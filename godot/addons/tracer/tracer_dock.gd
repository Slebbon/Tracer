@tool
extends VBoxContainer

signal action_requested(action: String)

var status_label: Label
var events_label: Label
var session_label: Label
var current_file_label: Label
var start_button: Button
var pause_button: Button
var resume_button: Button
var stop_button: Button
var snapshot_button: Button
var objective_label: Label
var note_buttons: Array[Button] = []

func _ready() -> void:
	custom_minimum_size = Vector2(280, 0)
	var scroll := ScrollContainer.new()
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	add_child(scroll)
	var content := VBoxContainer.new()
	content.add_theme_constant_override("separation", 8)
	content.custom_minimum_size = Vector2(250, 0)
	scroll.add_child(content)
	_add_heading(content, "TRACER")
	status_label = _add_value(content, "Stopped")
	events_label = _add_meta(content, "0 events")
	session_label = _add_meta(content, "No session started")
	current_file_label = _add_meta(content, "Current file: none")
	_add_heading(content, "OBJECTIVE AND NOTES")
	objective_label = _add_meta(content, "Unknown — not explicitly set")
	note_buttons.append(_add_button(content, "Set objective", "objective"))
	note_buttons.append(_add_button(content, "Record outcome", "outcome"))
	note_buttons.append(_add_button(content, "Record unresolved / next step", "next_step"))
	_add_heading(content, "RECORDING")
	start_button = _add_button(content, "Start recording", "start")
	pause_button = _add_button(content, "Pause recording", "pause")
	resume_button = _add_button(content, "Resume recording", "resume")
	stop_button = _add_button(content, "Stop recording", "stop")
	_add_heading(content, "CAPTURE")
	snapshot_button = _add_button(content, "Code snapshots: On", "toggle_snapshots")
	_add_meta(content, "Saved locally with this session for richer AI Review.")
	_add_heading(content, "REVIEW")
	_add_button(content, "Open AI Review", "review")
	_add_button(content, "Open Tracer storage", "open_storage")
	_add_heading(content, "CAPTURED BY GODOT")
	_add_meta(content, "Scenes, scripts, saves, resources, playtest and editor activity")
	_update_buttons(false, false)

func update_state(recording: bool, paused: bool, event_count: int, session_id: String, current_file: String, snapshots_enabled: bool, objective: String = "Unknown — not explicitly set") -> void:
	if not is_node_ready():
		return
	status_label.text = "Paused" if paused else "Recording" if recording else "Stopped"
	events_label.text = "%d events" % event_count
	session_label.text = "Session %s" % session_id.substr(0, 8) if session_id != "" else "No session started"
	current_file_label.text = "Current file: %s" % current_file if current_file != "" else "Current file: none"
	snapshot_button.text = "Code snapshots: %s" % ("On" if snapshots_enabled else "Off")
	objective_label.text = objective
	_update_buttons(recording, paused)

func _update_buttons(recording: bool, paused: bool) -> void:
	if start_button == null:
		return
	start_button.visible = not recording and not paused
	pause_button.visible = recording
	resume_button.visible = paused
	stop_button.visible = recording or paused
	for button in note_buttons:
		button.disabled = not recording and not paused

func _add_heading(parent: Control, text: String) -> void:
	var label := Label.new()
	label.text = text
	label.add_theme_font_size_override("font_size", 11)
	parent.add_child(label)

func _add_value(parent: Control, text: String) -> Label:
	var label := Label.new()
	label.text = text
	label.add_theme_font_size_override("font_size", 16)
	parent.add_child(label)
	return label

func _add_meta(parent: Control, text: String) -> Label:
	var label := Label.new()
	label.text = text
	label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	parent.add_child(label)
	return label

func _add_button(parent: Control, text: String, action: String) -> Button:
	var button := Button.new()
	button.text = text
	button.alignment = HORIZONTAL_ALIGNMENT_LEFT
	button.pressed.connect(func() -> void: action_requested.emit(action))
	parent.add_child(button)
	return button
