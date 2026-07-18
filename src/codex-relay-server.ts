import { timingSafeEqual } from "node:crypto";
import { isAllowedRelayHost } from "./relay-network.js";
import { WebSocketServer, WebSocket } from "ws";
import type { OfficialKeycapId } from "./keycaps.js";
import type { CodexMicroRendererBridge } from "./codex-micro-renderer-bridge.js";
import {
  RELAY_PROTOCOL_VERSION, parseRelayCommand,
  type RelayAuthMessage, type RelayCommand, type RelayCommandMessage, type RelayResultMessage, type RelaySnapshotMessage
} from "./relay-protocol.js";
import type { CodexHost } from "./types.js";

export type RelayServerConfig = {
  enabled: boolean;
  listenHost: string;
  port: number;
  token: string;
};

type RelayControl = Pick<CodexMicroRendererBridge,
  "refresh" | "sendAgent" | "sendAction" | "sendJoystick" | "sendEncoder" | "adjustReasoning" | "runKeycap">;

export class CodexRelayServer {
  private server?: WebSocketServer;
  private poll?: NodeJS.Timeout;
  private snapshotInFlight?: Promise<RelaySnapshotMessage>;
  private readonly authenticated = new Set<WebSocket>();

  constructor(
    private readonly config: RelayServerConfig,
    private readonly host: CodexHost,
    private readonly control: RelayControl,
    private readonly log: (message: string) => void
  ) {
    validateRelayServerConfig(config);
  }

  async start(): Promise<void> {
    if (this.server) return;
    const server = new WebSocketServer({
      host: this.config.listenHost,
      port: this.config.port,
      maxPayload: 64 * 1024,
      perMessageDeflate: false
    });
    this.server = server;
    server.on("connection", (socket) => this.handleConnection(socket));
    server.on("error", (error) => this.log(`Relay server error: ${String(error)}`));
    await new Promise<void>((resolve, reject) => {
      server.once("listening", resolve);
      server.once("error", reject);
    });
    this.log(`Relay listening on ${this.config.listenHost}:${this.config.port}; CDP remains loopback-only.`);
    this.scheduleSnapshot(0);
  }

  async close(): Promise<void> {
    if (this.poll) clearTimeout(this.poll);
    this.poll = undefined;
    for (const socket of this.authenticated) socket.close(1001, "relay stopping");
    this.authenticated.clear();
    const server = this.server;
    this.server = undefined;
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  private handleConnection(socket: WebSocket): void {
    const authTimer = setTimeout(() => socket.close(4001, "authentication required"), 3_000);
    socket.once("message", (raw) => {
      clearTimeout(authTimer);
      const auth = safeJson(raw.toString()) as Partial<RelayAuthMessage> | null;
      if (!auth || auth.type !== "auth" || auth.protocol !== RELAY_PROTOCOL_VERSION || !secureEqual(auth.token, this.config.token)) {
        socket.close(4003, "authentication failed");
        return;
      }
      this.authenticated.add(socket);
      socket.send(JSON.stringify({ type: "ready", protocol: RELAY_PROTOCOL_VERSION, host: this.host }));
      socket.on("message", (message) => void this.handleMessage(socket, message.toString()));
      socket.on("close", () => this.authenticated.delete(socket));
      socket.on("error", () => this.authenticated.delete(socket));
      void this.publishSnapshot(socket);
    });
    socket.on("close", () => clearTimeout(authTimer));
  }

  private async handleMessage(socket: WebSocket, raw: string): Promise<void> {
    const message = safeJson(raw) as Partial<RelayCommandMessage> | null;
    if (!message || message.type !== "command" || message.protocol !== RELAY_PROTOCOL_VERSION || typeof message.requestId !== "string") return;
    const command = parseRelayCommand(message.command);
    if (!command) {
      this.sendResult(socket, message.requestId, false, "Invalid relay command.");
      return;
    }
    try {
      await executeRelayCommand(this.control, command);
      this.sendResult(socket, message.requestId, true);
      await this.publishSnapshot();
    } catch (error) {
      this.sendResult(socket, message.requestId, false, error instanceof Error ? error.message : String(error));
    }
  }

  private sendResult(socket: WebSocket, requestId: string, ok: boolean, error?: string): void {
    if (socket.readyState !== WebSocket.OPEN) return;
    const result: RelayResultMessage = { type: "result", protocol: RELAY_PROTOCOL_VERSION, requestId, ok, ...(error ? { error } : {}) };
    socket.send(JSON.stringify(result));
  }

  private scheduleSnapshot(delay = 1_200): void {
    if (!this.server) return;
    this.poll = setTimeout(async () => {
      try { if (this.authenticated.size) await this.publishSnapshot(); }
      catch (error) { this.log(`Relay snapshot failed: ${String(error)}`); }
      finally { this.scheduleSnapshot(); }
    }, delay);
  }

  private async publishSnapshot(only?: WebSocket): Promise<void> {
    const message = await this.currentSnapshotMessage();
    const encoded = JSON.stringify(message);
    for (const socket of only ? [only] : this.authenticated) {
      if (socket.readyState === WebSocket.OPEN) socket.send(encoded);
    }
  }

  private async currentSnapshotMessage(): Promise<RelaySnapshotMessage> {
    if (this.snapshotInFlight) return this.snapshotInFlight;
    const pending = this.control.refresh().then((snapshot): RelaySnapshotMessage => ({
      type: "snapshot",
      protocol: RELAY_PROTOCOL_VERSION,
      host: this.host,
      observedAt: Date.now(),
      snapshot
    }));
    this.snapshotInFlight = pending;
    try { return await pending; }
    finally { if (this.snapshotInFlight === pending) this.snapshotInFlight = undefined; }
  }
}

export function validateRelayServerConfig(config: RelayServerConfig): void {
  if (!config.enabled) throw new Error("Relay server config is disabled.");
  if (!config.listenHost || !isAllowedRelayHost(config.listenHost.trim())) throw new Error("Relay listenHost must be loopback or a specific Tailscale address.");
  if (!Number.isInteger(config.port) || config.port < 1024 || config.port > 65_535) throw new Error("Relay port must be between 1024 and 65535.");
  if (typeof config.token !== "string" || Buffer.byteLength(config.token, "utf8") < 32) throw new Error("Relay token must contain at least 32 bytes.");
}

async function executeRelayCommand(control: RelayControl, command: RelayCommand): Promise<void> {
  if (command.kind === "agent") return control.sendAgent(command.slot, command.act, command.threadKey);
  if (command.kind === "action") return control.sendAction(command.slot, command.act);
  if (command.kind === "joystick") return control.sendJoystick(command.direction, command.distance);
  if (command.kind === "encoder") return control.sendEncoder(command.act);
  if (command.kind === "reasoning") return control.adjustReasoning(command.direction);
  return control.runKeycap(command.keycapId as OfficialKeycapId);
}

function secureEqual(left: unknown, right: string): boolean {
  if (typeof left !== "string") return false;
  const a = Buffer.from(left, "utf8");
  const b = Buffer.from(right, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

function safeJson(raw: string): unknown {
  try { return JSON.parse(raw); }
  catch { return null; }
}
