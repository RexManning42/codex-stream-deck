import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  BUILTIN_GROUPS, contrastRatio, KEY_ACCENTS, KEYCAP_GROUPS, KEYCAP_LABELS, tintInk,
  renderAgentKey, renderBuiltinKeycap, renderFallbackKeycap, renderImportedKeycap, type KeyGroup
} from "../src/render.js";
import type { AgentVisualStatus, ThemeMode } from "../src/types.js";

const THEMES: ThemeMode[] = ["light", "dark"];
const GROUPS: KeyGroup[] = ["nav", "compose", "affirm", "deny", "run", "vcs", "manage"];
// The worst point of the body gradient for each theme's ink polarity.
const FACE: Record<ThemeMode, string> = { light: "#D6DBDE", dark: "#343638" };
const MONO = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"><path d="M4 4h16v16H4z" stroke="currentColor"/></svg>';
const decode = (url: string) => decodeURIComponent(url.replace(/^data:image\/svg\+xml;charset=utf8,/, ""));

test("the accent is opt-in, so existing two-argument callers are unchanged", () => {
  const neutral = decode(renderBuiltinKeycap("back", "dark"));
  const accented = decode(renderBuiltinKeycap("back", "dark", "Back", "nav"));
  assert.doesNotMatch(neutral, /data-key-group=/, "no accent means no group marker");
  assert.match(neutral, /stroke="#F2F2EE"/, "neutral ink is untouched");
  assert.match(accented, /data-key-group="nav"/);
  assert.match(accented, new RegExp(KEY_ACCENTS.dark.nav.glow));
  assert.notEqual(neutral, accented);
});

test("every labelled keycap belongs to a group, and every group has both themes", () => {
  for (const [id, label] of Object.entries(KEYCAP_LABELS)) {
    if (!label) continue; // EMPT* placeholders are deliberately neutral
    assert.ok(KEYCAP_GROUPS[id], `keycap ${id} has a label but no group`);
  }
  for (const theme of THEMES) {
    for (const group of GROUPS) assert.ok(KEY_ACCENTS[theme][group], `${theme}/${group} missing`);
  }
  for (const group of Object.values(BUILTIN_GROUPS)) assert.ok(GROUPS.includes(group));
});

test("tinted ink clears WCAG AAA against the worst part of the key face", () => {
  for (const theme of THEMES) {
    for (const group of GROUPS) {
      const ratio = contrastRatio(KEY_ACCENTS[theme][group].ink, FACE[theme]);
      assert.ok(ratio >= 7, `${theme}/${group} ink contrast ${ratio.toFixed(2)} is below 7`);
    }
  }
});

test("ink is actually tinted rather than trivially left neutral", () => {
  // Guards the contrast test above from being satisfied by simply not applying colour.
  assert.notEqual(KEY_ACCENTS.dark.nav.ink, "#F2F2EE");
  assert.notEqual(KEY_ACCENTS.light.nav.ink, "#24292D");
  const inks = new Set(GROUPS.map((group) => KEY_ACCENTS.dark[group].ink));
  assert.equal(inks.size, GROUPS.length, "each group must be distinguishable by ink");
});

test("ink matches what the clamped mixer derives", () => {
  for (const theme of THEMES) {
    const base = theme === "dark" ? "#F2F2EE" : "#24292D";
    const amount = theme === "dark" ? 0.30 : 0.18;
    for (const group of GROUPS) {
      assert.equal(
        KEY_ACCENTS[theme][group].ink,
        tintInk(base, KEY_ACCENTS[theme][group].glow, amount, FACE[theme], 7)
      );
    }
  }
});

test("no accented surface emits pure black", () => {
  for (const theme of THEMES) {
    for (const group of GROUPS) {
      for (const output of [
        decode(renderImportedKeycap(MONO, theme, "Label", group)),
        decode(renderBuiltinKeycap("sidebar", theme, "Sidebar", group)),
        decode(renderFallbackKeycap("TERM", theme, group))
      ]) {
        assert.doesNotMatch(output, /#000(?:000)?\b/i, `${theme}/${group}`);
      }
    }
  }
});

test("each agent status has its own silhouette", () => {
  const statuses: AgentVisualStatus[] = ["empty", "idle", "thinking", "complete", "input", "error"];
  const shapes = statuses.map((status) => {
    const svg = decode(renderAgentKey(0, "Task", status, false, 0, "dark"));
    return svg.match(/data-agent-shape="([^"]+)"/)?.[1];
  });
  assert.equal(new Set(shapes).size, statuses.length, `shapes not distinct: ${shapes.join(", ")}`);
  assert.ok(shapes.every(Boolean));
});

test("only working and needs-answer animate, so settled tiles cost no traffic", () => {
  const at = (status: AgentVisualStatus, phase: number) =>
    decode(renderAgentKey(0, "Task", status, false, phase, "dark"));
  for (const status of ["complete", "error", "idle", "empty"] as AgentVisualStatus[]) {
    assert.equal(at(status, 0), at(status, 6), `${status} must be phase-invariant so lastImages dedupes it`);
  }
  for (const status of ["thinking", "input"] as AgentVisualStatus[]) {
    assert.notEqual(at(status, 0), at(status, 6), `${status} must move`);
  }
});

test("done and needs-answer stay distinguishable without colour", () => {
  // Strip every colour token; the silhouettes alone must still differ.
  const strip = (status: AgentVisualStatus) =>
    decode(renderAgentKey(0, "Task", status, false, 0, "dark")).replace(/#[0-9A-F]{6}\b/gi, "");
  assert.notEqual(strip("complete"), strip("input"));
  assert.notEqual(strip("complete"), strip("error"));
});

test("the accent is part of the keycap image cache key", () => {
  // Plan and Branch Review both draw BRCH.svg and want different hues, so omitting the
  // accent here would serve whichever rendered first to both keys.
  return readFile(new URL("../src/controller.ts", import.meta.url), "utf8").then((source) => {
    assert.match(source, /accentOverride \?\? KEYCAP_GROUPS\[keycapId\]/);
    assert.match(source, /\$\{theme\}:\$\{keycapId\}:\$\{labelOverride \?\? ""\}:\$\{accent \?\? ""\}/);
  });
});

test("animated agent payload stays inside budget", () => {
  // Agent tiles re-render at 5 fps and ship the whole data URL each frame.
  const url = renderAgentKey(0, "Refactor the bridge", "thinking", true, 4, "dark", "M", "ready", 84, true);
  assert.ok(url.length < 8000, `agent data URL grew to ${url.length}`);
});

test("dial selection ranks context by fullness and attention by who is blocked", async () => {
  const { selectDialSlots } = await import("../src/controller.js");
  const slot = (id: number, status: string, ctx?: number, key: string | null = `t${id}`) =>
    ({ id, threadKey: key, title: `Task ${id}`, status, selected: false, contextUsedPercent: ctx });
  const slots = [
    slot(0, "idle", 12), slot(1, "awaiting-approval", 40), slot(2, "working", 91),
    slot(3, "error", 5), slot(4, "idle", undefined), slot(5, "off", 99, null)
  ] as never[];

  // Context opens on the task closest to filling its window, and ignores empty slots.
  const context = selectDialSlots(slots, "context");
  assert.deepEqual(context.map((s) => s.id), [2, 1, 0, 3, 4]);
  assert.ok(!context.some((s) => s.threadKey === null), "an unassigned slot is not a task");

  // Attention is only what is blocked on you, in slot order so the first push is the
  // one that has been waiting longest.
  const attention = selectDialSlots(slots, "attention");
  assert.deepEqual(attention.map((s) => s.id), [1, 3]);
  assert.deepEqual(selectDialSlots([slot(0, "idle", 5)] as never[], "attention"), []);
});

test("the context strip reports fill, and warms as the window closes", async () => {
  const { renderContextStrip, SIGNAL_COLORS } = await import("../src/render.js");
  const at = (pct: number | undefined) => renderContextStrip("Refactor the bridge", pct, "1/5", "dark");

  assert.match(at(19), /data-strip-value="19"/);
  assert.match(at(19), />19%</);
  assert.match(at(19), new RegExp(SIGNAL_COLORS.dark.thinking), "healthy fill is the working colour");
  assert.match(at(84), new RegExp(SIGNAL_COLORS.dark.input), "past 80 it warns");
  assert.match(at(96), new RegExp(SIGNAL_COLORS.dark.error), "past 92 it alarms");

  // Unknown is not zero: an unmeasured window must not read as an empty one.
  assert.match(at(undefined), /data-strip-value="unknown"/);
  assert.doesNotMatch(at(undefined), />0%</);

  // A long task title is truncated rather than overrunning the 200px segment.
  const long = renderContextStrip("Compare 2.4GHz and 5GHz LTE antennas for the roof", 40, undefined, "dark");
  assert.match(long, /…/);
  assert.doesNotMatch(long, /antennas for the roof/);
});

test("the attention strip counts what is blocked, in pips as well as digits", async () => {
  const { renderAttentionStrip } = await import("../src/render.js");
  const pips = (svg: string) => (svg.match(/y="72" width="11"/g) ?? []).length;

  const clear = renderAttentionStrip(0, undefined, "dark");
  assert.match(clear, /data-strip-waiting="0"/);
  assert.match(clear, /ALL CLEAR/);
  assert.equal(pips(clear), 6, "all six slots are always drawn, lit or not");

  const three = renderAttentionStrip(3, "Fix the failing test", "dark");
  assert.match(three, /data-strip-waiting="3"/);
  assert.match(three, /WAITING ON YOU/);
  assert.match(three, />3</);
  // Countable without reading the number, and legible without relying on hue.
  assert.equal((three.match(/fill-opacity="1"/g) ?? []).length, 3);
});

test("strip segments are valid standalone SVG and stay off pure black", async () => {
  const { renderAttentionStrip, renderContextStrip } = await import("../src/render.js");
  for (const theme of ["light", "dark"] as const) {
    for (const svg of [renderContextStrip("Task", 55, "1/3", theme), renderAttentionStrip(2, "Task", theme)]) {
      // Pixmap takes a raw SVG string, so it must carry its own namespace and box.
      assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
      assert.match(svg, /viewBox="0 0 200 100"/);
      assert.match(svg, /<\/svg>$/);
      assert.doesNotMatch(svg, /#000(?:000)?\b/i);
    }
  }
});
