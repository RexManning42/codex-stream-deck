import streamDeck from "@elgato/streamdeck";
import { DeckController } from "./controller.js";
import {
  Agent1, Agent2, Agent3, Agent4, Agent5, Agent6,
  Approve, Back, Decline, Dictation, Fast, Fork, Forward, NewTask,
  Plan, Reasoning, ReasoningDown, ReasoningUp, Send, Sidebar
} from "./actions.js";

const controller = new DeckController();

for (const pluginAction of [
  new Agent1(controller), new Agent2(controller), new Agent3(controller),
  new Agent4(controller), new Agent5(controller), new Agent6(controller),
  new Fast(controller), new Approve(controller), new Decline(controller),
  new Fork(controller), new Dictation(controller), new Send(controller),
  new Plan(controller), new Reasoning(controller), new ReasoningDown(controller), new ReasoningUp(controller), new NewTask(controller),
  new Back(controller), new Forward(controller), new Sidebar(controller)
]) streamDeck.actions.registerAction(pluginAction);

streamDeck.connect();
void controller.start().catch((error) => streamDeck.logger.error(`Codex-Verbindung fehlgeschlagen: ${String(error)}`));

process.once("SIGTERM", () => controller.stop());
process.once("SIGINT", () => controller.stop());
