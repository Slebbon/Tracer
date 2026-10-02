const assert = require("node:assert/strict");
const { test } = require("node:test");
const { mkdtemp, readdir } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const Module = require("node:module");

test("VS Code opens stopped and writes no snapshots while paused or stopped", async () => {
  const root = await mkdtemp(join(tmpdir(), "tracer-extension-"));
  const commands = new Map();
  const disposable = { dispose() {} };
  const noopListener = () => disposable;
  let save;
  let content = "initial";
  const document = { uri: { scheme: "file" }, languageId: "typescript", getText: () => content };
  const api = {
    StatusBarAlignment: { Left: 1 },
    commands: {
      registerCommand: (name, handler) => { commands.set(name, handler); return disposable; },
      executeCommand: async (name) => commands.get(name)()
    },
    window: {
      activeTextEditor: { document },
      registerWebviewViewProvider: () => disposable,
      createStatusBarItem: () => ({ ...disposable, show() {} }),
      showInformationMessage() {},
      showInputBox: async () => "Implemented targeting",
      onDidChangeActiveTextEditor: noopListener,
      onDidOpenTerminal: noopListener,
      onDidCloseTerminal: noopListener
    },
    workspace: {
      name: "Validation", workspaceFolders: [{}],
      getConfiguration: () => ({ get: (name, fallback) => name === "retention.enabled" ? false : fallback }),
      asRelativePath: () => "Unit.ts",
      onDidOpenTextDocument: noopListener,
      onDidChangeWorkspaceFolders: noopListener,
      onDidChangeTextDocument: noopListener,
      onDidSaveTextDocument: (handler) => { save = handler; return disposable; }
    },
    languages: { onDidChangeDiagnostics: noopListener },
    tasks: { onDidStartTask: noopListener, onDidEndTask: noopListener, onDidEndTaskProcess: noopListener },
    extensions: { getExtension: () => undefined }
  };
  const originalLoad = Module._load;
  Module._load = function(name, ...args) { return name === "vscode" ? api : originalLoad.call(this, name, ...args); };
  let extension;
  try { extension = require("./out/extension.js"); } finally { Module._load = originalLoad; }
  const context = { globalStorageUri: { fsPath: root }, subscriptions: [] };
  const files = async (path) => { try { return await readdir(path); } catch (error) { if (error.code === "ENOENT") return []; throw error; } };
  try {
    await extension.activate(context);
    await save(document);
    assert.deepEqual(await files(join(root, "sessions")), []);
    assert.deepEqual(await files(join(root, "snapshots")), []);
    await commands.get("tracer.start")();
    const sessionDirs = await files(join(root, "snapshots"));
    const snapshots = join(root, "snapshots", sessionDirs[0]);
    assert.equal((await files(snapshots)).length, 1);
    await commands.get("tracer.pause")();
    content = "changed while paused";
    await save(document);
    await commands.get("tracer.setObjective")();
    await commands.get("tracer.noteOutcome")();
    assert.equal((await files(snapshots)).length, 1);
    await commands.get("tracer.start")(); // Resume the paused session.
    assert.equal((await files(join(root, "sessions"))).length, 1);
    await save(document);
    assert.equal((await files(snapshots)).length, 2);
    await commands.get("tracer.stop")();
    content = "changed after stop";
    await save(document);
    assert.equal((await files(snapshots)).length, 2);
    const { SessionStore } = require("./out/core/session-store.js");
    const events = await new SessionStore(join(root, "sessions", (await files(join(root, "sessions")))[0])).readAll();
    assert.ok(events.some((event) => event.type === "objective_set"));
    assert.ok(events.some((event) => event.type === "outcome_noted"));
    assert.equal(events.at(-1).type, "session_ended");
  } finally {
    context.subscriptions.forEach((item) => item.dispose());
  }
  const reopened = { ...context, subscriptions: [] };
  try {
    await extension.activate(reopened);
    await save(document);
    assert.equal((await files(join(root, "sessions"))).length, 1);
    assert.equal((await files(join(root, "snapshots"))).length, 1);
  } finally { reopened.subscriptions.forEach((item) => item.dispose()); }
});
