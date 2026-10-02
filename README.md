# Tracer

Tracer is a local-first VS Code developer-activity recorder. It records a structured chronological event stream and derives inspectable timeline and review projections from it.

## Install

Download the installable packages from the [latest release](https://github.com/Slebbon/Tracer/releases/latest). For older versions, choose a tag on the [releases page](https://github.com/Slebbon/Tracer/releases). Each release includes both collectors; choose the one for your editor or install both.

| Editor | v0.2.0 download | Requirements |
| --- | --- | --- |
| VS Code | [tracer-0.2.0.vsix](https://github.com/Slebbon/Tracer/releases/download/v0.2.0/tracer-0.2.0.vsix) | VS Code 1.90 or later |
| Godot | [tracer-godot-0.2.0.zip](https://github.com/Slebbon/Tracer/releases/download/v0.2.0/tracer-godot-0.2.0.zip) | Godot 4 editor; validated with 4.7.1 |

### VS Code

1. Download the `.vsix` asset from a release.
2. In VS Code, open **Extensions**, choose the **…** menu, then **Install from VSIX…** and select the downloaded file.
3. Reload VS Code if prompted, open the **Tracer** sidebar, and click **Start recording** when ready.

You can also install from a terminal with the VS Code CLI:

```powershell
code --install-extension .\tracer-0.2.0.vsix --force
```

### Godot

1. Download the `tracer-godot-<version>.zip` asset from the same release.
2. Extract it into your project root so the project contains both `project.godot` and `addons/tracer/plugin.cfg`.
3. Open **Project > Project Settings > Plugins** and enable **Tracer**.
4. In the Tracer dock, click **Start recording** when ready.

Both collectors open stopped. Set an objective after starting; add outcome and next-step notes before stopping. To update Godot, disable the plugin, replace `addons/tracer/` with the new release's addon, and enable it again. Update VS Code by installing the newer VSIX using the same steps. Logs are stored separately from the installed packages.

GitHub's automatically generated **Source code** archives contain the repository, not the ready-to-install VSIX or Godot addon ZIP. Use the named release assets above.

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
- Explicit objectives, user-reported outcomes and unresolved / next-step notes in both editors
- Evidence-linked Outcome and Unresolved / Next steps sections, with Unknown when evidence is missing
- Edit-to-playtest cadence in Godot and edit-to-task-run cadence in VS Code
- Starting a new session after stopping, without overwriting the previous session
- Status-bar indicator showing recording state and event count
- Tracer Activity Bar icon with a scrollable sidebar dashboard
- Local code snapshots enabled by default, with a sidebar toggle and sensitive-path exclusions
- Importable Godot 4 editor plugin with the same event envelope and AI Review flow
- Configurable local session retention with automatic cleanup after 30 days by default

Terminal command text is disabled by default. Enable `tracer.captureTerminalCommands` only when the workspace permits command capture.

Diagnostic message text is also disabled by default; severity metadata is retained without recording message contents.

## Development

```powershell
npm install
npm run check
npm run test:core
npm run test:extension
npm run package:extension
npm run package:godot
```

The extension entry point is `src/extension.ts`. In VS Code, compile the extension and launch an Extension Development Host using the project manifest.

`npm run package:extension` produces `tracer-<version>.vsix` for local installation. Godot ZIP packaging currently requires Windows and its built-in `tar.exe`.

The workspace contains `MVP-VALIDATION-CHECKLIST.md` for the first three real-session validation runs.

The workspace also contains `MVP-STATUS.md`, an evidence-backed implementation audit.

The `godot/` directory contains the Godot 4 addon source. `npm run package:godot` produces `tracer-godot-<version>.zip`, containing only `addons/tracer/`.

## Releases and version tags

Both collectors share one version and one tag, such as `v0.2.0`, `v0.2.1` for a patch, or `v0.3.0` for the next feature release. Every release has its own downloads and notes; see [CHANGELOG.md](CHANGELOG.md). Existing release tags remain attached to their original commits.

To publish a new release:

1. Set the same version in `package.json`, both root version fields in `package-lock.json`, and `godot/addons/tracer/plugin.cfg`.
2. Update this README's versioned download links and examples, then add release notes to `CHANGELOG.md`.
3. Run `npm run release:check`, `npm run check`, `npm run test:core`, and `npm run test:extension`; validate Godot as described in [godot/README.md](godot/README.md).
4. Commit the release changes and push the commit. Create and push an annotated tag matching the package version:

```powershell
# Example for the next patch, after updating the version files to 0.2.1:
git tag -a v0.2.1 -m "Tracer 0.2.1"
git push origin v0.2.1
```

The [release workflow](.github/workflows/release.yml) validates the tag against both collector versions, runs TypeScript and extension tests, builds the VSIX and Godot ZIP, and publishes a GitHub release with both assets. The GitHub Actions log shows whether publication succeeded.

## Godot 4 integration

Tracer can run inside the Godot editor as an importable editor plugin. Build the package with:

```powershell
npm run package:godot
```

Extract `tracer-godot-<version>.zip` into the root of a Godot project, at the same level as `project.godot`:

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
- local code snapshots enabled by default, with a `Code snapshots: On/Off` toggle in the dock;
- a button to open the local Tracer storage folder, including sessions and snapshots.

Godot sessions are stored locally under `user://tracer/sessions/`. When snapshots are enabled, source snapshots are stored separately under `user://tracer/snapshots/<session-id>/` and referenced by `code_snapshot` events in the JSONL. Saved script diffs are still captured as bounded diffs; snapshots do not record every keystroke and can be disabled from the dock.

## Useful commands

- `Tracer: Show Status`
- `Tracer: Start Recording`
- `Tracer: Set Current Objective`
- `Tracer: Record Outcome`
- `Tracer: Record Unresolved / Next Step`
- `Tracer: Pause Recording`
- `Tracer: Resume Recording`
- `Tracer: Stop Recording`
- `Tracer: Show Timeline`
- `Tracer: Show Recent Sessions`
- `Tracer: Export Session Projection`
- `Tracer: Copy AI Context`

## Privacy model

Raw data remains local. Default ignored patterns include `.env`, secrets directories, private keys/certificates, `node_modules`, and `.git`. Excluded file changes retain metadata but never persist their text payload.

Code snapshots are enabled by default in both collectors so the first MVP can produce a more useful AI Review. They can be disabled at any time from the VS Code sidebar or Godot Tracer dock. Snapshot files remain local and are included in the same retention lifecycle as their session.

The canonical source is JSONL. Markdown outputs are projections and can be regenerated from the raw event layer.

Both editors open stopped, including after restarting the editor. Click **Start recording** to create a session; pausing or stopping also prevents new code snapshots. Set the objective from the sidebar or Godot dock, then record outcomes and unresolved items before stopping. Notes can also be added while paused and remain explicit user reports in the JSONL and review.

The AI Review is a compact map of the session. Each observed change, outcome note, next-step note, and edit-to-run pair includes raw event sequence references. Observed edits identify affected files; their implementation meaning remains unknown without an explicit outcome note. A playtest stop never implies success, and a task exit code does not prove correctness. Cadence shows edits before each run, wall-clock seconds since the first and last edit, intervening activity events, and edits awaiting a run. Durations include pauses; event counts do not represent every user interaction. VS Code tasks have unknown purpose and are not automatically classified as tests.

Completed sessions are retained for 30 days by default and then removed automatically. Retention can be disabled or changed with `tracer.retention.enabled` and `tracer.retention.days`. The active session is never removed, and incomplete or malformed sessions are preserved for inspection.

Session files use names such as `session-20260917-100913-a1b2c3d4.jsonl`, combining a UTC timestamp with a short session ID for easier identification.
