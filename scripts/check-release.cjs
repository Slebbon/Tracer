const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");

function checkRelease(tag) {
  const root = resolve(__dirname, "..");
  const { version } = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
  const lock = JSON.parse(readFileSync(resolve(root, "package-lock.json"), "utf8"));
  const plugin = readFileSync(resolve(root, "godot/addons/tracer/plugin.cfg"), "utf8");
  const godotVersion = plugin.match(/^version="([^"]+)"\r?$/m)?.[1];
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) throw new Error("Use a release version in X.Y.Z format.");
  if (lock.version !== version || lock.packages[""].version !== version || godotVersion !== version) {
    throw new Error("package.json, package-lock.json and Godot plugin.cfg must have the same version.");
  }
  if (tag && tag !== `v${version}`) throw new Error(`Expected tag v${version}, received ${tag}.`);
  return { root, version };
}

module.exports = { checkRelease };
if (require.main === module) {
  const { version } = checkRelease(process.argv[2] || process.env.RELEASE_TAG);
  console.log(`Release versions match: v${version}`);
}
