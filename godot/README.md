# Tracer for Godot 4

This folder contains the importable Godot 4 editor plugin for Tracer.

## Install in a Godot project

Copy `addons/tracer` into the root of a Godot project:

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
