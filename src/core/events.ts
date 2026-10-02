export type TraceEventType =
  | "session_started"
  | "session_ended"
  | "session_paused"
  | "session_resumed"
  | "objective_set"
  | "outcome_noted"
  | "next_step_noted"
  | "play_started"
  | "play_stopped"
  | "script_opened"
  | "scene_opened"
  | "scene_closed"
  | "scene_saved"
  | "resource_saved"
  | "editor_screen_changed"
  | "filesystem_changed"
  | "node_selected"
  | "workspace_opened"
  | "workspace_changed"
  | "file_opened"
  | "active_file_changed"
  | "file_changed"
  | "file_saved"
  | "code_snapshot"
  | "diagnostics_changed"
  | "terminal_opened"
  | "terminal_closed"
  | "terminal_command_started"
  | "terminal_command_finished"
  | "task_started"
  | "task_finished"
  | "task_process_finished"
  | "git_branch_changed"
  | "git_commit";

export type TraceEventSource = "vscode" | "godot";

const TRACE_EVENT_TYPES: readonly TraceEventType[] = [
  "session_started", "session_ended", "session_paused", "session_resumed", "objective_set",
  "workspace_opened", "workspace_changed", "file_opened", "active_file_changed",
  "file_changed", "file_saved", "code_snapshot", "diagnostics_changed", "terminal_opened",
  "terminal_closed", "terminal_command_started", "terminal_command_finished",
  "task_started", "task_finished", "task_process_finished", "git_branch_changed", "git_commit",
  "outcome_noted", "next_step_noted", "play_started", "play_stopped", "script_opened",
  "scene_opened", "scene_closed", "scene_saved", "resource_saved", "editor_screen_changed",
  "filesystem_changed", "node_selected"
];

export type TextChange = {
  range: { startLine: number; startCharacter: number; endLine: number; endCharacter: number };
  text: string;
};

export type TraceEvent = {
  schemaVersion: 1;
  sessionId: string;
  sequence: number;
  timestamp: string;
  source: TraceEventSource;
  type: TraceEventType;
  workspace?: { name?: string; path?: string };
  file?: { path: string; languageId?: string };
  payload: Record<string, unknown>;
};

export function isTraceEvent(value: unknown): value is TraceEvent {
  if (typeof value !== "object" || value === null) return false;
  const event = value as Partial<TraceEvent>;
  return event.schemaVersion === 1
    && typeof event.sessionId === "string"
    && Number.isInteger(event.sequence) && (event.sequence as number) > 0
    && typeof event.timestamp === "string" && !Number.isNaN(Date.parse(event.timestamp))
    && (event.source === "vscode" || event.source === "godot")
    && typeof event.type === "string" && TRACE_EVENT_TYPES.includes(event.type as TraceEventType)
    && typeof event.payload === "object" && event.payload !== null;
}

export function parseTraceEvent(line: string, lineNumber: number): TraceEvent {
  const value: unknown = JSON.parse(line);
  if (!isTraceEvent(value)) throw new Error(`Invalid Tracer event at JSONL line ${lineNumber}.`);
  return value;
}

export function createEvent(
  sessionId: string,
  sequence: number,
  type: TraceEventType,
  payload: Record<string, unknown> = {},
  details: Pick<TraceEvent, "workspace" | "file"> = {},
  source: TraceEventSource = "vscode"
): TraceEvent {
  return {
    schemaVersion: 1,
    sessionId,
    sequence,
    timestamp: new Date().toISOString(),
    source,
    type,
    payload,
    ...details
  };
}
