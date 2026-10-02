@tool
extends RefCounted

const SCHEMA_VERSION := 1
const SOURCE := "godot"

var session_id := ""
var session_path := ""
var snapshot_directory := ""
var sequence := 0
var active := false
var recording := false

func start_session(project_name: String) -> String:
	var root := DirAccess.open("user://")
	if root == null:
		return ""
	root.make_dir_recursive("tracer/sessions")
	root.make_dir_recursive("tracer/snapshots")
	session_id = "%s-%s" % [Time.get_ticks_usec(), randi()]
	var stamp := Time.get_datetime_string_from_system(true, true).replace("-", "").replace(":", "").replace("T", "-").substr(0, 15)
	session_path = "user://tracer/sessions/session-%s-%s.jsonl" % [stamp, session_id.substr(0, 8)]
	snapshot_directory = "user://tracer/snapshots/%s" % session_id
	root.make_dir_recursive("tracer/snapshots/%s" % session_id)
	sequence = 0
	active = true
	recording = true
	return append("session_started", {"project": project_name})

func append(event_type: String, payload: Dictionary = {}, file_path := "", language_id := "") -> String:
	if not active:
		return ""
	var lifecycle := event_type in ["session_started", "session_ended", "session_paused", "session_resumed"]
	var annotation := event_type in ["objective_set", "outcome_noted", "next_step_noted"]
	if not recording and not lifecycle and not annotation:
		return ""
	sequence += 1
	var event := {
		"schemaVersion": SCHEMA_VERSION,
		"sessionId": session_id,
		"sequence": sequence,
		"timestamp": Time.get_datetime_string_from_system(true, true) + "Z",
		"source": SOURCE,
		"type": event_type,
		"payload": payload
	}
	if file_path != "":
		event["file"] = {"path": file_path, "languageId": language_id}
	var file: FileAccess
	if FileAccess.file_exists(session_path):
		file = FileAccess.open(session_path, FileAccess.READ_WRITE)
	else:
		file = FileAccess.open(session_path, FileAccess.WRITE)
	if file == null:
		return ""
	file.seek_end()
	file.store_line(JSON.stringify(event))
	file.flush()
	file.close()
	return JSON.stringify(event)

func save_snapshot(file_path: String, content: String) -> String:
	if not active or not recording or snapshot_directory == "":
		return ""
	var safe_name := file_path.replace("res://", "").replace("/", "_").replace("\\", "_").replace(":", "_")
	if safe_name == "":
		safe_name = "source.txt"
	var snapshot_path := "%s/%06d-%s" % [snapshot_directory, sequence + 1, safe_name]
	var file := FileAccess.open(snapshot_path, FileAccess.WRITE)
	if file == null:
		return ""
	file.store_string(content)
	file.flush()
	file.close()
	return snapshot_path

func pause_session() -> void:
	if active and recording:
		append("session_paused")
		recording = false

func resume_session() -> void:
	if active and not recording:
		append("session_resumed")
		recording = true

func end_session() -> void:
	if not active:
		return
	append("session_ended")
	recording = false
	active = false

func read_events() -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	if session_path == "" or not FileAccess.file_exists(session_path):
		return result
	var file := FileAccess.open(session_path, FileAccess.READ)
	if file == null:
		return result
	while not file.eof_reached():
		var line := file.get_line()
		if line.strip_edges() == "":
			continue
		var parsed = JSON.parse_string(line)
		if parsed is Dictionary:
			result.append(parsed)
	file.close()
	return result
