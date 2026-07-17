import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { renderAgentSvg } from "../src/render.js";

const agents = [
  renderAgentSvg(0, "Ready Task", "idle", true, 3),
  renderAgentSvg(1, "Building UI", "thinking", false, 4),
  renderAgentSvg(2, "Needs Review", "input", false, 3),
  renderAgentSvg(3, "Release Ready", "complete", false, 3),
  renderAgentSvg(4, "Test Failed", "error", false, 3),
  renderAgentSvg(5, "Not assigned", "empty", false, 3)
];

const key = 144;
const gap = 14;
const padding = 24;
const width = padding * 2 + agents.length * key + (agents.length - 1) * gap;
const height = padding * 2 + key;
const images = agents.map((svg, index) =>
  `<image x="${padding + index * (key + gap)}" y="${padding}" width="${key}" height="${key}" href="data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}"/>`
).join("");
const preview = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" rx="24" fill="#090B0E"/>${images}</svg>`;

const directory = resolve("docs/assets");
await mkdir(directory, { recursive: true });
await writeFile(resolve(directory, "agent-status-preview.svg"), preview, "utf8");
