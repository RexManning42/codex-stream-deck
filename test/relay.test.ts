import assert from "node:assert/strict";
import { createServer } from "node:net";
import test from "node:test";
import WebSocket from "ws";
import { isAllowedRelayHost } from "../src/relay-network.js";
import { CodexRelayServer, validateRelayServerConfig } from "../src/codex-relay-server.js";
import { HostActivityIndex, RELAY_PROTOCOL_VERSION, parseRelayCommand } from "../src/relay-protocol.js";
import type { CodexHost, MicroSnapshot } from "../src/types.js";

const host: CodexHost = { hostId: "56fd97ad-7073-42cc-85ce-befa17546d7c", hostName: "Test Mac", platform: "darwin" };
const snapshot: MicroSnapshot = {
  slots: Array.from({ length: 6 }, (_, id) => ({
    id, threadKey: `00000000-0000-4000-8000-00000000000${id}`, title: `Task ${id + 1}`,
    status: id === 0 ? "working" : "idle", selected: id === 0, activityAt: 1_000 - id
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

test("relay refuses wildcard exposure and short authentication tokens", () => {
  assert.throws(() => validateRelayServerConfig({ enabled: true, listenHost: "0.0.0.0", port: 47_651, token: "x".repeat(32) }), /loopback or a specific Tailscale address/);
  assert.throws(() => validateRelayServerConfig({ enabled: true, listenHost: "203.0.113.10", port: 47_651, token: "x".repeat(32) }), /loopback or a specific Tailscale/);
  assert.throws(() => validateRelayServerConfig({ enabled: true, listenHost: "127.0.0.1", port: 47_651, token: "short" }), /32 bytes/);
  assert.equal(isAllowedRelayHost("100.64.0.42"), true);
  assert.equal(isAllowedRelayHost("example.tailnet.ts.net"), true);
  assert.equal(isAllowedRelayHost("8.8.8.8"), false);
});

test("relay command parser permits only the narrow native command surface", () => {
  const threadKey = "00000000-0000-4000-8000-000000000005";
  assert.deepEqual(parseRelayCommand({ kind: "agent", slot: 5, threadKey, act: 1 }), { kind: "agent", slot: 5, threadKey, act: 1 });
  assert.deepEqual(parseRelayCommand({ kind: "reasoning", direction: "increase" }), { kind: "reasoning", direction: "increase" });
  assert.equal(parseRelayCommand({ kind: "agent", slot: 6, threadKey, act: 1 }), null);
  assert.equal(parseRelayCommand({ kind: "evaluate", expression: "process.exit()" }), null);
  assert.equal(parseRelayCommand({ kind: "keycap", keycapId: "NOT_REAL" }), null);
  assert.notEqual(parseRelayCommand({ kind: "agent", slot: 1, threadKey: "local:019f6de7-44c2-7fe2-9d17-9322c952e626", act: 1 }), null);
  assert.notEqual(parseRelayCommand({ kind: "agent", slot: 0, threadKey: "client-new-thread:e3c18619-71ff-4a8d-8dd3-d475e9bcf162", act: 1 }), null);
  assert.notEqual(parseRelayCommand({ kind: "agent", slot: 0, threadKey: "local:client-new-thread:e3c18619-71ff-4a8d-8dd3-d475e9bcf162", act: 1 }), null);
  assert.equal(parseRelayCommand({ kind: "agent", slot: 1, threadKey: "local:../../secret", act: 1 }), null);
});

test("relay snapshot parser bounds and validates host session catalogs", async () => {
  const { parseRelayServerMessage } = await import("../src/relay-protocol.js");
  const valid = { type: "snapshot", protocol: 1, host, observedAt: 1, snapshot: structuredClone(snapshot) };
  valid.snapshot.hostSessions = [{ threadId: "00000000-0000-4000-8000-000000000000", activityAt: 1, status: "working" }];
  assert.notEqual(parseRelayServerMessage(valid), null);
  const invalid = structuredClone(valid) as typeof valid & { snapshot: { hostSessions: unknown[] } };
  invalid.snapshot.hostSessions = Array.from({ length: 129 }, () => valid.snapshot.hostSessions![0]!);
  assert.equal(parseRelayServerMessage(invalid), null);
});

test("host activity merge globally orders explicit Mac and Windows timestamps", () => {
  const windows: CodexHost = { hostId: "11111111-1111-4111-8111-111111111111", hostName: "Windows", platform: "win32" };
  const macSnapshot = structuredClone(snapshot);
  const windowsSnapshot = structuredClone(snapshot);
  for (const slot of windowsSnapshot.slots) slot.threadKey = `10000000-0000-4000-8000-00000000000${slot.id}`;
  for (const slot of [...macSnapshot.slots, ...windowsSnapshot.slots]) slot.activityAt = 1;
  macSnapshot.slots[0]!.activityAt = 100;
  windowsSnapshot.slots[0]!.activityAt = 200;
  const merged = new HostActivityIndex().merge([
    { host, snapshot: macSnapshot, observedAt: 1_000 },
    { host: windows, snapshot: windowsSnapshot, observedAt: 1_000 }
  ]);
  assert.equal(merged[0]!.host.platform, "win32");
  assert.equal(merged[0]!.sourceSlot, 0);
  assert.ok(merged.some((slot) => slot.host.platform === "darwin"));
});

test("a newly connected host cannot make unknown historical activity look recent", () => {
  const windows: CodexHost = { hostId: "11111111-1111-4111-8111-111111111111", hostName: "Windows", platform: "win32" };
  const macSnapshot = structuredClone(snapshot);
  const windowsSnapshot = structuredClone(snapshot);
  for (const slot of [...macSnapshot.slots, ...windowsSnapshot.slots]) {
    delete slot.activityAt;
    slot.status = "idle";
    slot.selected = false;
  }
  windowsSnapshot.slots[0]!.selected = true;
  windowsSnapshot.slots[0]!.status = "working";
  const merged = new HostActivityIndex().merge([
    { host: windows, snapshot: windowsSnapshot, observedAt: 1_000 },
    { host, snapshot: macSnapshot, observedAt: 9_000 }
  ]);
  assert.equal(merged[0]!.host.platform, "win32");
  assert.equal(merged[0]!.threadKey, windowsSnapshot.slots[0]!.threadKey);
  assert.equal(merged[0]!.activityAt, 0);
});

test("an idle cloud thread visible on both hosts keeps the first stable owner", () => {
  const windows: CodexHost = { hostId: "11111111-1111-4111-8111-111111111111", hostName: "Windows", platform: "win32" };
  const shared = "00000000-0000-4000-8000-000000000000";
  const macSnapshot = structuredClone(snapshot);
  const windowsSnapshot = structuredClone(snapshot);
  for (const candidate of [macSnapshot.slots[5]!, windowsSnapshot.slots[5]!]) {
    candidate.threadKey = shared;
    candidate.status = "idle";
    candidate.selected = false;
    delete candidate.activityAt;
  }
  const match = new HostActivityIndex().merge([
    { host: windows, snapshot: windowsSnapshot, observedAt: 1_000 },
    { host, snapshot: macSnapshot, observedAt: 9_000 }
  ]).find((slot) => slot.threadKey === shared);
  assert.equal(match?.host.platform, "win32");
});

test("backing rollout ownership beats a mirrored remote-SSH recent entry", () => {
  const windows: CodexHost = { hostId: "11111111-1111-4111-8111-111111111111", hostName: "Windows", platform: "win32" };
  const shared = "00000000-0000-4000-8000-000000000000";
  const macSnapshot = structuredClone(snapshot);
  const windowsSnapshot = structuredClone(snapshot);
  macSnapshot.slots[0] = { ...macSnapshot.slots[0]!, threadKey: shared, status: "idle", selected: false, ownedByHost: true };
  windowsSnapshot.slots[0] = { ...windowsSnapshot.slots[0]!, threadKey: shared, status: "working", selected: true, ownedByHost: false };
  const match = new HostActivityIndex().merge([
    { host: windows, snapshot: windowsSnapshot, observedAt: 2_000 },
    { host, snapshot: macSnapshot, observedAt: 1_000 }
  ]).find((slot) => slot.threadKey === shared);
  assert.equal(match?.host.platform, "darwin", "commands route to the host with the rollout");
  assert.equal(match?.status, "working", "the strongest mirrored live status remains visible");
  assert.equal(match?.selected, true, "selection is aggregated across both visible mirrors");
});

test("host session catalogs route a mirror even when the owning host has no native slot for it", () => {
  const windows: CodexHost = { hostId: "11111111-1111-4111-8111-111111111111", hostName: "Windows", platform: "win32" };
  const shared = "00000000-0000-4000-8000-000000000000";
  const macSnapshot = structuredClone(snapshot);
  const windowsSnapshot = structuredClone(snapshot);
  macSnapshot.slots[0] = { ...macSnapshot.slots[0]!, threadKey: "40000000-0000-4000-8000-000000000099", status: "idle" };
  windowsSnapshot.slots[0] = { ...windowsSnapshot.slots[0]!, threadKey: shared, title: "Mac-owned task", status: "idle", ownedByHost: false };
  macSnapshot.hostSessions = [{ threadId: shared, activityAt: 2_000, status: "working" }];
  const match = new HostActivityIndex().merge([
    { host: windows, snapshot: windowsSnapshot, observedAt: 2_000 },
    { host, snapshot: macSnapshot, observedAt: 2_000 }
  ], 2_000, windows.hostId).find((slot) => slot.threadKey === shared);
  assert.equal(match?.host.platform, "darwin");
  assert.equal(match?.status, "working");
  assert.equal(match?.title, "Mac-owned task");
});

test("host session catalogs return a Mac-only cloud mirror to its Windows owner", () => {
  const windows: CodexHost = { hostId: "11111111-1111-4111-8111-111111111111", hostName: "Windows", platform: "win32" };
  const shared = "00000000-0000-4000-8000-000000000000";
  const macSnapshot = structuredClone(snapshot);
  const windowsSnapshot = structuredClone(snapshot);
  macSnapshot.slots[0] = { ...macSnapshot.slots[0]!, threadKey: shared, status: "working", ownedByHost: false };
  windowsSnapshot.slots[0] = { ...windowsSnapshot.slots[0]!, threadKey: "40000000-0000-4000-8000-000000000099", status: "idle" };
  windowsSnapshot.hostSessions = [{ threadId: shared, activityAt: 2_000, status: "idle" }];
  const match = new HostActivityIndex().merge([
    { host: windows, snapshot: windowsSnapshot, observedAt: 2_000 },
    { host, snapshot: macSnapshot, observedAt: 2_000 }
  ], 2_000, windows.hostId).find((slot) => slot.threadKey === shared);
  assert.equal(match?.host.platform, "win32");
  assert.equal(match?.status, "working");
});

test("delayed mirror status does not reorder an owned active task", () => {
  const windows: CodexHost = { hostId: "11111111-1111-4111-8111-111111111111", hostName: "Windows", platform: "win32" };
  const shared = "00000000-0000-4000-8000-000000000000";
  const macSnapshot = structuredClone(snapshot);
  const windowsSnapshot = structuredClone(snapshot);
  for (const slot of [...macSnapshot.slots, ...windowsSnapshot.slots]) {
    slot.status = "idle";
    slot.selected = false;
    delete slot.activityAt;
  }
  macSnapshot.slots[0] = { ...macSnapshot.slots[0]!, threadKey: shared, ownedByHost: true };
  windowsSnapshot.slots[0] = { ...windowsSnapshot.slots[0]!, threadKey: shared, ownedByHost: false };
  const index = new HostActivityIndex();
  index.merge([
    { host, snapshot: macSnapshot, observedAt: 500 },
    { host: windows, snapshot: windowsSnapshot, observedAt: 500 }
  ]);

  macSnapshot.slots[0]!.status = "working";
  macSnapshot.slots[0]!.selected = true;
  let match = index.merge([
    { host, snapshot: macSnapshot, observedAt: 1_000 },
    { host: windows, snapshot: windowsSnapshot, observedAt: 1_000 }
  ]).find((slot) => slot.threadKey === shared);
  assert.equal(match?.activityAt, 1_000);

  windowsSnapshot.slots[0]!.status = "working";
  windowsSnapshot.slots[0]!.selected = true;
  match = index.merge([
    { host, snapshot: macSnapshot, observedAt: 2_000 },
    { host: windows, snapshot: windowsSnapshot, observedAt: 2_000 }
  ]).find((slot) => slot.threadKey === shared);
  assert.equal(match?.activityAt, 1_000, "the delayed non-owner mirror cannot refresh recency");
});

test("the same cloud thread is shown once and owned by its live active host", () => {
  const windows: CodexHost = { hostId: "11111111-1111-4111-8111-111111111111", hostName: "Windows", platform: "win32" };
  const macSnapshot = structuredClone(snapshot);
  const windowsSnapshot = structuredClone(snapshot);
  const shared = "00000000-0000-4000-8000-000000000000";
  macSnapshot.slots[0] = { ...macSnapshot.slots[0]!, threadKey: shared, status: "working", activityAt: 100 };
  windowsSnapshot.slots[0] = { ...windowsSnapshot.slots[0]!, threadKey: shared, status: "idle", activityAt: 200 };
  const index = new HostActivityIndex();
  const merged = index.merge([
    { host, snapshot: macSnapshot, observedAt: 1_000 },
    { host: windows, snapshot: windowsSnapshot, observedAt: 1_000 }
  ]);
  const matches = merged.filter((slot) => slot.threadKey === shared);
  assert.equal(matches.length, 1);
  assert.equal(matches[0]!.host.platform, "darwin");
  assert.equal(matches[0]!.status, "working");

  macSnapshot.slots[0] = { ...macSnapshot.slots[0]!, status: "idle" };
  const afterCompletion = index.merge([
    { host, snapshot: macSnapshot, observedAt: 2_000 },
    { host: windows, snapshot: windowsSnapshot, observedAt: 2_000 }
  ]).find((slot) => slot.threadKey === shared);
  assert.equal(afterCompletion?.host.platform, "darwin", "the host that completed the task retains ownership");
});

test("single-host agent modes preserve Codex's native six-slot order", () => {
  const pinned = structuredClone(snapshot);
  pinned.agentSource = "pinned";
  for (const slot of pinned.slots) {
    slot.status = "idle";
    slot.selected = false;
    slot.activityAt = slot.id;
  }
  const merged = new HostActivityIndex().merge([{ host, snapshot: pinned, observedAt: 1_000 }], 1_000, host.hostId);
  assert.deepEqual(merged.map((slot) => slot.threadKey), pinned.slots.map((slot) => slot.threadKey));
  assert.deepEqual(merged.map((slot) => slot.id), [0, 1, 2, 3, 4, 5]);
});

test("combined pinned mode interleaves both hosts and routes mirrored tasks to the owner", () => {
  const windows: CodexHost = { hostId: "11111111-1111-4111-8111-111111111111", hostName: "Windows", platform: "win32" };
  const shared = "20000000-0000-4000-8000-000000000000";
  const windowsSnapshot = structuredClone(snapshot);
  const macSnapshot = structuredClone(snapshot);
  windowsSnapshot.agentSource = "pinned";
  macSnapshot.agentSource = "pinned";
  for (const slot of windowsSnapshot.slots) slot.threadKey = `21000000-0000-4000-8000-00000000000${slot.id}`;
  for (const slot of macSnapshot.slots) slot.threadKey = `22000000-0000-4000-8000-00000000000${slot.id}`;
  windowsSnapshot.slots[0] = { ...windowsSnapshot.slots[0]!, threadKey: shared, ownedByHost: false };
  macSnapshot.slots[4] = { ...macSnapshot.slots[4]!, threadKey: shared, ownedByHost: true };
  const merged = new HostActivityIndex().merge([
    { host: windows, snapshot: windowsSnapshot, observedAt: 1_000 },
    { host, snapshot: macSnapshot, observedAt: 1_000 }
  ], 1_000, windows.hostId);
  assert.equal(merged[0]!.threadKey, shared);
  assert.equal(merged[0]!.host.platform, "darwin");
  assert.equal(merged[0]!.sourceSlot, 4);
  assert.deepEqual(merged.slice(1).map((slot) => slot.threadKey), [
    macSnapshot.slots[0]!.threadKey,
    windowsSnapshot.slots[1]!.threadKey,
    macSnapshot.slots[1]!.threadKey,
    windowsSnapshot.slots[2]!.threadKey,
    macSnapshot.slots[2]!.threadKey
  ]);
});

test("combined custom mode uses the remote assignment when the controller slot is empty", () => {
  const windows: CodexHost = { hostId: "11111111-1111-4111-8111-111111111111", hostName: "Windows", platform: "win32" };
  const windowsSnapshot = structuredClone(snapshot);
  const macSnapshot = structuredClone(snapshot);
  windowsSnapshot.agentSource = "custom";
  macSnapshot.agentSource = "custom";
  windowsSnapshot.slots[0] = { id: 0, threadKey: null, title: null, status: "off", selected: false };
  macSnapshot.slots[0] = { ...macSnapshot.slots[0]!, threadKey: "30000000-0000-4000-8000-000000000000", ownedByHost: true };
  const merged = new HostActivityIndex().merge([
    { host: windows, snapshot: windowsSnapshot, observedAt: 1_000 },
    { host, snapshot: macSnapshot, observedAt: 1_000 }
  ], 1_000, windows.hostId);
  assert.equal(merged[0]!.threadKey, macSnapshot.slots[0]!.threadKey);
  assert.equal(merged[0]!.host.platform, "darwin");
  assert.equal(merged[0]!.sourceSlot, 0);
});

test("combined custom mode keeps the controller assignment when both hosts configure one button", () => {
  const windows: CodexHost = { hostId: "11111111-1111-4111-8111-111111111111", hostName: "Windows", platform: "win32" };
  const windowsSnapshot = structuredClone(snapshot);
  const macSnapshot = structuredClone(snapshot);
  windowsSnapshot.agentSource = "custom";
  macSnapshot.agentSource = "custom";
  windowsSnapshot.slots[0] = { ...windowsSnapshot.slots[0]!, threadKey: "31000000-0000-4000-8000-000000000000" };
  macSnapshot.slots[0] = { ...macSnapshot.slots[0]!, threadKey: "32000000-0000-4000-8000-000000000000" };
  const merged = new HostActivityIndex().merge([
    { host: windows, snapshot: windowsSnapshot, observedAt: 1_000 },
    { host, snapshot: macSnapshot, observedAt: 1_000 }
  ], 1_000, windows.hostId);
  assert.equal(merged[0]!.threadKey, windowsSnapshot.slots[0]!.threadKey);
  assert.equal(merged[0]!.host.platform, "win32");
});

test("combined custom mode de-duplicates prefixed mirrors and routes them to the rollout owner", () => {
  const windows: CodexHost = { hostId: "11111111-1111-4111-8111-111111111111", hostName: "Windows", platform: "win32" };
  const windowsSnapshot = structuredClone(snapshot);
  const macSnapshot = structuredClone(snapshot);
  windowsSnapshot.agentSource = "custom";
  macSnapshot.agentSource = "custom";
  const id = "33000000-0000-4000-8000-000000000000";
  windowsSnapshot.slots[0] = { ...windowsSnapshot.slots[0]!, threadKey: `local:${id}`, ownedByHost: false };
  macSnapshot.slots[1] = { ...macSnapshot.slots[1]!, threadKey: `local:client-new-thread:${id}`, ownedByHost: true };
  const merged = new HostActivityIndex().merge([
    { host: windows, snapshot: windowsSnapshot, observedAt: 1_000 },
    { host, snapshot: macSnapshot, observedAt: 1_000 }
  ], 1_000, windows.hostId);
  assert.equal(merged.filter((slot) => slot.threadKey?.endsWith(id)).length, 1);
  assert.equal(merged[0]!.host.platform, "darwin");
  assert.equal(merged[0]!.sourceSlot, 1);
  assert.equal(merged[1]!.threadKey, windowsSnapshot.slots[1]!.threadKey);
});

test("combined priority mode ranks waiting, unread, active, then idle", () => {
  const windows: CodexHost = { hostId: "11111111-1111-4111-8111-111111111111", hostName: "Windows", platform: "win32" };
  const windowsSnapshot = structuredClone(snapshot);
  const macSnapshot = structuredClone(snapshot);
  windowsSnapshot.agentSource = "priority";
  for (const slot of [...windowsSnapshot.slots, ...macSnapshot.slots]) {
    slot.status = "idle";
    slot.selected = false;
    slot.activityAt = 1;
  }
  macSnapshot.slots[0] = { ...macSnapshot.slots[0]!, threadKey: "40000000-0000-4000-8000-000000000000", status: "working" };
  macSnapshot.slots[1] = { ...macSnapshot.slots[1]!, threadKey: "40000000-0000-4000-8000-000000000001", status: "unread" };
  macSnapshot.slots[2] = { ...macSnapshot.slots[2]!, threadKey: "40000000-0000-4000-8000-000000000002", status: "awaiting-approval" };
  const merged = new HostActivityIndex().merge([
    { host: windows, snapshot: windowsSnapshot, observedAt: 1_000 },
    { host, snapshot: macSnapshot, observedAt: 1_000 }
  ], 1_000, windows.hostId);
  assert.deepEqual(merged.slice(0, 3).map((slot) => slot.status), ["awaiting-approval", "unread", "working"]);
});

test("combined priority mode keeps freshly completed owner sessions ahead of idle tasks", () => {
  const windows: CodexHost = { hostId: "11111111-1111-4111-8111-111111111111", hostName: "Windows", platform: "win32" };
  const windowsSnapshot = structuredClone(snapshot);
  const macSnapshot = structuredClone(snapshot);
  const completed = "50000000-0000-4000-8000-000000000000";
  windowsSnapshot.agentSource = "priority";
  macSnapshot.agentSource = "priority";
  for (const slot of [...windowsSnapshot.slots, ...macSnapshot.slots]) {
    slot.status = "idle";
    slot.selected = false;
    slot.activityAt = 1;
  }
  windowsSnapshot.slots[4] = { ...windowsSnapshot.slots[4]!, threadKey: completed, status: "idle" };
  macSnapshot.hostSessions = [{ threadId: completed, activityAt: 2_000, status: "complete" }];
  const merged = new HostActivityIndex().merge([
    { host: windows, snapshot: windowsSnapshot, observedAt: 2_000 },
    { host, snapshot: macSnapshot, observedAt: 2_000 }
  ], 2_000, windows.hostId);
  assert.equal(merged[0]!.threadKey, completed);
  assert.equal(merged[0]!.host.platform, "darwin");
  assert.equal(merged[0]!.status, "complete");
});

test("authenticated relay publishes snapshots and dispatches typed commands", async () => {
  const port = await freePort();
  const calls: unknown[] = [];
  const control = {
    refresh: async () => snapshot,
    sendAgent: async (slot: number, act: 0 | 1) => { calls.push(["agent", slot, act]); },
    sendAction: async () => {}, sendJoystick: async () => {}, sendEncoder: async () => {},
    adjustReasoning: async () => {}, runKeycap: async () => {}
  };
  const server = new CodexRelayServer(
    { enabled: true, listenHost: "127.0.0.1", port, token: "t".repeat(32) }, host, control, () => {}
  );
  await server.start();
  const socket = new WebSocket(`ws://127.0.0.1:${port}`);
  const messages = messageQueue(socket);
  await onceOpen(socket);
  socket.send(JSON.stringify({ type: "auth", protocol: RELAY_PROTOCOL_VERSION, token: "t".repeat(32) }));
  const first = await messages.next();
  assert.equal(first.type, "ready");
  const second = await messages.next();
  assert.equal(second.type, "snapshot");
  socket.send(JSON.stringify({
    type: "command", protocol: RELAY_PROTOCOL_VERSION, requestId: "request-1",
    command: { kind: "agent", slot: 2, threadKey: "00000000-0000-4000-8000-000000000002", act: 1 }
  }));
  const result = await messages.next();
  assert.deepEqual(calls, [["agent", 2, 1]]);
  assert.equal(result.type, "result");
  assert.equal(result.ok, true);
  socket.close();
  await server.close();
});

test("relay rejects a client with the wrong token before publishing state", async () => {
  const port = await freePort();
  let refreshes = 0;
  const control = {
    refresh: async () => { refreshes += 1; return snapshot; },
    sendAgent: async () => {}, sendAction: async () => {}, sendJoystick: async () => {},
    sendEncoder: async () => {}, adjustReasoning: async () => {}, runKeycap: async () => {}
  };
  const server = new CodexRelayServer(
    { enabled: true, listenHost: "127.0.0.1", port, token: "t".repeat(32) }, host, control, () => {}
  );
  await server.start();
  const socket = new WebSocket(`ws://127.0.0.1:${port}`);
  await onceOpen(socket);
  socket.send(JSON.stringify({ type: "auth", protocol: RELAY_PROTOCOL_VERSION, token: "wrong-token".repeat(4) }));
  const closeCode = await new Promise<number>((resolve) => socket.once("close", resolve));
  assert.equal(closeCode, 4003);
  assert.equal(refreshes, 0);
  await server.close();
});

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

async function onceOpen(socket: WebSocket): Promise<void> {
  if (socket.readyState === WebSocket.OPEN) return;
  await new Promise<void>((resolve, reject) => {
    socket.once("open", resolve);
    socket.once("error", reject);
  });
}

function messageQueue(socket: WebSocket): { next: () => Promise<Record<string, unknown>> } {
  const queued: Record<string, unknown>[] = [];
  const waiting: Array<(value: Record<string, unknown>) => void> = [];
  socket.on("message", (raw) => {
    const value = JSON.parse(raw.toString()) as Record<string, unknown>;
    const resolve = waiting.shift();
    if (resolve) resolve(value);
    else queued.push(value);
  });
  return {
    next: () => {
      const value = queued.shift();
      if (value) return Promise.resolve(value);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("Timed out waiting for relay message.")), 2_000);
        waiting.push((message) => { clearTimeout(timer); resolve(message); });
      });
    }
  };
}
