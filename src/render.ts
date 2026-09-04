import type { AgentVisualStatus, HostHealthState, ThemeMode, UsageWindow, UsageWindowKind } from "./types.js";
import { clampPercent, usageLabel } from "./usage.js";

export type BuiltinIconName = "back" | "forward" | "sidebar" | "home" | "navigation";

export const SIGNAL_COLORS: Record<ThemeMode, Record<AgentVisualStatus, string>> = {
  light: {
    empty: "#606B75", idle: "#FFFFFF", thinking: "#006BFF",
    complete: "#21D653", input: "#FF7A1A", error: "#FF2447"
  },
  dark: {
    empty: "#707B85", idle: "#F2F2EE", thinking: "#1683FF",
    complete: "#35D86B", input: "#FF9A3D", error: "#FF4B61"
  }
};

type SurfacePalette = {
  outer: string;
  keyTop: string;
  keyMiddle: string;
  keyBottom: string;
  border: string;
  innerBorder: string;
  frostTop: string;
  frostEnd: string;
  title: string;
  sheen: string;
  selected: string;
};

const SURFACES: Record<ThemeMode, SurfacePalette> = {
  light: {
    outer: "#C7CDD1", keyTop: "#FFFFFF", keyMiddle: "#F0F3F4", keyBottom: "#D6DBDE",
    border: "#FFFFFF", innerBorder: "#C4C9CD", frostTop: "#FFFFFF", frostEnd: "#AAB3BA",
    title: "#171C20", sheen: "#FFFFFF", selected: "#42E2C1"
  },
  dark: {
    outer: "#45484B", keyTop: "#343638", keyMiddle: "#2A2C2E", keyBottom: "#222426",
    border: "#55585B", innerBorder: "#3D4043", frostTop: "#FFFFFF", frostEnd: "#1C1E20",
    title: "#F2F2EF", sheen: "#FFFFFF", selected: "#4CE0C2"
  }
};

// Keys are grouped by what they do, and each group gets a hue. Colour is carried two ways:
// a backlit bloom in the key body, and a restrained tint of the glyph ink. Approve and
// Reject keep semantic green/red -- that meaning outranks family grouping.
export type KeyGroup = "nav" | "compose" | "affirm" | "deny" | "run" | "vcs" | "manage";

const GROUP_GLOW: Record<ThemeMode, Record<KeyGroup, string>> = {
  light: {
    nav: "#0A6CE8", compose: "#6A44E0", affirm: "#12A63F", deny: "#D61F36",
    run: "#C46A00", vcs: "#0B8F86", manage: "#5A6875"
  },
  dark: {
    nav: "#4C9BFF", compose: "#A88BFF", affirm: "#35D86B", deny: "#FF4B61",
    run: "#FFA83D", vcs: "#2FD4C4", manage: "#9AA7B4"
  }
};

// The glyph sits on the key face, so the tint is only allowed to go as far as contrast
// permits. Dark ink is measured against the lightest part of the face and light ink
// against the darkest, so the check covers the worst point of the body gradient.
const INK_BASE: Record<ThemeMode, string> = { light: "#24292D", dark: "#F2F2EE" };
const INK_FACE: Record<ThemeMode, string> = { light: "#D6DBDE", dark: "#343638" };
const INK_TINT: Record<ThemeMode, number> = { light: 0.18, dark: 0.30 };
const INK_MIN_CONTRAST = 7;

function channels(hex: string): [number, number, number] {
  const value = hex.replace("#", "");
  const full = value.length === 3 ? value.split("").map((part) => part + part).join("") : value;
  return [0, 2, 4].map((offset) => parseInt(full.slice(offset, offset + 2), 16)) as [number, number, number];
}

const toLinear = (channel: number): number => {
  const ratio = channel / 255;
  return ratio <= 0.04045 ? ratio / 12.92 : ((ratio + 0.055) / 1.055) ** 2.4;
};

const toSrgb = (linear: number): number => {
  const ratio = linear <= 0.0031308 ? linear * 12.92 : 1.055 * linear ** (1 / 2.4) - 0.055;
  return Math.round(Math.min(1, Math.max(0, ratio)) * 255);
};

export function relativeLuminance(hex: string): number {
  const [red, green, blue] = channels(hex).map(toLinear) as [number, number, number];
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

export function contrastRatio(a: string, b: string): number {
  const first = relativeLuminance(a);
  const second = relativeLuminance(b);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

// Mixing happens in linear light. A naive byte-wise lerp between an off-white ink and a
// saturated hue goes muddy well before it goes colourful.
function mixLinear(from: string, to: string, amount: number): string {
  const source = channels(from).map(toLinear);
  const target = channels(to).map(toLinear);
  const mixed = source.map((value, index) => value + (target[index]! - value) * amount);
  return "#" + mixed.map((value) => toSrgb(value).toString(16).padStart(2, "0")).join("").toUpperCase();
}

// Walk the tint back until it clears the contrast floor. Light-theme affirm is the case
// that actually trips this, which is why the clamp is code rather than a hand-tuned table.
export function tintInk(base: string, glow: string, amount: number, face: string, minRatio: number): string {
  for (let tint = amount; tint > 0.0001; tint -= 0.02) {
    const mixed = mixLinear(base, glow, tint);
    if (contrastRatio(mixed, face) >= minRatio) return mixed;
  }
  return base;
}

export type AccentPalette = { glow: string; ink: string };

// Derived rather than hardcoded so the shipped ink and the contrast rule cannot diverge.
export const KEY_ACCENTS: Record<ThemeMode, Record<KeyGroup, AccentPalette>> =
  (["light", "dark"] as const).reduce((themes, theme) => {
    const groups = Object.entries(GROUP_GLOW[theme]).reduce((accumulated, [group, glow]) => {
      accumulated[group as KeyGroup] = {
        glow,
        ink: tintInk(INK_BASE[theme], glow, INK_TINT[theme], INK_FACE[theme], INK_MIN_CONTRAST)
      };
      return accumulated;
    }, {} as Record<KeyGroup, AccentPalette>);
    themes[theme] = groups;
    return themes;
  }, {} as Record<ThemeMode, Record<KeyGroup, AccentPalette>>);

// Keyed by official Codex Micro keycap id, same shape as KEYCAP_LABELS. An id with no
// entry renders neutral, which is what the EMPT* placeholders want.
export const KEYCAP_GROUPS: Record<string, KeyGroup> = {
  NAV: "nav", TIME: "nav", FOLD: "nav", PARTY: "nav", MAGIC: "nav",
  CODEX: "compose", MIC: "compose", MIC1: "compose", NEW: "compose",
  UPL: "compose", PAINT: "compose", "MIND+": "compose", "MIND-": "compose",
  APPR: "affirm", REJ: "deny",
  FAST: "run", PLAY: "run", TERM: "run", YOLO: "run", YEET: "run",
  DIFF: "vcs", GIT: "vcs", BRCH: "vcs", BRANCH: "vcs", MRG: "vcs", PR: "vcs", SPLIT: "vcs",
  DEL: "manage", DWN: "manage", BUG: "manage", OAI: "manage",
  LAB: "manage", SETUP: "manage", APPS: "manage"
};

export const BUILTIN_GROUPS: Record<BuiltinIconName, KeyGroup> = {
  back: "nav", forward: "nav", sidebar: "nav", home: "nav", navigation: "nav"
};

// Friendly labels drawn at the bottom of each key so the glyph alone does not have
// to carry the meaning. Keyed by the official Codex Micro keycap id.
export const KEYCAP_LABELS: Record<string, string> = {
  FAST: "Fast", APPR: "Approve", REJ: "Reject", SPLIT: "Fork",
  MIC: "Mic", MIC1: "Mic", CODEX: "Submit", BUG: "Feedback", OAI: "Docs",
  TERM: "Terminal", DWN: "Copy MD", DEL: "Archive", NEW: "New Task",
  NAV: "Browser", MAGIC: "Pin", DIFF: "Review", PLAY: "Run",
  GIT: "Commit", BRCH: "Draft PR", BRANCH: "New Branch", MRG: "Merge PR", PR: "Pull Req",
  PAINT: "Photos", LAB: "Settings", PARTY: "Side Chat", TIME: "Tasks",
  "MIND+": "Effort +", "MIND-": "Effort \u2212",
  SETUP: "Settings", FOLD: "Folder", UPL: "Add Files", APPS: "Skills",
  YOLO: "YOLO", YEET: "YEET",
  EMPT1: "", EMPT2: "", EMPT3: "", EMPT4: "", EMPT5: ""
};

export const BUILTIN_LABELS: Record<BuiltinIconName, string> = {
  back: "Back", forward: "Forward", sidebar: "Sidebar", home: "Home", navigation: "Navigate"
};

const KEY_LABEL_FONT = "SF Pro Text, -apple-system, Bahnschrift, Segoe UI Variable Display, Segoe UI, Helvetica Neue, Arial, sans-serif";

// Bottom-centred caption. Returns "" when there is nothing to draw, so callers can
// keep the original full-size glyph geometry.
function keyLabelMarkup(label: string | undefined, surface: SurfacePalette): string {
  const text = (label ?? "").trim();
  if (!text) return "";
  const size = text.length > 9 ? 14 : text.length > 7 ? 16 : 18;
  return `<text data-key-label="1" x="72" y="122" text-anchor="middle" font-family="${KEY_LABEL_FONT}" font-size="${size}" font-weight="600" letter-spacing=".2" fill="${surface.title}" fill-opacity=".92">${escapeXml(text)}</text>`;
}

// The material every non-agent key sits on. Split out because three renderers draw the
// same chassis and only differ in what they put on top of it.
//
// Depth comes from stacked layers rather than one gradient: a seat shadow under the cap, a
// five-stop body, an inner shadow weighted to the base, and a specular highlight along the
// top edge. Colour rides on top of that as a bloom from beneath the key, so an accented key
// reads as backlit rather than painted.
//
// Every hex here is deliberately off-black: eight assertions check that no `#000` reaches
// the rendered output.
type ChassisDepth = {
  seat: string; seatOpacity: string;
  shade: string; shadeOpacity: string;
  specular: string; specularOpacity: string;
  bodyHigh: string; bodyLow: string;
  inkShadow: string; inkShadowOpacity: string;
};

const DEPTHS: Record<ThemeMode, ChassisDepth> = {
  light: {
    seat: "#98A1A8", seatOpacity: ".42",
    shade: "#7E878E", shadeOpacity: ".20",
    specular: "#FFFFFF", specularOpacity: ".90",
    bodyHigh: "#F7F9FA", bodyLow: "#E2E6E9",
    inkShadow: "#7E878E", inkShadowOpacity: ".30"
  },
  dark: {
    seat: "#141618", seatOpacity: ".55",
    shade: "#131517", shadeOpacity: ".34",
    specular: "#FFFFFF", specularOpacity: ".13",
    bodyHigh: "#3B3D40", bodyLow: "#252729",
    inkShadow: "#131517", inkShadowOpacity: ".45"
  }
};

function keycapChassis(theme: ThemeMode, accent?: KeyGroup): { defs: string; layers: string; ink: string } {
  const surface = SURFACES[theme];
  const depth = DEPTHS[theme];
  const palette = accent ? KEY_ACCENTS[theme][accent] : undefined;
  const glow = palette?.glow;
  const ink = palette?.ink ?? (theme === "dark" ? "#F2F2EE" : "#24292D");

  const defs = `<linearGradient id="keycap" x1="0" y1="0" x2="0" y2="1"><stop stop-color="${surface.keyTop}"/><stop offset=".14" stop-color="${depth.bodyHigh}"/><stop offset=".5" stop-color="${surface.keyMiddle}"/><stop offset=".8" stop-color="${depth.bodyLow}"/><stop offset="1" stop-color="${surface.keyBottom}"/></linearGradient>`
    + `<linearGradient id="cdShade" x1="0" y1="0" x2="0" y2="1"><stop offset=".62" stop-color="${depth.shade}" stop-opacity="0"/><stop offset="1" stop-color="${depth.shade}" stop-opacity="${depth.shadeOpacity}"/></linearGradient>`
    + `<radialGradient id="cdSpecular" cx="50%" cy="50%" r="50%"><stop stop-color="${depth.specular}" stop-opacity="${depth.specularOpacity}"/><stop offset="1" stop-color="${depth.specular}" stop-opacity="0"/></radialGradient>`
    + `<filter id="cdInkShadow" x="-25%" y="-25%" width="150%" height="150%"><feDropShadow dx="0" dy="1.6" stdDeviation="1.4" flood-color="${depth.inkShadow}" flood-opacity="${depth.inkShadowOpacity}"/></filter>`
    + (glow
      ? `<radialGradient id="cdBloom" cx="50%" cy="103%" r="80%"><stop stop-color="${glow}" stop-opacity="${theme === "dark" ? ".62" : ".40"}"/><stop offset=".46" stop-color="${glow}" stop-opacity="${theme === "dark" ? ".22" : ".14"}"/><stop offset="1" stop-color="${glow}" stop-opacity="0"/></radialGradient>`
        + `<filter id="cdCapGlow" x="-18%" y="-18%" width="136%" height="136%"><feGaussianBlur stdDeviation="3.4"/></filter>`
        + `<linearGradient id="cdBevel" x1="0" y1="0" x2="0" y2="1"><stop stop-color="${theme === "dark" ? "#6A6E72" : "#FFFFFF"}" stop-opacity="${theme === "dark" ? ".95" : ".88"}"/><stop offset=".55" stop-color="${glow}" stop-opacity="${theme === "dark" ? ".34" : ".26"}"/><stop offset="1" stop-color="${glow}" stop-opacity="${theme === "dark" ? ".78" : ".55"}"/></linearGradient>`
        + `<linearGradient id="cdWash" x1="0" y1="0" x2="0" y2="1"><stop stop-color="${glow}" stop-opacity="0"/><stop offset=".55" stop-color="${glow}" stop-opacity="${theme === "dark" ? ".05" : ".035"}"/><stop offset="1" stop-color="${glow}" stop-opacity="${theme === "dark" ? ".17" : ".12"}"/></linearGradient>`
        + `<linearGradient id="cdRim" x1="0" y1="0" x2="0" y2="1"><stop stop-color="${surface.innerBorder}"/><stop offset=".5" stop-color="${surface.innerBorder}"/><stop offset="1" stop-color="${glow}" stop-opacity=".55"/></linearGradient>`
      : "");

  const capStroke = glow
    ? `stroke="url(#cdBevel)" stroke-width="2"`
    : `stroke="${surface.border}" stroke-width="2" stroke-opacity="${theme === "dark" ? ".88" : ".34"}"`;

  const layers = `<rect x="3" y="7" width="138" height="134" rx="20" fill="${depth.seat}" fill-opacity="${depth.seatOpacity}"/>`
    + (glow ? `<rect data-key-accent="${accent}" x="2" y="2" width="140" height="140" rx="21" fill="url(#cdBloom)" filter="url(#cdCapGlow)"/>` : "")
    + `<rect data-theme="${theme}"${accent ? ` data-key-group="${accent}"` : ""} data-key-depth="1" x="4" y="4" width="136" height="136" rx="18" fill="url(#keycap)" ${capStroke}/>`
    + (glow ? `<rect x="5.5" y="5.5" width="133" height="133" rx="16.5" fill="url(#cdWash)"/>` : "")
    + `<rect x="5.5" y="5.5" width="133" height="133" rx="16.5" fill="url(#cdShade)"/>`
    + `<ellipse cx="72" cy="17" rx="57" ry="14" fill="url(#cdSpecular)"/>`
    + `<rect x="7.5" y="7.5" width="129" height="129" rx="15" fill="none" stroke="${glow ? "url(#cdRim)" : surface.innerBorder}" stroke-width="1"/>`;

  return { defs, layers, ink };
}

// The touch strip gives each dial a 200x100 segment, and a pixmap layout item accepts a
// raw SVG string -- so the segment is drawn here rather than assembled from Elgato's stock
// text-and-bar layout. That keeps the dials in the same material and palette as the keys.
const STRIP_W = 200;
const STRIP_H = 100;

function stripEllipsis(value: string, budget: number): string {
  const text = value.replace(/\s+/g, " ").trim();
  return text.length <= budget ? text : `${text.slice(0, Math.max(0, budget - 1)).trimEnd()}…`;
}

function stripChassis(theme: ThemeMode, glow: string): string {
  const surface = SURFACES[theme];
  const depth = DEPTHS[theme];
  return `<defs>`
    + `<linearGradient id="cdStripBody" x1="0" y1="0" x2="0" y2="1"><stop stop-color="${depth.bodyHigh}"/><stop offset=".55" stop-color="${surface.keyMiddle}"/><stop offset="1" stop-color="${surface.keyBottom}"/></linearGradient>`
    + `<radialGradient id="cdStripBloom" cx="50%" cy="108%" r="72%"><stop stop-color="${glow}" stop-opacity="${theme === "dark" ? ".34" : ".22"}"/><stop offset="1" stop-color="${glow}" stop-opacity="0"/></radialGradient>`
    + `<linearGradient id="cdStripTop" x1="0" y1="0" x2="0" y2="1"><stop stop-color="${depth.specular}" stop-opacity="${theme === "dark" ? ".10" : ".55"}"/><stop offset="1" stop-color="${depth.specular}" stop-opacity="0"/></linearGradient>`
    + `</defs>`
    + `<rect x="0" y="0" width="${STRIP_W}" height="${STRIP_H}" fill="url(#cdStripBody)"/>`
    + `<rect x="0" y="0" width="${STRIP_W}" height="${STRIP_H}" fill="url(#cdStripBloom)"/>`
    + `<rect x="0" y="0" width="${STRIP_W}" height="26" fill="url(#cdStripTop)"/>`
    + `<rect x="0" y="${STRIP_H - 2}" width="${STRIP_W}" height="2" fill="${glow}" fill-opacity="${theme === "dark" ? ".55" : ".42"}"/>`;
}

const STRIP_FONT = `font-family="${KEY_LABEL_FONT}"`;

function stripLabel(text: string, surface: SurfacePalette): string {
  return `<text x="12" y="21" ${STRIP_FONT} font-size="11" font-weight="700" letter-spacing="1.6" fill="${surface.title}" fill-opacity=".52">${escapeXml(text)}</text>`;
}

/** Context-window fill for one task: the number that says how much room is left to work in. */
export function renderContextStrip(
  title: string | undefined,
  usedPercent: number | undefined,
  position: string | undefined,
  theme: ThemeMode = "dark"
): string {
  const surface = SURFACES[theme];
  const signal = SIGNAL_COLORS[theme];
  // Warms as the window fills, on the same thresholds the agent tiles use.
  const glow = usedPercent == null ? signal.empty
    : usedPercent >= 92 ? signal.error : usedPercent >= 80 ? signal.input : signal.thinking;
  const value = usedPercent == null ? "—" : `${Math.round(usedPercent)}%`;
  const filled = Math.max(0, Math.min(100, usedPercent ?? 0)) / 100;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${STRIP_W}" height="${STRIP_H}" viewBox="0 0 ${STRIP_W} ${STRIP_H}">`
    + stripChassis(theme, glow)
    + stripLabel("CONTEXT", surface)
    + (position ? `<text x="188" y="21" text-anchor="end" ${STRIP_FONT} font-size="11" font-weight="600" fill="${surface.title}" fill-opacity=".42">${escapeXml(position)}</text>` : "")
    + `<text data-strip-value="${usedPercent == null ? "unknown" : Math.round(usedPercent)}" x="12" y="56" ${STRIP_FONT} font-size="30" font-weight="700" fill="${surface.title}">${value}</text>`
    + `<text x="188" y="56" text-anchor="end" ${STRIP_FONT} font-size="13" font-weight="600" fill="${surface.title}" fill-opacity=".78">${escapeXml(stripEllipsis(title ?? "No task", 18))}</text>`
    + `<rect x="12" y="72" width="176" height="12" rx="6" fill="${surface.title}" fill-opacity=".13"/>`
    + (filled > 0 ? `<rect x="12" y="72" width="${(176 * filled).toFixed(1)}" height="12" rx="6" fill="${glow}"/>` : "")
    + `</svg>`;
}

/** How many tasks are blocked on you, so the deck is readable from across the room. */
export function renderAttentionStrip(
  waiting: number,
  title: string | undefined,
  theme: ThemeMode = "dark"
): string {
  const surface = SURFACES[theme];
  const signal = SIGNAL_COLORS[theme];
  const glow = waiting === 0 ? signal.complete : signal.input;

  // One pip per agent slot, lit for the ones that want you: countable at a glance and
  // legible without relying on the colour.
  const pips = Array.from({ length: 6 }, (_, index) => {
    const lit = index < waiting;
    return `<rect x="${12 + index * 15}" y="72" width="11" height="12" rx="3" fill="${lit ? glow : surface.title}" fill-opacity="${lit ? "1" : ".13"}"/>`;
  }).join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${STRIP_W}" height="${STRIP_H}" viewBox="0 0 ${STRIP_W} ${STRIP_H}">`
    + stripChassis(theme, glow)
    + stripLabel(waiting === 0 ? "ALL CLEAR" : "WAITING ON YOU", surface)
    + `<text data-strip-waiting="${waiting}" x="12" y="56" ${STRIP_FONT} font-size="30" font-weight="700" fill="${surface.title}">${waiting === 0 ? "—" : String(waiting)}</text>`
    + `<text x="188" y="56" text-anchor="end" ${STRIP_FONT} font-size="13" font-weight="600" fill="${surface.title}" fill-opacity="${waiting === 0 ? ".5" : ".82"}">${escapeXml(waiting === 0 ? "Nothing blocked" : stripEllipsis(title ?? "Task", 18))}</text>`
    + pips
    + `</svg>`;
}

export function renderAgentKey(slot: number, title: string, status: AgentVisualStatus, selected = false, phase = 0, theme: ThemeMode = "light", hostBadge?: string, hostHealth: HostHealthState = "ready", contextUsedPercent?: number, showContextRing = true): string {
  return toDataUrl(renderAgentSvg(slot, title, status, selected, phase, theme, hostBadge, hostHealth, contextUsedPercent, showContextRing));
}

export function renderAgentSvg(_slot: number, title: string, status: AgentVisualStatus, selected = false, phase = 0, theme: ThemeMode = "light", hostBadge?: string, hostHealth: HostHealthState = "ready", contextUsedPercent?: number, showContextRing = true): string {
  const surface = SURFACES[theme];
  const color = SIGNAL_COLORS[theme][status];
  const [line1, line2] = splitTitle(title);
  const pulse = 0.70 + 0.30 * ((Math.sin((phase / 12) * Math.PI * 2) + 1) / 2);
  const glowColor = status === "idle" ? (theme === "dark" ? "#D5D9DC" : "#AAB4BB") : color;
  const themeBoost = theme === "dark" ? .08 : 0;
  const glowOpacity = Math.min(1, (status === "empty" ? .12 : status === "idle" ? .18 : status === "thinking" ? .50 + pulse * .16 : status === "input" ? .42 + pulse * .12 : .52) + themeBoost);
  const surfaceOpacity = (status === "empty" ? .04 : status === "idle" ? .06 : status === "thinking" ? .30 + pulse * .12 : status === "input" ? .24 + pulse * .08 : .28) + (theme === "dark" && status !== "empty" ? .06 : 0);
  const statusMark = renderAgentStatusMark(status, glowColor, phase, pulse, surface);
  const titleMarkup = line2
    ? `<text x="72" y="55" text-anchor="middle" font-size="${fitTitleFont(line1, 16.5)}" font-weight="600" letter-spacing=".12" fill="${surface.title}">${escapeXml(line1)}</text><text x="72" y="75" text-anchor="middle" font-size="${fitTitleFont(line2, 16.5)}" font-weight="600" letter-spacing=".12" fill="${surface.title}">${escapeXml(line2)}</text>`
    : `<text x="72" y="66" text-anchor="middle" font-size="${fitTitleFont(line1, 18)}" font-weight="600" letter-spacing=".12" fill="${surface.title}">${escapeXml(line1)}</text>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
    <defs>
      <linearGradient id="keycap" x1="0" y1="0" x2="0" y2="1"><stop stop-color="${surface.keyTop}"/><stop offset=".14" stop-color="${DEPTHS[theme].bodyHigh}"/><stop offset=".48" stop-color="${surface.keyMiddle}"/><stop offset=".8" stop-color="${DEPTHS[theme].bodyLow}"/><stop offset="1" stop-color="${surface.keyBottom}"/></linearGradient>
      <linearGradient id="cdShade" x1="0" y1="0" x2="0" y2="1"><stop offset=".62" stop-color="${DEPTHS[theme].shade}" stop-opacity="0"/><stop offset="1" stop-color="${DEPTHS[theme].shade}" stop-opacity="${DEPTHS[theme].shadeOpacity}"/></linearGradient>
      <radialGradient id="cdSpecular" cx="50%" cy="50%" r="50%"><stop stop-color="${DEPTHS[theme].specular}" stop-opacity="${DEPTHS[theme].specularOpacity}"/><stop offset="1" stop-color="${DEPTHS[theme].specular}" stop-opacity="0"/></radialGradient>
      <linearGradient id="frost" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${surface.frostTop}" stop-opacity="${theme === "dark" ? ".12" : ".74"}"/><stop offset=".5" stop-color="${surface.frostTop}" stop-opacity="${theme === "dark" ? ".035" : ".12"}"/><stop offset="1" stop-color="${surface.frostEnd}" stop-opacity="${theme === "dark" ? ".28" : ".16"}"/></linearGradient>
      <linearGradient id="stateWash" x1="0" y1="0" x2="0" y2="1"><stop stop-color="${glowColor}" stop-opacity="0"/><stop offset=".48" stop-color="${glowColor}" stop-opacity="${(surfaceOpacity * .28).toFixed(3)}"/><stop offset="1" stop-color="${glowColor}" stop-opacity="${surfaceOpacity.toFixed(3)}"/></linearGradient>
      <radialGradient id="stateBloom" cx="50%" cy="100%" r="82%"><stop stop-color="${glowColor}" stop-opacity="${(surfaceOpacity * 1.22).toFixed(3)}"/><stop offset=".55" stop-color="${glowColor}" stop-opacity="${(surfaceOpacity * .35).toFixed(3)}"/><stop offset="1" stop-color="${glowColor}" stop-opacity="0"/></radialGradient>
      <radialGradient id="selectedBloom" cx="8%" cy="8%" r="90%"><stop stop-color="${surface.selected}" stop-opacity="${theme === "dark" ? ".32" : ".25"}"/><stop offset=".54" stop-color="${surface.selected}" stop-opacity=".06"/><stop offset="1" stop-color="${surface.selected}" stop-opacity="0"/></radialGradient>
      <filter id="softGlow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="4.2"/></filter>
    </defs>
    <rect x="3.5" y="7" width="137" height="134" rx="21" fill="${DEPTHS[theme].seat}" fill-opacity="${DEPTHS[theme].seatOpacity}"/>
    <rect data-theme="${theme}" x="4.5" y="4.5" width="135" height="135" rx="20" fill="${surface.outer}" fill-opacity=".96"/>
    <rect data-agent-status-band="${status}" x="7" y="7" width="130" height="130" rx="17" fill="none" stroke="${glowColor}" stroke-width="8" stroke-opacity="${glowOpacity.toFixed(3)}" filter="url(#softGlow)"/>
    ${selected ? `<rect x="7" y="7" width="130" height="130" rx="17" fill="none" stroke="${surface.selected}" stroke-width="7" stroke-opacity=".34" filter="url(#softGlow)"/>` : ""}
    <rect x="9" y="9" width="126" height="126" rx="14" fill="url(#keycap)" stroke="${surface.border}" stroke-width="1.5" stroke-opacity="${theme === "dark" ? ".92" : ".88"}"/>
    <rect x="9" y="9" width="126" height="126" rx="14" fill="url(#stateWash)"/>
    <rect x="9" y="9" width="126" height="126" rx="14" fill="url(#stateBloom)"/>
    ${selected ? `<rect x="9" y="9" width="126" height="126" rx="14" fill="url(#selectedBloom)"/>` : ""}
    <rect x="12" y="12" width="120" height="120" rx="12" fill="url(#frost)" stroke="${surface.innerBorder}" stroke-width="1" opacity="${theme === "dark" ? ".86" : ".72"}"/>
    <rect data-key-depth="1" x="9" y="9" width="126" height="126" rx="14" fill="url(#cdShade)"/>
    <ellipse cx="72" cy="20" rx="54" ry="13" fill="url(#cdSpecular)"/>
    ${renderHostHealthMark(hostHealth, theme)}
    ${hostHealth === "ready" && status !== "empty" && showContextRing ? renderContextRing(contextUsedPercent, theme, surface) : ""}
    ${hostBadge ? `<g data-agent-host="${escapeXml(hostBadge)}"><rect x="108" y="16" width="20" height="18" rx="7" fill="${surface.title}" fill-opacity=".11"/><text x="118" y="29" text-anchor="middle" font-family="Bahnschrift, Segoe UI, Arial, sans-serif" font-size="11" font-weight="700" fill="${surface.title}" fill-opacity=".82">${escapeXml(hostBadge)}</text></g>` : ""}
    <g font-family="Bahnschrift, Segoe UI Variable Display, Segoe UI, Arial, sans-serif">${titleMarkup}</g>
    ${statusMark}
  </svg>`;
}

export function toDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf8,${encodeURIComponent(svg)}`;
}

export function renderImportedKeycap(svg: string, theme: ThemeMode = "light", label?: string, accent?: KeyGroup): string {
  const viewBox = svg.match(/viewBox=["']([^"']+)["']/i)?.[1];
  const rootAttributes = svg.match(/<svg\b([^>]*)>/i)?.[1] ?? "";
  const body = svg.match(/<svg\b[^>]*>([\s\S]*?)<\/svg>/i)?.[1];
  if (!viewBox || !body || !/^[\d.\s-]+$/.test(viewBox)) throw new Error("The imported SVG has no usable viewBox.");
  const values = viewBox.trim().split(/\s+/).map(Number);
  if (values.length !== 4) throw new Error("The imported SVG viewBox is invalid.");
  const [minX = 0, minY = 0, width = 0, height = 0] = values;
  if (![minX, minY, width, height].every(Number.isFinite) || width <= 0 || height <= 0) throw new Error("The imported SVG dimensions are invalid.");

  const surface = SURFACES[theme];
  const chassis = keycapChassis(theme, accent);
  // Without an accent this resolves to the original neutral ink, which is what keeps the
  // existing two-argument callers byte-identical.
  const glyphColor = chassis.ink;
  const caption = keyLabelMarkup(label, surface);
  // Shrink and lift the glyph only when a caption is drawn, so unlabelled keys are unchanged.
  const size = caption ? 76 : 90;
  const originY = caption ? 16 : 27;
  const originX = (144 - size) / 2;
  const scale = Math.min(size / width, size / height);
  const x = originX + (size - width * scale) / 2 - minX * scale;
  const y = originY + (size - height * scale) / 2 - minY * scale;
  const glyph = body
    .replaceAll("currentColor", glyphColor)
    .replace(/#(?:000000|000|ffffff|fff)\b/gi, glyphColor)
    .replace(/\b(?:black|white)\b/gi, glyphColor);
  const inheritedFill = rootAttributes.match(/\bfill=["'](?:currentColor|#000(?:000)?|#fff(?:fff)?|black|white)["']/i) ? glyphColor : "none";

  return toDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
    <defs>${chassis.defs}</defs>
    ${chassis.layers}
    <g data-icon-source="local-user-file" filter="url(#cdInkShadow)" transform="translate(${x.toFixed(3)} ${y.toFixed(3)}) scale(${scale.toFixed(5)})" fill="${inheritedFill}" color="${glyphColor}">${glyph}</g>
    ${caption}
  </svg>`);
}

export function renderBuiltinKeycap(name: BuiltinIconName, theme: ThemeMode = "light", label?: string, accent?: KeyGroup): string {
  const surface = SURFACES[theme];
  const chassis = keycapChassis(theme, accent);
  const glyphColor = chassis.ink;
  const glyphs: Record<BuiltinIconName, string> = {
    back: `<path d="M88 36L58 62l30 26M59 62h41"/>`,
    forward: `<path d="M56 36l30 26-30 26M44 62h41"/>`,
    sidebar: `<rect x="39" y="34" width="66" height="56" rx="10"/><path d="M64 34v56M48 48h8M48 61h8M48 74h8"/>`,
    home: `<path d="M40 60l32-27 32 27M50 56v35h44V56M65 91V70h14v21"/>`,
    navigation: `<circle cx="58" cy="48" r="6"/><circle cx="86" cy="48" r="6"/><circle cx="58" cy="76" r="6"/><circle cx="86" cy="76" r="6"/>`
  };
  const caption = keyLabelMarkup(label, surface);
  return toDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
    <defs>${chassis.defs}</defs>
    ${chassis.layers}
    <g data-icon-source="codex-deck-original" filter="url(#cdInkShadow)" fill="none" stroke="${glyphColor}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" transform="translate(0 ${caption ? 0 : 10})">${glyphs[name]}</g>
    ${caption}
  </svg>`);
}

export function renderFallbackKeycap(keycapId: string, theme: ThemeMode = "light", accent?: KeyGroup): string {
  const surface = SURFACES[theme];
  const chassis = keycapChassis(theme, accent);
  const label = escapeXml(keycapId);
  const fontSize = keycapId.length > 5 ? 17 : 21;
  return toDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
    <defs>${chassis.defs}</defs>
    ${chassis.layers}
    <text data-icon-source="fallback-label" x="72" y="78" text-anchor="middle" font-family="Bahnschrift, Segoe UI Variable Display, Segoe UI, Arial, sans-serif" font-size="${fontSize}" font-weight="650" letter-spacing="1.1" fill="${surface.title}">${label}</text>
  </svg>`);
}

export function renderHostTargetKey(label: "WIN" | "MAC", health: HostHealthState, theme: ThemeMode = "dark"): string {
  const surface = SURFACES[theme];
  const signal = health === "ready" ? "#35D86B" : health === "degraded" ? SIGNAL_COLORS[theme].input
    : health === "offline" ? SIGNAL_COLORS[theme].error : SIGNAL_COLORS[theme].empty;
  const status = health === "ready" ? "READY" : health === "degraded" ? "DEGRADED"
    : health === "offline" ? "OFFLINE" : "CONNECT";
  return toDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
    <defs>
      <linearGradient id="keycap" x1="0" y1="0" x2="0" y2="1"><stop stop-color="${surface.keyTop}"/><stop offset=".14" stop-color="${DEPTHS[theme].bodyHigh}"/><stop offset=".5" stop-color="${surface.keyMiddle}"/><stop offset=".8" stop-color="${DEPTHS[theme].bodyLow}"/><stop offset="1" stop-color="${surface.keyBottom}"/></linearGradient><linearGradient id="cdShade" x1="0" y1="0" x2="0" y2="1"><stop offset=".62" stop-color="${DEPTHS[theme].shade}" stop-opacity="0"/><stop offset="1" stop-color="${DEPTHS[theme].shade}" stop-opacity="${DEPTHS[theme].shadeOpacity}"/></linearGradient><radialGradient id="cdSpecular" cx="50%" cy="50%" r="50%"><stop stop-color="${DEPTHS[theme].specular}" stop-opacity="${DEPTHS[theme].specularOpacity}"/><stop offset="1" stop-color="${DEPTHS[theme].specular}" stop-opacity="0"/></radialGradient>
      <radialGradient id="hostBloom" cx="50%" cy="100%" r="78%"><stop stop-color="${signal}" stop-opacity=".36"/><stop offset="1" stop-color="${signal}" stop-opacity="0"/></radialGradient>
      <filter id="hostGlow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="4"/></filter>
    </defs>
    <rect data-theme="${theme}" x="4" y="4" width="136" height="136" rx="18" fill="url(#keycap)" stroke="${surface.border}" stroke-width="2" stroke-opacity="${theme === "dark" ? ".88" : ".34"}"/>
    <rect data-host-health="${health}" x="7.5" y="7.5" width="129" height="129" rx="15" fill="url(#hostBloom)" stroke="${signal}" stroke-width="2" stroke-opacity="${health === "ready" ? ".34" : ".82"}"/>
    ${health === "degraded" || health === "offline" ? `<rect x="8" y="8" width="128" height="128" rx="15" fill="none" stroke="${signal}" stroke-width="7" stroke-opacity=".24" filter="url(#hostGlow)"/>` : ""}
    <text x="72" y="69" text-anchor="middle" font-family="Bahnschrift, Segoe UI Variable Display, Segoe UI, Arial, sans-serif" font-size="27" font-weight="700" letter-spacing="1.4" fill="${surface.title}">${label}</text>
    <circle cx="72" cy="91" r="5" fill="${signal}"/><circle cx="72" cy="91" r="11" fill="${signal}" fill-opacity=".10"/>
    <text x="72" y="116" text-anchor="middle" font-family="Bahnschrift, Segoe UI Variable Display, Segoe UI, Arial, sans-serif" font-size="${health === "degraded" ? 11 : 12}" font-weight="700" letter-spacing="1" fill="${signal}">${status}</text>
  </svg>`);
}

export function renderUsageLimitKey(window: UsageWindow | undefined, requestedKind: UsageWindowKind, theme: ThemeMode = "dark", health: HostHealthState = "ready"): string {
  const surface = SURFACES[theme];
  const remaining = window ? Math.round(clampPercent(window.remainingPercent)) : null;
  const signal = usageSignal(remaining, health, theme);
  const track = theme === "dark" ? "#45494C" : "#AAB2B8";
  const circumference = 2 * Math.PI * 40;
  const dash = remaining == null ? 0 : circumference * remaining / 100;
  const label = usageLabel(window?.kind ?? requestedKind);
  const digits = remaining == null ? 0 : String(remaining).length;
  const numberX = digits >= 3 ? 61 : digits === 2 ? 65 : 69;
  const fontSize = digits >= 3 ? 27 : 30;
  return toDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
    <defs>
      <linearGradient id="keycap" x1="0" y1="0" x2="0" y2="1"><stop stop-color="${surface.keyTop}"/><stop offset=".14" stop-color="${DEPTHS[theme].bodyHigh}"/><stop offset=".5" stop-color="${surface.keyMiddle}"/><stop offset=".8" stop-color="${DEPTHS[theme].bodyLow}"/><stop offset="1" stop-color="${surface.keyBottom}"/></linearGradient><linearGradient id="cdShade" x1="0" y1="0" x2="0" y2="1"><stop offset=".62" stop-color="${DEPTHS[theme].shade}" stop-opacity="0"/><stop offset="1" stop-color="${DEPTHS[theme].shade}" stop-opacity="${DEPTHS[theme].shadeOpacity}"/></linearGradient><radialGradient id="cdSpecular" cx="50%" cy="50%" r="50%"><stop stop-color="${DEPTHS[theme].specular}" stop-opacity="${DEPTHS[theme].specularOpacity}"/><stop offset="1" stop-color="${DEPTHS[theme].specular}" stop-opacity="0"/></radialGradient>
      <radialGradient id="usageBloom" cx="50%" cy="52%" r="52%"><stop stop-color="${signal}" stop-opacity=".13"/><stop offset=".76" stop-color="${signal}" stop-opacity=".02"/><stop offset="1" stop-color="${signal}" stop-opacity="0"/></radialGradient>
      <filter id="usageGlow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="4"/></filter>
    </defs>
    <rect data-theme="${theme}" x="4" y="4" width="136" height="136" rx="18" fill="url(#keycap)" stroke="${surface.border}" stroke-width="2" stroke-opacity="${theme === "dark" ? ".88" : ".34"}"/>
    <rect data-key-depth="1" x="5.5" y="5.5" width="133" height="133" rx="16.5" fill="url(#cdShade)"/>
    <ellipse cx="72" cy="17" rx="57" ry="14" fill="url(#cdSpecular)"/>
    <rect x="7.5" y="7.5" width="129" height="129" rx="15" fill="none" stroke="${surface.innerBorder}" stroke-width="1"/>
    <circle cx="72" cy="70" r="55" fill="url(#usageBloom)"/>
    <circle cx="72" cy="70" r="40" fill="none" stroke="${track}" stroke-width="7"/>
    ${remaining == null ? "" : `<circle data-usage-remaining="${remaining}" cx="72" cy="70" r="40" fill="none" stroke="${signal}" stroke-width="7" stroke-linecap="round" stroke-dasharray="${dash.toFixed(2)} ${circumference.toFixed(2)}" transform="rotate(-90 72 70)"/>`}
    ${health === "degraded" || health === "offline" ? `<circle cx="72" cy="70" r="48" fill="none" stroke="${signal}" stroke-width="4" stroke-opacity=".13" filter="url(#usageGlow)"/>` : ""}
    ${remaining == null
      ? `<text x="72" y="80" text-anchor="middle" font-family="Bahnschrift, Segoe UI, Arial, sans-serif" font-size="31" font-weight="700" fill="${signal}">—</text>`
      : `<text data-usage-value="${remaining}" x="${numberX}" y="80" text-anchor="middle" fill="${surface.title}" font-family="Bahnschrift, Segoe UI, Arial, sans-serif" font-size="${fontSize}" font-weight="700">${remaining}</text><g data-usage-percent="vector" transform="translate(87 57)" fill="none" stroke="${signal}" stroke-width="2.4" stroke-linecap="round"><circle cx="2.5" cy="2.5" r="1.7"/><circle cx="10" cy="12" r="1.7"/><path d="M11 1L1.5 13.5"/></g>`}
    <text x="72" y="126" text-anchor="middle" fill="${surface.title}" fill-opacity=".62" font-family="Bahnschrift, Segoe UI, Arial, sans-serif" font-size="11" font-weight="700" letter-spacing="1.2">${label}</text>
  </svg>`);
}

export function renderUsageOverviewKey(usageWindows: UsageWindow[], theme: ThemeMode = "dark", health: HostHealthState = "ready"): string {
  const surface = SURFACES[theme];
  const fiveHour = usageWindows.find((window) => window.kind === "five-hour");
  const weekly = usageWindows.find((window) => window.kind === "weekly");
  return toDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
    <defs><linearGradient id="keycap" x1="0" y1="0" x2="0" y2="1"><stop stop-color="${surface.keyTop}"/><stop offset=".14" stop-color="${DEPTHS[theme].bodyHigh}"/><stop offset=".5" stop-color="${surface.keyMiddle}"/><stop offset=".8" stop-color="${DEPTHS[theme].bodyLow}"/><stop offset="1" stop-color="${surface.keyBottom}"/></linearGradient><linearGradient id="cdShade" x1="0" y1="0" x2="0" y2="1"><stop offset=".62" stop-color="${DEPTHS[theme].shade}" stop-opacity="0"/><stop offset="1" stop-color="${DEPTHS[theme].shade}" stop-opacity="${DEPTHS[theme].shadeOpacity}"/></linearGradient><radialGradient id="cdSpecular" cx="50%" cy="50%" r="50%"><stop stop-color="${DEPTHS[theme].specular}" stop-opacity="${DEPTHS[theme].specularOpacity}"/><stop offset="1" stop-color="${DEPTHS[theme].specular}" stop-opacity="0"/></radialGradient></defs>
    <rect data-theme="${theme}" x="4" y="4" width="136" height="136" rx="18" fill="url(#keycap)" stroke="${surface.border}" stroke-width="2" stroke-opacity="${theme === "dark" ? ".88" : ".34"}"/>
    <rect data-key-depth="1" x="5.5" y="5.5" width="133" height="133" rx="16.5" fill="url(#cdShade)"/>
    <ellipse cx="72" cy="17" rx="57" ry="14" fill="url(#cdSpecular)"/>
    <rect x="7.5" y="7.5" width="129" height="129" rx="15" fill="none" stroke="${surface.innerBorder}" stroke-width="1"/>
    ${renderUsageBar("5H", fiveHour, 33, surface, theme, health)}
    ${renderUsageBar("WK", weekly, 82, surface, theme, health)}
  </svg>`);
}

export function renderRateLimitResetKey(
  available: number | null,
  holdProgress = 0,
  theme: ThemeMode = "dark",
  health: HostHealthState = "ready"
): string {
  const surface = SURFACES[theme];
  const count = available == null ? null : Math.max(0, Math.floor(available));
  const enabled = count != null && count > 0 && health === "ready";
  const glyph = enabled ? (theme === "dark" ? "#F2F2EE" : "#24292D") : SIGNAL_COLORS[theme].empty;
  const countColor = enabled ? SIGNAL_COLORS[theme].thinking : SIGNAL_COLORS[theme].empty;
  const progress = clampPercent(holdProgress * 100);
  const progressDash = 2 * Math.PI * 51 * progress / 100;
  const healthColor = usageSignal(null, health, theme);
  return toDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
    <defs>
      <linearGradient id="keycap" x1="0" y1="0" x2="0" y2="1"><stop stop-color="${surface.keyTop}"/><stop offset=".14" stop-color="${DEPTHS[theme].bodyHigh}"/><stop offset=".5" stop-color="${surface.keyMiddle}"/><stop offset=".8" stop-color="${DEPTHS[theme].bodyLow}"/><stop offset="1" stop-color="${surface.keyBottom}"/></linearGradient><linearGradient id="cdShade" x1="0" y1="0" x2="0" y2="1"><stop offset=".62" stop-color="${DEPTHS[theme].shade}" stop-opacity="0"/><stop offset="1" stop-color="${DEPTHS[theme].shade}" stop-opacity="${DEPTHS[theme].shadeOpacity}"/></linearGradient><radialGradient id="cdSpecular" cx="50%" cy="50%" r="50%"><stop stop-color="${DEPTHS[theme].specular}" stop-opacity="${DEPTHS[theme].specularOpacity}"/><stop offset="1" stop-color="${DEPTHS[theme].specular}" stop-opacity="0"/></radialGradient>
      <radialGradient id="resetBloom" cx="50%" cy="50%" r="50%"><stop stop-color="${countColor}" stop-opacity="${enabled ? ".13" : "0"}"/><stop offset="1" stop-color="${countColor}" stop-opacity="0"/></radialGradient>
    </defs>
    <rect data-theme="${theme}" x="4" y="4" width="136" height="136" rx="18" fill="url(#keycap)" stroke="${surface.border}" stroke-width="2" stroke-opacity="${theme === "dark" ? ".88" : ".34"}"/>
    <rect data-key-depth="1" x="5.5" y="5.5" width="133" height="133" rx="16.5" fill="url(#cdShade)"/>
    <ellipse cx="72" cy="17" rx="57" ry="14" fill="url(#cdSpecular)"/>
    <rect x="7.5" y="7.5" width="129" height="129" rx="15" fill="none" stroke="${surface.innerBorder}" stroke-width="1"/>
    <circle cx="72" cy="69" r="54" fill="url(#resetBloom)"/>
    <g transform="translate(33.6 30.6) scale(3.2)" fill="none" stroke="${glyph}" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>
    </g>
    <text data-reset-credits="${count ?? "unknown"}" x="72" y="78" text-anchor="middle" fill="${countColor}" font-family="Bahnschrift, Segoe UI, Arial, sans-serif" font-size="23" font-weight="700">${count == null ? "—" : count > 99 ? "99+" : count}</text>
    ${progress > 0 ? `<circle data-reset-hold="${progress.toFixed(0)}" cx="72" cy="69" r="51" fill="none" stroke="${SIGNAL_COLORS[theme].thinking}" stroke-width="4" stroke-linecap="round" stroke-dasharray="${progressDash.toFixed(2)} ${(2 * Math.PI * 51).toFixed(2)}" transform="rotate(-90 72 69)"/><text x="72" y="128" text-anchor="middle" fill="${SIGNAL_COLORS[theme].thinking}" font-family="Bahnschrift, Segoe UI, Arial, sans-serif" font-size="10" font-weight="700" letter-spacing="1">HOLD</text>` : ""}
    ${health !== "ready" ? `<circle cx="122" cy="22" r="5" fill="${healthColor}"/>` : ""}
  </svg>`);
}

function renderUsageBar(label: string, window: UsageWindow | undefined, y: number, surface: SurfacePalette, theme: ThemeMode, health: HostHealthState): string {
  const remaining = window ? Math.round(clampPercent(window.remainingPercent)) : null;
  const signal = usageSignal(remaining, health, theme);
  const track = theme === "dark" ? "#45494C" : "#AAB2B8";
  const width = remaining == null ? 0 : 96 * remaining / 100;
  return `<g data-usage-window="${label}">
    <text x="24" y="${y}" fill="${surface.title}" fill-opacity=".72" font-family="Bahnschrift, Segoe UI, Arial, sans-serif" font-size="12" font-weight="700" letter-spacing=".8">${label}</text>
    <text x="120" y="${y}" text-anchor="end" fill="${remaining == null ? signal : surface.title}" font-family="Bahnschrift, Segoe UI, Arial, sans-serif" font-size="14" font-weight="700">${remaining == null ? "—" : `${remaining}%`}</text>
    <rect x="24" y="${y + 10}" width="96" height="10" rx="5" fill="${track}"/>
    ${remaining == null ? "" : `<rect data-usage-remaining="${remaining}" x="24" y="${y + 10}" width="${width.toFixed(2)}" height="10" rx="5" fill="${signal}"/>`}
  </g>`;
}

function usageSignal(remaining: number | null, health: HostHealthState, theme: ThemeMode): string {
  if (health === "offline") return SIGNAL_COLORS[theme].error;
  if (health === "degraded" || health === "connecting") return SIGNAL_COLORS[theme].input;
  if (remaining == null) return SIGNAL_COLORS[theme].empty;
  return remaining <= 20 ? SIGNAL_COLORS[theme].error : SIGNAL_COLORS[theme].complete;
}

export function escapeXml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&apos;", "\"": "&quot;"
  })[character] ?? character);
}

function splitTitle(value: string): [string, string] {
  const clean = value.replace(/\s+/g, " ").trim();
  if (clean.length <= 16) return [clean, ""];
  const words = clean.split(" ");
  let first = "";
  let second = "";
  for (const word of words) {
    if (!second && `${first} ${word}`.trim().length <= 16) first = `${first} ${word}`.trim();
    else if (`${second} ${word}`.trim().length <= 16) second = `${second} ${word}`.trim();
    else break;
  }
  if (!first) first = clean.slice(0, 15);
  const used = `${first}${second ? ` ${second}` : ""}`.length;
  if (used < clean.length) second = `${(second || clean.slice(first.length).trim()).slice(0, 15)}…`;
  return [first, second];
}

function fitTitleFont(value: string, maximum: number): string {
  let units = 0;
  for (const character of value) {
    if (/\s/.test(character)) units += .32;
    else if (/[ilI1.,:;'|!]/.test(character)) units += .3;
    else if (/[MW@%&]/.test(character)) units += .88;
    else if (/[A-ZÄÖÜ]/.test(character)) units += .63;
    else units += .54;
  }
  return Math.max(12.5, Math.min(maximum, 112 / Math.max(units, 1))).toFixed(2);
}

// Every status used to be a circle at cy 108 in a different colour, which is one
// silhouette in four coats of paint -- at arm's length the state simply did not register.
// Each status now differs in three redundant channels: outline, filled area, and motion.
// Motion is the one that survives everything: sweeping = working, rising = wants you,
// still = settled.
//
// Only thinking and input may depend on phase. renderAnimatedAgents re-renders those two
// at 5 fps; keeping the rest phase-invariant lets lastImages dedupe them to zero traffic,
// so a finished agent costs nothing to display.
function renderAgentStatusMark(
  status: AgentVisualStatus,
  color: string,
  phase: number,
  pulse: number,
  surface: SurfacePalette
): string {
  if (status === "thinking") {
    const x = 45 + (phase % 12) * 2.75;
    return `<g data-agent-motion="working" data-agent-shape="sweep"><rect x="43" y="104" width="58" height="8" rx="4" fill="#77838C" fill-opacity=".18"/><rect x="${x.toFixed(2)}" y="106" width="20" height="4" rx="2" fill="${color}" fill-opacity=".98"/><rect x="${(x - 2).toFixed(2)}" y="104" width="24" height="8" rx="4" fill="${color}" fill-opacity=".16" filter="url(#softGlow)"/></g>`;
  }
  if (status === "input") {
    // Widest, brightest silhouette on the deck, and the only one that rises. Needing an
    // answer is the state you must not miss.
    const rise = (-2.2 * Math.sin((phase / 12) * Math.PI * 2)).toFixed(2);
    return `<g data-agent-motion="input" data-agent-shape="caret-pill"><rect x="30" y="95" width="84" height="30" rx="15" fill="${color}" fill-opacity="${(.14 + pulse * .18).toFixed(3)}" stroke="${color}" stroke-opacity=".92" stroke-width="2.5"/><g transform="translate(0 ${rise})" fill="none" stroke="${color}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"><path d="M62 114l10-9 10 9"/><path d="M62 105l10-9 10 9" stroke-opacity=".55"/></g></g>`;
  }
  if (status === "complete") {
    // Solid disc with the tick knocked out, plus a full-width rule: reads as a finished
    // block of work even in a monochrome photocopy.
    return `<g data-agent-motion="complete" data-agent-shape="disc"><rect x="30" y="88" width="84" height="3" rx="1.5" fill="${color}" fill-opacity=".38"/><circle cx="72" cy="110" r="18" fill="${color}" fill-opacity=".96"/><path d="M63 110l6.5 6.5L82 103" fill="none" stroke="${surface.keyBottom}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></g>`;
  }
  if (status === "error") {
    return `<g data-agent-motion="error" data-agent-shape="triangle"><path d="M72 90l23 40H49z" fill="${color}" fill-opacity=".96"/><path d="M72 104v11" fill="none" stroke="${surface.keyBottom}" stroke-width="4.5" stroke-linecap="round"/><circle cx="72" cy="123" r="2.6" fill="${surface.keyBottom}"/></g>`;
  }
  if (status === "empty") {
    return `<rect data-agent-shape="dash" x="59" y="106" width="26" height="4" rx="2" fill="${color}" fill-opacity=".32"/>`;
  }
  return `<g data-agent-motion="idle" data-agent-shape="ring"><circle cx="72" cy="108" r="7" fill="none" stroke="${color}" stroke-width="3" stroke-opacity=".82"/><circle cx="72" cy="108" r="13" fill="${color}" fill-opacity=".06"/></g>`;
}

function renderHostHealthMark(health: HostHealthState, theme: ThemeMode): string {
  if (health === "ready") return "";
  if (health === "degraded") {
    const color = SIGNAL_COLORS[theme].input;
    return `<g data-agent-host-health="degraded"><path d="M25 15l11 20H14z" fill="${color}"/><text x="25" y="31" text-anchor="middle" font-family="Arial, sans-serif" font-size="14" font-weight="900" fill="#17191B">!</text></g>`;
  }
  if (health === "offline") {
    const color = SIGNAL_COLORS[theme].error;
    return `<g data-agent-host-health="offline" fill="${color}"><circle cx="25" cy="25" r="11"/><path d="M20 20l10 10m0-10L20 30" fill="none" stroke="#FFFFFF" stroke-width="3" stroke-linecap="round"/></g>`;
  }
  return `<g data-agent-host-health="connecting" fill="${SIGNAL_COLORS[theme].empty}"><circle cx="18" cy="25" r="2.5"/><circle cx="25" cy="25" r="2.5"/><circle cx="32" cy="25" r="2.5"/></g>`;
}

function renderContextRing(
  value: number | undefined,
  theme: ThemeMode,
  surface: SurfacePalette
): string {
  if (value == null || !Number.isFinite(value)) {
    return `<g data-context-used="unknown" aria-label="Context usage pending">
      <circle cx="25" cy="25" r="9" fill="${surface.keyMiddle}" fill-opacity=".58" stroke="${surface.title}" stroke-width="3" stroke-opacity=".18"/>
    </g>`;
  }
  const percent = Math.max(0, Math.min(100, value));
  const radius = 9;
  const circumference = 2 * Math.PI * radius;
  const dash = circumference * percent / 100;
  const color = percent >= 92
    ? SIGNAL_COLORS[theme].error
    : percent >= 80 ? SIGNAL_COLORS[theme].input : surface.title;
  return `<g data-context-used="${Math.round(percent)}" aria-label="Context usage ${Math.round(percent)} percent">
    <circle cx="25" cy="25" r="${radius}" fill="${surface.keyMiddle}" fill-opacity=".58" stroke="${surface.title}" stroke-width="3" stroke-opacity=".14"/>
    <circle cx="25" cy="25" r="${radius}" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-dasharray="${dash.toFixed(2)} ${circumference.toFixed(2)}" transform="rotate(-90 25 25)"/>
  </g>`;
}
