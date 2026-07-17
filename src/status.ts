import type { AgentVisualStatus } from "./types.js";

export function visualStatusFromMicro(status: string): AgentVisualStatus {
  switch (status) {
    case "off": return "empty";
    case "working": return "thinking";
    case "unread": return "complete";
    case "approval":
    case "awaiting-approval":
    case "awaiting-response":
      return "input";
    case "error": return "error";
    default: return "idle";
  }
}
