# Tracer MVP Status

## Product target

The MVP should answer: **“What have I been doing during this coding session?”**

## Evidence matrix

| Requirement | Status | Evidence |
|---|---|---|
| VS Code extension manifest and activation | Verified | `package.json`, compiled `out/extension.js`, installed VSIX |
| Versioned, sequenced event envelope | Verified | `src/core/events.ts`, Core checks |
| Append-only local JSONL storage | Verified | `src/core/session-store.ts`, concurrent-write test |
| Runtime event validation | Verified | malformed and unknown-type tests |
| Workspace/file/edit/save capture | Implemented | `src/extension.ts`; live session produced workspace/file events |
| Diagnostics capture and compaction | Verified | severity metadata is default; message text is opt-in; compaction test; live trace reduced diagnostic noise |
| Terminal/task capture | Implemented | capability-detected listeners in `src/extension.ts` |
| Git branch/commit capture | Live partially verified | real session recorded Git branch events; commit transition still needs controlled validation |
| Full timeline | Core verified | emitted renderer smoke test; UI requires controlled VS Code inspection |
| Compact timeline | Core and live verified | real trace compacted from 83 raw events to 14, later 236 raw events to a smaller compact projection |
| Summary and AI context | Core and live projection verified | generated from real session; objective and development path supported |
| Raw/compact/Markdown exports | Implemented | `src/core/outputs.ts` and export command |
| Copy AI Context | Implemented | VS Code command and clipboard write |
| Pause/resume/stop controls | Implemented | lifecycle events and status-bar state |
| Recent-session history | Implemented | `Tracer: Show Recent Sessions` |
| Sensitive-path filtering | Verified | nested `.env`, secrets, key, certificate tests |
| Distributable package | Verified | `tracer-0.0.1.vsix`, runtime-only archive |

## Persistence audit

The installed extension currently has four local session files totaling 280 events. Every file parsed successfully and every sequence was contiguous from 1 through its event count. This validates the append/read path against real generated traces, not only synthetic tests.

## Remaining validation

The implementation is ahead of the validation evidence. One uncontrolled live session has been observed, but the following still require three controlled sessions using the checklist:

- edit/save/diagnostic/task/terminal/Git sequence accuracy;
- pause/resume exclusion behavior;
- objective capture in Summary and AI Context;
- historical-session reopening;
- export files inspected outside VS Code;
- privacy behavior for an actual ignored file and terminal command.

## Decision gate

Do not add cloud sync, automatic semantic AI summaries, or learning extraction until the three-session validation establishes that the deterministic trace is accurate, unsurprising, and more useful than a Git diff alone.
