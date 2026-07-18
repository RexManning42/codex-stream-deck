import type { AgentVisualStatus, ThemeMode } from "./types.js";

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

export function renderAgentKey(slot: number, title: string, status: AgentVisualStatus, selected = false, phase = 0, theme: ThemeMode = "light", hostBadge?: string): string {
  return toDataUrl(renderAgentSvg(slot, title, status, selected, phase, theme, hostBadge));
}

export function renderAgentSvg(_slot: number, title: string, status: AgentVisualStatus, selected = false, phase = 0, theme: ThemeMode = "light", hostBadge?: string): string {
  const surface = SURFACES[theme];
  const color = SIGNAL_COLORS[theme][status];
  const [line1, line2] = splitTitle(title);
  const pulse = 0.70 + 0.30 * ((Math.sin((phase / 12) * Math.PI * 2) + 1) / 2);
  const glowColor = status === "idle" ? (theme === "dark" ? "#D5D9DC" : "#AAB4BB") : color;
  const themeBoost = theme === "dark" ? .08 : 0;
  const glowOpacity = Math.min(1, (status === "empty" ? .12 : status === "idle" ? .18 : status === "thinking" ? .50 + pulse * .16 : status === "input" ? .42 + pulse * .12 : .52) + themeBoost);
  const surfaceOpacity = (status === "empty" ? .04 : status === "idle" ? .06 : status === "thinking" ? .30 + pulse * .12 : status === "input" ? .24 + pulse * .08 : .28) + (theme === "dark" && status !== "empty" ? .06 : 0);
  const statusMark = renderAgentStatusMark(status, glowColor, phase, pulse);
  const titleMarkup = line2
    ? `<text x="72" y="55" text-anchor="middle" font-size="${fitTitleFont(line1, 16.5)}" font-weight="600" letter-spacing=".12" fill="${surface.title}">${escapeXml(line1)}</text><text x="72" y="75" text-anchor="middle" font-size="${fitTitleFont(line2, 16.5)}" font-weight="600" letter-spacing=".12" fill="${surface.title}">${escapeXml(line2)}</text>`
    : `<text x="72" y="66" text-anchor="middle" font-size="${fitTitleFont(line1, 18)}" font-weight="600" letter-spacing=".12" fill="${surface.title}">${escapeXml(line1)}</text>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
    <defs>
      <linearGradient id="keycap" x1="0" y1="0" x2="0" y2="1"><stop stop-color="${surface.keyTop}"/><stop offset=".48" stop-color="${surface.keyMiddle}"/><stop offset="1" stop-color="${surface.keyBottom}"/></linearGradient>
      <linearGradient id="frost" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${surface.frostTop}" stop-opacity="${theme === "dark" ? ".12" : ".74"}"/><stop offset=".5" stop-color="${surface.frostTop}" stop-opacity="${theme === "dark" ? ".035" : ".12"}"/><stop offset="1" stop-color="${surface.frostEnd}" stop-opacity="${theme === "dark" ? ".28" : ".16"}"/></linearGradient>
      <linearGradient id="stateWash" x1="0" y1="0" x2="0" y2="1"><stop stop-color="${glowColor}" stop-opacity="0"/><stop offset=".48" stop-color="${glowColor}" stop-opacity="${(surfaceOpacity * .28).toFixed(3)}"/><stop offset="1" stop-color="${glowColor}" stop-opacity="${surfaceOpacity.toFixed(3)}"/></linearGradient>
      <radialGradient id="stateBloom" cx="50%" cy="100%" r="82%"><stop stop-color="${glowColor}" stop-opacity="${(surfaceOpacity * 1.22).toFixed(3)}"/><stop offset=".55" stop-color="${glowColor}" stop-opacity="${(surfaceOpacity * .35).toFixed(3)}"/><stop offset="1" stop-color="${glowColor}" stop-opacity="0"/></radialGradient>
      <radialGradient id="selectedBloom" cx="8%" cy="8%" r="90%"><stop stop-color="${surface.selected}" stop-opacity="${theme === "dark" ? ".32" : ".25"}"/><stop offset=".54" stop-color="${surface.selected}" stop-opacity=".06"/><stop offset="1" stop-color="${surface.selected}" stop-opacity="0"/></radialGradient>
      <filter id="softGlow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="4.2"/></filter>
    </defs>
    <rect data-theme="${theme}" x="4.5" y="4.5" width="135" height="135" rx="20" fill="${surface.outer}" fill-opacity=".96"/>
    <rect data-agent-status-band="${status}" x="7" y="7" width="130" height="130" rx="17" fill="none" stroke="${glowColor}" stroke-width="8" stroke-opacity="${glowOpacity.toFixed(3)}" filter="url(#softGlow)"/>
    ${selected ? `<rect x="7" y="7" width="130" height="130" rx="17" fill="none" stroke="${surface.selected}" stroke-width="7" stroke-opacity=".34" filter="url(#softGlow)"/>` : ""}
    <rect x="9" y="9" width="126" height="126" rx="14" fill="url(#keycap)" stroke="${surface.border}" stroke-width="1.5" stroke-opacity="${theme === "dark" ? ".92" : ".88"}"/>
    <rect x="9" y="9" width="126" height="126" rx="14" fill="url(#stateWash)"/>
    <rect x="9" y="9" width="126" height="126" rx="14" fill="url(#stateBloom)"/>
    ${selected ? `<rect x="9" y="9" width="126" height="126" rx="14" fill="url(#selectedBloom)"/>` : ""}
    <rect x="12" y="12" width="120" height="120" rx="12" fill="url(#frost)" stroke="${surface.innerBorder}" stroke-width="1" opacity="${theme === "dark" ? ".86" : ".72"}"/>
    <path d="M18 21C46 12 99 12 126 23" fill="none" stroke="${surface.sheen}" stroke-width="6" stroke-linecap="round" opacity="${theme === "dark" ? "0" : ".68"}"/>
    ${hostBadge ? `<g data-agent-host="${escapeXml(hostBadge)}"><rect x="108" y="16" width="20" height="18" rx="7" fill="${surface.title}" fill-opacity=".11"/><text x="118" y="29" text-anchor="middle" font-family="Bahnschrift, Segoe UI, Arial, sans-serif" font-size="11" font-weight="700" fill="${surface.title}" fill-opacity=".82">${escapeXml(hostBadge)}</text></g>` : ""}
    <g font-family="Bahnschrift, Segoe UI Variable Display, Segoe UI, Arial, sans-serif">${titleMarkup}</g>
    ${statusMark}
  </svg>`;
}

export function toDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf8,${encodeURIComponent(svg)}`;
}

export function renderImportedKeycap(svg: string, theme: ThemeMode = "light"): string {
  const viewBox = svg.match(/viewBox=["']([^"']+)["']/i)?.[1];
  const rootAttributes = svg.match(/<svg\b([^>]*)>/i)?.[1] ?? "";
  const body = svg.match(/<svg\b[^>]*>([\s\S]*?)<\/svg>/i)?.[1];
  if (!viewBox || !body || !/^[\d.\s-]+$/.test(viewBox)) throw new Error("The imported SVG has no usable viewBox.");
  const values = viewBox.trim().split(/\s+/).map(Number);
  if (values.length !== 4) throw new Error("The imported SVG viewBox is invalid.");
  const [minX = 0, minY = 0, width = 0, height = 0] = values;
  if (![minX, minY, width, height].every(Number.isFinite) || width <= 0 || height <= 0) throw new Error("The imported SVG dimensions are invalid.");

  const surface = SURFACES[theme];
  const glyphColor = theme === "dark" ? "#F2F2EE" : "#24292D";
  const size = 90;
  const scale = Math.min(size / width, size / height);
  const x = 27 + (size - width * scale) / 2 - minX * scale;
  const y = 27 + (size - height * scale) / 2 - minY * scale;
  const glyph = body
    .replaceAll("currentColor", glyphColor)
    .replace(/#(?:000000|000|ffffff|fff)\b/gi, glyphColor)
    .replace(/\b(?:black|white)\b/gi, glyphColor);
  const inheritedFill = rootAttributes.match(/\bfill=["'](?:currentColor|#000(?:000)?|#fff(?:fff)?|black|white)["']/i) ? glyphColor : "none";

  return toDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
    <defs><linearGradient id="keycap" x1="0" y1="0" x2="0" y2="1"><stop stop-color="${surface.keyTop}"/><stop offset=".52" stop-color="${surface.keyMiddle}"/><stop offset="1" stop-color="${surface.keyBottom}"/></linearGradient></defs>
    <rect data-theme="${theme}" x="4" y="4" width="136" height="136" rx="18" fill="url(#keycap)" stroke="${surface.border}" stroke-width="2" stroke-opacity="${theme === "dark" ? ".88" : ".34"}"/>
    <rect x="7.5" y="7.5" width="129" height="129" rx="15" fill="none" stroke="${surface.innerBorder}" stroke-width="1"/>
    <path d="M16 18C45 8 101 8 128 20" fill="none" stroke="${surface.sheen}" stroke-width="6" stroke-linecap="round" opacity="${theme === "dark" ? "0" : ".72"}"/>
    <g data-icon-source="local-user-file" transform="translate(${x.toFixed(3)} ${y.toFixed(3)}) scale(${scale.toFixed(5)})" fill="${inheritedFill}" color="${glyphColor}">${glyph}</g>
  </svg>`);
}

export function renderBuiltinKeycap(name: BuiltinIconName, theme: ThemeMode = "light"): string {
  const surface = SURFACES[theme];
  const glyphColor = theme === "dark" ? "#F2F2EE" : "#24292D";
  const glyphs: Record<BuiltinIconName, string> = {
    back: `<path d="M88 36L58 62l30 26M59 62h41"/>`,
    forward: `<path d="M56 36l30 26-30 26M44 62h41"/>`,
    sidebar: `<rect x="39" y="34" width="66" height="56" rx="10"/><path d="M64 34v56M48 48h8M48 61h8M48 74h8"/>`,
    home: `<path d="M40 60l32-27 32 27M50 56v35h44V56M65 91V70h14v21"/>`,
    navigation: `<circle cx="58" cy="48" r="6"/><circle cx="86" cy="48" r="6"/><circle cx="58" cy="76" r="6"/><circle cx="86" cy="76" r="6"/>`
  };
  return toDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
    <defs><linearGradient id="keycap" x1="0" y1="0" x2="0" y2="1"><stop stop-color="${surface.keyTop}"/><stop offset=".52" stop-color="${surface.keyMiddle}"/><stop offset="1" stop-color="${surface.keyBottom}"/></linearGradient></defs>
    <rect data-theme="${theme}" x="4" y="4" width="136" height="136" rx="18" fill="url(#keycap)" stroke="${surface.border}" stroke-width="2" stroke-opacity="${theme === "dark" ? ".88" : ".34"}"/>
    <rect x="7.5" y="7.5" width="129" height="129" rx="15" fill="none" stroke="${surface.innerBorder}" stroke-width="1"/>
    <path d="M16 18C45 8 101 8 128 20" fill="none" stroke="${surface.sheen}" stroke-width="6" stroke-linecap="round" opacity="${theme === "dark" ? "0" : ".72"}"/>
    <g data-icon-source="codex-deck-original" fill="none" stroke="${glyphColor}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" transform="translate(0 10)">${glyphs[name]}</g>
  </svg>`);
}

export function renderFallbackKeycap(keycapId: string, theme: ThemeMode = "light"): string {
  const surface = SURFACES[theme];
  const label = escapeXml(keycapId);
  const fontSize = keycapId.length > 5 ? 17 : 21;
  return toDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
    <defs><linearGradient id="keycap" x1="0" y1="0" x2="0" y2="1"><stop stop-color="${surface.keyTop}"/><stop offset=".52" stop-color="${surface.keyMiddle}"/><stop offset="1" stop-color="${surface.keyBottom}"/></linearGradient></defs>
    <rect data-theme="${theme}" x="4" y="4" width="136" height="136" rx="18" fill="url(#keycap)" stroke="${surface.border}" stroke-width="2" stroke-opacity="${theme === "dark" ? ".88" : ".34"}"/>
    <rect x="7.5" y="7.5" width="129" height="129" rx="15" fill="none" stroke="${surface.innerBorder}" stroke-width="1"/>
    <text data-icon-source="fallback-label" x="72" y="78" text-anchor="middle" font-family="Bahnschrift, Segoe UI Variable Display, Segoe UI, Arial, sans-serif" font-size="${fontSize}" font-weight="650" letter-spacing="1.1" fill="${surface.title}">${label}</text>
  </svg>`);
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

function renderAgentStatusMark(status: AgentVisualStatus, color: string, phase: number, pulse: number): string {
  if (status === "thinking") {
    const x = 45 + (phase % 12) * 2.75;
    return `<g data-agent-motion="working"><rect x="43" y="104" width="58" height="8" rx="4" fill="#77838C" fill-opacity=".18"/><rect x="${x.toFixed(2)}" y="106" width="20" height="4" rx="2" fill="${color}" fill-opacity=".98"/><rect x="${(x - 2).toFixed(2)}" y="104" width="24" height="8" rx="4" fill="${color}" fill-opacity=".16" filter="url(#softGlow)"/></g>`;
  }
  if (status === "input") return `<g data-agent-motion="input" fill="${color}" fill-opacity="${(.72 + pulse * .24).toFixed(3)}"><rect x="63" y="98" width="6" height="22" rx="3"/><rect x="75" y="98" width="6" height="22" rx="3"/><circle cx="72" cy="109" r="19" fill="${color}" fill-opacity="${(.04 + pulse * .06).toFixed(3)}" filter="url(#softGlow)"/></g>`;
  if (status === "complete") return `<g data-agent-motion="complete" fill="none" stroke="${color}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"><circle cx="72" cy="108" r="17"/><path d="M63 108l6 6 12-14"/></g>`;
  if (status === "error") return `<g data-agent-motion="error" fill="none" stroke="${color}" stroke-width="5" stroke-linecap="round"><circle cx="72" cy="108" r="17"/><path d="M65 101l14 14M79 101l-14 14"/></g>`;
  if (status === "empty") return `<rect x="59" y="106" width="26" height="4" rx="2" fill="${color}" fill-opacity=".32"/>`;
  return `<circle data-agent-motion="idle" cx="72" cy="108" r="5" fill="${color}" fill-opacity=".76"/><circle cx="72" cy="108" r="12" fill="${color}" fill-opacity=".07"/>`;
}
