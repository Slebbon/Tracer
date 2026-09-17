import type { TraceEvent } from "./events";

export type CompactEvent = {
  kind: "session" | "workspace" | "navigation" | "file_activity" | "diagnostics" | "other";
  firstSequence: number;
  lastSequence: number;
  start: string;
  end: string;
  file?: string;
  sourceSequences: number[];
  summary: string;
};

export function renderFullTimeline(events: TraceEvent[]): string {
  const lines = ["# Tracer Full Timeline", ""];
  for (const event of sortEvents(events)) {
    lines.push(`## ${formatTimestamp(event.timestamp)} — ${event.type}`);
    if (event.file?.path) lines.push(`File: \`${event.file.path}\``);
    if (event.workspace?.name) lines.push(`Workspace: \`${event.workspace.name}\``);
    lines.push(`Sequence: ${event.sequence}`);
    lines.push("", "```json", JSON.stringify(event.payload, null, 2), "```", "");
  }
  return lines.join("\n");
}

export function compactEvents(events: TraceEvent[]): CompactEvent[] {
  const result: CompactEvent[] = [];
  for (const event of sortEvents(events)) {
    const file = event.file?.path;
    const previous = result[result.length - 1];
    const closeEnough = previous && Date.parse(event.timestamp) - Date.parse(previous.end) <= 30_000;
    const fileActivity = previous && previous.kind === "file_activity" && (event.type === "file_changed" || event.type === "file_saved") && previous.file === file;
    const diagnosticActivity = previous && previous.kind === "diagnostics" && event.type === "diagnostics_changed";
    const canMerge = Boolean(previous && closeEnough && (fileActivity || diagnosticActivity));
    if (canMerge) {
      previous.lastSequence = event.sequence;
      previous.end = event.timestamp;
      previous.sourceSequences.push(event.sequence);
      previous.summary = previous.kind === "diagnostics"
        ? `diagnostics updated (${previous.sourceSequences.length} updates)`
        : `${file ?? "file"} activity (${previous.sourceSequences.length} events)`;
      continue;
    }
    result.push(toCompactEvent(event));
  }
  return result;
}

export function renderCompactTimeline(events: TraceEvent[]): string {
  const lines = ["# Tracer Compact Timeline", ""];
  for (const event of compactEvents(events)) {
    lines.push(`- **${formatTimestamp(event.start)}${event.start === event.end ? "" : ` → ${formatTimestamp(event.end)}`}** ${event.summary} _(raw: ${event.sourceSequences.join(", ")})_`);
  }
  return `${lines.join("\n")}\n`;
}

function toCompactEvent(event: TraceEvent): CompactEvent {
  const file = event.file?.path;
  let kind: CompactEvent["kind"] = "other";
  if (event.type === "session_started" || event.type === "session_ended") kind = "session";
  else if (event.type === "workspace_opened" || event.type === "workspace_changed") kind = "workspace";
  else if (event.type === "file_opened" || event.type === "active_file_changed") kind = "navigation";
  else if (event.type === "file_changed" || event.type === "file_saved") kind = "file_activity";
  else if (event.type === "diagnostics_changed") kind = "diagnostics";
  else if (event.type.startsWith("terminal_")) kind = "other";
  return {
    kind,
    firstSequence: event.sequence,
    lastSequence: event.sequence,
    start: event.timestamp,
    end: event.timestamp,
    file,
    sourceSequences: [event.sequence],
    summary: describeEvent(event, file)
  };
}

function describeEvent(event: TraceEvent, file?: string): string {
  if (file) return `${event.type.replaceAll("_", " ")} — ${file}`;
  if (event.type === "git_branch_changed") return `git branch — ${stringValue(event.payload.branch) ?? "unknown"}`;
  if (event.type === "git_commit") return `git commit — ${shortCommit(stringValue(event.payload.commit))}`;
  if (event.type === "task_started") return `task started — ${stringValue(event.payload.name) ?? "unnamed"}`;
  if (event.type === "task_process_finished") return `task finished — exit ${numberValue(event.payload.exitCode) ?? "unknown"}`;
  if (event.type === "terminal_opened" || event.type === "terminal_closed") return `${event.type.replaceAll("_", " ")} — ${stringValue(event.payload.name) ?? "terminal"}`;
  if (event.type === "diagnostics_changed") return "diagnostics updated";
  if (event.type === "objective_set") return `objective set — ${stringValue(event.payload.objective) ?? "unspecified"}`;
  return event.type.replaceAll("_", " ");
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function shortCommit(value: string | undefined): string {
  return value ? value.slice(0, 8) : "unknown";
}

function sortEvents(events: TraceEvent[]): TraceEvent[] {
  return [...events].sort((left, right) => left.sequence - right.sequence);
}

function formatTimestamp(value: string): string {
  return new Date(value).toLocaleTimeString([], { hour12: false, fractionalSecondDigits: 3 });
}
