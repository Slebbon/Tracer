import type { TraceEvent } from "./events";
import { compactEvents, renderCompactTimeline } from "./timeline";

export function renderRawJsonl(events: TraceEvent[]): string {
  return `${events
    .slice()
    .sort((left, right) => left.sequence - right.sequence)
    .map((event) => JSON.stringify(event))
    .join("\n")}\n`;
}

export function renderSessionSummary(events: TraceEvent[]): string {
  const ordered = events.slice().sort((left, right) => left.sequence - right.sequence);
  const files = [...new Set(ordered.flatMap((event) => event.file?.path ? [event.file.path] : []))];
  const changedFiles = [...new Set(ordered.filter((event) => event.type === "file_changed").flatMap((event) => event.file?.path ? [event.file.path] : []))];
  const diagnostics = ordered.filter((event) => event.type === "diagnostics_changed").length;
  const tasks = ordered.filter((event) => event.type.startsWith("task_")).length;
  const terminals = ordered.filter((event) => event.type.startsWith("terminal_")).length;
  const git = ordered.filter((event) => event.type.startsWith("git_")).length;
  const objectiveEvent = [...ordered].reverse().find((event) => event.type === "objective_set");
  const objective = objectiveEvent && typeof objectiveEvent.payload.objective === "string" ? objectiveEvent.payload.objective : undefined;
  const first = ordered[0]?.timestamp;
  const last = ordered[ordered.length - 1]?.timestamp;
  const lines = ["# Tracer Session Summary", "", `Events recorded: ${ordered.length}`];
  if (first && last) lines.push(`Session range: ${first} → ${last}`);
  lines.push("", "## Current objective", "", objective ?? "Not explicitly set");
  lines.push("", "## Files explored", "", ...(files.length ? files.map((file) => `- \`${file}\``) : ["- None recorded"]));
  lines.push("", "## Files changed", "", ...(changedFiles.length ? changedFiles.map((file) => `- \`${file}\``) : ["- None recorded"]));
  lines.push("", "## Activity", "", `- ${ordered.filter((event) => event.type === "file_changed").length} file-change events`, `- ${ordered.filter((event) => event.type === "file_saved").length} file saves`, `- ${diagnostics} diagnostic updates`, `- ${tasks} task events`, `- ${terminals} terminal events`, `- ${git} Git events`);
  const path = compactEvents(ordered).slice(0, 20);
  lines.push("", "## Development path", "", ...(path.length
    ? path.map((event) => `- ${event.summary} _(raw: ${event.sourceSequences.join(", ")})_`)
    : ["- No activity path recorded"]));
  return `${lines.join("\n")}\n`;
}

export function renderAiContext(events: TraceEvent[]): string {
  const ordered = events.slice().sort((left, right) => left.sequence - right.sequence);
  const files = [...new Set(ordered.flatMap((event) => event.file?.path ? [event.file.path] : []))];
  const currentFile = [...ordered].reverse().find((event) => event.file?.path)?.file?.path;
  const objective = [...ordered].reverse().find((event) => event.type === "objective_set");
  const objectiveText = objective && typeof objective.payload.objective === "string" ? objective.payload.objective : undefined;
  const first = ordered[0]?.timestamp;
  const last = ordered[ordered.length - 1]?.timestamp;
  const compactPath = compactEvents(ordered).slice(-20);
  const changes = ordered.filter((event) => event.type === "file_changed").length;
  const saves = ordered.filter((event) => event.type === "file_saved").length;
  const diagnostics = ordered.filter((event) => event.type === "diagnostics_changed").length;
  const tasks = ordered.filter((event) => event.type.startsWith("task_")).length;
  const terminals = ordered.filter((event) => event.type.startsWith("terminal_")).length;
  const git = ordered.filter((event) => event.type.startsWith("git_")).length;
  const lastEvent = ordered.at(-1);
  return [
    "# Tracer AI Review",
    "",
    "A concise review brief generated from Tracer's local chronological development trace.",
    "",
    "## Objective",
    "",
    objectiveText ?? "Not explicitly set",
    "",
    "## Session overview",
    "",
    `- Status: ${lastEvent?.type === "session_ended" ? "completed" : "in progress or interrupted"}`,
    `- Raw events: ${ordered.length}`,
    ...(first && last ? [`- Time range: ${first} → ${last}`] : []),
    "",
    "## Working set",
    "",
    `- Current file: ${currentFile ? `\`${currentFile}\`` : "Unknown"}`,
    ...(files.length ? files.map((file) => `- Relevant file: \`${file}\``) : ["- No files recorded"]),
    "",
    "## Activity signals",
    "",
    `- File changes: ${changes}`,
    `- Saves: ${saves}`,
    `- Diagnostic updates: ${diagnostics}`,
    `- Tasks: ${tasks}`,
    `- Terminal events: ${terminals}`,
    `- Git events: ${git}`,
    "",
    "## Recent development path",
    "",
    ...(compactPath.length
      ? compactPath.map((event) => `- ${event.summary} _(raw events: ${event.sourceSequences.join(", ")})_`)
      : ["- No activity path recorded"]),
    "",
    "## Evidence and limits",
    "",
    "- Activity summaries are deterministic projections of the raw event stream; they are not guesses about intent.",
    "- Raw sequence references are preserved so each review item can be traced back to JSONL evidence.",
    "- Use the raw JSONL export when exact edits, diagnostics, or command-level details are required."
  ].join("\n");
}

export function compactJsonl(events: TraceEvent[]): string {
  return `${compactEvents(events).map((event) => JSON.stringify(event)).join("\n")}\n`;
}
