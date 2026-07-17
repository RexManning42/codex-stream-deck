import streamDeck, { type KeyAction } from "@elgato/streamdeck";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { CodexMicroRendererBridge } from "./codex-micro-renderer-bridge.js";
import type { OfficialKeycapId } from "./keycaps.js";
import { renderAgentKey, renderBuiltinKeycap, renderFallbackKeycap, renderImportedKeycap, type BuiltinIconName } from "./render.js";
import { openCodexThread } from "./windows-open.js";
import { visualStatusFromMicro } from "./status.js";
import type { MicroActionSlot, MicroDirection, MicroSnapshot, ReasoningAdjustment } from "./types.js";

export type FixedIconSource =
  | { kind: "local"; keycapId: string }
  | { kind: "builtin"; name: BuiltinIconName };

type FixedIconRegistration = { action: KeyAction; source: FixedIconSource };
type AgentRegistration = { action: KeyAction; slot: number };
type MicroActionRegistration = { action: KeyAction; slot: MicroActionSlot };
type ActionIdentity = { id: string };

const USER_ICON_ROOT = join(
  process.env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local"),
  "CodexDeck",
  "icons"
);

export class DeckController {
  private readonly microBridge = new CodexMicroRendererBridge((message) => streamDeck.logger.info(message));
  private readonly agents = new Map<string, AgentRegistration>();
  private readonly microActions = new Map<string, MicroActionRegistration>();
  private readonly fixedActions = new Map<string, FixedIconRegistration>();
  private readonly keycapImages = new Map<string, Promise<string | null>>();
  private readonly lastImages = new Map<string, string>();
  private poll?: NodeJS.Timeout;
  private animation?: NodeJS.Timeout;
  private stopped = false;
  private animationFrame = 0;
  private snapshot?: MicroSnapshot;
  private lastError = "";
  private lastAssignmentSignature = "";
  private lastStatusSignature = "";
  private lastLayoutSignature = "";

  async start(): Promise<void> {
    this.stopped = false;
    await this.refresh();
    this.scheduleRefresh();
    this.scheduleAnimation();
  }

  stop(): void {
    this.stopped = true;
    if (this.poll) clearInterval(this.poll);
    if (this.animation) clearInterval(this.animation);
    this.microBridge.close();
  }

  registerAgent(slot: number, action: KeyAction): void {
    this.agents.set(action.id, { action, slot });
    void this.renderAgent({ action, slot });
  }

  unregisterAgent(action: ActionIdentity): void {
    this.unregister(action, this.agents);
  }

  registerMicroAction(slot: MicroActionSlot, action: KeyAction): void {
    this.microActions.set(action.id, { action, slot });
    void this.renderMicroAction({ action, slot });
  }

  unregisterMicroAction(action: ActionIdentity): void {
    this.unregister(action, this.microActions);
  }

  registerFixedAction(id: string, action: KeyAction, source: FixedIconSource): void {
    this.fixedActions.set(action.id, { action, source });
    void this.renderFixedAction({ action, source });
  }

  unregisterFixedAction(action: ActionIdentity): void {
    this.unregister(action, this.fixedActions);
  }

  async sendAgent(slot: number, act: 0 | 1): Promise<void> {
    await this.microBridge.sendAgent(slot, act);
  }

  async sendMicroAction(slot: MicroActionSlot, act: 0 | 1): Promise<void> {
    await this.microBridge.sendAction(slot, act);
  }

  async sendJoystick(direction: MicroDirection, distance: 0 | 1): Promise<void> {
    await this.microBridge.sendJoystick(direction, distance);
  }

  async sendEncoder(act: 0 | 1): Promise<void> {
    await this.microBridge.sendEncoder(act);
  }

  async adjustReasoning(direction: ReasoningAdjustment): Promise<void> {
    await this.microBridge.adjustReasoning(direction);
  }

  async runKeycap(keycapId: OfficialKeycapId): Promise<void> {
    await this.microBridge.runKeycap(keycapId);
  }

  async createTask(): Promise<void> {
    await openCodexThread("new");
  }

  private async refresh(): Promise<void> {
    try {
      const snapshot = await this.microBridge.refresh();
      this.snapshot = snapshot;
      this.lastError = "";

      const assignments = snapshot.slots.map((slot) => `${slot.id}=${slot.threadKey ?? "empty"}`).join(" ");
      if (assignments !== this.lastAssignmentSignature) {
        this.lastAssignmentSignature = assignments;
        streamDeck.logger.info(`Codex Micro slots: ${assignments}`);
      }

      const statuses = snapshot.slots.map((slot) => `${slot.id}:${slot.status}:${slot.selected}`).join(",");
      if (statuses !== this.lastStatusSignature) {
        this.lastStatusSignature = statuses;
        streamDeck.logger.info(`Codex Micro states: ${snapshot.slots.map((slot) => `${slot.id + 1}=${slot.status}`).join(" ")}`);
      }

      const layout = JSON.stringify({ theme: snapshot.theme, slots: snapshot.layout.slots });
      if (layout !== this.lastLayoutSignature) {
        this.lastLayoutSignature = layout;
        this.keycapImages.clear();
        streamDeck.logger.info(`Codex Micro layout synchronized (${snapshot.agentSource}, ${snapshot.theme} theme).`);
      }

      await this.renderAll();
    } catch (error) {
      this.snapshot = undefined;
      const message = String(error);
      if (message !== this.lastError) {
        this.lastError = message;
        streamDeck.logger.warn(`Codex Micro bridge unavailable: ${message}`);
      }
      await Promise.all([...this.agents.values()].map((registration) => this.renderAgent(registration)));
    }
  }

  private async renderAll(): Promise<void> {
    await Promise.all([
      ...[...this.agents.values()].map((registration) => this.renderAgent(registration)),
      ...[...this.microActions.values()].map((registration) => this.renderMicroAction(registration)),
      ...[...this.fixedActions.values()].map((registration) => this.renderFixedAction(registration))
    ]);
  }

  private async renderAgent({ action, slot }: AgentRegistration): Promise<void> {
    const agent = this.snapshot?.slots.find((item) => item.id === slot);
    const title = agent?.title ?? (this.snapshot ? "Not assigned" : "Bridge offline");
    const status = agent ? visualStatusFromMicro(agent.status) : "empty";
    const theme = this.snapshot?.theme ?? "dark";
    await this.setImage(action, renderAgentKey(slot, title, status, agent?.selected ?? false, this.animationFrame, theme));
  }

  private async renderAnimatedAgents(): Promise<void> {
    const registrations = [...this.agents.values()].filter(({ slot }) => {
      const agent = this.snapshot?.slots.find((item) => item.id === slot);
      if (!agent) return false;
      const status = visualStatusFromMicro(agent.status);
      return status === "thinking" || status === "input";
    });
    await Promise.all(registrations.map((registration) => this.renderAgent(registration).catch((error) =>
      streamDeck.logger.error(`Agent animation ${registration.slot + 1} failed: ${String(error)}`)
    )));
  }

  private async renderMicroAction({ action, slot }: MicroActionRegistration): Promise<void> {
    const keycapId = this.snapshot?.layout.slots[slot]?.keycapId;
    if (!keycapId) return;
    const image = await this.keycapImage(keycapId, this.snapshot?.theme ?? "dark");
    if (image) await this.setImage(action, image);
  }

  private async renderFixedAction(registration: FixedIconRegistration): Promise<void> {
    const theme = this.snapshot?.theme ?? "dark";
    const image = registration.source.kind === "builtin"
      ? renderBuiltinKeycap(registration.source.name, theme)
      : await this.keycapImage(registration.source.keycapId, theme);
    if (image) await this.setImage(registration.action, image);
  }

  private async setImage(action: KeyAction, image: string): Promise<void> {
    if (this.lastImages.get(action.id) === image) return;
    await Promise.all([action.setImage(image), action.setTitle("")]);
    this.lastImages.set(action.id, image);
  }

  private unregister<T>(action: ActionIdentity, registrations: Map<string, T>): void {
    registrations.delete(action.id);
    this.lastImages.delete(action.id);
  }

  private scheduleRefresh(): void {
    if (this.stopped) return;
    this.poll = setTimeout(async () => {
      try { await this.refresh(); }
      finally { this.scheduleRefresh(); }
    }, 1_200);
  }

  private scheduleAnimation(): void {
    if (this.stopped) return;
    this.animation = setTimeout(async () => {
      this.animationFrame = (this.animationFrame + 1) % 12;
      try { await this.renderAnimatedAgents(); }
      finally { this.scheduleAnimation(); }
    }, 200);
  }

  private keycapImage(keycapId: string, theme: "light" | "dark"): Promise<string | null> {
    const cacheKey = `${theme}:${keycapId}`;
    let pending = this.keycapImages.get(cacheKey);
    if (pending) return pending;
    pending = readFile(join(USER_ICON_ROOT, `${keycapId}.svg`), "utf8")
      .then((svg) => renderImportedKeycap(svg, theme))
      .catch(() => renderFallbackKeycap(keycapId, theme));
    this.keycapImages.set(cacheKey, pending);
    return pending;
  }
}
