import { OFFICIAL_KEYCAP_IDS, type OfficialKeycapId } from "./keycaps.js";
import type {
  CodexHost, MicroActionSlot, MicroDirection, MicroSnapshot, ReasoningAdjustment, RoutedAgentSlot
} from "./types.js";

export const RELAY_PROTOCOL_VERSION = 1;

export type RelayCommand =
  | { kind: "agent"; slot: number; threadKey: string; act: 0 | 1 }
  | { kind: "action"; slot: MicroActionSlot; act: 0 | 1 }
  | { kind: "joystick"; direction: MicroDirection; distance: 0 | 1 }
  | { kind: "encoder"; act: 0 | 1 }
  | { kind: "reasoning"; direction: ReasoningAdjustment }
  | { kind: "keycap"; keycapId: OfficialKeycapId };

export type RelayAuthMessage = { type: "auth"; protocol: 1; token: string };
export type RelayReadyMessage = { type: "ready"; protocol: 1; host: CodexHost };
export type RelaySnapshotMessage = {
  type: "snapshot";
  protocol: 1;
  host: CodexHost;
  observedAt: number;
  snapshot: MicroSnapshot;
};
export type RelayCommandMessage = { type: "command"; protocol: 1; requestId: string; command: RelayCommand };
export type RelayResultMessage = { type: "result"; protocol: 1; requestId: string; ok: boolean; error?: string };
export type RelayServerMessage = RelayReadyMessage | RelaySnapshotMessage | RelayResultMessage;

export type HostSnapshot = { host: CodexHost; snapshot: MicroSnapshot; observedAt: number };

type ActivityRecord = { activityAt: number; signature: string; lastSeenAt: number };

export class HostActivityIndex {
  private readonly activity = new Map<string, ActivityRecord>();

  merge(inputs: HostSnapshot[], now = Date.now()): RoutedAgentSlot[] {
    const routed: RoutedAgentSlot[] = [];
    for (const input of inputs) {
      for (const slot of input.snapshot.slots) {
        if (!slot.threadKey) continue;
        const key = `${input.host.hostId}:${slot.threadKey}`;
        const signature = `${slot.status}:${slot.selected}:${slot.title ?? ""}`;
        const prior = this.activity.get(key);
        const explicit = validTimestamp(slot.activityAt);
        const changed = prior != null && prior.signature !== signature;
        // A snapshot observation is not task activity. In particular, a newly
        // connected host must not make all six of its historical slots appear
        // newer than an already connected host. Only native timestamps or an
        // actually observed slot change establish cross-host recency.
        const activityAt = changed
          ? Math.max(explicit ?? 0, input.observedAt)
          : explicit ?? prior?.activityAt ?? 0;
        this.activity.set(key, { activityAt, signature, lastSeenAt: now });
        routed.push({ ...slot, activityAt, host: input.host, sourceSlot: slot.id, observedAt: input.observedAt });
      }
    }
    for (const [key, value] of this.activity) {
      if (now - value.lastSeenAt > 86_400_000) this.activity.delete(key);
    }
    const mirrors = new Map<string, RoutedAgentSlot[]>();
    for (const slot of routed) {
      const candidates = mirrors.get(slot.threadKey!) ?? [];
      candidates.push(slot);
      mirrors.set(slot.threadKey!, candidates);
    }
    return [...mirrors.values()].map(mergeMirrors)
      .sort(compareActivity)
      .slice(0, 6)
      .map((slot, id) => ({ ...slot, id }));
  }
}

export function parseRelayServerMessage(value: unknown): RelayServerMessage | null {
  if (!isRecord(value) || value.protocol !== RELAY_PROTOCOL_VERSION || typeof value.type !== "string") return null;
  if (value.type === "ready" && isHost(value.host)) return value as RelayReadyMessage;
  if (value.type === "snapshot" && isHost(value.host) && Number.isFinite(value.observedAt) && isSnapshot(value.snapshot)) {
    return value as RelaySnapshotMessage;
  }
  if (value.type === "result" && typeof value.requestId === "string" && typeof value.ok === "boolean") {
    return value as RelayResultMessage;
  }
  return null;
}

export function parseRelayCommand(value: unknown): RelayCommand | null {
  if (!isRecord(value) || typeof value.kind !== "string") return null;
  if (value.kind === "agent" && integerIn(value.slot, 0, 5) && isThreadKey(value.threadKey) && binary(value.act)) return value as RelayCommand;
  if (value.kind === "action" && ["ACT06", "ACT07", "ACT08", "ACT09", "ACT10_ACT11", "ACT12"].includes(String(value.slot)) && binary(value.act)) return value as RelayCommand;
  if (value.kind === "joystick" && ["up", "right", "down", "left"].includes(String(value.direction)) && binary(value.distance)) return value as RelayCommand;
  if (value.kind === "encoder" && binary(value.act)) return value as RelayCommand;
  if (value.kind === "reasoning" && ["decrease", "increase"].includes(String(value.direction))) return value as RelayCommand;
  if (value.kind === "keycap" && typeof value.keycapId === "string" && OFFICIAL_KEYCAP_IDS.includes(value.keycapId as OfficialKeycapId)) return value as RelayCommand;
  return null;
}

function isSnapshot(value: unknown): value is MicroSnapshot {
  if (!isRecord(value) || !Array.isArray(value.slots) || value.slots.length !== 6 || !isRecord(value.layout)) return false;
  return value.slots.every((slot, index) => isRecord(slot) && slot.id === index && typeof slot.status === "string");
}

function isHost(value: unknown): value is CodexHost {
  return isRecord(value) && typeof value.hostId === "string" && typeof value.hostName === "string" && ["win32", "darwin"].includes(String(value.platform));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function binary(value: unknown): value is 0 | 1 { return value === 0 || value === 1; }
function integerIn(value: unknown, minimum: number, maximum: number): value is number {
  return Number.isInteger(value) && Number(value) >= minimum && Number(value) <= maximum;
}
function validTimestamp(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function compareOwnership(left: RoutedAgentSlot, right: RoutedAgentSlot): number {
  const ownership = Number(right.ownedByHost === true) - Number(left.ownedByHost === true);
  if (ownership) return ownership;
  const status = hostStatusPriority(right.status) - hostStatusPriority(left.status);
  if (status) return status;
  if (left.selected !== right.selected) return left.selected ? -1 : 1;
  return compareActivity(left, right);
}

function mergeMirrors(candidates: RoutedAgentSlot[]): RoutedAgentSlot {
  let owner = candidates[0]!;
  for (const candidate of candidates.slice(1)) {
    if (compareOwnership(candidate, owner) < 0) owner = candidate;
  }
  const strongest = [...candidates].sort((left, right) =>
    mirrorStatusPriority(right.status) - mirrorStatusPriority(left.status) ||
    Number(right.selected) - Number(left.selected)
  )[0]!;
  const ownedCandidates = candidates.filter((candidate) => candidate.ownedByHost === true);
  const recencyCandidates = ownedCandidates.length ? ownedCandidates : candidates;
  return {
    ...owner,
    status: strongest.status,
    selected: candidates.some((candidate) => candidate.selected),
    // A delayed status update in a cloud/SSH mirror must not make the task look
    // newly active or cause two simultaneously working keys to swap places.
    // Status and selection remain aggregated, but recency follows the backing
    // rollout owner whenever ownership is known.
    activityAt: Math.max(...recencyCandidates.map((candidate) => candidate.activityAt ?? 0)),
    observedAt: Math.max(...candidates.map((candidate) => candidate.observedAt))
  };
}

function compareActivity(left: RoutedAgentSlot, right: RoutedAgentSlot): number {
  if (left.selected !== right.selected) return left.selected ? -1 : 1;
  const status = hostStatusPriority(right.status) - hostStatusPriority(left.status);
  if (status) return status;
  return (right.activityAt ?? 0) - (left.activityAt ?? 0) || left.sourceSlot - right.sourceSlot;
}

function hostStatusPriority(status: string): number {
  if (["working", "thinking", "approval", "awaiting-approval", "awaiting-response"].includes(status)) return 3;
  if (["unread", "error"].includes(status)) return 2;
  if (status === "idle") return 1;
  return 0;
}

function mirrorStatusPriority(status: string): number {
  if (["working", "thinking", "approval", "awaiting-approval", "awaiting-response"].includes(status)) return 4;
  if (["unread", "error"].includes(status)) return 3;
  if (["complete", "completed", "done"].includes(status)) return 2;
  if (status === "idle") return 1;
  return 0;
}
function isThreadKey(value: unknown): value is string {
  return typeof value === "string" && /^(?:[a-z][a-z0-9_-]{0,31}:)?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
