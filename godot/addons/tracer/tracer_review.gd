@tool
extends RefCounted

static func build(events: Array[Dictionary], session_path: String = "") -> String:
	var ordered := events.duplicate()
	ordered.sort_custom(func(a: Dictionary, b: Dictionary) -> bool: return int(a.get("sequence", 0)) < int(b.get("sequence", 0)))
	var files: Array[String] = []
	var counts: Dictionary = {}
	var objective := "Unknown — not explicitly set"
	var path: Array[String] = []
	var outcomes: Array[String] = []
	var next_steps: Array[String] = []
	var changes: Dictionary = {}
	var pending: Array[Dictionary] = []
	var cadence: Array[String] = []
	var unpaired_runs := 0
	for index in range(ordered.size()):
		var event: Dictionary = ordered[index]
		var kind := str(event.get("type", "unknown"))
		var sequence := str(event.get("sequence", "?"))
		var payload: Dictionary = event.get("payload", {})
		var file_data: Dictionary = event.get("file", {})
		var file_path := str(file_data.get("path", ""))
		var ref := " _(raw events: %s)_" % sequence
		counts[kind] = int(counts.get(kind, 0)) + 1
		if file_path != "" and not files.has(file_path):
			files.append(file_path)
		if kind == "objective_set":
			objective = str(payload.get("objective", objective))
		if kind == "outcome_noted":
			outcomes.append("- User-reported: " + str(payload.get("note", "Unknown")) + ref)
		if kind == "next_step_noted":
			next_steps.append("- User-reported: " + str(payload.get("note", "Unknown")) + ref)
		if kind == "file_changed":
			pending.append({"event": event, "index": index})
			if file_path != "":
				if not changes.has(file_path):
					changes[file_path] = []
				changes[file_path].append(sequence)
		if kind == "play_started":
			if pending.is_empty():
				unpaired_runs += 1
			else:
				var first: Dictionary = pending[0]["event"]
				var last: Dictionary = pending[-1]["event"]
				var refs: Array[String] = []
				for edit in pending:
					refs.append(str(edit["event"].get("sequence", "?")))
				refs.append(sequence)
				var interactions := 0
				for between in range(int(pending[-1]["index"]) + 1, index):
					if not str(ordered[between].get("type", "")) in ["code_snapshot", "session_paused", "session_resumed", "objective_set", "outcome_noted", "next_step_noted"]:
						interactions += 1
				cadence.append("- Playtest: %d edit events → play; %s since first edit, %s since last edit; %d intervening activity events _(raw events: %s)_" % [pending.size(), _elapsed(first, event), _elapsed(last, event), interactions, ", ".join(refs)])
				pending.clear()
		if kind == "play_stopped":
			outcomes.append("- Playtest stopped; result unknown" + ref)
		path.append("- " + kind.replace("_", " ") + (" — " + file_path if file_path != "" else "") + ref)
	for file_path in changes:
		outcomes.append("- Observed edits to `%s` (%d change events); implementation meaning unknown _(raw events: %s)_" % [file_path, changes[file_path].size(), ", ".join(changes[file_path])])
	var lines: Array[String] = ["# Tracer AI Review", "", "## Objective", "", objective, "", "## Session overview", "", "- Raw events: %d" % ordered.size(), "- Session file: " + session_path]
	if not ordered.is_empty():
		lines.append("- Status: " + ("completed" if ordered[-1].get("type", "") == "session_ended" else "in progress or interrupted"))
		lines.append("- Time range: %s → %s" % [ordered[0].get("timestamp", "Unknown"), ordered[-1].get("timestamp", "Unknown")])
	lines.append_array(["", "## Files involved", ""])
	if files.is_empty():
		lines.append("- None recorded")
	for file_path in files:
		lines.append("- " + file_path)
	lines.append_array(["", "## Activity signals", "", "- Script changes: %d" % int(counts.get("file_changed", 0)), "- Saves: %d" % int(counts.get("file_saved", 0)), "- Code snapshots: %d" % int(counts.get("code_snapshot", 0)), "- Scene saves: %d" % int(counts.get("scene_saved", 0)), "- Playtests started: %d" % int(counts.get("play_started", 0)), "", "## Recent path", ""])
	lines.append_array(path.slice(maxi(0, path.size() - 20)) if not path.is_empty() else ["- No activity recorded"])
	lines.append_array(["", "## Outcome", ""])
	lines.append_array(outcomes if not outcomes.is_empty() else ["- Unknown — no outcome evidence recorded"])
	lines.append_array(["", "## Unresolved / Next steps", ""])
	lines.append_array(next_steps if not next_steps.is_empty() else ["- Unknown — no unresolved items or next steps recorded"])
	lines.append_array(["", "## Edit → playtest cadence", ""])
	lines.append_array(cadence if not cadence.is_empty() else ["- Unknown — no edit-to-play pairs recorded"])
	lines.append_array(["- Playtests without preceding recorded edits: %d" % unpaired_runs, "- Edit events awaiting a recorded playtest: %d" % pending.size(), "- Durations are wall-clock time (including pauses). Counts describe recorded events, not keystrokes or all user interactions.", "", "## Evidence and limits", "", "This review is a deterministic map of the local event stream. User notes are self-reported. Edits and playtest stops do not establish implementation meaning or success. The JSONL remains the source of truth; use raw event references for exact saved diffs and snapshot paths."])
	return "\n".join(lines)

static func _elapsed(first: Dictionary, last: Dictionary) -> String:
	var start := str(first.get("timestamp", ""))
	var finish := str(last.get("timestamp", ""))
	if start == "" or finish == "":
		return "Unknown"
	var seconds := Time.get_unix_time_from_datetime_string(finish) - Time.get_unix_time_from_datetime_string(start)
	return "%ds" % seconds if seconds >= 0 else "Unknown"
