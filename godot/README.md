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
