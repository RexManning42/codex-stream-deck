import assert from "node:assert/strict";
import test from "node:test";
import { buildCodexLaunchSpec, buildLaunchAgentPlist, buildWatcherLaunchScript, parseDebugPort } from "../launcher/macos/codex-deck-macos.js";
import { codexDeckStateRoot } from "../src/codex-deck-paths.js";

test("macOS launcher uses LaunchServices and passes loopback-only CDP arguments", () => {
  const spec = buildCodexLaunchSpec({ appPath: "/Applications/Unexpected Codex Name.app" }, 43123);
  assert.equal(spec.command, "/usr/bin/open");
  assert.deepEqual(spec.args, [
    "-n",
    "-a",
    "/Applications/Unexpected Codex Name.app",
    "--args",
    "--remote-debugging-address=127.0.0.1",
    "--remote-debugging-port=43123"
  ]);
  assert.doesNotMatch(spec.args.join(" "), /0\.0\.0\.0/);
});

test("macOS launcher validates ports and parses both supported flag forms", () => {
  assert.throws(() => buildCodexLaunchSpec({ appPath: "/Applications/Codex.app" }, 0), /Invalid debugging port/);
  assert.equal(parseDebugPort("Codex --remote-debugging-port=43123"), 43123);
  assert.equal(parseDebugPort("Codex --remote-debugging-port 43124"), 43124);
  assert.equal(parseDebugPort("Codex --remote-debugging-port=70000"), null);
});

test("bridge and user icon state use the native macOS Application Support root", () => {
  assert.equal(
    codexDeckStateRoot("darwin", "/Users/tester"),
    "/Users/tester/Library/Application Support/CodexDeck"
  );
  assert.equal(
    codexDeckStateRoot("win32", "C:\\Users\\tester", "C:\\Users\\tester\\AppData\\Local"),
    "C:\\Users\\tester\\AppData\\Local\\CodexDeck"
  );
});

test("LaunchAgent uses a dynamic Node resolver instead of pinning an NVM version", () => {
  const launcher = buildWatcherLaunchScript("/tmp/Codex Deck/runtime.mjs");
  const plist = buildLaunchAgentPlist("/tmp/Codex Deck/watcher-launch.sh");
  assert.match(launcher, /\.nvm\/versions\/node\/\*\/bin\/node/);
  assert.match(launcher, /Contents\/Resources\/cua_node\/bin\/node/);
  assert.match(launcher, /Node\.js 20 or newer/);
  assert.match(plist, /<string>\/bin\/zsh<\/string>/);
  assert.match(plist, /watcher-launch\.sh/);
  assert.doesNotMatch(plist, /\.nvm\/versions\/node\/v\d/);
});
