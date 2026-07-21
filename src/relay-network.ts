import { createSocket } from "node:dgram";
import { networkInterfaces } from "node:os";
import { isIP } from "node:net";

export function isAllowedRelayHost(value: string): boolean {
  const host = value.trim().toLowerCase().replace(/^\[|\]$/g, "");
  if (["127.0.0.1", "localhost", "::1"].includes(host) || host.endsWith(".ts.net")) return true;
  if (isIP(host) === 4) {
    const [first, second] = host.split(".").map(Number);
    return first === 100 && second != null && second >= 64 && second <= 127;
  }
  return isIP(host) === 6 && host.startsWith("fd7a:115c:a1e0:");
}

export function isPrivateLanHost(value: string): boolean {
  const host = value.trim().toLowerCase().replace(/^\[|\]$/g, "");
  if (isIP(host) !== 4) return false;
  const [first = -1, second = -1] = host.split(".").map(Number);
  return first === 10 || (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168);
}

export function privateLanAddresses(
  interfaces: ReturnType<typeof networkInterfaces> = networkInterfaces()
): string[] {
  const addresses = Object.values(interfaces).flatMap((entries) => entries ?? [])
    .filter((entry) => entry.family === "IPv4" && !entry.internal && isPrivateLanHost(entry.address))
    .map((entry) => entry.address);
  return [...new Set(addresses)].sort();
}

export async function selectPrivateLanAddress(): Promise<string> {
  const candidates = privateLanAddresses();
  if (!candidates.length) {
    throw new Error("No private IPv4 LAN address is available. Connect this computer to the same trusted network as the iPhone.");
  }
  const routed = await defaultRouteAddress();
  if (routed && candidates.includes(routed)) return routed;
  return candidates[0]!;
}

async function defaultRouteAddress(): Promise<string | null> {
  return await new Promise((resolve) => {
    const socket = createSocket("udp4");
    const finish = (value: string | null) => {
      try { socket.close(); } catch { /* already closed */ }
      resolve(value);
    };
    socket.once("error", () => finish(null));
    socket.connect(53, "1.1.1.1", () => {
      const address = socket.address();
      finish(typeof address === "object" && isPrivateLanHost(address.address) ? address.address : null);
    });
    setTimeout(() => finish(null), 500).unref();
  });
}
