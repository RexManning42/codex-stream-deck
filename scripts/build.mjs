import { build } from "esbuild";
import { cp, mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import "./generate-plugin-icons.mjs";

const output = resolve("dist/com.simeo.codex-deck.sdPlugin");
await rm(resolve(output, "bin"), { recursive: true, force: true });
await rm(resolve(output, "static"), { recursive: true, force: true });
await mkdir(resolve(output, "bin"), { recursive: true });
await mkdir(resolve(output, "static/imgs"), { recursive: true });
for (const filename of [
  "category-icon.svg", "category-icon@2x.svg",
  "key.svg", "key@2x.svg",
  "plugin-icon.png", "plugin-icon@2x.png"
]) {
  await cp(resolve("static/imgs", filename), resolve(output, "static/imgs", filename));
}
await cp(resolve("static/manifest.json"), resolve(output, "manifest.json"));

await build({
  entryPoints: [resolve("src/plugin.ts")],
  outfile: resolve(output, "bin/plugin.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  sourcemap: true,
  banner: { js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);" }
});
