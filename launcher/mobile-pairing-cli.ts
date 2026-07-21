import { configureLocalMobilePairing } from "../src/mobile-local-pairing.js";

const stateRootIndex = process.argv.indexOf("--state-root");
const portIndex = process.argv.indexOf("--port");
if (stateRootIndex < 0 || !process.argv[stateRootIndex + 1]) {
  throw new Error("Usage: mobile-pairing.mjs --state-root <path> [--port <1024-65535>] [--rotate]");
}
const port = portIndex >= 0 ? Number.parseInt(process.argv[portIndex + 1] ?? "", 10) : undefined;
const result = await configureLocalMobilePairing({
  stateRoot: process.argv[stateRootIndex + 1]!,
  ...(port == null ? {} : { port }),
  rotate: process.argv.includes("--rotate")
});
process.stdout.write(`${JSON.stringify(result)}\n`);
