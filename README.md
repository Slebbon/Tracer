# Tracer

Tracer is a local-first VS Code developer-activity recorder. It records a structured chronological event stream and derives inspectable timeline and review projections from it.

## Author and license

Tracer was created and is maintained by **Marco Confessore**. It is released under the [MIT License](LICENSE).

## Current MVP surface

- Session, workspace, file, edit, save, diagnostic, terminal, and VS Code task events
- Explicit start control: Tracer opens stopped and records only after you start a session
- Append-only JSONL storage under the VS Code global storage directory
- Full and deterministic compact timelines
- Raw JSONL, compact JSONL, full/compact Markdown, summary, and AI Review exports
- Configurable sensitive-path exclusions
- Pause, resume, and stop recording controls
- Starting a new session after stopping, without overwriting the previous session
- Status-bar indicator showing recording state and event count
- Tracer Activity Bar icon with a scrollable sidebar dashboard
- Importable Godot 4 editor plugin with the same event envelope and AI Review flow
- Configurable local session retention with automatic cleanup after 30 days by default

Terminal command text is disabled by default. Enable `tracer.captureTerminalCommands` only when the workspace permits command capture.

Diagnostic message text is also disabled by default; severity metadata is retained without recording message contents.

## Development

```powershell
npm install
npm run check
npm run test:core
npm run package:extension
```

The extension entry point is `src/extension.ts`. In VS Code, compile the extension and launch an Extension Development Host using the project manifest.

`npm run package:extension` produces `tracer-0.0.1.vsix` for local installation.

The workspace contains `MVP-VALIDATION-CHECKLIST.md` for the first three real-session validation runs.

The workspace also contains `MVP-STATUS.md`, an evidence-backed implementation audit.

The `godot/` directory contains the Godot 4 addon source, and `tracer-godot-0.1.0.zip` is the generated importable package. Copy the ZIP contents into a Godot project so the project contains `addons/tracer/`, then enable Tracer under Project Settings > Plugins.

## Godot 4 integration

Tracer can run inside the Godot editor as an importable editor plugin. Build the package with:

```powershell
npm run package:godot
```

Extract `tracer-godot-0.1.0.zip` into the root of a Godot project, at the same level as `project.godot`:

```text
your-game/
├── project.godot
└── addons/
    └── tracer/
```

Enable it from `Project > Project Settings > Plugins`. The Tracer dock appears in the right editor dock area. The first Godot MVP starts stopped and provides:

- Start, Pause, Resume, and Stop controls;
- a new session after stopping, without overwriting the previous one;
- script, scene, resource, filesystem, selection, editor-screen, and playtest events;
- saved script diffs and saved-file metadata;
- a readable AI Review panel;
- a button to open the local session folder.

Godot sessions are stored locally under `user://tracer/sessions/`. Script diffs are captured when files are saved; unsaved character-by-character edits are not yet collected.

## Useful commands

- `Tracer: Show Status`
- `Tracer: Set Current Objective`
- `Tracer: Pause Recording`
- `Tracer: Resume Recording`
- `Tracer: Stop Recording`
- `Tracer: Show Timeline`
- `Tracer: Show Recent Sessions`
- `Tracer: Export Session Projection`
- `Tracer: Copy AI Context`

## Privacy model

Raw data remains local. Default ignored patterns include `.env`, secrets directories, private keys/certificates, `node_modules`, and `.git`. Excluded file changes retain metadata but never persist their text payload.

The canonical source is JSONL. Markdown outputs are projections and can be regenerated from the raw event layer.

Completed sessions are retained for 30 days by default and then removed automatically. Retention can be disabled or changed with `tracer.retention.enabled` and `tracer.retention.days`. The active session is never removed, and incomplete or malformed sessions are preserved for inspection.

Session files use names such as `session-20260917-100913-a1b2c3d4.jsonl`, combining a UTC timestamp with a short session ID for easier identification.
