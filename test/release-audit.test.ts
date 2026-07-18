import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const auditScript = fileURLToPath(new URL("../scripts/audit-release.mjs", import.meta.url));

test("release audit accepts explicit clean roots and rejects private state", async () => {
  const root = await mkdtemp(join(tmpdir(), "codex-deck-audit-"));
  try {
    const clean = join(root, "clean");
    await mkdir(clean);
    await writeFile(join(clean, "README.txt"), "public release fixture\n", "utf8");
    const cleanResult = spawnSync(process.execPath, [auditScript, clean], { encoding: "utf8" });
    assert.equal(cleanResult.status, 0, cleanResult.stderr);
    assert.match(cleanResult.stdout, /passed for 1 artifact roots/);

    await writeFile(join(clean, "relay-client.json"), "{}\n", "utf8");
    const privateResult = spawnSync(process.execPath, [auditScript, clean], { encoding: "utf8" });
    assert.equal(privateResult.status, 1);
    assert.match(privateResult.stderr, /private runtime state must not be packaged/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
