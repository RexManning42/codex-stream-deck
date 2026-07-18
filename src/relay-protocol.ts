import { OFFICIAL_KEYCAP_IDS, type OfficialKeycapId } from "./keycaps.js";
import type {
  CodexHost, HostSessionPresence, MicroActionSlot, MicroDirection, MicroSnapshot, ReasoningAdjustment, RoutedAgentSlot
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
export type RelayHealthMessage = {
  type: "health";
  protocol: 1;
  host: CodexHost;
  state: "degraded";
  reason: "native-signals-unavailable";
  observedAt: number;
};
export type RelayCommandMessage = { type: "command"; protocol: 1; requestId: string; command: RelayCommand };
export type RelayResultMessage = { type: "result"; protocol: 1; requestId: string; ok: boolean; error?: string };
export type RelayServerMessage = RelayReadyMessage | RelaySnapshotMessage | RelayHealthMessage | RelayResultMessage;

export type HostSnapshot = { host: CodexHost; snapshot: MicroSnapshot; observedAt: number };

type ActivityRecord = { activityAt: number; signature: string; lastSeenAt: number };
type SessionOwner = { input: HostSnapshot; session: HostSessionPresence };

export class HostActivityIndex {
  private readonly activity = new Map<string, ActivityRecord>();

  merge(inputs: HostSnapshot[], now = Date.now(), authoritativeHostId?: string): RoutedAgentSlot[] {
    const routed: RoutedAgentSlot[] = [];
    for (const input of inputs) {
      for (const slot of input.snapshot.slots) {
        if (!slot.threadKey) continue;
        const key = `${input.host.hostId}:${threadIdentity(slot.threadKey)}`;
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
    if (inputs.length === 0) return [];
    if (inputs.length === 1) return nativeSlotOrder(inputs[0]!, routed);

    const mirrors = new Map<string, RoutedAgentSlot[]>();
    for (const slot of routed) {
      const identity = threadIdentity(slot.threadKey!);
      const candidates = mirrors.get(identity) ?? [];
      candidates.push(slot);
      mirrors.set(identity, candidates);
    }
    const sessionOwners = sessionOwnerIndex(inputs);
    const merged = [...mirrors.entries()].map(([identity, candidates]) => mergeMirrors(candidates, sessionOwners.get(identity)));
    const byThread = new Map(merged.map((slot) => [threadIdentity(slot.threadKey!), slot]));
    const authority = inputs.find((input) => input.host.hostId === authoritativeHostId) ?? inputs[0]!;

    if (authority.snapshot.agentSource === "pinned") return pinnedSlotOrder(authority, inputs, byThread);
    if (authority.snapshot.agentSource === "custom") return customSlotOrder(authority, inputs, byThread);
    return merged
      .sort(authority.snapshot.agentSource === "priority" ? comparePriority : compareActivity)
      .slice(0, 6)
      .map((slot, id) => ({ ...slot, id }));
  }
}

function nativeSlotOrder(input: HostSnapshot, routed: RoutedAgentSlot[]): RoutedAgentSlot[] {
  const bySourceSlot = new Map(
    routed.filter((candidate) => candidate.host.hostId === input.host.hostId)
      .map((candidate) => [candidate.sourceSlot, candidate])
  );
  return input.snapshot.slots.map((slot, id) => {
    const candidate = bySourceSlot.get(slot.id);
    return candidate ? { ...candidate, id } : emptyRoutedSlot(input, slot, id);
  });
}

function pinnedSlotOrder(
  authority: HostSnapshot,
  inputs: HostSnapshot[],
  byThread: Map<string, RoutedAgentSlot>
): RoutedAgentSlot[] {
  const sources = [
    authority,
    ...inputs.filter((input) => input.host.hostId !== authority.host.hostId && input.snapshot.agentSource === "pinned")
  ];
  const result: RoutedAgentSlot[] = [];
  const used = new Set<string>();
  for (let sourceSlot = 0; sourceSlot < 6 && result.length < 6; sourceSlot += 1) {
    for (const source of sources) {
      const slot = source.snapshot.slots[sourceSlot];
      if (!slot?.threadKey) continue;
      const identity = threadIdentity(slot.threadKey);
      if (used.has(identity)) continue;
      used.add(identity);
      const routed = byThread.get(identity);
      if (routed) result.push({ ...routed, id: result.length });
      if (result.length === 6) break;
    }
  }
  while (result.length < 6) result.push(emptyRoutedPosition(authority, result.length));
  return result;
}

function customSlotOrder(
  authority: HostSnapshot,
  inputs: HostSnapshot[],
  byThread: Map<string, RoutedAgentSlot>
): RoutedAgentSlot[] {
  const remoteSources = inputs.filter((input) =>
    input.host.hostId !== authority.host.hostId && input.snapshot.agentSource === "custom"
  );
  const used = new Set<string>();
  return authority.snapshot.slots.map((localSlot, id) => {
    const candidates = [
      { source: authority, slot: localSlot },
      ...remoteSources.map((source) => ({ source, slot: source.snapshot.slots[id]! }))
    ];
    for (const candidate of candidates) {
      if (!candidate.slot?.threadKey) continue;
      const identity = threadIdentity(candidate.slot.threadKey);
      if (used.has(identity)) continue;
      used.add(identity);
      const routed = byThread.get(identity);
      return routed ? { ...routed, id } : emptyRoutedSlot(candidate.source, candidate.slot, id);
    }
    return emptyRoutedPosition(authority, id);
  });
}

function emptyRoutedSlot(input: HostSnapshot, slot: MicroSnapshot["slots"][number], id: number): RoutedAgentSlot {
  return { ...slot, id, host: input.host, sourceSlot: slot.id, observedAt: input.observedAt };
}

function emptyRoutedPosition(input: HostSnapshot, id: number): RoutedAgentSlot {
  return {
    id, threadKey: null, title: null, status: "off", selected: false,
    host: input.host, sourceSlot: id, observedAt: input.observedAt
  };
}

export function parseRelayServerMessage(value: unknown): RelayServerMessage | null {
  if (!isRecord(value) || value.protocol !== RELAY_PROTOCOL_VERSION || typeof value.type !== "string") return null;
  if (value.type === "ready" && isHost(value.host)) return value as RelayReadyMessage;
  if (value.type === "snapshot" && isHost(value.host) && Number.isFinite(value.observedAt) && isSnapshot(value.snapshot)) {
    return value as RelaySnapshotMessage;
  }
  if (value.type === "health" && isHost(value.host) && value.state === "degraded" &&
      value.reason === "native-signals-unavailable" && Number.isFinite(value.observedAt)) {
    return value as RelayHealthMessage;
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
  if (!value.slots.every((slot, index) => isRecord(slot) && slot.id === index && typeof slot.status === "string")) return false;
  if (value.hostSessions == null) return true;
  return Array.isArray(value.hostSessions) && value.hostSessions.length <= 128 && value.hostSessions.every((session) =>
    isRecord(session) && isThreadKey(session.threadId) && validTimestamp(session.activityAt) != null &&
    ["idle", "working", "complete"].includes(String(session.status))
  );
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

function mergeMirrors(candidates: RoutedAgentSlot[], sessionOwner?: SessionOwner): RoutedAgentSlot {
  let owner = candidates[0]!;
  const explicitOwner = sessionOwner && candidates.find((candidate) => candidate.host.hostId === sessionOwner.input.host.hostId);
  if (explicitOwner) owner = explicitOwner;
  else {
    for (const candidate of candidates.slice(1)) {
      if (compareOwnership(candidate, owner) < 0) owner = candidate;
    }
  }
  const strongest = [...candidates].sort((left, right) =>
    mirrorStatusPriority(right.status) - mirrorStatusPriority(left.status) ||
    Number(right.selected) - Number(left.selected)
  )[0]!;
  const ownedCandidates = candidates.filter((candidate) => candidate.ownedByHost === true);
  const recencyCandidates = ownedCandidates.length ? ownedCandidates : candidates;
  const sessionStatus = sessionOwner?.session.status;
  const status = sessionStatus && sessionStatus !== "idle" && !["approval", "awaiting-approval", "awaiting-response", "unread", "error"].includes(strongest.status)
    ? sessionStatus
    : strongest.status;
  const routedOwner = sessionOwner?.input.host ?? owner.host;
  return {
    ...owner,
    host: routedOwner,
    ownedByHost: sessionOwner ? true : owner.ownedByHost,
    status,
    selected: candidates.some((candidate) => candidate.selected),
    // A delayed status update in a cloud/SSH mirror must not make the task look
    // newly active or cause two simultaneously working keys to swap places.
    // Status and selection remain aggregated, but recency follows the backing
    // rollout owner whenever ownership is known.
    activityAt: Math.max(sessionOwner?.session.activityAt ?? 0, ...recencyCandidates.map((candidate) => candidate.activityAt ?? 0)),
    observedAt: Math.max(...candidates.map((candidate) => candidate.observedAt))
  };
}

function sessionOwnerIndex(inputs: HostSnapshot[]): Map<string, SessionOwner> {
  const owners = new Map<string, SessionOwner>();
  for (const input of inputs) {
    for (const session of input.snapshot.hostSessions ?? []) {
      const identity = threadIdentity(session.threadId);
      const prior = owners.get(identity);
      if (!prior || session.activityAt > prior.session.activityAt) owners.set(identity, { input, session });
    }
  }
  return owners;
}

function compareActivity(left: RoutedAgentSlot, right: RoutedAgentSlot): number {
  if (left.selected !== right.selected) return left.selected ? -1 : 1;
  const status = hostStatusPriority(right.status) - hostStatusPriority(left.status);
  if (status) return status;
  return (right.activityAt ?? 0) - (left.activityAt ?? 0) || left.sourceSlot - right.sourceSlot;
}

function comparePriority(left: RoutedAgentSlot, right: RoutedAgentSlot): number {
  return priorityModeStatus(right.status) - priorityModeStatus(left.status) ||
    Number(right.selected) - Number(left.selected) ||
    (right.activityAt ?? 0) - (left.activityAt ?? 0) ||
    left.sourceSlot - right.sourceSlot;
}

function priorityModeStatus(status: string): number {
  if (["approval", "awaiting-approval", "awaiting-response"].includes(status)) return 4;
  if (["unread", "error", "complete", "completed", "done"].includes(status)) return 3;
  if (["working", "thinking"].includes(status)) return 2;
  if (status === "idle") return 1;
  return 0;
}

function hostStatusPriority(status: string): number {
  if (["working", "thinking", "approval", "awaiting-approval", "awaiting-response"].includes(status)) return 3;
  if (["unread", "error", "complete", "completed", "done"].includes(status)) return 2;
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
  return typeof value === "string" && /^(?:[a-z][a-z0-9_-]{0,31}:){0,3}[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function threadIdentity(value: string): string {
  return value.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)?.[0]?.toLowerCase() ?? value;
}
