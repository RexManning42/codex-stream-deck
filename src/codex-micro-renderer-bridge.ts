import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import WebSocket from "ws";
import { OFFICIAL_KEYCAP_IDS, type OfficialKeycapId } from "./keycaps.js";
import type { MicroActionSlot, MicroDirection, MicroSnapshot, ReasoningAdjustment } from "./types.js";

type DebugTarget = {
  type: string;
  url: string;
  webSocketDebuggerUrl?: string;
};

type CdpResponse = {
  id?: number;
  result?: { result?: { value?: unknown; description?: string }; exceptionDetails?: { text?: string; exception?: { description?: string } } };
  error?: { message?: string };
};

const execFileAsync = promisify(execFile);
const PORT_FILE = join(process.env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local"), "CodexDeck", "codex-micro-bridge.json");
const DEVICE_STATE = {
  type: "codex-micro-device-state-changed",
  state: { status: "connected", error: null, battery: { percentage: 100, isCharging: true } }
};

export const REASONING_COMMANDS: Record<ReasoningAdjustment, string> = {
  decrease: "composer.decreaseReasoningEffort",
  increase: "composer.increaseReasoningEffort"
};

const SNAPSHOT_EXPRESSION = `(async () => {
  const hrefs = [...document.querySelectorAll('link[rel="modulepreload"]')].map((link) => link.href);
  const moduleUrl = (prefix) => hrefs.find((href) => href.includes('/assets/' + prefix));
  const required = ['app-scope-', 'codex-micro-slot-signals-', 'vscode-api-', 'src-', 'use-reduced-motion-'];
  const urls = Object.fromEntries(required.map((prefix) => [prefix, moduleUrl(prefix)]));
  if (Object.values(urls).some((value) => !value)) throw new Error('Codex Micro renderer modules are not loaded.');

  const [appScope, slotSignals, vscode, source, settings] = await Promise.all([
    import(urls['app-scope-']),
    import(urls['codex-micro-slot-signals-']),
    import(urls['vscode-api-']),
    import(urls['src-']),
    import(urls['use-reduced-motion-'])
  ]);
  const settingStorageUrl = moduleUrl('setting-storage-');
  const settingStorage = settingStorageUrl ? await import(settingStorageUrl) : null;
  const definitions = vscode.Et ?? source.P;
  const getSetting = settingStorage?.r ?? settings.u;
  if (!definitions || typeof getSetting !== 'function') throw new Error('Codex Micro settings API was not found.');

  const bus = [vscode.g, vscode.m, ...Object.values(vscode)].find((candidate) => candidate && typeof candidate === 'object' && candidate.handlers instanceof Map && (typeof candidate.dispatchHostMessage === 'function' || typeof candidate.dispatchMessage === 'function'));
  if (!bus) throw new Error('Codex VS Code event bus was not found.');
  const dispatch = bus.dispatchHostMessage ?? bus.dispatchMessage;
  if ((bus.handlers.get('codex-micro-hid-event')?.size ?? 0) === 0) {
    dispatch.call(bus, ${JSON.stringify(DEVICE_STATE)});
  }
  const root = document.getElementById('root');
  const reactKey = root && Object.getOwnPropertyNames(root).find((key) => key.startsWith('__reactContainer$'));
  if (!root || !reactKey) throw new Error('Codex React root was not found.');

  let queue = [root[reactKey]];
  const seen = new Set();
  let found = null;
  while (queue.length && seen.size < 30000 && !found) {
    const fiber = queue.pop();
    if (!fiber || seen.has(fiber)) continue;
    seen.add(fiber);
    const maps = [];
    if (fiber.memoizedProps?.value instanceof Map) maps.push(fiber.memoizedProps.value);
    let dependency = fiber.dependencies?.firstContext;
    while (dependency) {
      if (dependency.memoizedValue instanceof Map) maps.push(dependency.memoizedValue);
      dependency = dependency.next;
    }
    for (const chain of maps) {
      const node = [...chain.values()].find((candidate) => candidate?.token === appScope.t);
      if (node) { found = { chain, node }; break; }
    }
    queue.push(fiber.child, fiber.sibling);
  }
  if (!found) throw new Error('Codex AppScope store was not found.');

  const atom = slotSignals.n.resolve(found.node, found.chain);
  const slots = found.node.store.get(atom);
  const [layout, agentSource, lightingAutoOff] = await Promise.all([
    getSetting(definitions.layout),
    getSetting(definitions.agentSource),
    getSetting(definitions.lightingAutoOff)
  ]);

  const html = document.documentElement;
  const body = document.body;
  const themeWords = [
    html.dataset.theme,
    html.dataset.colorScheme,
    html.className,
    body?.dataset?.theme,
    body?.className,
    getComputedStyle(html).colorScheme
  ].filter(Boolean).join(' ').toLowerCase();
  const explicitDark = /(^|[\\s_-])dark($|[\\s_-])/.test(themeWords);
  const explicitLight = /(^|[\\s_-])light($|[\\s_-])/.test(themeWords);
  const backgrounds = [body, document.getElementById('root'), html]
    .filter(Boolean)
    .map((element) => getComputedStyle(element).backgroundColor)
    .map((value) => value.match(/rgba?\\(([^)]+)\\)/)?.[1]?.split(',').map(Number))
    .filter((channels) => channels?.length >= 3 && (channels.length < 4 || channels[3] > 0));
  const background = backgrounds[0];
  const luminance = background
    ? (0.2126 * background[0] + 0.7152 * background[1] + 0.0722 * background[2]) / 255
    : null;
  const theme = explicitDark || (!explicitLight && (luminance != null ? luminance < 0.42 : matchMedia('(prefers-color-scheme: dark)').matches))
    ? 'dark'
    : 'light';

  return { slots, layout, agentSource, lightingAutoOff, theme };
})()`;

export class CodexMicroRendererBridge {
  private socket?: WebSocket;
  private nextId = 0;
  private pending = new Map<number, { resolve: (value: CdpResponse) => void; reject: (error: Error) => void; timer: NodeJS.Timeout }>();
  private connecting?: Promise<void>;
  private lastSnapshot?: MicroSnapshot;

  constructor(private readonly log: (message: string) => void) {}

  async refresh(): Promise<MicroSnapshot> {
    try {
      await this.ensureConnected();
      const snapshot = await this.evaluate<MicroSnapshot>(SNAPSHOT_EXPRESSION);
      this.lastSnapshot = snapshot;
      return snapshot;
    } catch (error) {
      this.disconnect();
      throw error;
    }
  }

  async sendAgent(slot: number, act: 0 | 1): Promise<void> {
    if (!Number.isInteger(slot) || slot < 0 || slot > 5) throw new Error(`Ungültiger Micro-Agent-Slot: ${slot}`);
    const snapshot = this.lastSnapshot ?? await this.refresh();
    const assignment = snapshot.slots.find((item) => item.id === slot);
    await this.dispatch("codex-micro-hid-event", {
      event: { key: `AG0${slot}`, act, slot, threadKey: assignment?.threadKey ?? null }
    }, "codex-micro-hid-event");
  }

  async sendAction(slot: MicroActionSlot, act: 0 | 1): Promise<void> {
    const key = slot === "ACT10_ACT11" ? "ACT10" : slot;
    await this.dispatch("codex-micro-hid-event", { event: { key, act, slot: null, threadKey: null } }, "codex-micro-hid-event");
  }

  async sendJoystick(direction: MicroDirection, distance: 0 | 1): Promise<void> {
    const angle: Record<MicroDirection, number> = { up: 0.75, right: 0, down: 0.25, left: 0.5 };
    await this.dispatch("codex-micro-joystick-event", { event: { angle: angle[direction], distance } }, "codex-micro-joystick-event");
  }

  async sendEncoder(act: 0 | 1): Promise<void> {
    await this.dispatch("codex-micro-hid-event", { event: { key: "ENC", act, slot: null, threadKey: null } }, "codex-micro-hid-event");
  }

  async adjustReasoning(direction: ReasoningAdjustment): Promise<void> {
    await this.ensureConnected();
    const command = REASONING_COMMANDS[direction];
    const expression = `(async () => {
      const urls = [
        ...[...document.querySelectorAll('link[href], script[src]')].map((element) => element.href || element.src),
        ...performance.getEntriesByType('resource').map((entry) => entry.name)
      ];
      const href = [...new Set(urls)].find((value) => value.includes('/assets/run-command-'));
      if (!href) throw new Error('Codex command runner is unavailable.');
      const commands = await import(href);
      if (typeof commands.i !== 'function') throw new Error('Codex command runner export changed.');
      const handled = commands.i(${JSON.stringify(command)}, 'codex_micro_hid');
      if (!handled) throw new Error('Codex reasoning command is not active in the current composer.');
      return true;
    })()`;
    try {
      await this.evaluate(expression);
    } catch (error) {
      this.disconnect();
      throw error;
    }
  }

  async runKeycap(keycapId: OfficialKeycapId): Promise<void> {
    if (!OFFICIAL_KEYCAP_IDS.includes(keycapId)) throw new Error(`Unknown Codex Micro keycap: ${keycapId}`);
    await this.ensureConnected();
    const expression = `(async () => {
      const urls = [...new Set([
        ...[...document.querySelectorAll('link[href], script[src]')].map((element) => element.href || element.src),
        ...performance.getEntriesByType('resource').map((entry) => entry.name)
      ])];
      const moduleUrl = (prefix) => urls.find((value) => value.includes('/assets/' + prefix));
      const layoutUrl = moduleUrl('codex-micro-layout-');
      const commandsUrl = moduleUrl('run-command-');
      const vscodeUrl = moduleUrl('vscode-api-');
      if (!layoutUrl || !commandsUrl || !vscodeUrl) throw new Error('Codex Micro command modules are unavailable.');
      const [layout, commands, vscode] = await Promise.all([import(layoutUrl), import(commandsUrl), import(vscodeUrl)]);
      const keycapGetter = Object.values(layout).find((candidate) => {
        if (typeof candidate !== 'function') return false;
        try { return candidate('FAST')?.id === 'FAST'; } catch { return false; }
      });
      if (typeof keycapGetter !== 'function') throw new Error('Codex Micro keycap registry changed.');
      const keycap = keycapGetter(${JSON.stringify(keycapId)});
      const action = keycap?.action;
      if (!action) throw new Error('The selected Codex Micro keycap has no action.');

      if (action.type === 'command') {
        if (typeof commands.i !== 'function') throw new Error('Codex command runner export changed.');
        const handled = commands.i(action.command, 'codex_micro_hid');
        if (!handled) throw new Error('This Codex command is not active in the current view.');
        return true;
      }

      const bus = [vscode.g, vscode.m, ...Object.values(vscode)].find((candidate) => candidate && typeof candidate === 'object' && (typeof candidate.dispatchHostMessage === 'function' || typeof candidate.dispatchMessage === 'function'));
      if (!bus) throw new Error('Codex VS Code event bus was not found.');
      if (action.type === 'external-url' && typeof bus.dispatchMessage === 'function') {
        bus.dispatchMessage('open-in-browser', { url: action.url, source: 'manual', initiator: 'open_in_browser_bridge' });
        return true;
      }
      if (action.type === 'composer-text' && typeof bus.dispatchHostMessage === 'function') {
        bus.dispatchHostMessage({ type: 'codex-micro-insert-composer-text', text: action.text });
        return true;
      }
      throw new Error('This Codex Micro keycap action is not supported as a standalone key.');
    })()`;
    try {
      await this.evaluate(expression);
    } catch (error) {
      this.disconnect();
      throw error;
    }
  }

  close(): void {
    this.disconnect();
  }

  private async dispatch(type: string, payload: object, requiredHandler: string): Promise<void> {
    await this.ensureConnected();
    const message = { type, ...payload };
    const expression = `(async () => {
      const href = [...document.querySelectorAll('link[rel="modulepreload"]')].map((link) => link.href).find((value) => value.includes('/assets/vscode-api-'));
      if (!href) throw new Error('Codex VS Code bridge module is unavailable.');
      const vscode = await import(href);
      const bus = [vscode.g, vscode.m, ...Object.values(vscode)].find((candidate) => candidate && typeof candidate === 'object' && candidate.handlers instanceof Map && (typeof candidate.dispatchHostMessage === 'function' || typeof candidate.dispatchMessage === 'function'));
      if (!bus) throw new Error('Codex VS Code event bus was not found.');
      const dispatch = bus.dispatchHostMessage ?? bus.dispatchMessage;
      if ((bus.handlers.get(${JSON.stringify(requiredHandler)})?.size ?? 0) === 0) {
        dispatch.call(bus, ${JSON.stringify(DEVICE_STATE)});
      }
      const deadline = Date.now() + 1200;
      while ((bus.handlers.get(${JSON.stringify(requiredHandler)})?.size ?? 0) === 0 && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      if ((bus.handlers.get(${JSON.stringify(requiredHandler)})?.size ?? 0) === 0) throw new Error('Codex Micro input handler is not active.');
      dispatch.call(bus, ${JSON.stringify(message)});
      return true;
    })()`;
    try {
      await this.evaluate(expression);
    } catch (error) {
      this.disconnect();
      throw error;
    }
  }

  private async ensureConnected(): Promise<void> {
    if (this.socket?.readyState === WebSocket.OPEN) return;
    if (this.connecting) return this.connecting;
    this.connecting = this.connect();
    try { await this.connecting; }
    finally { this.connecting = undefined; }
  }

  private async connect(): Promise<void> {
    const port = await discoverDebugPort();
    const targets = await fetchJson<DebugTarget[]>(`http://127.0.0.1:${port}/json/list`);
    const candidates = targets.filter((target) => target.type === "page" && target.webSocketDebuggerUrl && target.url.startsWith("app://"));
    const target = candidates.find((item) => !item.url.includes("initialRoute=")) ?? candidates[0];
    if (!target?.webSocketDebuggerUrl) throw new Error("Kein Codex-Hauptfenster mit Debug-Brücke gefunden.");

    const socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Zeitüberschreitung beim Verbinden mit Codex.")), 3000);
      socket.once("open", () => { clearTimeout(timer); resolve(); });
      socket.once("error", (error) => { clearTimeout(timer); reject(error); });
    });
    socket.on("message", (raw) => this.handleMessage(String(raw)));
    socket.on("close", () => this.disconnect(socket));
    socket.on("error", () => this.disconnect(socket));
    this.socket = socket;
    this.log(`Native Codex-Micro-Brücke verbunden (Port ${port}, ${target.url}).`);
  }

  private evaluate<T = unknown>(expression: string): Promise<T> {
    const socket = this.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) return Promise.reject(new Error("Codex-Micro-Brücke ist nicht verbunden."));
    const id = ++this.nextId;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error("Codex-Runtime-Antwort hat zu lange gedauert."));
      }, 5000);
      this.pending.set(id, {
        timer,
        reject,
        resolve: (message) => {
          if (message.error) return reject(new Error(message.error.message ?? "Unbekannter CDP-Fehler."));
          const result = message.result;
          if (result?.exceptionDetails) return reject(new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text ?? "Codex-Auswertung fehlgeschlagen."));
          resolve(result?.result?.value as T);
        }
      });
      socket.send(JSON.stringify({ id, method: "Runtime.evaluate", params: { expression, awaitPromise: true, returnByValue: true } }));
    });
  }

  private handleMessage(raw: string): void {
    let message: CdpResponse;
    try { message = JSON.parse(raw) as CdpResponse; }
    catch { return; }
    if (message.id == null) return;
    const pending = this.pending.get(message.id);
    if (!pending) return;
    this.pending.delete(message.id);
    clearTimeout(pending.timer);
    pending.resolve(message);
  }

  private disconnect(expected?: WebSocket): void {
    if (expected && this.socket !== expected) return;
    const socket = this.socket;
    this.socket = undefined;
    if (socket && socket.readyState === WebSocket.OPEN) socket.close();
    for (const { reject, timer } of this.pending.values()) {
      clearTimeout(timer);
      reject(new Error("Codex-Micro-Brücke wurde getrennt."));
    }
    this.pending.clear();
  }
}

async function discoverDebugPort(): Promise<number> {
  const fromFile = await readPortFile();
  if (fromFile && await isDebugPort(fromFile)) return fromFile;
  if (process.platform !== "win32") throw new Error("Die native Codex-Micro-Brücke ist derzeit für Windows eingerichtet.");

  const command = "$ports = Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'ChatGPT.exe' -and $_.CommandLine -match '--remote-debugging-port=(\\d+)' } | ForEach-Object { if ($_.CommandLine -match '--remote-debugging-port=(\\d+)') { $Matches[1] } }; $ports | Select-Object -Unique";
  const { stdout } = await execFileAsync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", command], { windowsHide: true, timeout: 4000 });
  for (const value of stdout.split(/\s+/)) {
    const port = Number.parseInt(value, 10);
    if (Number.isInteger(port) && await isDebugPort(port)) return port;
  }
  throw new Error("Codex wurde nicht über den Micro-Aktivierungsstarter geöffnet.");
}

async function readPortFile(): Promise<number | null> {
  try {
    const data = JSON.parse(await readFile(PORT_FILE, "utf8")) as { port?: unknown };
    const port = Number(data.port);
    return Number.isInteger(port) && port > 0 && port <= 65535 ? port : null;
  } catch { return null; }
}

async function isDebugPort(port: number): Promise<boolean> {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(750) });
    return response.ok;
  } catch { return false; }
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { signal: AbortSignal.timeout(1500) });
  if (!response.ok) throw new Error(`Codex-Debug-Endpunkt antwortete mit ${response.status}.`);
  return await response.json() as T;
}
