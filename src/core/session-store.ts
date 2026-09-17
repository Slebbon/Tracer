import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { TraceEvent } from "./events";

export class SessionStore {
  private writeChain = Promise.resolve();
  private readonly eventsPath: string;

  public constructor(eventsPath: string) {
    this.eventsPath = eventsPath;
  }

  public async append(event: TraceEvent): Promise<void> {
    this.writeChain = this.writeChain.then(async () => {
      await mkdir(dirname(this.eventsPath), { recursive: true });
      await appendFile(this.eventsPath, `${JSON.stringify(event)}\n`, "utf8");
    });
    await this.writeChain;
  }

  public async readAll(): Promise<TraceEvent[]> {
    let contents: string;
    try {
      contents = await readFile(this.eventsPath, "utf8");
    } catch (error: unknown) {
      if (isMissingFile(error)) return [];
      throw error;
    }

    return contents
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line, index) => parseStoredEvent(line, index + 1))
      .sort((left, right) => left.sequence - right.sequence);
  }
}

function parseStoredEvent(line: string, lineNumber: number): TraceEvent {
  const value: unknown = JSON.parse(line);
  if (!isStoredEvent(value)) throw new Error(`Invalid Tracer event at JSONL line ${lineNumber}.`);
  return value;
}

function isStoredEvent(value: unknown): value is TraceEvent {
  if (typeof value !== "object" || value === null) return false;
  const event = value as Partial<TraceEvent>;
  return event.schemaVersion === 1
    && typeof event.sessionId === "string"
    && Number.isInteger(event.sequence) && (event.sequence as number) > 0
    && typeof event.timestamp === "string" && !Number.isNaN(Date.parse(event.timestamp))
    && event.source === "vscode"
    && typeof event.type === "string" && [
      "session_started", "session_ended", "session_paused", "session_resumed", "objective_set",
      "workspace_opened", "workspace_changed", "file_opened", "active_file_changed",
      "file_changed", "file_saved", "diagnostics_changed", "terminal_opened",
      "terminal_closed", "terminal_command_started", "terminal_command_finished",
      "task_started", "task_finished", "task_process_finished", "git_branch_changed", "git_commit"
    ].includes(event.type)
    && typeof event.payload === "object" && event.payload !== null;
}

function isMissingFile(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
