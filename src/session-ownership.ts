import { readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { MicroSnapshot } from "./types.js";

const SESSION_FILENAME = /-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl$/i;
const THREAD_KEY = /(?:^|:)([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

export class CodexSessionOwnershipIndex {
  private sessionIds = new Set<string>();
  private refreshedAt = 0;
  private refreshInFlight?: Promise<void>;

  constructor(
    private readonly roots = defaultSessionRoots(),
    private readonly refreshIntervalMs = 5_000
  ) {}

  async annotate(snapshot: MicroSnapshot, now = Date.now()): Promise<MicroSnapshot> {
    await this.refreshIfNeeded(now);
    return {
      ...snapshot,
      slots: snapshot.slots.map((slot) => {
        const sessionId = sessionIdFromThreadKey(slot.threadKey);
        return { ...slot, ownedByHost: sessionId != null && this.sessionIds.has(sessionId) };
      })
    };
  }

  private async refreshIfNeeded(now: number): Promise<void> {
    if (now - this.refreshedAt < this.refreshIntervalMs) return;
    if (this.refreshInFlight) return this.refreshInFlight;
    const pending = this.refresh(now);
    this.refreshInFlight = pending;
    try { await pending; }
    finally { if (this.refreshInFlight === pending) this.refreshInFlight = undefined; }
  }

  private async refresh(now: number): Promise<void> {
    const next = new Set<string>();
    for (const root of this.roots) {
      try {
        const entries = await readdir(root, { recursive: true, withFileTypes: true });
        for (const entry of entries) {
          if (!entry.isFile()) continue;
          const sessionId = sessionIdFromRolloutFilename(entry.name);
          if (sessionId) next.add(sessionId);
        }
      }
      catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code !== "ENOENT") throw error;
      }
    }
    this.sessionIds = next;
    this.refreshedAt = now;
  }
}

export function sessionIdFromRolloutFilename(filename: string): string | null {
  return filename.match(SESSION_FILENAME)?.[1]?.toLowerCase() ?? null;
}

export function sessionIdFromThreadKey(threadKey: string | null): string | null {
  return threadKey?.match(THREAD_KEY)?.[1]?.toLowerCase() ?? null;
}

function defaultSessionRoots(): string[] {
  const codexHome = process.env.CODEX_HOME || join(homedir(), ".codex");
  return [join(codexHome, "sessions"), join(codexHome, "archived_sessions")];
}
