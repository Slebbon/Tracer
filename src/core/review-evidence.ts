import type { TraceEvent } from "./events";

/** Facts and user annotations only: activity does not establish intent or success. */
export function renderReviewEvidence(events: TraceEvent[]): string[] {
  const ordered = [...events].sort((a, b) => a.sequence - b.sequence);
  const outcomes: string[] = [];
  const nextSteps: string[] = [];
  const changed = new Map<string, number[]>();
  const cycles: string[] = [];
  let pending: TraceEvent[] = [];
  let unpairedRuns = 0;
  for (const event of ordered) {
    const ref = `_(raw events: ${event.sequence})_`;
    if (event.type === "outcome_noted" && typeof event.payload.note === "string") {
      outcomes.push(`- User-reported: ${event.payload.note} ${ref}`);
    }
    if (event.type === "next_step_noted" && typeof event.payload.note === "string") {
      nextSteps.push(`- User-reported: ${event.payload.note} ${ref}`);
    }
    if (event.type === "file_changed") {
      pending.push(event);
      if (event.file?.path) {
        const refs = changed.get(event.file.path) ?? [];
        refs.push(event.sequence);
        changed.set(event.file.path, refs);
      }
    }
    if (event.type === "play_started" || event.type === "task_started") {
      const label = event.type === "play_started" ? "Playtest" : "Task run (purpose unknown)";
      if (pending.length) {
        const first = pending[0];
        const last = pending[pending.length - 1];
        const duration = (start: TraceEvent): string => {
          const seconds = (Date.parse(event.timestamp) - Date.parse(start.timestamp)) / 1000;
          return Number.isFinite(seconds) && seconds >= 0 ? `${seconds.toFixed(1)}s` : "Unknown";
        };
        const interactions = ordered.filter((item) => item.sequence > last.sequence && item.sequence < event.sequence
          && !["code_snapshot", "session_paused", "session_resumed", "objective_set", "outcome_noted", "next_step_noted"].includes(item.type)).length;
        cycles.push(`- ${label}: ${pending.length} edit events → run; ${duration(first)} since first edit, ${duration(last)} since last edit; ${interactions} intervening activity events _(raw events: ${pending.map((item) => item.sequence).join(", ")}, ${event.sequence})_`);
        pending = [];
      } else {
        unpairedRuns += 1;
      }
    }
    if (event.type === "task_process_finished") {
      const exit = event.payload.exitCode;
      outcomes.push(`- Task process exited with code ${typeof exit === "number" ? exit : "Unknown"}; correctness unknown ${ref}`);
    }
    if (event.type === "play_stopped") outcomes.push(`- Playtest stopped; result unknown ${ref}`);
  }
  for (const [file, refs] of changed) {
    outcomes.push(`- Observed edits to \`${file}\` (${refs.length} change events); implementation meaning unknown _(raw events: ${refs.join(", ")})_`);
  }
  return [
    "", "## Outcome", "",
    ...(outcomes.length ? outcomes : ["- Unknown — no outcome evidence recorded"]),
    "", "## Unresolved / Next steps", "",
    ...(nextSteps.length ? nextSteps : ["- Unknown — no unresolved items or next steps recorded"]),
    "", "## Edit → playtest / run cadence", "",
    ...cycles,
    ...(!cycles.length ? ["- Unknown — no edit-to-run pairs recorded"] : []),
    `- Runs without preceding recorded edits: ${unpairedRuns}`,
    `- Edit events awaiting a recorded run: ${pending.length}`,
    "- Durations are wall-clock time (including pauses). Counts describe recorded events, not keystrokes or all user interactions. Tasks are not assumed to be tests."
  ];
}
