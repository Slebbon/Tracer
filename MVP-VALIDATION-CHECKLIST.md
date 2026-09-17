# Tracer MVP Validation Checklist

This checklist validates the product hypothesis:

> A local chronological record of development activity provides useful context that Git and the current AI conversation do not contain.

## Setup

1. Install `tracer-0.0.1.vsix` into a disposable VS Code profile or development VS Code instance.
2. Open a non-sensitive test repository.
3. Keep terminal command capture disabled for the first run.
4. Start with `Tracer: Show Status` and confirm the status bar says `Tracer: recording`.

## Controlled activity session

Perform these actions in order:

1. Open two source files.
2. Edit one ordinary source file and save it.
3. Trigger a diagnostic, if the repository has a simple lint/type error.
4. Run a task or test command.
5. Open a terminal and run a harmless command.
6. Switch Git branches or create a local commit if the repository is disposable.
7. Pause Tracer, edit a file, and resume it.
8. Copy the AI context and export the raw and compact projections.
9. Set a current objective with `Tracer: Set Current Objective` and copy the AI context again.
10. Stop Tracer.

## Evidence to collect

### Capture accuracy

- [ ] Session start and stop are present.
- [ ] Workspace and active-file changes are present.
- [ ] File changes include ranges and text for non-ignored files.
- [ ] Saves, diagnostics, terminal lifecycle, tasks, and Git changes appear when detectable.
- [ ] Events are ordered by sequence and timestamp.

### Compaction

- [ ] Full timeline contains the detailed sequence.
- [ ] Compact timeline reduces repeated edits.
- [ ] Every compact item lists its source raw sequence numbers.
- [ ] Compact output does not invent semantic intent.

### Privacy

- [ ] A file matching `.env`, `secrets/**`, `*.pem`, or `*.key` does not persist text content.
- [ ] Terminal command text remains absent while capture is disabled.
- [ ] Raw storage stays local.

### Usefulness

- [ ] The summary explains what files were explored and changed.
- [ ] The stated objective appears in the Summary and AI Context views.
- [ ] AI context can be pasted into an assistant without additional explanation.
- [ ] The context contains information about the development path that a final Git diff would not contain.
- [ ] A previous session can be reopened through `Tracer: Show Recent Sessions`.

## Decision gate

Record observations for three sessions. Continue to semantic AI summaries only if:

- the full trace is accurate enough to trust;
- compact output is materially easier to review;
- privacy behavior is unsurprising; and
- the exported AI context is more useful than a Git diff alone.

If any gate fails, fix capture or compaction before adding more interpretation.
