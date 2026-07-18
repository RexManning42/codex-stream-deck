import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { hostname } from "node:os";
import { dirname, join } from "node:path";
import { codexDeckStateRoot } from "./codex-deck-paths.js";
import type { CodexHost } from "./types.js";

const HOST_FILE = join(codexDeckStateRoot(), "host.json");

export async function getOrCreateHostIdentity(path = HOST_FILE): Promise<CodexHost> {
  const existing = await readHostIdentity(path);
  const platform = process.platform === "darwin" ? "darwin" : "win32";
  const value: CodexHost = {
    hostId: existing?.hostId ?? randomUUID(),
    hostName: existing?.hostName || hostname(),
    platform
  };
  if (!existing || existing.hostName !== value.hostName || existing.platform !== value.platform) {
    await mkdir(dirname(path), { recursive: true });
    const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    await rename(temporary, path);
  }
  return value;
}

export async function readHostIdentity(path = HOST_FILE): Promise<CodexHost | null> {
  try {
    const value = JSON.parse(await readFile(path, "utf8")) as Partial<CodexHost>;
    if (!isUuid(value.hostId) || typeof value.hostName !== "string" || !value.hostName.trim()) return null;
    const platform = value.platform === "darwin" ? "darwin" : "win32";
    return { hostId: value.hostId, hostName: value.hostName.trim(), platform };
  } catch { return null; }
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
