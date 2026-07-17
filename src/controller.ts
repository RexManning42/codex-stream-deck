import streamDeck, { type KeyAction } from "@elgato/streamdeck";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { CodexMicroRendererBridge } from "./codex-micro-renderer-bridge.js";
import { renderAgentKey, renderImportedKeycap } from "./render.js";
import { openCodexThread } from "./windows-open.js";
import { visualStatusFromMicro } from "./status.js";
import type { MicroActionSlot, MicroDirection, MicroSnapshot, ReasoningAdjustment } from "./types.js";

const USER_ICON_ROOT = join(
  process.env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local"),
  "CodexDeck",
  "icons"
);

export class DeckController {
  private readonly microBridge = new CodexMicroRendererBridge((message) => streamDeck.logger.info(message));
  private readonly agents = new Map<number, KeyAction>();
  private readonly microActions = new Map<MicroActionSlot, KeyAction>();
  private readonly keycapImages = new Map<string, Promise<string | null>>();
  private poll?: NodeJS.Timeout;
  private animation?: NodeJS.Timeout;
  private animationFrame = 0;
  private snapshot?: MicroSnapshot;
  private lastError = "";
  private lastAssignmentSignature = "";
  private lastStatusSignature = "";
  private lastLayoutSignature = "";

  async start(): Promise<void> {
    await this.refresh();
    this.poll = setInterval(() => void this.refresh(), 1_200);
    this.animation = setInterval(() => {
      this.animationFrame = (this.animationFrame + 1) % 12;
      void this.renderAnimatedAgents();
    }, 200);
  }

  stop(): void {
    if (this.poll) clearInterval(this.poll);
    if (this.animation) clearInterval(this.animation);
    this.microBridge.close();
  }

  registerAgent(slot: number, action: KeyAction): void {
    this.agents.set(slot, action);
    void this.renderAgent(slot);
  }

  unregisterAgent(slot: number): void {
    this.agents.delete(slot);
  }

  registerMicroAction(slot: MicroActionSlot, action: KeyAction): void {
    this.microActions.set(slot, action);
    void this.renderMicroAction(slot);
  }

  unregisterMicroAction(slot: MicroActionSlot): void {
    this.microActions.delete(slot);
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

      const layout = JSON.stringify(snapshot.layout.slots);
      if (layout !== this.lastLayoutSignature) {
        this.lastLayoutSignature = layout;
        this.keycapImages.clear();
        streamDeck.logger.info(`Codex Micro layout synchronized (${snapshot.agentSource}).`);
      }

      await this.renderAll();
    } catch (error) {
      this.snapshot = undefined;
      const message = String(error);
      if (message !== this.lastError) {
        this.lastError = message;
        streamDeck.logger.warn(`Codex Micro bridge unavailable: ${message}`);
      }
      await Promise.all([...this.agents.keys()].map((slot) => this.renderAgent(slot)));
    }
  }

  private async renderAll(): Promise<void> {
    await Promise.all([
      ...[...this.agents.keys()].map((slot) => this.renderAgent(slot)),
      ...[...this.microActions.keys()].map((slot) => this.renderMicroAction(slot))
    ]);
  }

  private async renderAgent(slot: number): Promise<void> {
    const action = this.agents.get(slot);
    if (!action) return;
    const agent = this.snapshot?.slots.find((item) => item.id === slot);
    const title = agent?.title ?? (this.snapshot ? "Not assigned" : "Bridge offline");
    const status = agent ? visualStatusFromMicro(agent.status) : "empty";
    await action.setImage(renderAgentKey(slot, title, status, agent?.selected ?? false, this.animationFrame));
    await action.setTitle("");
  }

  private async renderAnimatedAgents(): Promise<void> {
    const slots = [...this.agents.keys()].filter((slot) => {
      const agent = this.snapshot?.slots.find((item) => item.id === slot);
      return agent?.status === "working" || agent?.status === "approval" || agent?.selected;
    });
    await Promise.all(slots.map((slot) => this.renderAgent(slot).catch((error) =>
      streamDeck.logger.error(`Agent animation ${slot + 1} failed: ${String(error)}`)
    )));
  }

  private async renderMicroAction(slot: MicroActionSlot): Promise<void> {
    const action = this.microActions.get(slot);
    const keycapId = this.snapshot?.layout.slots[slot]?.keycapId;
    if (!action || !keycapId) return;
    const image = await this.keycapImage(keycapId);
    if (image) {
      await action.setImage(image);
      await action.setTitle("");
    }
  }

  private keycapImage(keycapId: string): Promise<string | null> {
    let pending = this.keycapImages.get(keycapId);
    if (pending) return pending;
    pending = readFile(join(USER_ICON_ROOT, `${keycapId}.svg`), "utf8")
      .then((svg) => renderImportedKeycap(svg))
      .catch(() => null);
    this.keycapImages.set(keycapId, pending);
    return pending;
  }
}
