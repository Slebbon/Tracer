# Tracer

Tracer is a local-first VS Code developer-activity recorder. It records a structured chronological event stream and derives inspectable timeline and context projections from it.

## Author and license

Tracer was created and is maintained by **Marco Confessore**. It is released under the [MIT License](LICENSE).

## Current MVP surface

- Session, workspace, file, edit, save, diagnostic, terminal, and VS Code task events
- Append-only JSONL storage under the VS Code global storage directory
- Full and deterministic compact timelines
- Raw JSONL, compact JSONL, full/compact Markdown, summary, and AI-context exports
- Configurable sensitive-path exclusions
- Pause, resume, and stop recording controls
- Status-bar indicator showing recording state and event count
- Tracer Activity Bar icon with a scrollable sidebar dashboard

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
