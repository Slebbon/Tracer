import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createEvent } from "./src/core/events.ts";
import { isIgnoredPath } from "./src/core/privacy.ts";
import { SessionStore } from "./src/core/session-store.ts";
import { compactEvents } from "./src/core/timeline.ts";

test("privacy defaults exclude secrets without excluding ordinary source files", () => {
  assert.equal(isIgnoredPath(".env"), true);
  assert.equal(isIgnoredPath("packages/api/.env.local"), true);
  assert.equal(isIgnoredPath("src/cert.pem"), true);
  assert.equal(isIgnoredPath("src/secrets/token.txt"), true);
  assert.equal(isIgnoredPath("src/auth/token.ts"), false);
});

test("compact edits retain their raw sequence references", () => {
  const first = createEvent("session", 1, "file_changed", {}, { file: { path: "src/a.ts" } });
  const second = {
    ...createEvent("session", 2, "file_changed", {}, { file: { path: "src/a.ts" } }),
    timestamp: new Date(Date.parse(first.timestamp) + 1_000).toISOString()
  };
  const compact = compactEvents([second, first]);
  assert.equal(compact.length, 1);
  assert.deepEqual(compact[0].sourceSequences, [1, 2]);
});

test("compact timeline groups nearby diagnostic updates", () => {
  const first = createEvent("session", 1, "diagnostics_changed", { diagnostics: [] });
  const second = {
    ...createEvent("session", 2, "diagnostics_changed", { diagnostics: [] }),
    timestamp: new Date(Date.parse(first.timestamp) + 1_000).toISOString()
  };
  const compact = compactEvents([first, second]);
  assert.equal(compact.length, 1);
  assert.deepEqual(compact[0].sourceSequences, [1, 2]);
});

test("session store serializes concurrent appends in sequence order", async () => {
  const directory = await mkdtemp(join(tmpdir(), "tracer-test-"));
  const path = join(directory, "events.jsonl");
  const store = new SessionStore(path);
  await Promise.all([
    store.append(createEvent("session", 1, "session_started")),
    store.append(createEvent("session", 2, "file_opened")),
    store.append(createEvent("session", 3, "file_saved"))
  ]);
  const events = await store.readAll();
  assert.deepEqual(events.map((event) => event.sequence), [1, 2, 3]);
  assert.equal((await readFile(path, "utf8")).trim().split("\n").length, 3);
});

test("session store rejects malformed event records", async () => {
  const directory = await mkdtemp(join(tmpdir(), "tracer-invalid-test-"));
  const path = join(directory, "events.jsonl");
  const store = new SessionStore(path);
  await import("node:fs/promises").then(({ writeFile }) => writeFile(path, JSON.stringify({ schemaVersion: 1, sequence: "wrong" }) + "\n", "utf8"));
  await assert.rejects(() => store.readAll(), /Invalid Tracer event at JSONL line 1/);
});

test("session store rejects unknown event types", async () => {
  const directory = await mkdtemp(join(tmpdir(), "tracer-unknown-event-test-"));
  const path = join(directory, "events.jsonl");
  const store = new SessionStore(path);
  const event = createEvent("session", 1, "session_started");
  await import("node:fs/promises").then(({ writeFile }) => writeFile(path, JSON.stringify({ ...event, type: "future_event" }) + "\n", "utf8"));
  await assert.rejects(() => store.readAll(), /Invalid Tracer event at JSONL line 1/);
});
