const { spawnSync } = require("node:child_process");
const { checkRelease } = require("./check-release.cjs");

const { root, version } = checkRelease();
if (process.platform !== "win32") throw new Error("Godot ZIP packaging currently requires Windows (tar.exe).");
const archive = `tracer-godot-${version}.zip`;
const result = spawnSync("tar.exe", ["-a", "-c", "-f", archive, "--exclude=*.import", "--exclude=*.uid", "-C", "godot", "addons"], {
  cwd: root, stdio: "inherit"
});
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status || 1);
console.log(`Packaged ${archive}`);
