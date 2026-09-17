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
  return [
    "# Tracer Development Context",
    "",
    "This context was generated from a local chronological development trace.",
    "",
    "## Current objective",
    "",
    objectiveText ?? "Not explicitly set",
    "",
    "## Relevant files",
    "",
    ...(files.length ? files.map((file) => `- \`${file}\``) : ["- None recorded"]),
    "",
    "## Current file",
    "",
    currentFile ? `\`${currentFile}\`` : "Unknown",
    "",
    "## Recent activity",
    "",
    renderCompactTimeline(ordered),
    "## Raw event coverage",
    "",
    `This context is derived from ${ordered.length} raw events. The raw JSONL export should be preferred when exact details are required.`
  ].join("\n");
}

export function compactJsonl(events: TraceEvent[]): string {
  return `${compactEvents(events).map((event) => JSON.stringify(event)).join("\n")}\n`;
}
