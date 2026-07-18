import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { CodexSessionOwnershipIndex, sessionIdFromRolloutFilename, sessionIdFromThreadKey } from "../src/session-ownership.js";
import type { MicroSnapshot } from "../src/types.js";

const owned = "019f7336-04a2-72f1-af41-2f216ccdc3d0";
const mirrored = "019f6de7-44c2-7fe2-9d17-9322c952e626";

test("session ownership is derived from exact rollout filenames, not message references", async () => {
  const root = await mkdtemp(join(tmpdir(), "codex-deck-ownership-"));
  try {
    const dated = join(root, "2026", "07", "18");
    await mkdir(dated, { recursive: true });
    await writeFile(join(dated, `rollout-2026-07-18T00-00-00-${owned}.jsonl`), "{}\n");
    await writeFile(join(dated, "rollout-containing-another-thread-reference.jsonl"), mirrored);
    const index = new CodexSessionOwnershipIndex([root], 60_000);
    const annotated = await index.annotate(snapshot());
    assert.equal(annotated.slots[0]!.ownedByHost, true);
    assert.equal(annotated.slots[1]!.ownedByHost, false);
  }
  finally { await rm(root, { recursive: true, force: true }); }
});

test("rollout and prefixed thread identities use the same UUID", () => {
  assert.equal(sessionIdFromRolloutFilename(`rollout-time-${owned}.jsonl`), owned);
  assert.equal(sessionIdFromThreadKey(`local:${owned}`), owned);
  assert.equal(sessionIdFromThreadKey("local:../../secret"), null);
});

function snapshot(): MicroSnapshot {
  return {
    slots: Array.from({ length: 6 }, (_, id) => ({
      id,
      threadKey: `local:${id === 0 ? owned : id === 1 ? mirrored : `00000000-0000-4000-8000-00000000000${id}`}`,
      title: `Task ${id + 1}`,
      status: "idle",
      selected: false
    })),
    layout: {
      version: 1,
      slots: {
        ACT06: { keycapId: "FAST" }, ACT07: { keycapId: "APPR" }, ACT08: { keycapId: "REJ" },
        ACT09: { keycapId: "SPLIT" }, ACT10_ACT11: { keycapId: "CODEX" }, ACT12: { keycapId: "CODEX" }
      },
      analogStick: { up: {}, right: {}, down: {}, left: {} }
    },
    agentSource: "recent",
    lightingAutoOff: "3-minutes",
    theme: "dark"
  };
}
