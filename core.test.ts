import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createEvent } from "./src/core/events.ts";
import { isIgnoredPath } from "./src/core/privacy.ts";
import { SessionStore } from "./src/core/session-store.ts";
import { compactEvents } from "./src/core/timeline.ts";
import { renderReviewEvidence } from "./src/core/review-evidence.ts";
import { isTraceEvent } from "./src/core/events.ts";

test("review never invents implementation outcomes or successful playtests", () => {
  const edits = createEvent("session", 1, "file_changed", {}, { file: { path: "Unit.gd" } });
  const review = renderReviewEvidence([edits, createEvent("session", 2, "play_stopped")]).join("\n");
  assert.match(review, /Observed edits to `Unit.gd`/);
  assert.match(review, /result unknown/);
  assert.match(review, /Unknown — no unresolved items/);
  assert.match(review, /raw events: 1/);
  assert.doesNotMatch(review, /successfully|Added TargetType/);
});

test("review retains explicit notes and pairs edits with the next run in sequence order", () => {
  const event = (sequence: number, type: Parameters<typeof createEvent>[2], seconds: number, payload = {}) => ({
    ...createEvent("session", sequence, type, payload),
    timestamp: new Date(Date.UTC(2026, 0, 1) + seconds * 1000).toISOString()
  });
  const events = [event(1, "file_changed", 0), event(2, "file_changed", 10), event(3, "file_saved", 12),
    event(4, "code_snapshot", 13), event(5, "play_started", 30), event(6, "play_started", 40),
    event(7, "outcome_noted", 50, { note: "Added TargetType" }),
    event(8, "next_step_noted", 60, { note: "Test ALLY" }), event(9, "file_changed", 70)];
  const review = renderReviewEvidence(events.reverse()).join("\n");
  assert.match(review, /2 edit events → run; 30.0s since first edit, 20.0s since last edit; 1 intervening activity events/);
  assert.match(review, /raw events: 1, 2, 5/);
  assert.match(review, /User-reported: Added TargetType/);
  assert.match(review, /User-reported: Test ALLY/);
  assert.match(review, /Runs without preceding recorded edits: 1/);
  assert.match(review, /Edit events awaiting a recorded run: 1/);
});

test("Godot and annotation event types survive JSONL validation", () => {
  for (const type of ["play_started", "play_stopped", "scene_opened", "scene_saved", "script_opened", "outcome_noted", "next_step_noted"] as const) {
    assert.equal(isTraceEvent(createEvent("godot-session", 1, type, {}, {}, "godot")), true);
  }
});

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
