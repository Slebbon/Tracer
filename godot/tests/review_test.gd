extends SceneTree

const Review = preload("res://addons/tracer/tracer_review.gd")
const Store = preload("res://addons/tracer/tracer_event_store.gd")

func _initialize() -> void:
	var store = Store.new()
	assert(not store.active and not store.recording)
	assert(store.append("file_changed") == "")
	assert(store.save_snapshot("Unit.gd", "source") == "")
	assert(store.start_session("Validation") != "")
	store.pause_session()
	assert(store.save_snapshot("Unit.gd", "paused") == "")
	assert(store.append("file_changed") == "")
	assert(store.append("objective_set", {"objective": "Implement targeting"}) != "")
	assert(store.append("outcome_noted", {"note": "Added TargetType"}) != "")
	store.end_session()
	assert(store.append("next_step_noted", {"note": "too late"}) == "")
	assert(store.read_events()[0]["timestamp"].ends_with("Z"))
	var events: Array[Dictionary] = [
		_event(1, "file_changed", "00", {}),
		_event(2, "file_changed", "10", {}),
		_event(3, "file_saved", "12", {}),
		_event(4, "code_snapshot", "13", {}),
		_event(5, "play_started", "30", {}),
		_event(6, "play_stopped", "40", {}),
		_event(7, "outcome_noted", "50", {"note": "Added TargetType"}),
		_event(8, "next_step_noted", "55", {"note": "Test ALLY"})
	]
	var review: String = Review.build(events)
	assert(review.contains("2 edit events → play; 30s since first edit, 20s since last edit; 1 intervening activity events"))
	assert(review.contains("raw events: 1, 2, 5"))
	assert(review.contains("User-reported: Added TargetType"))
	assert(review.contains("User-reported: Test ALLY"))
	assert(review.contains("Playtest stopped; result unknown"))
	assert(Review.build([]).contains("Unknown — no outcome evidence"))
	print("Godot review and recording lifecycle tests passed")
	quit(0)

func _event(sequence: int, type: String, seconds: String, payload: Dictionary) -> Dictionary:
	return {"sequence": sequence, "type": type, "timestamp": "2026-01-01T00:00:" + seconds + "Z", "payload": payload, "file": {"path": "Unit.gd"}}
