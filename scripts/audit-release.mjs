import { readFile, readdir, stat } from "node:fs/promises";
import { basename, extname, resolve } from "node:path";

const roots = process.argv.slice(2).length
  ? process.argv.slice(2).map((path) => resolve(path))
  : [resolve("dist/com.simeo.codex-deck.sdPlugin"), resolve("release/codex-deck-launcher"), resolve("release/codex-deck-launcher-macos")];

const forbiddenFiles = new Set([
  "codex-micro-bridge.json", "control-target.json", "host.json", "relay-client.json", "relay-server.json",
  "mobile-relay-server.json", "mobile-local-relay-server.json", "mobile-local-pairing.svg",
  "relay-tunnel.pid", "watcher-state.json", "watcher.log", "watcher.log.1", "watcher.log.2", "watcher.log.3"
]);
const protectedKeycaps = new Set("FAST APPR REJ SPLIT MIC CODEX BUG OAI TERM DWN DEL NEW NAV MAGIC DIFF PLAY GIT BRCH MRG PR PAINT LAB PARTY TIME MIND+ MIND- SETUP FOLD UPL APPS".split(" "));
const forbiddenText = [
  /[A-Z]:\\Users\\(?!Public\\|Default\\|tester\\)[^\\/\s]+/iu,
  /\/Users\/(?!Shared\/|tester\/)[^/\s]+/iu,
  /\b100\.(?:\d{1,3}\.){2}\d{1,3}\b(?!\/10)/u,
  ...String(process.env.CODEX_DECK_PRIVATE_MARKERS ?? "").split("|").filter(Boolean).map((marker) => new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "iu"))
];
const textExtensions = new Set([".cmd", ".command", ".html", ".js", ".json", ".map", ".md", ".mjs", ".ps1", ".sh", ".svg", ".txt"]);
const failures = [];

async function walk(path) {
  const info = await stat(path);
  if (info.isDirectory()) {
    for (const entry of await readdir(path)) await walk(resolve(path, entry));
    return;
  }
  const name = basename(path);
  if (forbiddenFiles.has(name.toLowerCase())) failures.push(`${path}: private runtime state must not be packaged`);
  if (extname(name).toLowerCase() === ".svg" && protectedKeycaps.has(name.slice(0, -4).toUpperCase())) {
    failures.push(`${path}: protected Codex keycap SVG must not be packaged`);
  }
  if (!textExtensions.has(extname(name).toLowerCase()) || info.size > 8 * 1024 * 1024) return;
  const contents = await readFile(path, "utf8");
  for (const pattern of forbiddenText) if (pattern.test(contents)) failures.push(`${path}: contains private setup marker ${pattern}`);
}

for (const root of roots) {
  try { await walk(root); }
  catch (error) { failures.push(`${root}: cannot audit (${String(error)})`); }
}

if (failures.length) {
  console.error("Release audit failed:\n" + failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}
console.log(`Release audit passed for ${roots.length} artifact roots.`);
