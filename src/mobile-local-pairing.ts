import { randomBytes, X509Certificate } from "node:crypto";
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import QRCode from "qrcode";
import { generate } from "selfsigned";
import { getOrCreateHostIdentity } from "./host-identity.js";
import { selectPrivateLanAddress } from "./relay-network.js";
import { validateRelayServerConfig, type RelayServerConfig } from "./codex-relay-server.js";

export const LOCAL_MOBILE_CONFIG = "mobile-local-relay-server.json";
export const LOCAL_PAIRING_QR = "mobile-local-pairing.svg";

export type LocalPairingResult = {
  configPath: string;
  qrPath: string;
  hostName: string;
  address: string;
  port: number;
  fingerprintSha256: string;
};

export async function configureLocalMobilePairing(options: {
  stateRoot: string;
  port?: number;
  rotate?: boolean;
}): Promise<LocalPairingResult> {
  const port = options.port ?? 47_653;
  const configPath = join(options.stateRoot, LOCAL_MOBILE_CONFIG);
  const qrPath = join(options.stateRoot, LOCAL_PAIRING_QR);
  const host = await getOrCreateHostIdentity(join(options.stateRoot, "host.json"));
  const address = await selectPrivateLanAddress();
  await mkdir(options.stateRoot, { recursive: true, mode: 0o700 });

  let config = !options.rotate ? await readExisting(configPath) : null;
  if (!config) {
    const certificate = await generate(
      [{ name: "commonName", value: `Codex Deck ${host.hostId}` }],
      {
        keyType: "ec",
        curve: "P-256",
        algorithm: "sha256",
        notAfterDate: new Date(Date.now() + 10 * 365 * 24 * 60 * 60 * 1_000),
        extensions: [
          { name: "basicConstraints", cA: false, critical: true },
          { name: "keyUsage", digitalSignature: true, keyAgreement: true, critical: true },
          { name: "extKeyUsage", serverAuth: true },
          { name: "subjectAltName", altNames: [{ type: 7, ip: address }, { type: 2, value: "localhost" }] }
        ]
      }
    );
    const fingerprintSha256 = normalizeFingerprint(new X509Certificate(certificate.cert).fingerprint256);
    config = {
      enabled: true,
      listenHost: "auto",
      port,
      token: randomBytes(32).toString("base64url"),
      transport: "local",
      tls: {
        certificate: certificate.cert,
        privateKey: certificate.private,
        fingerprintSha256
      },
      discovery: { enabled: true }
    };
  } else if (config.port !== port) {
    config = { ...config, port };
  }
  validateRelayServerConfig(config);
  await atomicWrite(configPath, `${JSON.stringify(config, null, 2)}\n`);

  const link = new URL("codexdeck://pair");
  link.searchParams.set("version", "1");
  link.searchParams.set("mode", "nearby");
  link.searchParams.set("hostId", host.hostId);
  link.searchParams.set("name", host.hostName);
  link.searchParams.set("platform", host.platform);
  link.searchParams.set("endpoint", `wss://${address}:${config.port}`);
  link.searchParams.set("token", config.token);
  link.searchParams.set("fingerprint", normalizeFingerprint(config.tls!.fingerprintSha256));
  const qr = await QRCode.toString(link.toString(), {
    type: "svg", errorCorrectionLevel: "M", margin: 3,
    color: { dark: "#111214", light: "#f5f7f9" }
  });
  await atomicWrite(qrPath, qr);
  return {
    configPath,
    qrPath,
    hostName: host.hostName,
    address,
    port: config.port,
    fingerprintSha256: normalizeFingerprint(config.tls!.fingerprintSha256)
  };
}

async function readExisting(path: string): Promise<RelayServerConfig | null> {
  try {
    const value = JSON.parse(await readFile(path, "utf8")) as RelayServerConfig;
    validateRelayServerConfig(value);
    return value.transport === "local" ? value : null;
  } catch { return null; }
}

async function atomicWrite(path: string, contents: string): Promise<void> {
  const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, contents, { encoding: "utf8", mode: 0o600 });
  await rename(temporary, path);
  await chmod(path, 0o600).catch(() => {});
}

function normalizeFingerprint(value: string): string {
  return value.replaceAll(":", "").trim().toLowerCase();
}
