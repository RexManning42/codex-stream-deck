import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { renderRateLimitResetKey, renderUsageLimitKey, renderUsageOverviewKey } from "../src/render.js";
import { parseRelayCommand } from "../src/relay-protocol.js";
import type { UsageSnapshot, UsageWindow } from "../src/types.js";
import { parseUsageLimitMode, selectUsageWindow, usageWindowKind } from "../src/usage.js";

const fiveHour: UsageWindow = {
  id: "five-hour", kind: "five-hour", usedPercent: 26, remainingPercent: 74,
  windowDurationMins: 300, resetsAt: 1_800_000_000_000
};
const weekly: UsageWindow = {
  id: "weekly", kind: "weekly", usedPercent: 88, remainingPercent: 12,
  windowDurationMins: 10_080, resetsAt: 1_800_000_000_000
};

function usage(windows: UsageWindow[]): UsageSnapshot {
  return { windows, observedAt: Date.now(), resetCreditsAvailable: 2, resetCreditsApplicable: 1 };
}

function decode(dataUrl: string): string {
  return decodeURIComponent(dataUrl.replace(/^data:image\/svg\+xml;charset=utf8,/, ""));
}

test("usage selection prefers 5-hour but falls back to weekly", () => {
  assert.equal(selectUsageWindow(usage([weekly]), "auto"), weekly);
  assert.equal(selectUsageWindow(usage([weekly, fiveHour]), "auto"), fiveHour);
  assert.equal(selectUsageWindow(usage([weekly, fiveHour]), "weekly"), weekly);
  assert.equal(selectUsageWindow(usage([weekly]), "five-hour"), undefined);
  assert.equal(usageWindowKind(300), "five-hour");
  assert.equal(usageWindowKind(10_080), "weekly");
  assert.equal(parseUsageLimitMode("weekly"), "weekly");
  assert.equal(parseUsageLimitMode("unexpected"), "auto");
});

test("single usage key preserves the circular design and centers numeric weight", () => {
  const healthy = decode(renderUsageLimitKey(fiveHour, "five-hour", "dark"));
  assert.match(healthy, /data-usage-remaining="74"/);
  assert.match(healthy, />74<\/tspan>/);
  assert.match(healthy, /<tspan dx="2" dy="-8"[^>]*>%<\/tspan>/);
  assert.match(healthy, />5H<\/text>/);
  assert.match(healthy, /data-usage-value="74" x="72" y="80" text-anchor="middle"/);

  const unavailable = decode(renderUsageLimitKey(undefined, "five-hour", "dark"));
  assert.match(unavailable, />—<\/text>/);
  assert.match(unavailable, />5H<\/text>/);
});

test("overview renders independent 5-hour and weekly progress bars", () => {
  const svg = decode(renderUsageOverviewKey([fiveHour, weekly], "dark"));
  assert.match(svg, /data-usage-window="5H"/);
  assert.match(svg, /data-usage-window="WK"/);
  assert.match(svg, /data-usage-remaining="74"/);
  assert.match(svg, /data-usage-remaining="12"/);

  const weeklyOnly = decode(renderUsageOverviewKey([weekly], "dark"));
  assert.match(weeklyOnly, /data-usage-window="5H"[\s\S]*>—<\/text>/);
  assert.match(weeklyOnly, /data-usage-window="WK"[\s\S]*>12%<\/text>/);
});

test("reset key keeps the count in the fixed circle center and exposes hold progress", () => {
  const svg = decode(renderRateLimitResetKey(2, .5, "dark"));
  assert.match(svg, /data-reset-credits="2" x="72" y="78" text-anchor="middle"/);
  assert.match(svg, /data-reset-hold="50"/);
  assert.doesNotMatch(svg, /cx="106" cy="40"/);

  const available = decode(renderRateLimitResetKey(1, 0, "dark", "ready"));
  assert.match(available, /data-reset-credits="1"/);
  assert.match(available, /stop-opacity="\.13"/);
});

test("usage actions and property inspector are packaged without official keycap artwork", async () => {
  const [manifestSource, inspector, bridge] = await Promise.all([
    readFile(new URL("../static/manifest.json", import.meta.url), "utf8"),
    readFile(new URL("../static/property-inspector/usage-limit.html", import.meta.url), "utf8"),
    readFile(new URL("../src/codex-micro-renderer-bridge.ts", import.meta.url), "utf8")
  ]);
  const manifest = JSON.parse(manifestSource) as { Actions: Array<{ UUID: string; PropertyInspectorPath?: string }> };
  const actions = new Map(manifest.Actions.map((action) => [action.UUID, action]));
  assert.equal(actions.get("com.simeo.codex-deck.usage-limit")?.PropertyInspectorPath, "static/property-inspector/usage-limit.html");
  assert.equal(actions.has("com.simeo.codex-deck.usage-overview"), true);
  assert.equal(actions.has("com.simeo.codex-deck.rate-limit-reset"), true);
  assert.match(inspector, /value="auto"/);
  assert.match(inspector, /value="five-hour"/);
  assert.match(inspector, /value="weekly"/);
  assert.match(bridge, /safeGet\('\/wham\/rate-limit-reset-credits'\)/);
  assert.match(bridge, /safePost\('\/wham\/rate-limit-reset-credits\/consume'/);
  assert.match(bridge, /applicable_available_count/);
  assert.doesNotMatch(bridge, /profile_image_url/);
});

test("relay accepts only the typed reset command", () => {
  assert.deepEqual(parseRelayCommand({ kind: "rate-limit-reset" }), { kind: "rate-limit-reset" });
  assert.equal(parseRelayCommand({ kind: "rate-limit-reset", arbitrary: "ignored" })?.kind, "rate-limit-reset");
  assert.equal(parseRelayCommand({ kind: "rate-limit-reset-now" }), null);
});
