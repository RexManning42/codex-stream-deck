import { open, readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { HostSessionPresence, MicroSnapshot } from "./types.js";

const SESSION_FILENAME = /-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl$/i;
const THREAD_KEY = /(?:^|:)([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

export class CodexSessionOwnershipIndex {
  private sessionIds = new Set<string>();
  private recentSessions: HostSessionPresence[] = [];
  private acknowledgedCompletions = new Map<string, number>();
  private activeSessions = new Set<string>();
  private refreshedAt = 0;
  private refreshInFlight?: Promise<void>;

  constructor(
    private readonly roots = defaultSessionRoots(),
    private readonly refreshIntervalMs = 5_000
  ) {}

  async annotate(snapshot: MicroSnapshot, now = Date.now()): Promise<MicroSnapshot> {
    await this.refreshIfNeeded(now);
    const selectedSessions = new Set(snapshot.slots
      .filter((slot) => slot.selected)
      .map((slot) => sessionIdFromThreadKey(slot.threadKey))
      .filter((sessionId): sessionId is string => sessionId != null));
    const activeSessionId = sessionIdFromThreadKey(snapshot.activeThreadKey ?? null);
    if (activeSessionId) selectedSessions.add(activeSessionId);
    for (const session of this.recentSessions) {
      if (session.status === "complete" && session.completionRevision != null && selectedSessions.has(session.threadId) &&
        !this.activeSessions.has(session.threadId)) {
        this.acknowledgedCompletions.set(session.threadId, session.completionRevision);
      }
    }
    this.activeSessions = selectedSessions;
    return {
      ...snapshot,
      hostSessions: this.recentSessions.map((session) => ({
        ...session,
        status: session.status === "complete" && session.completionRevision != null &&
          this.acknowledgedCompletions.get(session.threadId) === session.completionRevision ? "idle" : session.status
      })),
      slots: snapshot.slots.map((slot) => {
        const sessionId = sessionIdFromThreadKey(slot.threadKey);
        return { ...slot, ownedByHost: sessionId != null && this.sessionIds.has(sessionId) };
      })
    };
  }

  markOpened(threadKey: string, _now = Date.now()): void {
    const sessionId = sessionIdFromThreadKey(threadKey);
    if (!sessionId) return;
    const session = this.recentSessions.find((candidate) => candidate.threadId === sessionId);
    if (session?.status === "complete" && session.completionRevision != null) {
      this.acknowledgedCompletions.set(sessionId, session.completionRevision);
    }
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
    const sessionFiles: Array<{ threadId: string; path: string }> = [];
    const files: Array<{ threadId: string; path: string; activityAt: number }> = [];
    for (const root of this.roots) {
      try {
        const entries = await readdir(root, { recursive: true, withFileTypes: true });
        for (const entry of entries) {
          if (!entry.isFile()) continue;
          const sessionId = sessionIdFromRolloutFilename(entry.name);
          if (!sessionId) continue;
          next.add(sessionId);
          const parentPath = (entry as typeof entry & { parentPath?: string; path?: string }).parentPath
            ?? (entry as typeof entry & { path?: string }).path;
          if (!parentPath) continue;
          sessionFiles.push({ threadId: sessionId, path: join(parentPath, entry.name) });
        }
      }
      catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code !== "ENOENT") throw error;
      }
    }
    for (let index = 0; index < sessionFiles.length; index += 32) {
      const batch = sessionFiles.slice(index, index + 32);
      const resolved = await Promise.all(batch.map(async ({ threadId, path }) => {
        try {
          const info = await stat(path);
          return { threadId, path, activityAt: info.mtimeMs };
        } catch { return null; }
      }));
      files.push(...resolved.filter((value): value is NonNullable<typeof value> => value != null));
    }
    this.sessionIds = next;
    const uniqueRecent = new Map<string, typeof files[number]>();
    for (const file of files.sort((left, right) => right.activityAt - left.activityAt)) {
      if (!uniqueRecent.has(file.threadId)) uniqueRecent.set(file.threadId, file);
    }
    const recent = [...uniqueRecent.values()].slice(0, 128);
    this.recentSessions = await Promise.all(recent.map(async ({ threadId, path, activityAt }) => {
      const recentStatus = now - activityAt <= 15 * 60_000
        ? await readRecentSessionStatus(path)
        : { status: "idle" as const };
      return { threadId, activityAt, ...recentStatus };
    }));
    const currentIds = new Set(this.recentSessions.map((session) => session.threadId));
    for (const threadId of this.acknowledgedCompletions.keys()) {
      if (!currentIds.has(threadId)) this.acknowledgedCompletions.delete(threadId);
    }
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

async function readRecentSessionStatus(path: string): Promise<Pick<HostSessionPresence, "status" | "completionRevision">> {
  try {
    const handle = await open(path, "r");
    try {
      const info = await handle.stat();
      const length = Math.min(info.size, 512 * 1024);
      const buffer = Buffer.alloc(length);
      await handle.read(buffer, 0, length, Math.max(0, info.size - length));
      const tail = buffer.toString("utf8");
      const completedAt = tail.lastIndexOf('"type":"task_complete"');
      const activeAt = Math.max(
        tail.lastIndexOf('"type":"agent_reasoning"'),
        tail.lastIndexOf('"type":"function_call"'),
        tail.lastIndexOf('"type":"turn_context"')
      );
      if (activeAt > completedAt) return { status: "working" };
      if (completedAt >= 0) return { status: "complete", completionRevision: info.size - length + completedAt };
      return { status: "idle" };
    } finally {
      await handle.close();
    }
  } catch {
    return { status: "idle" };
  }
}
