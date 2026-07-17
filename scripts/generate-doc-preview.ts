import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { renderAgentSvg } from "../src/render.js";
import type { ThemeMode } from "../src/types.js";

function renderPreview(theme: ThemeMode): string {
  const agents = [
    renderAgentSvg(0, "Ready Task", "idle", true, 3, theme),
    renderAgentSvg(1, "Building UI", "thinking", false, 4, theme),
    renderAgentSvg(2, "Needs Review", "input", false, 3, theme),
    renderAgentSvg(3, "Release Ready", "complete", false, 3, theme),
    renderAgentSvg(4, "Test Failed", "error", false, 3, theme),
    renderAgentSvg(5, "Not assigned", "empty", false, 3, theme)
  ];
  const key = 144;
  const gap = 14;
  const padding = 24;
  const width = padding * 2 + agents.length * key + (agents.length - 1) * gap;
  const height = padding * 2 + key;
  const background = theme === "dark" ? "#202224" : "#090B0E";
  const images = agents.map((svg, index) =>
    `<image x="${padding + index * (key + gap)}" y="${padding}" width="${key}" height="${key}" href="data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}"/>`
  ).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" rx="24" fill="${background}"/>${images}</svg>`;
}

const directory = resolve("docs/assets");
await mkdir(directory, { recursive: true });
await Promise.all([
  writeFile(resolve(directory, "agent-status-preview.svg"), renderPreview("light"), "utf8"),
  writeFile(resolve(directory, "agent-status-preview-dark.svg"), renderPreview("dark"), "utf8")
]);
