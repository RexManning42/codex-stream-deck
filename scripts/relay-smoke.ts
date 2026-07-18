import { CodexRelayClient, readRelayClientConfig } from "../src/codex-relay-client.js";
import type { HostSnapshot } from "../src/relay-protocol.js";

const config = await readRelayClientConfig();
if (!config) throw new Error("No enabled relay-client.json was found in the CodexDeck state directory.");

let client: CodexRelayClient;
const snapshot = await new Promise<HostSnapshot>((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("Timed out waiting for the Mac relay snapshot.")), 8_000);
  client = new CodexRelayClient(config, (value) => {
    clearTimeout(timer);
    resolve(value);
  }, (message) => console.log(message));
  client.start();
});

console.log(`Relay snapshot: ${snapshot.host.hostName} (${snapshot.host.platform}, ${snapshot.host.hostId})`);
console.log(`Agent source: ${snapshot.snapshot.agentSource}`);
for (const slot of snapshot.snapshot.slots) {
  console.log(`${slot.id + 1}: ${slot.status}${slot.selected ? " selected" : ""} | local-rollout=${slot.ownedByHost === true ? "yes" : "no"} | activity=${slot.activityAt ?? "unknown"} | ${slot.threadKey ?? "empty"} | ${slot.title ?? ""}`);
}
client!.close();
