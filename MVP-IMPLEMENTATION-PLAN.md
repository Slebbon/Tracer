# Tracer — MVP Implementation Plan

## Goal

Validate Tracer's core hypothesis with one narrow promise: after a coding session, I can inspect what I did, how the work evolved, and export that context for another tool or for myself.

The MVP is a VS Code extension backed by a logically IDE-independent Tracer Core. The extension is the first collector and interface; it is not the permanent product boundary.

## Product boundary

### In scope for v0.1

- VS Code extension activation and session lifecycle
- Workspace/project identification
- Active-file and file-open events
- File-save events with structured text-change details
- Diagnostics changes
- Local append-only JSONL storage
- Full chronological timeline
- Deterministic compact timeline
- Markdown export for full trace, compact trace, and current context
- Privacy exclusions for sensitive paths
- Basic status and timeline commands

### Deliberately deferred

- AI-generated semantic summaries
- Learning extraction and knowledge scoring
- Cloud sync or accounts
- Standalone desktop/web app
- Cross-session project memory
- Broad terminal/test capture that depends on fragile IDE APIs
- Cursor-level telemetry and every keystroke

The MVP should prove the recorder and timeline before adding interpretation.

## Architecture

```text
VS Code APIs
    ↓
VS Code Collector
    ↓ normalized events
Tracer Core
  - event schema
  - privacy filter
  - JSONL session store
  - compaction
  - renderers/export
    ↓
VS Code timeline/status UI + files on disk
```

The collector may initially run in the extension host alongside Core. The boundary is logical and should be reflected in folders, types, and tests.

## MVP milestones

### Step 0 — Foundation

Create a minimal TypeScript VS Code extension workspace with separate `core` and `vscode` modules, a test runner, formatting/linting, and a documented local data directory.

Done when the extension activates and a smoke test can append and read one event without VS Code-specific imports in Core.

### Step 1 — Canonical event model and storage

Define a versioned event envelope with `schemaVersion`, `sessionId`, `sequence`, ISO `timestamp`, `source`, `type`, optional workspace/file references, and a typed payload.

Implement session start/end and append-only JSONL storage. Every event must have a monotonic session sequence. Malformed records must not silently become valid records.

Done when a session can be reopened after extension restart and event order is deterministic.

### Step 2 — First useful collectors

Capture only high-signal events: session lifecycle, workspace changes, file opening/active-file changes, file changes/saves, and diagnostics changes. Preserve structured ranges and old/new text where available, subject to path filtering. Do not capture secrets by default.

Done when a real 15–30 minute coding session produces a readable local event log without excessive noise.

### Step 3 — Full timeline

Build a read-only timeline renderer from stored events. Keep raw event data accessible; rendering must never become the source of truth. Add a VS Code command and panel/webview showing timestamps, event type, file, and relevant payload details.

Done when the user can answer “what exactly did I do?” from the extension alone.

### Step 4 — Deterministic compaction

Group adjacent related file-change events using explicit rules, initially by file and a short time window. Each compact event must retain references to source sequence numbers. Every compact item must be traceable to raw events.

### Step 5 — Export and privacy controls

Export raw JSONL, compact JSONL, full timeline Markdown, compact timeline Markdown, and current development context Markdown. Add configurable ignore patterns for `.env`, secrets, keys/certificates, dependencies, and user-defined paths. Filtering must happen before persistence for excluded content.

### Step 6 — MVP validation

Use Tracer while building Tracer. Evaluate three sessions: accuracy, noise, compaction fidelity, unexpected sensitive capture, and usefulness of exported context when pasted into an AI assistant.

## Acceptance criteria

- Works offline with no account or network dependency.
- Raw events are append-only, timestamped, sequenced, and inspectable.
- Core can be tested without starting VS Code.
- Compact output is deterministic and references raw source events.
- Excluded paths never write file contents to the trace.
- Exports are ordinary JSONL/Markdown files.
- The extension has a clear pause/stop control or documented session boundary.
- A fresh user can understand the current session without reading implementation docs.

## Decisions

- JSONL is canonical; Markdown is a projection/export.
- Raw and compact layers are both first-class and downloadable.
- Semantic/AI interpretation is downstream of deterministic capture and compaction.
- Local storage is the default; network access is opt-in and out of scope for v0.1.
- VS Code is the first collector, not the definition of the core event protocol.

## Immediate next implementation slice

Start with Step 0 and Step 1 together:

1. Scaffold the extension and TypeScript test setup.
2. Add versioned event types.
3. Add an append-only JSONL session store.
4. Add a smoke command that records and displays the current session event count.

This gives Tracer a runnable vertical spine before adding collectors or UI complexity.

## Current implementation status

Completed in the workspace:

- Foundation manifest and TypeScript configuration
- Versioned event envelope
- Serialized append-only JSONL session store
- Session/workspace/file/diagnostics collectors
- Terminal open/close and capability-detected shell command start/finish collectors
- VS Code task start/finish/process-result collectors for detectable test/build activity
- Capability-detected Git branch and commit collectors through the built-in VS Code Git API
- Explicit pause, resume, and stop recording controls with lifecycle events
- Persistent VS Code status-bar indicator for recording state and event count
- Runtime validation of stored event envelopes
- Emitted-build Core smoke check in addition to type-checking
- Workspace `out` build and `.vscodeignore` packaging boundary
- Verified distributable `tracer-0.0.1.vsix` artifact
- Three-session MVP validation checklist
- First live session projection check: 83 raw events compacted to 14 events
- Four-view in-editor timeline panel: Full, Compact, Summary, and AI Context
- VSIX packaging verified with runtime-only output (10 files, no source maps)
- Recent-session browser with re-openable historical projections
- Runtime event validation rejects unknown event types; historical-session ordering is timestamp-based
- Privacy defaults cover nested `.env`/environment files with regression coverage
- Summaries and compact labels surface task, terminal, Git, and diagnostic outcomes
- Diagnostic severity is captured by default; diagnostic message text is explicit opt-in
- Status-bar tooltip includes the current objective during recording
- Deterministic summaries include a development path with raw event references
- Explicit session objective captured locally and included in Summary/AI Context
- Local build/test artifacts excluded from future source control
- Configurable sensitive-path filtering before file-change payload persistence
- Full timeline Markdown renderer
- Deterministic compact timeline with raw sequence references
- Raw JSONL, compact JSONL, full/compact Markdown, summary, and AI-context projections
- One-command copy of AI context to the local clipboard
- VS Code commands for status, timeline inspection, and projection export
- Core tests covering privacy, compaction, and concurrent append ordering

The next slice is real-session validation, followed by test/Git signals only if they add useful signal without making the trace noisy.
