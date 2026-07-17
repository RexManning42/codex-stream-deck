import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { REASONING_COMMANDS } from "../src/codex-micro-renderer-bridge.js";
import { ADDITIONAL_KEYCAPS, OFFICIAL_KEYCAP_IDS } from "../src/keycaps.js";
import { visualStatusFromMicro } from "../src/status.js";

test("official Micro statuses map to the Stream Deck color states", () => {
  assert.equal(visualStatusFromMicro("off"), "empty");
  assert.equal(visualStatusFromMicro("working"), "thinking");
  assert.equal(visualStatusFromMicro("unread"), "complete");
  assert.equal(visualStatusFromMicro("approval"), "input");
  assert.equal(visualStatusFromMicro("awaiting-approval"), "input");
  assert.equal(visualStatusFromMicro("awaiting-response"), "input");
  assert.equal(visualStatusFromMicro("error"), "error");
  assert.equal(visualStatusFromMicro("idle"), "idle");
});

test("official keycap SVG contents are not bundled in the public source", async () => {
  const controller = await readFile(new URL("../src/controller.ts", import.meta.url), "utf8");
  assert.match(controller, /CodexDeck[\s\S]*icons/);
  assert.doesNotMatch(controller, /static\/imgs\/official/);
});

test("renderer bridge uses native Micro events and discovers hashed modules at runtime", async () => {
  const source = await readFile(new URL("../src/codex-micro-renderer-bridge.ts", import.meta.url), "utf8");
  for (const eventName of ["codex-micro-device-state-changed", "codex-micro-hid-event", "codex-micro-joystick-event"]) {
    assert.match(source, new RegExp(eventName));
  }
  assert.match(source, /modulepreload/);
  assert.doesNotMatch(source, /D90_rd6W|SFcKxWqG|DJFcGyy5/);
});

test("reasoning controls use the official native composer commands", async () => {
  assert.deepEqual(REASONING_COMMANDS, {
    decrease: "composer.decreaseReasoningEffort",
    increase: "composer.increaseReasoningEffort"
  });
  const source = await readFile(new URL("../src/codex-micro-renderer-bridge.ts", import.meta.url), "utf8");
  assert.match(source, /run-command-/);
  assert.match(source, /codex_micro_hid/);
});

test("manifest exposes both dedicated reasoning adjustment buttons", async () => {
  const manifest = JSON.parse(await readFile(new URL("../static/manifest.json", import.meta.url), "utf8")) as { Actions: Array<{ UUID: string }> };
  const actions = new Set(manifest.Actions.map((action) => action.UUID));
  assert.equal(actions.has("com.simeo.codex-deck.reasoning-down"), true);
  assert.equal(actions.has("com.simeo.codex-deck.reasoning-up"), true);
});

test("all official keycaps are covered by standalone or native actions", async () => {
  const manifest = JSON.parse(await readFile(new URL("../static/manifest.json", import.meta.url), "utf8")) as { Actions: Array<{ UUID: string }> };
  const actions = new Set(manifest.Actions.map((action) => action.UUID));
  for (const keycap of ADDITIONAL_KEYCAPS) {
    assert.equal(actions.has(`com.simeo.codex-deck.keycap-${keycap.slug}`), true, `missing ${keycap.id}`);
  }
  assert.equal(OFFICIAL_KEYCAP_IDS.length, 30);
  assert.equal(new Set(ADDITIONAL_KEYCAPS.map((keycap) => keycap.id)).size, 29);
  assert.equal(actions.has("com.simeo.codex-deck.dictation"), true, "MIC uses the native press/release action");
});

test("standalone keycaps resolve Codex's live registry instead of hardcoding commands", async () => {
  const source = await readFile(new URL("../src/codex-micro-renderer-bridge.ts", import.meta.url), "utf8");
  assert.match(source, /codex-micro-layout-/);
  assert.match(source, /keycapGetter/);
  assert.match(source, /codex_micro_hid/);
});

test("controller avoids overlapping polls and redundant image writes", async () => {
  const source = await readFile(new URL("../src/controller.ts", import.meta.url), "utf8");
  assert.match(source, /lastImages/);
  assert.match(source, /this\.lastImages\.get\(action\.id\) === image/);
  assert.match(source, /scheduleRefresh/);
  assert.match(source, /status === "thinking" \|\| status === "input"/);
  assert.doesNotMatch(source, /setInterval\(/);
});
