export type AgentVisualStatus = "empty" | "idle" | "thinking" | "complete" | "input" | "error";
export type ThemeMode = "light" | "dark";

export type MicroAgentSlot = {
  id: number;
  threadKey: string | null;
  title: string | null;
  status: string;
  selected: boolean;
  activityAt?: number;
  /** True when this host has the backing Codex rollout file for the task. */
  ownedByHost?: boolean;
};

export type MicroActionSlot = "ACT06" | "ACT07" | "ACT08" | "ACT09" | "ACT10_ACT11" | "ACT12";
export type MicroDirection = "up" | "right" | "down" | "left";
export type ReasoningAdjustment = "decrease" | "increase";

export type MicroLayout = {
  version: 1;
  slots: Record<MicroActionSlot, { keycapId: string; commandId?: string }>;
  analogStick: Record<MicroDirection, unknown>;
};

export type MicroSnapshot = {
  slots: MicroAgentSlot[];
  layout: MicroLayout;
  agentSource: "pinned" | "recent" | "priority" | "custom";
  lightingAutoOff: string;
  theme: ThemeMode;
};

export type CodexHost = {
  hostId: string;
  hostName: string;
  platform: "win32" | "darwin";
};

export type RoutedAgentSlot = MicroAgentSlot & {
  host: CodexHost;
  sourceSlot: number;
  observedAt: number;
};
