import streamDeck, { action, type KeyDownEvent, type KeyUpEvent, type WillAppearEvent, type WillDisappearEvent, SingletonAction } from "@elgato/streamdeck";
import type { DeckController } from "./controller.js";
import type { MicroActionSlot, MicroDirection, ReasoningAdjustment } from "./types.js";

abstract class AgentAction extends SingletonAction {
  constructor(private readonly controller: DeckController, private readonly slot: number) { super(); }

  override onWillAppear(ev: WillAppearEvent): void {
    if (ev.action.isKey()) this.controller.registerAgent(this.slot, ev.action);
  }

  override onWillDisappear(_ev: WillDisappearEvent): void {
    this.controller.unregisterAgent(this.slot);
  }

  override async onKeyDown(ev: KeyDownEvent): Promise<void> {
    try { await this.controller.sendAgent(this.slot, 1); }
    catch (error) {
      streamDeck.logger.error(`Agent key ${this.slot + 1} failed: ${String(error)}`);
      await ev.action.showAlert();
    }
  }

  override async onKeyUp(ev: KeyUpEvent): Promise<void> {
    try { await this.controller.sendAgent(this.slot, 0); }
    catch (error) {
      streamDeck.logger.error(`Agent key ${this.slot + 1} failed: ${String(error)}`);
      await ev.action.showAlert();
    }
  }
}

@action({ UUID: "com.simeo.codex-deck.agent-1" }) export class Agent1 extends AgentAction { constructor(c: DeckController) { super(c, 0); } }
@action({ UUID: "com.simeo.codex-deck.agent-2" }) export class Agent2 extends AgentAction { constructor(c: DeckController) { super(c, 1); } }
@action({ UUID: "com.simeo.codex-deck.agent-3" }) export class Agent3 extends AgentAction { constructor(c: DeckController) { super(c, 2); } }
@action({ UUID: "com.simeo.codex-deck.agent-4" }) export class Agent4 extends AgentAction { constructor(c: DeckController) { super(c, 3); } }
@action({ UUID: "com.simeo.codex-deck.agent-5" }) export class Agent5 extends AgentAction { constructor(c: DeckController) { super(c, 4); } }
@action({ UUID: "com.simeo.codex-deck.agent-6" }) export class Agent6 extends AgentAction { constructor(c: DeckController) { super(c, 5); } }

abstract class MicroKeyAction extends SingletonAction {
  constructor(private readonly controller: DeckController, private readonly slot: MicroActionSlot) { super(); }

  override onWillAppear(ev: WillAppearEvent): void {
    if (ev.action.isKey()) this.controller.registerMicroAction(this.slot, ev.action);
  }

  override onWillDisappear(_ev: WillDisappearEvent): void {
    this.controller.unregisterMicroAction(this.slot);
  }

  override async onKeyDown(ev: KeyDownEvent): Promise<void> {
    try { await this.controller.sendMicroAction(this.slot, 1); }
    catch (error) {
      streamDeck.logger.error(`Micro action ${this.slot} failed: ${String(error)}`);
      await ev.action.showAlert();
    }
  }

  override async onKeyUp(ev: KeyUpEvent): Promise<void> {
    try { await this.controller.sendMicroAction(this.slot, 0); }
    catch (error) {
      streamDeck.logger.error(`Micro action ${this.slot} failed: ${String(error)}`);
      await ev.action.showAlert();
    }
  }
}

abstract class JoystickAction extends SingletonAction {
  constructor(private readonly controller: DeckController, private readonly direction: MicroDirection) { super(); }

  override async onKeyDown(ev: KeyDownEvent): Promise<void> {
    try { await this.controller.sendJoystick(this.direction, 1); }
    catch (error) {
      streamDeck.logger.error(`Joystick ${this.direction} failed: ${String(error)}`);
      await ev.action.showAlert();
    }
  }

  override async onKeyUp(ev: KeyUpEvent): Promise<void> {
    try { await this.controller.sendJoystick(this.direction, 0); }
    catch (error) {
      streamDeck.logger.error(`Joystick ${this.direction} failed: ${String(error)}`);
      await ev.action.showAlert();
    }
  }
}

class EncoderAction extends SingletonAction {
  constructor(private readonly controller: DeckController) { super(); }

  override async onKeyDown(ev: KeyDownEvent): Promise<void> {
    try { await this.controller.sendEncoder(1); }
    catch (error) {
      streamDeck.logger.error(`Reasoning encoder failed: ${String(error)}`);
      await ev.action.showAlert();
    }
  }

  override async onKeyUp(ev: KeyUpEvent): Promise<void> {
    try { await this.controller.sendEncoder(0); }
    catch (error) {
      streamDeck.logger.error(`Reasoning encoder failed: ${String(error)}`);
      await ev.action.showAlert();
    }
  }
}

abstract class ReasoningAdjustmentAction extends SingletonAction {
  private pressed = false;
  private repeatTimer?: NodeJS.Timeout;

  constructor(private readonly controller: DeckController, private readonly direction: ReasoningAdjustment) { super(); }

  override async onKeyDown(ev: KeyDownEvent): Promise<void> {
    if (this.pressed) return;
    this.pressed = true;
    await this.send(ev);
    if (this.pressed) this.repeatTimer = setTimeout(() => void this.repeat(ev), 500);
  }

  override onKeyUp(_ev: KeyUpEvent): void { this.stop(); }
  override onWillDisappear(_ev: WillDisappearEvent): void { this.stop(); }

  private async repeat(ev: KeyDownEvent): Promise<void> {
    if (!this.pressed) return;
    await this.send(ev);
    if (this.pressed) this.repeatTimer = setTimeout(() => void this.repeat(ev), 300);
  }

  private async send(ev: KeyDownEvent): Promise<void> {
    try { await this.controller.adjustReasoning(this.direction); }
    catch (error) {
      this.stop();
      streamDeck.logger.error(`Reasoning ${this.direction} failed: ${String(error)}`);
      await ev.action.showAlert();
    }
  }

  private stop(): void {
    this.pressed = false;
    if (this.repeatTimer) clearTimeout(this.repeatTimer);
    this.repeatTimer = undefined;
  }
}

@action({ UUID: "com.simeo.codex-deck.fast" }) export class Fast extends MicroKeyAction { constructor(c: DeckController) { super(c, "ACT06"); } }
@action({ UUID: "com.simeo.codex-deck.approve" }) export class Approve extends MicroKeyAction { constructor(c: DeckController) { super(c, "ACT07"); } }
@action({ UUID: "com.simeo.codex-deck.decline" }) export class Decline extends MicroKeyAction { constructor(c: DeckController) { super(c, "ACT08"); } }
@action({ UUID: "com.simeo.codex-deck.fork" }) export class Fork extends MicroKeyAction { constructor(c: DeckController) { super(c, "ACT09"); } }
@action({ UUID: "com.simeo.codex-deck.dictation" }) export class Dictation extends MicroKeyAction { constructor(c: DeckController) { super(c, "ACT10_ACT11"); } }
@action({ UUID: "com.simeo.codex-deck.send" }) export class Send extends MicroKeyAction { constructor(c: DeckController) { super(c, "ACT12"); } }
@action({ UUID: "com.simeo.codex-deck.plan" }) export class Plan extends JoystickAction { constructor(c: DeckController) { super(c, "up"); } }
@action({ UUID: "com.simeo.codex-deck.back" }) export class Back extends JoystickAction { constructor(c: DeckController) { super(c, "left"); } }
@action({ UUID: "com.simeo.codex-deck.forward" }) export class Forward extends JoystickAction { constructor(c: DeckController) { super(c, "right"); } }
@action({ UUID: "com.simeo.codex-deck.sidebar" }) export class Sidebar extends JoystickAction { constructor(c: DeckController) { super(c, "down"); } }
@action({ UUID: "com.simeo.codex-deck.reasoning" }) export class Reasoning extends EncoderAction {}
@action({ UUID: "com.simeo.codex-deck.reasoning-down" }) export class ReasoningDown extends ReasoningAdjustmentAction { constructor(c: DeckController) { super(c, "decrease"); } }
@action({ UUID: "com.simeo.codex-deck.reasoning-up" }) export class ReasoningUp extends ReasoningAdjustmentAction { constructor(c: DeckController) { super(c, "increase"); } }

@action({ UUID: "com.simeo.codex-deck.new-task" })
export class NewTask extends SingletonAction {
  constructor(private readonly controller: DeckController) { super(); }

  override async onKeyDown(ev: KeyDownEvent): Promise<void> {
    try { await this.controller.createTask(); }
    catch (error) {
      streamDeck.logger.error(`New task failed: ${String(error)}`);
      await ev.action.showAlert();
    }
  }
}
