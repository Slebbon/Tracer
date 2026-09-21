import * as vscode from "vscode";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { readdir, stat, unlink, writeFile } from "node:fs/promises";
import { createEvent } from "./core/events";
import { SessionStore } from "./core/session-store";
import { DEFAULT_IGNORES, isIgnoredPath } from "./core/privacy";
import { renderCompactTimeline, renderFullTimeline } from "./core/timeline";
import { compactJsonl, renderAiContext, renderRawJsonl, renderSessionSummary } from "./core/outputs";

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  let sessionId = "";
  let sequence = 0;
  let recording = false;
  let ended = true;
  let hasSession = false;
  let eventCount = 0;
  let currentObjective = "Not set";
  let storageStats: StorageStats = { sessions: 0, bytes: 0 };
  let store: SessionStore | undefined;
  const sessionsDirectory = join(context.globalStorageUri.fsPath, "sessions");
  const sidebar = new TracerSidebarProvider(() => ({
    state: ended ? "stopped" : recording ? "recording" : "paused",
    eventCount,
    objective: currentObjective,
    sessionId,
    retentionEnabled: vscode.workspace.getConfiguration("tracer").get<boolean>("retention.enabled", true),
    retentionDays: vscode.workspace.getConfiguration("tracer").get<number>("retention.days", 30),
    storageStats
  }));
  context.subscriptions.push(vscode.window.registerWebviewViewProvider("tracer.dashboard", sidebar));
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  status.command = "tracer.showStatus";
  context.subscriptions.push(status);
  const updateStatus = (): void => {
    status.text = ended ? "$(circle-slash) Tracer: stopped" : recording ? "$(pulse) Tracer: recording" : "$(debug-pause) Tracer: paused";
    status.tooltip = `${hasSession ? `Tracer session — ${eventCount} events` : "Tracer is stopped — no active session"}\nObjective: ${currentObjective}`;
    status.show();
    sidebar.refresh();
    if (eventCount % 25 === 0) void refreshStorageStats();
  };
  const append = async (
    type: Parameters<typeof createEvent>[2],
    payload: Record<string, unknown> = {},
    details: Parameters<typeof createEvent>[4] = {}
  ): Promise<void> => {
    const lifecycle = type === "session_started" || type === "session_ended" || type === "session_paused" || type === "session_resumed";
    if (!hasSession || !store || (!recording && !lifecycle)) return;
    await store.append(createEvent(sessionId, ++sequence, type, payload, details));
    eventCount += 1;
    updateStatus();
  };
  const fileDetails = (document: vscode.TextDocument): Parameters<typeof createEvent>[4] => ({
    file: { path: vscode.workspace.asRelativePath(document.uri), languageId: document.languageId }
  });
  const ignored = () => vscode.workspace.getConfiguration("tracer").get<string[]>("ignorePatterns", DEFAULT_IGNORES);

  async function startSession(): Promise<void> {
    sessionId = randomUUID();
    sequence = 0;
    eventCount = 0;
    currentObjective = "Not set";
    ended = false;
    recording = true;
    hasSession = true;
    store = new SessionStore(join(sessionsDirectory, sessionFileName(sessionId)));
    await append("session_started", { workspace: vscode.workspace.name ?? null }, {
      workspace: { name: vscode.workspace.name ?? undefined, path: vscode.workspace.workspaceFile?.fsPath }
    });
    if (vscode.workspace.workspaceFile || vscode.workspace.workspaceFolders?.length) {
      await append("workspace_opened", {}, {
        workspace: { name: vscode.workspace.name ?? undefined, path: vscode.workspace.workspaceFile?.fsPath }
      });
    }
    if (vscode.window.activeTextEditor) {
      await append("active_file_changed", {}, fileDetails(vscode.window.activeTextEditor.document));
    }
    await refreshStorageStats();
  }

  await pruneExpiredSessions(sessionsDirectory, "", retentionSettings());
  await refreshStorageStats();
  updateStatus();

  context.subscriptions.push(
    vscode.commands.registerCommand("tracer.recordTestEvent", async () => {
      if (!hasSession) {
        void vscode.window.showInformationMessage("Tracer is stopped. Start a session before recording events.");
        return;
      }
      await append("file_changed", { source: "manual_test_command" });
      void vscode.window.showInformationMessage(`Tracer recorded event ${sequence}.`);
    }),
    vscode.commands.registerCommand("tracer.start", async () => {
      if (recording) return;
      await startSession();
      void vscode.window.showInformationMessage("Tracer recording started.");
    }),
    vscode.commands.registerCommand("tracer.showStatus", async () => {
      const events = await readCurrentEvents();
      void vscode.window.showInformationMessage(`${hasSession ? `Tracer session ${sessionId.slice(0, 8)}` : "Tracer has no active session"}: ${events.length} events (${ended ? "stopped" : recording ? "recording" : "paused"}).`);
    }),
    vscode.commands.registerCommand("tracer.setObjective", async () => {
      if (!hasSession) {
        void vscode.window.showInformationMessage("Start a Tracer session before setting an objective.");
        return;
      }
      const objective = await vscode.window.showInputBox({
        prompt: "What are you trying to accomplish in this session?",
        placeHolder: "e.g. Fix token refresh handling and make the tests pass",
        ignoreFocusOut: true
      });
      if (!objective?.trim()) return;
      currentObjective = objective.trim();
      await append("objective_set", { objective: objective.trim() });
      void vscode.window.showInformationMessage("Tracer current objective updated.");
    }),
    vscode.commands.registerCommand("tracer.pause", async () => {
      if (ended || !recording) return;
      recording = false;
      await append("session_paused");
      void vscode.window.showInformationMessage("Tracer recording paused.");
    }),
    vscode.commands.registerCommand("tracer.resume", async () => {
      if (recording) return;
      if (ended || !hasSession) {
        await startSession();
        void vscode.window.showInformationMessage("Tracer started a new recording session.");
        return;
      }
      recording = true;
      await append("session_resumed");
      void vscode.window.showInformationMessage("Tracer recording resumed.");
    }),
    vscode.commands.registerCommand("tracer.stop", async () => {
      if (ended) return;
      ended = true;
      recording = false;
      await append("session_ended");
      void vscode.window.showInformationMessage("Tracer recording stopped for this session.");
    }),
    vscode.commands.registerCommand("tracer.showTimeline", async () => {
      const events = await readCurrentEvents();
      const panel = vscode.window.createWebviewPanel("tracerTimeline", "Tracer Timeline", vscode.ViewColumn.Beside, {});
      panel.webview.html = timelineHtml(
        renderFullTimeline(events),
        renderCompactTimeline(events),
        renderSessionSummary(events),
        renderAiContext(events)
      );
    }),
    vscode.commands.registerCommand("tracer.showRecentSessions", async () => {
      const sessions = await readRecentSessions(sessionsDirectory, sessionId);
      if (!sessions.length) {
        void vscode.window.showInformationMessage("Tracer has no previous sessions to show.");
        return;
      }
      const choice = await vscode.window.showQuickPick(sessions.map((session) => ({
        label: `${session.workspace} — ${session.startedAt}`,
        description: `${session.eventCount} events${session.sessionId === sessionId ? " (current)" : ""}`,
        session
      })), { placeHolder: "Choose a session to inspect" });
      if (!choice) return;
      const panel = vscode.window.createWebviewPanel("tracerSession", `Tracer — ${choice.session.workspace}`, vscode.ViewColumn.Beside, {});
      panel.webview.html = timelineHtml(
        renderFullTimeline(choice.session.events),
        renderCompactTimeline(choice.session.events),
        renderSessionSummary(choice.session.events),
        renderAiContext(choice.session.events)
      );
    }),
    vscode.commands.registerCommand("tracer.exportTimeline", async () => {
      const events = await readCurrentEvents();
      const target = await vscode.window.showSaveDialog({
        saveLabel: "Export Tracer Timeline",
        filters: { Markdown: ["md"] },
        defaultUri: vscode.Uri.file("tracer-timeline.md")
      });
      if (!target) return;
      await writeFile(target.fsPath, renderFullTimeline(events), "utf8");
      void vscode.window.showInformationMessage(`Tracer timeline exported to ${target.fsPath}.`);
    }),
    vscode.commands.registerCommand("tracer.exportSession", async () => {
      const events = await readCurrentEvents();
      const choice = await vscode.window.showQuickPick([
        { label: "Raw JSONL", key: "raw", extension: "jsonl" },
        { label: "Compact JSONL", key: "compact", extension: "jsonl" },
        { label: "Full Timeline Markdown", key: "full", extension: "md" },
        { label: "Compact Timeline Markdown", key: "compactMd", extension: "md" },
        { label: "Session Summary Markdown", key: "summary", extension: "md" },
        { label: "AI Review Markdown", key: "context", extension: "md" }
      ], { placeHolder: "Choose the Tracer projection to export" });
      if (!choice) return;
      const content = choice.key === "raw" ? renderRawJsonl(events)
        : choice.key === "compact" ? compactJsonl(events)
          : choice.key === "full" ? renderFullTimeline(events)
            : choice.key === "compactMd" ? renderCompactTimeline(events)
              : choice.key === "summary" ? renderSessionSummary(events)
                : renderAiContext(events);
      const target = await vscode.window.showSaveDialog({
        saveLabel: "Export Tracer Projection",
        defaultUri: vscode.Uri.file(`tracer-${choice.key}.${choice.extension}`)
      });
      if (!target) return;
      await writeFile(target.fsPath, content, "utf8");
      void vscode.window.showInformationMessage(`Tracer projection exported to ${target.fsPath}.`);
    }),
    vscode.commands.registerCommand("tracer.copyAiContext", async () => {
      const events = await readCurrentEvents();
      await vscode.env.clipboard.writeText(renderAiContext(events));
      void vscode.window.showInformationMessage("Tracer AI review copied to the clipboard.");
    }),
    vscode.commands.registerCommand("tracer.manageStorage", async () => {
      await refreshStorageStats();
      const settings = retentionSettings();
      const choice = await vscode.window.showQuickPick([
        { label: "$(folder-opened) Open Tracer storage folder", action: "open" },
        { label: "$(trash) Clean expired sessions now", action: "clean" },
        { label: "$(settings-gear) Open retention settings", action: "settings" }
      ], { placeHolder: `${storageStats.sessions} sessions • ${formatBytes(storageStats.bytes)} • ${settings.enabled ? `${settings.days}-day retention` : "retention disabled"}` });
      if (!choice) return;
      if (choice.action === "open") {
        await vscode.env.openExternal(vscode.Uri.file(sessionsDirectory));
      } else if (choice.action === "clean") {
        const deleted = await pruneExpiredSessions(sessionsDirectory, sessionId, settings);
        await refreshStorageStats();
        void vscode.window.showInformationMessage(deleted ? `Tracer removed ${deleted} expired session${deleted === 1 ? "" : "s"}.` : "Tracer found no expired sessions to remove.");
      } else {
        await vscode.commands.executeCommand("workbench.action.openSettings", "@ext:tracer-local.tracer retention");
      }
    }),
    vscode.commands.registerCommand("tracer.cleanExpiredSessions", async () => {
      const deleted = await pruneExpiredSessions(sessionsDirectory, sessionId, retentionSettings());
      await refreshStorageStats();
      void vscode.window.showInformationMessage(deleted ? `Tracer removed ${deleted} expired session${deleted === 1 ? "" : "s"}.` : "Tracer found no expired sessions to remove.");
    }),
    vscode.workspace.onDidOpenTextDocument((document) => {
      void append("file_opened", {}, fileDetails(document));
    }),
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor) void append("active_file_changed", {}, fileDetails(editor.document));
    }),
    vscode.workspace.onDidChangeWorkspaceFolders((event) => {
      void append("workspace_changed", { added: event.added.length, removed: event.removed.length });
    }),
    vscode.workspace.onDidChangeTextDocument((event) => {
      const path = vscode.workspace.asRelativePath(event.document.uri);
      const excluded = isIgnoredPath(path, ignored());
      const changes = excluded ? [] : event.contentChanges.map((change) => ({
        range: {
          startLine: change.range.start.line,
          startCharacter: change.range.start.character,
          endLine: change.range.end.line,
          endCharacter: change.range.end.character
        },
        text: change.text
      }));
      void append("file_changed", { excluded, changes, changeCount: event.contentChanges.length }, fileDetails(event.document));
    }),
    vscode.workspace.onDidSaveTextDocument((document) => {
      void append("file_saved", { excluded: isIgnoredPath(vscode.workspace.asRelativePath(document.uri), ignored()) }, fileDetails(document));
    }),
    vscode.languages.onDidChangeDiagnostics((event) => {
      const diagnostics = event.uris.map((uri) => ({
        file: vscode.workspace.asRelativePath(uri),
        items: vscode.languages.getDiagnostics(uri).map((diagnostic) => ({
          severity: diagnostic.severity,
          message: vscode.workspace.getConfiguration("tracer").get<boolean>("captureDiagnosticMessages", false) ? diagnostic.message : null,
          messageCaptured: vscode.workspace.getConfiguration("tracer").get<boolean>("captureDiagnosticMessages", false)
        }))
      }));
      void append("diagnostics_changed", { diagnostics });
    }),
    vscode.window.onDidOpenTerminal((terminal) => {
      void append("terminal_opened", { name: terminal.name });
    }),
    vscode.window.onDidCloseTerminal((terminal) => {
      void append("terminal_closed", { name: terminal.name, exitStatus: terminal.exitStatus?.code ?? null });
    }),
    vscode.tasks.onDidStartTask((event) => {
      void append("task_started", { name: event.execution.task.name, source: event.execution.task.source, type: event.execution.task.definition.type ?? null });
    }),
    vscode.tasks.onDidEndTask((event) => {
      void append("task_finished", { name: event.execution.task.name, source: event.execution.task.source });
    }),
    vscode.tasks.onDidEndTaskProcess((event) => {
      void append("task_process_finished", { name: event.execution.task.name, exitCode: event.exitCode ?? null, source: event.execution.task.source });
    })
  );

  registerShellExecutionListeners(vscode, append, context, () =>
    vscode.workspace.getConfiguration("tracer").get<boolean>("captureTerminalCommands", false)
  );
  await registerGitListeners(vscode, append, context);

  context.subscriptions.push({ dispose: () => {
    if (hasSession && !ended) {
      ended = true;
      recording = false;
      void append("session_ended");
    }
  } });

  function retentionSettings(): RetentionSettings {
    const configuration = vscode.workspace.getConfiguration("tracer");
    return {
      enabled: configuration.get<boolean>("retention.enabled", true),
      days: Math.max(1, configuration.get<number>("retention.days", 30))
    };
  }

  async function refreshStorageStats(): Promise<void> {
    storageStats = await getStorageStats(sessionsDirectory);
    sidebar.refresh();
  }

  async function readCurrentEvents(): Promise<Awaited<ReturnType<SessionStore["readAll"]>>> {
    return store ? store.readAll() : [];
  }
}

export function deactivate(): void {}

type SidebarState = {
  state: "recording" | "paused" | "stopped";
  eventCount: number;
  objective: string;
  sessionId: string;
  retentionEnabled: boolean;
  retentionDays: number;
  storageStats: StorageStats;
};

class TracerSidebarProvider implements vscode.WebviewViewProvider {
  private view: vscode.WebviewView | undefined;

  public constructor(private readonly getState: () => SidebarState) {}

  public resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = { enableScripts: true };
    view.webview.onDidReceiveMessage((message: { command?: string }) => {
      if (message.command) void vscode.commands.executeCommand(message.command);
    }, undefined);
    view.webview.html = this.render();
  }

  public refresh(): void {
    if (this.view) this.view.webview.html = this.render();
  }

  private render(): string {
    const state = this.getState();
    const escape = (value: string): string => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
    const button = (command: string, label: string, primary = false): string => `<button class="${primary ? "primary" : ""}" data-command="${command}">${label}</button>`;
    return `<!doctype html><html><head><meta charset="utf-8"><style>
      :root{font-family:var(--vscode-font-family);font-size:var(--vscode-font-size)}
      body{color:var(--vscode-foreground);background:var(--vscode-sideBar-background);margin:0;padding:12px;overflow-y:auto}
      .section{border-bottom:1px solid var(--vscode-sideBarSectionHeader-border);padding:0 0 14px;margin:0 0 14px}
      h2{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--vscode-sideBarSectionHeader-foreground);margin:0 0 10px}
      .state{display:flex;align-items:center;gap:8px;font-weight:600}.dot{width:8px;height:8px;border-radius:50%;background:var(--vscode-testing-iconPassed)}
      .paused .dot{background:var(--vscode-notificationsWarningIcon-foreground)}.stopped .dot{background:var(--vscode-descriptionForeground)}
      .meta{color:var(--vscode-descriptionForeground);font-size:11px;margin-top:6px;line-height:1.45;overflow-wrap:anywhere}
      .objective{padding:8px;background:var(--vscode-textCodeBlock-background);border-left:2px solid var(--vscode-textLink-foreground);line-height:1.4;overflow-wrap:anywhere}
      button{display:block;width:100%;text-align:left;color:var(--vscode-foreground);background:var(--vscode-button-secondaryBackground);border:0;padding:7px 9px;margin:5px 0;cursor:pointer;border-radius:2px}
      button:hover{background:var(--vscode-button-secondaryHoverBackground)}button.primary{color:var(--vscode-button-foreground);background:var(--vscode-button-background)}
      button.primary:hover{background:var(--vscode-button-hoverBackground)}
    </style></head><body>
      <section class="section"><h2>Session</h2><div class="state ${state.state}"><span class="dot"></span><span>${state.state}</span></div><div class="meta">${state.eventCount} events<br>${state.sessionId ? `Session ${escape(state.sessionId.slice(0, 8))}` : "No session started"}</div></section>
      <section class="section"><h2>Current objective</h2><div class="objective">${escape(state.objective)}</div>${button("tracer.setObjective", "Set objective", true)}</section>
      <section class="section"><h2>Recording</h2>${state.state === "recording" ? button("tracer.pause", "Pause recording", true) : state.state === "paused" ? button("tracer.resume", "Resume recording", true) : button("tracer.start", "Start recording", true)}${state.state !== "stopped" ? button("tracer.stop", "Stop recording") : ""}${button("tracer.showStatus", "Show status")}</section>
      <section class="section"><h2>Inspect</h2>${button("tracer.showTimeline", "Open timeline", true)}${button("tracer.showRecentSessions", "Recent sessions")}</section>
      <section class="section"><h2>Storage</h2><div class="meta">${state.storageStats.sessions} session${state.storageStats.sessions === 1 ? "" : "s"} · ${formatBytes(state.storageStats.bytes)}<br>Automatic cleanup: ${state.retentionEnabled ? `after ${state.retentionDays} days` : "disabled"}</div>${button("tracer.manageStorage", "Manage storage", true)}${button("tracer.cleanExpiredSessions", "Clean expired sessions")}</section>
      <section class="section"><h2>Export</h2>${button("tracer.exportSession", "Export projection")}${button("tracer.exportTimeline", "Export timeline")}${button("tracer.copyAiContext", "Copy AI review")}</section>
      <script>const vscode=acquireVsCodeApi();for(const button of document.querySelectorAll('button'))button.addEventListener('click',()=>vscode.postMessage({command:button.dataset.command}));</script>
    </body></html>`;
  }
}

type StorageStats = {
  sessions: number;
  bytes: number;
};

type RetentionSettings = {
  enabled: boolean;
  days: number;
};

async function getStorageStats(directory: string): Promise<StorageStats> {
  try {
    const files = (await readdir(directory)).filter((file) => file.endsWith(".jsonl"));
    const sizes = await Promise.all(files.map(async (file) => {
      try {
        return (await stat(join(directory, file))).size;
      } catch {
        return 0;
      }
    }));
    return { sessions: files.length, bytes: sizes.reduce((total, size) => total + size, 0) };
  } catch {
    return { sessions: 0, bytes: 0 };
  }
}

async function pruneExpiredSessions(directory: string, currentSessionId: string, settings: RetentionSettings): Promise<number> {
  if (!settings.enabled) return 0;
  let files: string[];
  try {
    files = (await readdir(directory)).filter((file) => file.endsWith(".jsonl"));
  } catch {
    return 0;
  }
  const cutoff = Date.now() - settings.days * 24 * 60 * 60 * 1000;
  let deleted = 0;
  for (const file of files) {
    const path = join(directory, file);
    try {
      const events = await new SessionStore(path).readAll();
      if (events[0]?.sessionId === currentSessionId) continue;
      const lastEvent = events.at(-1);
      if (!events.length || lastEvent?.type !== "session_ended") continue;
      const startedAt = Date.parse(events[0].timestamp);
      if (Number.isFinite(startedAt) && startedAt < cutoff) {
        await unlink(path);
        deleted += 1;
      }
    } catch {
      // Preserve malformed or partially written sessions for inspection.
    }
  }
  return deleted;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function sessionFileName(sessionId: string): string {
  const timestamp = new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
  return `session-${timestamp}-${sessionId.slice(0, 8)}.jsonl`;
}

function timelineHtml(full: string, compact: string, summary: string, context: string): string {
  const escape = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  const panel = (id: string, title: string, content: string, active = false) => `<section id="${id}" class="view${active ? " active" : ""}"><h2>${title}</h2><pre>${escape(content)}</pre></section>`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    body{font-family:var(--vscode-font-family);color:var(--vscode-foreground);background:var(--vscode-editor-background);padding:16px}
    button{color:var(--vscode-button-foreground);background:var(--vscode-button-background);border:0;padding:6px 10px;margin-right:6px;cursor:pointer}
    button:hover{background:var(--vscode-button-hoverBackground)} .view{display:none}.view.active{display:block}
    pre{white-space:pre-wrap;line-height:1.45;border:1px solid var(--vscode-panel-border);padding:12px;overflow:auto}
  </style></head><body><h1>Tracer Timeline</h1>
    <nav><button data-view="full">Full</button><button data-view="compact">Compact</button><button data-view="summary">Summary</button><button data-view="context">AI Review</button></nav>
    ${panel("full", "Full Timeline", full, true)}${panel("compact", "Compact Timeline", compact)}${panel("summary", "Session Summary", summary)}${panel("context", "AI Review", context)}
    <script>for(const button of document.querySelectorAll('button')){button.addEventListener('click',()=>{for(const view of document.querySelectorAll('.view'))view.classList.remove('active');document.getElementById(button.dataset.view)?.classList.add('active');});}</script>
  </body></html>`;
}

type RecentSession = {
  sessionId: string;
  workspace: string;
  startedAt: string;
  startedAtIso: string;
  eventCount: number;
  events: Awaited<ReturnType<SessionStore["readAll"]>>;
};

async function readRecentSessions(directory: string, currentSessionId: string): Promise<RecentSession[]> {
  let files: string[];
  try {
    files = (await readdir(directory)).filter((file) => file.endsWith(".jsonl"));
  } catch {
    return [];
  }
  const sessions = await Promise.all(files.map(async (file): Promise<RecentSession | undefined> => {
    try {
      const events = await new SessionStore(join(directory, file)).readAll();
      const first = events[0];
      if (!first) return undefined;
      return {
        sessionId: first.sessionId,
        workspace: first.workspace?.name ?? "Unnamed workspace",
        startedAt: new Date(first.timestamp).toLocaleString(),
        startedAtIso: first.timestamp,
        eventCount: events.length,
        events
      };
    } catch {
      return undefined;
    }
  }));
  return sessions
    .filter((session): session is RecentSession => Boolean(session))
    .sort((left, right) => (left.sessionId === currentSessionId ? -1 : right.sessionId === currentSessionId ? 1 : right.startedAtIso.localeCompare(left.startedAtIso)))
    .slice(0, 25);
}

type AppendEvent = (
  type: Parameters<typeof createEvent>[2],
  payload?: Record<string, unknown>,
  details?: Parameters<typeof createEvent>[4]
) => Promise<void>;

type ShellExecutionEvent = {
  terminal: { name: string };
  execution: { commandLine?: { value?: string }; cwd?: vscode.Uri };
};

type ShellExecutionEmitter = {
  onDidStartTerminalShellExecution?: (listener: (event: ShellExecutionEvent) => void) => vscode.Disposable;
  onDidEndTerminalShellExecution?: (listener: (event: ShellExecutionEvent) => void) => vscode.Disposable;
};

function registerShellExecutionListeners(
  api: typeof vscode,
  append: AppendEvent,
  context: vscode.ExtensionContext,
  captureCommands: () => boolean
): void {
  const shellApi = api.window as typeof api.window & ShellExecutionEmitter;
  if (shellApi.onDidStartTerminalShellExecution) {
    context.subscriptions.push(shellApi.onDidStartTerminalShellExecution((event) => {
      void append("terminal_command_started", {
        terminal: event.terminal.name,
        command: captureCommands() ? event.execution.commandLine?.value ?? null : null,
        commandCaptured: captureCommands(),
        cwd: event.execution.cwd?.fsPath ?? null
      });
    }));
  }
  if (shellApi.onDidEndTerminalShellExecution) {
    context.subscriptions.push(shellApi.onDidEndTerminalShellExecution((event) => {
      void append("terminal_command_finished", {
        terminal: event.terminal.name,
        command: captureCommands() ? event.execution.commandLine?.value ?? null : null,
        commandCaptured: captureCommands(),
        cwd: event.execution.cwd?.fsPath ?? null
      });
    }));
  }
}

type GitHead = { name?: string; commit?: string };
type GitRepository = {
  rootUri: vscode.Uri;
  state: {
    HEAD?: GitHead;
    onDidChange: (listener: () => void) => vscode.Disposable;
  };
};
type GitApi = {
  repositories: GitRepository[];
  onDidOpenRepository?: (listener: (repository: GitRepository) => void) => vscode.Disposable;
};
type GitExtension = { getAPI: (version: number) => GitApi };

async function registerGitListeners(
  api: typeof vscode,
  append: AppendEvent,
  context: vscode.ExtensionContext
): Promise<void> {
  const extension = api.extensions.getExtension<GitExtension>("vscode.git");
  if (!extension) return;
  let gitApi: GitApi | undefined;
  try {
    const git = extension.isActive ? extension.exports : await extension.activate();
    gitApi = git?.getAPI(1);
  } catch {
    return;
  }
  if (!gitApi) return;

  const attach = (repository: GitRepository): void => {
    let previous = repository.state.HEAD;
    const capture = (): void => {
      const current = repository.state.HEAD;
      if (!current) return;
      if (current.name !== previous?.name) {
        void append("git_branch_changed", { repository: repository.rootUri.fsPath, branch: current.name ?? null, commit: current.commit ?? null });
      }
      if (current.commit && previous?.commit && current.commit !== previous.commit) {
        void append("git_commit", { repository: repository.rootUri.fsPath, branch: current.name ?? null, commit: current.commit });
      }
      previous = current;
    };
    context.subscriptions.push(repository.state.onDidChange(capture));
    if (repository.state.HEAD) {
      void append("git_branch_changed", { repository: repository.rootUri.fsPath, branch: repository.state.HEAD.name ?? null, commit: repository.state.HEAD.commit ?? null });
    }
  };

  for (const repository of gitApi.repositories) attach(repository);
  if (gitApi.onDidOpenRepository) context.subscriptions.push(gitApi.onDidOpenRepository(attach));
}
