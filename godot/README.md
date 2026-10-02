# Tracer for Godot 4

This folder contains the importable Godot 4 editor plugin for Tracer.

## Install in a Godot project

Download `tracer-godot-<version>.zip` from the [latest Tracer release](https://github.com/Slebbon/Tracer/releases/latest) and extract it into the root of a Godot project. Choose an older tag from [all releases](https://github.com/Slebbon/Tracer/releases) if needed. Use the addon ZIP asset, rather than GitHub's source code archives.

You can also copy `addons/tracer` from this folder into a Godot project:

```text
your-game/
└── addons/
    └── tracer/
```

Then enable it from `Project > Project Settings > Plugins > Tracer`.

The plugin starts stopped. When started, it records local JSONL events under:

```text
user://tracer/sessions/
```

The first Godot MVP records editor activity, scene/resource saves, saved script diffs, scene changes, node selections, workspace changes, and playtest start/stop events. It uses the same Tracer event envelope as the VS Code collector with `source: "godot"`.

Code snapshots are enabled by default. Use the `Code snapshots: On/Off` button in the Tracer dock to toggle them. Snapshots are written locally to:

```text
user://tracer/snapshots/<session-id>/
```

The session JSONL records a `code_snapshot` event with the snapshot path, content hash, byte count, line count, and capture reason. Tracer does not capture every keystroke; it captures the current script when opened, after saves, and periodically while recording. The setting is stored in Godot's editor settings and does not modify the project file.

The dock's `Open Tracer storage` button opens `user://tracer/`, which contains both `sessions/` and `snapshots/`.

Use **Set objective**, **Record outcome**, and **Record unresolved / next step** while recording or paused. Notes are saved as explicit events, and AI Review labels outcomes and next steps as user-reported. The review includes raw sequence references for edits and notes, plus edit-to-playtest time and recorded activity counts. A stopped playtest has an unknown result unless you record an outcome. Missing outcome or next-step evidence is shown as Unknown.

Enabling the plugin or reopening Godot leaves Tracer stopped. Start recording explicitly; no code snapshots are saved while paused or stopped. A scene already playing when recording starts or resumes is not counted as a new playtest.

For local validation, run Godot with `--headless --path godot --script res://tests/review_test.gd` from the repository root. The validation project and tests are excluded from the distributable addon ZIP.
