@tool
extends EditorPlugin

const EventStore = preload("tracer_event_store.gd")
const TracerDock = preload("tracer_dock.gd")

var dock: VBoxContainer
var store
var poll_timer: Timer
var recording := false
var paused := false
var current_script_path := ""
var current_file := ""
var current_scene_path := ""
var playing := false
var snapshots: Dictionary = {}
var snapshot_hashes: Dictionary = {}
var snapshot_elapsed := 0.0
const SNAPSHOT_INTERVAL_SECONDS := 30.0

func _enter_tree() -> void:
	dock = TracerDock.new()
	dock.name = "Tracer"
	dock.action_requested.connect(_on_dock_action)
	add_control_to_dock(DOCK_SLOT_RIGHT_UL, dock)
	poll_timer = Timer.new()
	poll_timer.wait_time = 0.75
	poll_timer.timeout.connect(_poll_editor_state)
	add_child(poll_timer)
	poll_timer.start()
	scene_changed.connect(_on_scene_changed)
	scene_closed.connect(_on_scene_closed)
	scene_saved.connect(_on_scene_saved)
	resource_saved.connect(_on_resource_saved)
	main_screen_changed.connect(_on_main_screen_changed)
	var filesystem := EditorInterface.get_resource_filesystem()
	filesystem.filesystem_changed.connect(_on_filesystem_changed)
	EditorInterface.get_selection().selection_changed.connect(_on_selection_changed)
	_update_dock()

func _exit_tree() -> void:
	if recording or paused:
		_stop_session()
	if is_instance_valid(poll_timer):
		poll_timer.stop()
	if is_instance_valid(dock):
		remove_control_from_docks(dock)
		dock.queue_free()

func _on_dock_action(action: String) -> void:
	match action:
		"start": _start_session()
		"pause": _pause_session()
		"resume": _resume_session()
		"stop": _stop_session()
		"toggle_snapshots": _toggle_snapshots()
		"review": _show_review()
		"open_storage": OS.shell_open(ProjectSettings.globalize_path("user://tracer"))

func _start_session() -> void:
	if recording:
		return
	store = EventStore.new()
	var project_name := str(ProjectSettings.get_setting("application/config/name", "Godot Project"))
	if store.start_session(project_name) == "":
		return
	recording = true
	paused = false
	current_file = ""
	current_script_path = ""
	current_scene_path = ""
	snapshots.clear()
	snapshot_hashes.clear()
	snapshot_elapsed = 0.0
	_ensure_snapshot_setting()
	_record("workspace_opened", {"project": project_name})
	_capture_current_editor()
	_update_dock()

func _pause_session() -> void:
	if not recording or store == null:
		return
	store.pause_session()
	recording = false
	paused = true
	_update_dock()

func _resume_session() -> void:
	if not paused or store == null:
		return
	store.resume_session()
	recording = true
	paused = false
	_update_dock()

func _stop_session() -> void:
	if store == null or (not recording and not paused):
		return
	store.end_session()
	recording = false
	paused = false
	_update_dock()

func _record(event_type: String, payload: Dictionary = {}, file_path := "", language_id := "") -> void:
	if store == null:
		return
	store.append(event_type, payload, file_path, language_id)
	_update_dock()

func _capture_current_editor() -> void:
	var script := EditorInterface.get_script_editor().get_current_script()
	if script != null and script.resource_path != "":
		_track_script(script.resource_path)
	var root := EditorInterface.get_edited_scene_root()
	if root != null and root.scene_file_path != "":
		current_scene_path = root.scene_file_path
		_record("scene_opened", {"scene": current_scene_path}, current_scene_path, "scene")

func _poll_editor_state() -> void:
	if not recording:
		return
	snapshot_elapsed += poll_timer.wait_time
	var script := EditorInterface.get_script_editor().get_current_script()
	if script != null and script.resource_path != "":
		_track_script(script.resource_path)
	if snapshot_elapsed >= SNAPSHOT_INTERVAL_SECONDS:
		snapshot_elapsed = 0.0
		_capture_current_script_snapshot("interval")
	var now_playing := EditorInterface.is_playing_scene()
	if now_playing != playing:
		playing = now_playing
		_record("play_started" if playing else "play_stopped")

func _track_script(path: String) -> void:
	if path == current_script_path:
		return
	current_script_path = path
	current_file = path
	if FileAccess.file_exists(path):
		snapshots[path] = FileAccess.get_file_as_string(path)
	_record("script_opened", {}, path, "gd")
	_capture_current_script_snapshot("script_opened")

func _on_resource_saved(resource: Resource) -> void:
	if not recording or resource == null or resource.resource_path == "":
		return
	var path := resource.resource_path
	if resource is Script or path.ends_with(".gd"):
		_capture_saved_file(path, "script", "gd")
	else:
		_record("resource_saved", {"resource_type": resource.get_class()}, path, path.get_extension())

func _on_scene_saved(path: String) -> void:
	if not recording:
		return
	current_scene_path = path
	_capture_saved_file(path, "scene", "scene")
	_record("scene_saved", {}, path, "scene")

func _capture_saved_file(path: String, kind: String, language_id: String) -> void:
	if not FileAccess.file_exists(path):
		return
	var after := FileAccess.get_file_as_string(path)
	var had_snapshot := snapshots.has(path)
	var before: String = snapshots.get(path, after)
	if had_snapshot and before != after:
		_record("file_changed", _diff_payload(before, after, kind), path, language_id)
	_record("file_saved", {"kind": kind, "changed": had_snapshot and before != after}, path, language_id)
	snapshots[path] = after
	if kind == "script":
		_capture_code_snapshot(path, after, "save", language_id)

func _capture_current_script_snapshot(reason: String) -> void:
	if not _snapshots_enabled():
		return
	var script := EditorInterface.get_script_editor().get_current_script()
	if script == null or script.resource_path == "":
		return
	_capture_code_snapshot(script.resource_path, script.source_code, reason, "gd")

func _capture_code_snapshot(path: String, content: String, reason: String, language_id: String) -> void:
	if not _snapshots_enabled() or store == null or path == "" or content == "":
		return
	var content_hash := str(content.hash())
	if snapshot_hashes.get(path, "") == content_hash:
		return
	var saved_path: String = store.save_snapshot(path, content)
	if saved_path == "":
		return
	snapshot_hashes[path] = content_hash
	_record("code_snapshot", {"reason": reason, "snapshotPath": saved_path, "contentHash": content_hash, "bytes": content.to_utf8_buffer().size(), "lineCount": content.split("\n").size()}, path, language_id)

func _snapshots_enabled() -> bool:
	_ensure_snapshot_setting()
	return bool(EditorInterface.get_editor_settings().get_setting("tracer/capture_code_snapshots"))

func _ensure_snapshot_setting() -> void:
	var settings := EditorInterface.get_editor_settings()
	if not settings.has_setting("tracer/capture_code_snapshots"):
		settings.set_setting("tracer/capture_code_snapshots", true)

func _toggle_snapshots() -> void:
	_ensure_snapshot_setting()
	var settings := EditorInterface.get_editor_settings()
	settings.set_setting("tracer/capture_code_snapshots", not _snapshots_enabled())
	_update_dock()

func _diff_payload(before: String, after: String, kind: String) -> Dictionary:
	var old_lines := before.split("\n")
	var new_lines := after.split("\n")
	var prefix := 0
	while prefix < old_lines.size() and prefix < new_lines.size() and old_lines[prefix] == new_lines[prefix]:
		prefix += 1
	var suffix := 0
	while suffix < old_lines.size() - prefix and suffix < new_lines.size() - prefix and old_lines[old_lines.size() - 1 - suffix] == new_lines[new_lines.size() - 1 - suffix]:
		suffix += 1
	var old_end := old_lines.size() - suffix if suffix > 0 else old_lines.size()
	var new_end := new_lines.size() - suffix if suffix > 0 else new_lines.size()
	var removed := old_lines.slice(prefix, old_end)
	var added := new_lines.slice(prefix, new_end)
	var diff_lines: Array[String] = []
	for line in removed:
		diff_lines.append("- " + line)
	for line in added:
		diff_lines.append("+ " + line)
	return {
		"kind": kind,
		"beforeHash": str(before.hash()),
		"afterHash": str(after.hash()),
		"removedLines": removed.size(),
		"addedLines": added.size(),
		"diff": "\n".join(diff_lines).left(12000)
	}

func _on_scene_changed(scene_root: Node) -> void:
	if not recording:
		return
	var path := scene_root.scene_file_path if scene_root != null else ""
	current_scene_path = path
	_record("scene_opened", {"scene": path}, path, "scene")

func _on_scene_closed(path: String) -> void:
	if recording:
		_record("scene_closed", {"scene": path}, path, "scene")

func _on_main_screen_changed(screen_name: String) -> void:
	if recording:
		_record("editor_screen_changed", {"screen": screen_name})

func _on_filesystem_changed() -> void:
	if recording:
		_record("filesystem_changed")

func _on_selection_changed() -> void:
	if not recording:
		return
	var nodes := EditorInterface.get_selection().get_selected_nodes()
	var names: Array[String] = []
	for node in nodes:
		names.append(str(node.name))
	_record("node_selected", {"count": nodes.size(), "nodes": names})

func _show_review() -> void:
	if store == null:
		return
	var window := Window.new()
	window.title = "Tracer AI Review"
	window.size = Vector2i(760, 560)
	window.close_requested.connect(window.queue_free)
	var review := TextEdit.new()
	review.editable = false
	review.text = _build_review(store.read_events())
	review.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	window.add_child(review)
	add_child(window)
	window.popup_centered()

func _build_review(events: Array[Dictionary]) -> String:
	var files: Array[String] = []
	var counts: Dictionary = {}
	var objective := "Not explicitly set"
	var path: Array[String] = []
	for event in events:
		var event_type := str(event.get("type", "unknown"))
		counts[event_type] = int(counts.get(event_type, 0)) + 1
		var file_data = event.get("file", {})
		if file_data is Dictionary and str(file_data.get("path", "")) != "":
			var file_path := str(file_data.get("path", ""))
			if not files.has(file_path):
				files.append(file_path)
		var payload = event.get("payload", {})
		if event_type == "objective_set" and payload is Dictionary:
			objective = str(payload.get("objective", objective))
		if path.size() < 20:
			path.append("- %s%s" % [event_type.replace("_", " "), " — " + str(file_data.get("path", "")) if file_data is Dictionary and str(file_data.get("path", "")) != "" else ""])
	var lines: Array[String] = [
		"# Tracer AI Review",
		"",
		"## Objective",
		"",
		objective,
		"",
		"## Session overview",
		"",
		"- Raw events: %d" % events.size(),
		"- Session file: %s" % ProjectSettings.globalize_path(store.session_path),
		"",
		"## Files involved",
		""
	]
	if files.is_empty():
		lines.append("- None recorded")
	else:
		for file_path in files:
			lines.append("- %s" % file_path)
	lines.append_array(["", "## Activity signals", "", "- Script changes: %d" % int(counts.get("file_changed", 0)), "- Saves: %d" % int(counts.get("file_saved", 0)), "- Code snapshots: %d" % int(counts.get("code_snapshot", 0)), "- Scene saves: %d" % int(counts.get("scene_saved", 0)), "- Playtest events: %d" % (int(counts.get("play_started", 0)) + int(counts.get("play_stopped", 0))), "", "## Recent path", ""])
	lines.append_array(path if not path.is_empty() else ["- No activity recorded"])
	lines.append_array(["", "## Evidence", "", "This review is a deterministic summary of the local Godot event stream. The JSONL session remains the source of truth."])
	return "\n".join(lines)

func _update_dock() -> void:
	if is_instance_valid(dock):
		dock.update_state(recording, paused, store.sequence if store != null else 0, store.session_id if store != null else "", current_file, _snapshots_enabled())
