import { build } from "esbuild";
import { cp, mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";

const output = resolve("release/codex-deck-launcher");
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

await build({
  entryPoints: [resolve("launcher/runtime-override.ts")],
  outfile: resolve(output, "runtime-override.mjs"),
  bundle: false,
  platform: "node",
  format: "esm",
  target: "node20",
  minify: false
});

await cp(resolve("node_modules/ws"), resolve(output, "node_modules/ws"), { recursive: true });

for (const filename of ["Start Codex Deck.cmd", "Start-CodexDeck.ps1", "README.txt"]) {
  await cp(resolve("launcher", filename), resolve(output, filename));
}
