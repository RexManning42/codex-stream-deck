import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import WebSocket from "ws";
import { codexDeckStateRoot } from "./codex-deck-paths.js";
import { OFFICIAL_KEYCAP_IDS, type OfficialKeycapId } from "./keycaps.js";
import { CodexSessionOwnershipIndex } from "./session-ownership.js";
import type { MicroActionSlot, MicroDirection, MicroSnapshot, ReasoningAdjustment } from "./types.js";

type DebugTarget = {
  type: string;
  url: string;
  webSocketDebuggerUrl?: string;
};

export function selectCodexMainTarget(targets: DebugTarget[]): DebugTarget | undefined {
  const candidates = targets.filter((target) =>
    target.type === "page" && target.webSocketDebuggerUrl && target.url.startsWith("app://")
  );
  const isIndexDocument = (target: DebugTarget): boolean => {
    try { return new URL(target.url).pathname === "/index.html"; }
    catch { return false; }
  };
  const isAuxiliarySurface = (target: DebugTarget): boolean =>
    /avatar-overlay|composition-surface/i.test(target.url);

  return candidates.find((target) => isIndexDocument(target) && !new URL(target.url).search)
    ?? candidates.find(isIndexDocument)
    ?? candidates.find((target) => !isAuxiliarySurface(target) && !target.url.includes("initialRoute="))
    ?? candidates.find((target) => !isAuxiliarySurface(target));
}

type CdpResponse = {
  id?: number;
  result?: { result?: { value?: unknown; description?: string }; exceptionDetails?: { text?: string; exception?: { description?: string } } };
  error?: { message?: string };
};

export type AgentDispatchPlan =
  | { kind: "native"; slot: number; threadKey: string }
  | { kind: "direct"; threadKey: string };

export function resolveAgentDispatch(
  snapshot: MicroSnapshot,
  requestedSlot: number,
  expectedThreadKey?: string
): AgentDispatchPlan {
  const requested = snapshot.slots.find((item) => item.id === requestedSlot);
  const threadKey = expectedThreadKey ?? requested?.threadKey ?? null;
  if (!threadKey) throw new Error("The selected Codex task has no stable thread identity.");
  const current = snapshot.slots.find((item) => item.threadKey === threadKey);
  return current
    ? { kind: "native", slot: current.id, threadKey }
    : { kind: "direct", threadKey };
}

const execFileAsync = promisify(execFile);
const PORT_FILE = join(codexDeckStateRoot(), "codex-micro-bridge.json");
const DEVICE_STATE = {
  type: "codex-micro-device-state-changed",
  state: { status: "connected", error: null, battery: { percentage: 100, isCharging: true } }
};

export const REASONING_ENCODER_KEYS: Record<ReasoningAdjustment, "ENC_CW" | "ENC_CC"> = {
  decrease: "ENC_CW",
  increase: "ENC_CC"
};

// Codex labels the same conversation two ways: the sidebar row carries a host-prefixed
// key ("local:<uuid>") while the composer carries the bare uuid. Comparing them as raw
// strings can never match, so identity is the trailing uuid -- the same rule
// threadIdentity() in relay-protocol.ts already uses.
export function threadKeyIdentity(value: string | null | undefined): string {
  const text = value ?? "";
  return text.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)?.[0]?.toLowerCase() ?? text;
}

// Resolving Codex's command runner is identical whether the caller starts from a keycap
// or from a bare command id, so both embed this. Defines `resolved` = { fn, detail }.
const COMMAND_RUNNER_SOURCE = `
        const CACHE = Symbol.for('codex-deck-command-runner');
        const rejected = [];

        // Validation never calls the candidate: a speculative call could fire an arbitrary
        // command. Safety rests on provenance instead - the winner is the callee of a call
        // Codex itself makes with (<command id>, 'codex_micro_hid'), reached through a
        // static import binding.
        const usable = (fn) => {
          if (typeof fn !== 'function') return false;
          if (fn.length < 2) return false;
          const text = Function.prototype.toString.call(fn);
          if (/^\\s*class[\\s{]/.test(text)) return false;
          if (/\\{\\s*\\[native code\\]\\s*\\}/.test(text)) return false;
          return true;
        };

        const resolveFrom = async (sourceUrl) => {
          let text;
          try { text = await (await fetch(sourceUrl)).text(); } catch { return null; }
          let sites = collectRunnerCallSites(text, /^codex_micro_hid$/).filter(isRunnerCallSite);
          if (!sites.length) sites = collectRunnerCallSites(text, /^codex_micro_[a-z_]+$/).filter(isRunnerCallSite);
          if (!sites.length) return null;
          const score = (name) => sites.filter((site) => site.callee === name)
            .reduce((total, site) => total + (site.literalFirstArg ? 10 : 1), 0);
          const ranked = [...new Set(sites.map((site) => site.callee))].sort((a, b) => score(b) - score(a));
          const importPattern = /import\\s*\\{([^}]*)\\}\\s*from\\s*["']([^"']+)["']/g;
          for (const callee of ranked) {
            let found = null;
            let sawBinding = false;
            importPattern.lastIndex = 0;
            for (let match = importPattern.exec(text); match && !found; match = importPattern.exec(text)) {
              for (const specifier of match[1].split(',')) {
                const parts = specifier.trim().split(/\\s+as\\s+/);
                const exportName = parts[0];
                const localName = parts[1] ?? parts[0];
                if (localName !== callee) continue;
                sawBinding = true;
                const where = match[2].split('/').pop() + '#' + exportName;
                let namespace = null;
                try { namespace = await import(new URL(match[2], sourceUrl).href); } catch {}
                const fn = namespace ? namespace[exportName] : null;
                if (usable(fn)) found = { fn, detail: callee + ' -> ' + where };
                else rejected.push(callee + ' (' + where + ' is ' + (typeof fn === 'function' ? 'arity ' + fn.length : String(fn === null ? 'unresolvable' : typeof fn)) + ')');
                break;
              }
            }
            if (found) return found;
            if (!sawBinding) rejected.push(callee + ' (local function, no import binding)');
          }
          return null;
        };

        let resolved = globalThis[CACHE];
        if (!resolved || resolved.url !== bridgeUrl) {
          resolved = null;
          const searched = [bridgeUrl, ...urls.filter((url) => url.includes('/assets/codex-micro-') && url !== bridgeUrl)];
          for (const url of searched) {
            if (!url) continue;
            const hit = await resolveFrom(url);
            if (hit) { resolved = { url: bridgeUrl, fn: hit.fn, detail: hit.detail }; break; }
          }
          // The module hash rotates on every Codex build, so this self-invalidates.
          if (resolved) globalThis[CACHE] = resolved;
        }
        if (!resolved) {
          throw new Error('Codex command runner not found in ' + (bridgeUrl ? bridgeUrl.split('/').pop() : 'the Codex bundle')
            + '. Rejected: ' + (rejected.length ? rejected.join('; ') : 'no two-argument call sites') + '.');
        }

        // Single-shot: a throw may have left side effects, and a falsy result is Codex
        // reporting no active handler, not a reason to try a different function.
`;

export type CodexThread = {
  threadKey: string;
  title: string;
  pinned: boolean;
  active: boolean;
};

export type CodexCommand = {
  id: string;
  /** "webview" commands reach the runner; "electron-only" ones resolve but never handle. */
  kind: string;
  group: string | null;
  title: string | null;
  keycapId: string | null;
};

export type RunnerCallSite = {
  callee: string;
  argIndex: number;
  argCount: number;
  literalFirstArg: boolean;
  member: boolean;
};

// Locates calls shaped like `runner(<command id>, "codex_micro_hid")` inside a minified
// bundle, so the command runner can be found by how Codex itself calls it rather than by
// any minified name.
//
// This has to be a structural scan rather than a regex. Codex now reaches the runner
// through a three-argument capability gate -- `tn(ctx, keycap.command, "codex_micro_hid")`
// -- and a regex cannot count arguments, so the previous pattern silently matched nothing
// and every standalone keycap died. Counting arguments lets us reject that wrapper on
// position alone: the gate is a local function we could not resolve anyway, while the
// two-argument form it delegates to is a static import we can.
export function collectRunnerCallSites(source: string, literal: RegExp): RunnerCallSite[] {
  // Mark string and template regions so quoted parentheses and commas cannot desync the
  // backward scan.
  const mask = new Uint8Array(source.length);
  let quote = "";
  for (let index = 0; index < source.length; index++) {
    const character = source[index];
    if (quote) {
      mask[index] = 1;
      if (character === "\\") { if (index + 1 < source.length) mask[index + 1] = 1; index++; continue; }
      if (character === quote) quote = "";
      continue;
    }
    if (character === '"' || character === "'" || character === "`") { quote = character; mask[index] = 1; }
  }

  const sites: RunnerCallSite[] = [];
  const scan = /["'`](codex_micro_[a-z_]+)["'`]/g;
  for (let match = scan.exec(source); match; match = scan.exec(source)) {
    if (!literal.test(match[1] ?? "")) continue;
    const quoteStart = match.index;

    // The literal has to be the final argument of the call.
    let after = quoteStart + match[0].length;
    while (after < source.length && /\s/.test(source[after] ?? "")) after++;
    if (source[after] !== ")") continue;

    // Walk back to the opening paren, counting top-level commas on the way.
    let index = quoteStart - 1;
    let depth = 0;
    let commas = 0;
    let open = -1;
    while (index >= 0) {
      if (mask[index]) { index--; continue; }
      const character = source[index];
      if (character === ")" || character === "]" || character === "}") depth++;
      else if (character === "(" || character === "[" || character === "{") {
        if (depth === 0) { if (character === "(") open = index; break; }
        depth--;
      } else if (character === "," && depth === 0) commas++;
      index--;
    }
    if (open < 0) continue;

    let end = open - 1;
    while (end >= 0 && /\s/.test(source[end] ?? "")) end--;
    const nameEnd = end;
    while (end >= 0 && /[A-Za-z0-9_$]/.test(source[end] ?? "")) end--;
    const callee = source.slice(end + 1, nameEnd + 1);
    if (!callee) continue;

    const firstArg = source.slice(open + 1, quoteStart).replace(/,\s*$/, "").trim();
    sites.push({
      callee,
      argIndex: commas,
      argCount: commas + 1,
      // A quoted first argument proves the parameter is a command id rather than a context.
      literalFirstArg: /^["'`][^"'`\\]*["'`]$/.test(firstArg),
      member: end >= 0 && source[end] === "."
    });
  }
  return sites;
}

// A usable runner is called as `f(<command id>, "codex_micro_hid")`: second of exactly two
// arguments, and not a member expression (we can only resolve bare import bindings).
export function isRunnerCallSite(site: RunnerCallSite): boolean {
  return site.argIndex === 1 && site.argCount === 2 && !site.member;
}

const SNAPSHOT_EXPRESSION = `(async () => {
  const urls = [...new Set([
    ...[...document.querySelectorAll('link[href], script[src]')].map((element) => element.href || element.src),
    ...performance.getEntriesByType('resource').map((entry) => entry.name)
  ])].filter((url) => url.includes('/assets/') && url.endsWith('.js'));
  const slotSignalsUrl = urls.find((url) => url.includes('/assets/codex-micro-slot-signals-'));
  if (!slotSignalsUrl) throw new Error('Codex Micro slot signals are not loaded.');

  const namespaces = [];
  for (const url of urls) {
    try { namespaces.push(await import(url)); } catch {}
  }
  const exportedValues = namespaces.flatMap((namespace) => Object.values(namespace));
  const definitions = exportedValues.find((candidate) =>
    candidate && typeof candidate === 'object' &&
    candidate.layout?.key === 'codex-micro-layout' &&
    candidate.agentSource?.key === 'codex-micro-agent-source'
  );
  if (!definitions) throw new Error('Codex Micro settings definitions were not found.');

  const bus = exportedValues.find((candidate) => candidate && typeof candidate === 'object' && candidate.handlers instanceof Map && (typeof candidate.dispatchHostMessage === 'function' || typeof candidate.dispatchMessage === 'function'));
  if (!bus) throw new Error('Codex VS Code event bus was not found.');
  const dispatch = bus.dispatchHostMessage ?? bus.dispatchMessage;
  if ((bus.handlers.get('codex-micro-hid-event')?.size ?? 0) === 0) {
    dispatch.call(bus, ${JSON.stringify(DEVICE_STATE)});
  }
  const root = document.getElementById('root');
  const reactKey = root && Object.getOwnPropertyNames(root).find((key) => key.startsWith('__reactContainer$'));
  if (!root || !reactKey) throw new Error('Codex React root was not found.');

  const slotSignals = await import(slotSignalsUrl);
  const resolvers = Object.values(slotSignals).filter((candidate) =>
    candidate && typeof candidate === 'object' &&
    typeof candidate.resolve === 'function' &&
    typeof candidate.createSubscriberAtom === 'function'
  );
  if (resolvers.length === 0) throw new Error('Codex Micro slot resolver was not found.');

  let queue = [root[reactKey]];
  const seen = new Set();
  const queryClients = new Set();
  let found = null;
  while (queue.length && seen.size < 30000 && !found) {
    const fiber = queue.pop();
    if (!fiber || seen.has(fiber)) continue;
    seen.add(fiber);
    const maps = [];
    const contextValues = [fiber.memoizedProps?.value];
    let dependency = fiber.dependencies?.firstContext;
    while (dependency) {
      contextValues.push(dependency.memoizedValue);
      dependency = dependency.next;
    }
    for (const value of contextValues) {
      if (value instanceof Map) maps.push(value);
      if (value && typeof value.getQueryCache === 'function' && typeof value.getQueryData === 'function') queryClients.add(value);
    }
    for (const chain of maps) {
      for (const node of chain.values()) {
        if (!node?.store || typeof node.store.get !== 'function') continue;
        for (const resolver of resolvers) {
          try {
            const atom = resolver.resolve(node, chain);
            const slots = node.store.get(atom);
            if (Array.isArray(slots) && slots.length === 6 && slots.every((slot, index) => slot?.id === index)) {
              found = { chain, node, slots };
              break;
            }
          } catch {}
        }
        if (found) break;
      }
      if (found) break;
    }
    queue.push(fiber.child, fiber.sibling);
  }
  if (!found) throw new Error('Codex Micro slot store was not found.');

  let layout = definitions.layout.default;
  let agentSource = definitions.agentSource.default;
  let lightingAutoOff = definitions.lightingAutoOff?.default ?? '3-minutes';

  let settingsResolved = false;
  const directSettingReader = exportedValues.find((candidate) => {
    if (typeof candidate !== 'function' || candidate.length !== 1) return false;
    const source = Function.prototype.toString.call(candidate);
    return source.includes('get-setting') && source.includes('.default');
  });
  if (directSettingReader) {
    try {
      const candidateLayout = await directSettingReader(definitions.layout);
      const candidateAgentSource = await directSettingReader(definitions.agentSource);
      const candidateLightingAutoOff = definitions.lightingAutoOff
        ? await directSettingReader(definitions.lightingAutoOff)
        : lightingAutoOff;
      if (
        candidateLayout?.version === 1 &&
        typeof candidateLayout.slots === 'object' &&
        ['pinned', 'recent', 'priority', 'custom'].includes(candidateAgentSource)
      ) {
        layout = candidateLayout;
        agentSource = candidateAgentSource;
        if (typeof candidateLightingAutoOff === 'string') lightingAutoOff = candidateLightingAutoOff;
        settingsResolved = true;
      }
    } catch {}
  }

  if (!settingsResolved) {
    const settingReaders = exportedValues.filter((candidate) => {
      if (typeof candidate !== 'function' || candidate.length !== 2) return false;
      const source = Function.prototype.toString.call(candidate);
      return source.includes('.key') && source.includes('.default');
    });
    const getStoreValue = found.node.store.get.bind(found.node.store);
    for (const readSetting of settingReaders) {
      try {
        const candidateLayout = await readSetting(getStoreValue, definitions.layout);
        const candidateAgentSource = await readSetting(getStoreValue, definitions.agentSource);
        const candidateLightingAutoOff = definitions.lightingAutoOff
          ? await readSetting(getStoreValue, definitions.lightingAutoOff)
          : lightingAutoOff;
        if (candidateLayout?.version !== 1 || typeof candidateLayout.slots !== 'object') continue;
        if (!['pinned', 'recent', 'priority', 'custom'].includes(candidateAgentSource)) continue;
        layout = candidateLayout;
        agentSource = candidateAgentSource;
        if (typeof candidateLightingAutoOff === 'string') lightingAutoOff = candidateLightingAutoOff;
        break;
      } catch {}
    }
  }
  const toEpoch = (value) => {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value < 100000000000 ? value * 1000 : value;
    if (typeof value === 'string') {
      const parsed = Date.parse(value);
      if (Number.isFinite(parsed)) return parsed;
    }
    return undefined;
  };
  const slots = found.slots.map((slot) => ({
    ...slot,
    activityAt: toEpoch(slot.activityAt) ?? toEpoch(slot.updatedAt) ?? toEpoch(slot.lastActivityAt) ??
      toEpoch(slot.thread?.updatedAt) ?? toEpoch(slot.task?.updatedAt)
  }));

  let usage;
  for (const client of queryClients) {
    try {
      const query = client.getQueryCache().getAll().find((candidate) =>
        JSON.stringify(candidate.queryKey) === '["rate-limit-status"]'
      );
      const refreshKey = Symbol.for('codex-deck-rate-limit-refresh-at');
      const now = Date.now();
      const dataUpdatedAt = Number(query?.state?.dataUpdatedAt) || 0;
      const lastRefreshAttempt = Number(globalThis[refreshKey]) || 0;
      if (query && typeof query.fetch === 'function' && now - dataUpdatedAt >= 15000 && now - lastRefreshAttempt >= 15000) {
        globalThis[refreshKey] = now;
        // Rate-limit refresh is network-backed and must never hold agent status,
        // selection, or lighting behind its response. A later snapshot reads
        // the refreshed query cache once this best-effort request completes.
        try { Promise.resolve(query.fetch()).catch(() => {}); } catch {}
      }
      const data = query?.state?.data;
      const rateLimit = data?.rate_limit;
      if (!rateLimit || typeof rateLimit !== 'object') continue;
      const normalizeWindow = (window, role) => {
        if (!window || typeof window !== 'object') return null;
        const used = Number(window.used_percent);
        if (!Number.isFinite(used)) return null;
        const seconds = Number(window.limit_window_seconds);
        const minutes = Number.isFinite(seconds) && seconds > 0 ? seconds / 60 : null;
        const kind = minutes != null && Math.abs(minutes - 300) <= 1 ? 'five-hour'
          : minutes != null && Math.abs(minutes - 10080) <= 1 ? 'weekly'
            : 'other';
        const usedPercent = Math.min(100, Math.max(0, used));
        return {
          id: kind === 'other' ? role + '-' + String(minutes ?? 'unknown') : kind,
          kind,
          usedPercent,
          remainingPercent: 100 - usedPercent,
          windowDurationMins: minutes,
          resetsAt: toEpoch(window.reset_at) ?? null
        };
      };
      const windows = [
        normalizeWindow(rateLimit.primary_window, 'primary'),
        normalizeWindow(rateLimit.secondary_window, 'secondary')
      ].filter(Boolean);
      const available = Number(data.rate_limit_reset_credits?.available_count);
      const applicable = Number(data.rate_limit_reset_credits?.applicable_available_count);
      usage = {
        windows,
        observedAt: Number.isFinite(query.state?.dataUpdatedAt) && query.state.dataUpdatedAt > 0
          ? query.state.dataUpdatedAt
          : Date.now(),
        resetCreditsAvailable: Number.isFinite(available) ? Math.max(0, Math.floor(available)) : null,
        resetCreditsApplicable: Number.isFinite(applicable) ? Math.max(0, Math.floor(applicable)) : null
      };
      break;
    } catch {}
  }

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
  const activeThreadElement = document.querySelector('[data-app-action-sidebar-thread-id][data-app-action-sidebar-thread-active="true"]')
    ?? document.querySelector('[data-app-action-sidebar-thread-id][aria-current="page"]');
  const activeThreadKey = activeThreadElement?.getAttribute('data-app-action-sidebar-thread-id')
    ?? document.querySelector('[data-above-composer-conversation-id]')
      ?.getAttribute('data-above-composer-conversation-id')
    ?? undefined;
  const activeThreadTitle = activeThreadElement
    ? (activeThreadElement.getAttribute('aria-label') ?? activeThreadElement.textContent ?? '').trim().slice(0, 240) || undefined
    : undefined;

  return { slots, activeThreadKey, activeThreadTitle, layout, agentSource, lightingAutoOff, theme, ...(usage ? { usage } : {}) };
})()`;

// Distinguishes a renderer-side failure (the page answered, with an exception) from a
// transport failure (socket closed, CDP error, timeout). Only the latter is a reason to
// tear down and rebuild the connection.
export class RendererEvaluationError extends Error {
  constructor(message: string, readonly kind: "page" | "transport") {
    super(message);
    this.name = "RendererEvaluationError";
  }
}

export class CodexMicroRendererBridge {
  private socket?: WebSocket;
  private nextId = 0;
  private pending = new Map<number, { resolve: (value: CdpResponse) => void; reject: (error: Error) => void; timer: NodeJS.Timeout }>();
  private connecting?: Promise<void>;
  private lastSnapshot?: MicroSnapshot;
  private readonly sessionOwnership = new CodexSessionOwnershipIndex();
  private readonly evaluationNamespace = randomUUID();
  private loggedRunner?: string;

  constructor(private readonly log: (message: string) => void) {}

  async refresh(): Promise<MicroSnapshot> {
    try {
      await this.ensureConnected();
      const nativeSnapshot = await this.evaluate<MicroSnapshot>(SNAPSHOT_EXPRESSION);
      const snapshot = await this.sessionOwnership.annotate(nativeSnapshot);
      this.lastSnapshot = snapshot;
      return snapshot;
    } catch (error) {
      this.disconnect();
      throw error;
    }
  }

  async sendAgent(slot: number, act: 0 | 1, expectedThreadKey?: string): Promise<void> {
    if (!Number.isInteger(slot) || slot < 0 || slot > 5) throw new Error(`Ungültiger Micro-Agent-Slot: ${slot}`);
    const snapshot = act === 1 ? await this.refresh() : this.lastSnapshot ?? await this.refresh();
    const plan = resolveAgentDispatch(snapshot, slot, expectedThreadKey);
    if (plan.kind === "native") {
      if (plan.slot !== slot) {
        this.log(`Agent slot ${slot + 1} changed before dispatch; using current native slot ${plan.slot + 1}.`);
      }
      await this.dispatch("codex-micro-hid-event", {
        event: { key: `AG0${plan.slot}`, act, slot: plan.slot, threadKey: plan.threadKey }
      }, "codex-micro-hid-event");
      if (act === 0) return;
    } else {
      if (act === 0) return;
      this.log(`Task ${plan.threadKey} is outside this host's six native Micro slots; opening its exact thread identity.`);
    }
    await this.ensureThreadActivated(plan.threadKey);
    this.sessionOwnership.markOpened(plan.threadKey);
  }

  private async ensureThreadActivated(threadKey: string): Promise<void> {
    const result = await this.evaluate<"active" | "opened" | "missing" | "failed">(`(async () => {
      ${threadKeyIdentity.toString()}
      const wanted = threadKeyIdentity(${JSON.stringify(threadKey)});
      const activeThreadKey = () => document.querySelector('[data-above-composer-conversation-id]')
        ?.getAttribute('data-above-composer-conversation-id')
        ?? document.querySelector('[data-app-action-sidebar-thread-id][data-app-action-sidebar-thread-active="true"]')
          ?.getAttribute('data-app-action-sidebar-thread-id')
        ?? document.querySelector('[data-app-action-sidebar-thread-id][aria-current="page"]')
          ?.getAttribute('data-app-action-sidebar-thread-id')
        ?? null;
      const isActive = () => {
        const current = activeThreadKey();
        return current != null && threadKeyIdentity(current) === wanted;
      };
      const waitForActive = async (duration) => {
        const deadline = Date.now() + duration;
        while (Date.now() < deadline) {
          if (isActive()) return true;
          await new Promise((resolve) => setTimeout(resolve, 25));
        }
        return isActive();
      };
      if (await waitForActive(250)) return 'active';
      const item = [...document.querySelectorAll('[data-app-action-sidebar-thread-id]')]
        .find((element) => threadKeyIdentity(element.getAttribute('data-app-action-sidebar-thread-id')) === wanted);
      if (!item) return 'missing';
      const selector = 'button, a, [role="button"], [role="link"]';
      const clickable = item.matches(selector) ? item : item.querySelector(selector) ?? item.closest(selector) ?? item;
      if (typeof clickable.click === 'function') clickable.click();
      else clickable.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
      return await waitForActive(1500) ? 'opened' : 'failed';
    })()`);
    if (result === "active" || result === "opened") return;
    if (result === "missing") {
      throw new Error("The exact Codex task is not present in this host's loaded sidebar. Open or pin it once in Codex, then retry.");
    }
    throw new Error("Codex received the task selection but did not activate the requested thread.");
  }

  /** Runs any command in Codex's registry, not only the ~29 that have Micro keycap artwork. */
  async runCommand(commandId: string): Promise<void> {
    await this.ensureConnected();
    const expression = `(async () => {
      ${collectRunnerCallSites.toString()}
      ${isRunnerCallSite.toString()}
      const urls = [...new Set([
        ...[...document.querySelectorAll('link[href], script[src]')].map((element) => element.href || element.src),
        ...performance.getEntriesByType('resource').map((entry) => entry.name)
      ])].filter((url) => url.includes('/assets/') && url.endsWith('.js'));
      const bridgeUrl = urls.find((value) => value.includes('/assets/codex-micro-bridge-'));
      ${COMMAND_RUNNER_SOURCE}
      const handled = resolved.fn(${JSON.stringify(commandId)}, 'codex_micro_hid');
      // Electron-only commands resolve but never handle: the webview runner cannot reach them.
      if (!handled) throw new Error('This Codex command is not active in the current view.');
      return { runner: resolved.detail };
    })()`;
    try {
      const result = await this.evaluate<{ runner?: string }>(expression);
      if (result?.runner && this.loggedRunner !== result.runner) {
        this.loggedRunner = result.runner;
        this.log(`Codex command runner resolved: ${result.runner}.`);
      }
    } catch (error) {
      if (!(error instanceof RendererEvaluationError) || error.kind !== "page") this.disconnect();
      throw error;
    }
  }

  /** Codex's own command registry, read live so it follows app updates rather than a baked list. */
  async listCommands(): Promise<CodexCommand[]> {
    await this.ensureConnected();
    const expression = `(async () => {
      const urls = [...new Set([
        ...[...document.querySelectorAll('link[href], script[src]')].map((element) => element.href || element.src),
        ...performance.getEntriesByType('resource').map((entry) => entry.name)
      ])].filter((url) => url.includes('/assets/') && url.endsWith('.js'));

      // The registry is the largest exported array of objects carrying an id and a kind.
      let registry = null;
      for (const url of urls) {
        let namespace;
        try { namespace = await import(url); } catch { continue; }
        for (const value of Object.values(namespace)) {
          if (!Array.isArray(value) || value.length < 20) continue;
          const first = value[0];
          if (!first || typeof first !== 'object' || !('id' in first) || !('kind' in first)) continue;
          if (!registry || value.length > registry.length) registry = value;
        }
      }
      if (!registry) throw new Error('Codex command registry was not found.');

      // Each Micro keycap names the command it runs, so existing artwork can be reused.
      const keycapByCommand = {};
      const layoutUrl = urls.find((value) => value.includes('/assets/codex-micro-layout-'));
      if (layoutUrl) {
        const layout = await import(layoutUrl);
        const getter = Object.values(layout).find((candidate) => {
          if (typeof candidate !== 'function') return false;
          try { return candidate('FAST')?.id === 'FAST'; } catch { return false; }
        });
        if (getter) {
          for (const id of ${JSON.stringify(OFFICIAL_KEYCAP_IDS)}) {
            const keycap = getter(id);
            const command = keycap?.action?.commandId ?? keycap?.action?.command;
            if (keycap && keycap.id === id && command) keycapByCommand[command] = id;
          }
        }
      }

      return registry.map((command) => ({
        id: command.id,
        kind: command.kind,
        group: command.commandMenuGroupKey ?? null,
        title: command.titleIntlId ?? null,
        keycapId: keycapByCommand[command.id] ?? null
      }));
    })()`;
    return await this.evaluate<CodexCommand[]>(expression);
  }

  /**
   * Conversations in Codex's sidebar. Micro slot signals only cover the six Codex agent
   * slots and go empty in ChatGPT mode, so chat-side features read the sidebar instead.
   */
  async listThreads(limit = 24): Promise<CodexThread[]> {
    await this.ensureConnected();
    const expression = `(() => {
      const rows = [...document.querySelectorAll('[data-app-action-sidebar-thread-id]')];
      const seen = new Set();
      const threads = [];
      for (const row of rows) {
        const threadKey = row.getAttribute('data-app-action-sidebar-thread-id');
        if (!threadKey || seen.has(threadKey)) continue;
        seen.add(threadKey);
        const title = row.getAttribute('data-app-action-sidebar-thread-title')
          ?? row.getAttribute('aria-label') ?? '';
        threads.push({
          threadKey,
          title: String(title).replace(/\s+/g, ' ').trim().slice(0, 120),
          pinned: row.getAttribute('data-app-action-sidebar-thread-pinned') === 'true',
          active: row.getAttribute('data-app-action-sidebar-thread-active') === 'true'
        });
        if (threads.length >= ${Math.max(1, Math.min(64, Math.trunc(limit)))}) break;
      }
      return threads;
    })()`;
    return await this.evaluate<CodexThread[]>(expression);
  }

  /** Opens a sidebar conversation by its thread key. */
  async openThread(threadKey: string): Promise<void> {
    await this.ensureConnected();
    await this.ensureThreadActivated(threadKey);
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
    await this.dispatch("codex-micro-hid-event", {
      event: { key: REASONING_ENCODER_KEYS[direction], act: 2, slot: null, threadKey: null }
    }, "codex-micro-hid-event");
  }

  async runKeycap(keycapId: OfficialKeycapId): Promise<void> {
    if (!OFFICIAL_KEYCAP_IDS.includes(keycapId)) throw new Error(`Unknown Codex Micro keycap: ${keycapId}`);
    await this.ensureConnected();
    const expression = `(async () => {
      ${collectRunnerCallSites.toString()}
      ${isRunnerCallSite.toString()}

      const urls = [...new Set([
        ...[...document.querySelectorAll('link[href], script[src]')].map((element) => element.href || element.src),
        ...performance.getEntriesByType('resource').map((entry) => entry.name)
      ])].filter((url) => url.includes('/assets/') && url.endsWith('.js'));
      const moduleUrl = (prefix) => urls.find((value) => value.includes('/assets/' + prefix));
      const layoutUrl = moduleUrl('codex-micro-layout-');
      const bridgeUrl = moduleUrl('codex-micro-bridge-');
      if (!layoutUrl) throw new Error('Codex Micro keycap registry is unavailable.');
      const layout = await import(layoutUrl);
      const keycapGetter = Object.values(layout).find((candidate) => {
        if (typeof candidate !== 'function') return false;
        try { return candidate('FAST')?.id === 'FAST'; } catch { return false; }
      });
      if (typeof keycapGetter !== 'function') throw new Error('Codex Micro keycap registry changed.');
      const wanted = ${JSON.stringify(keycapId)};
      const keycap = keycapGetter(wanted);
      // Codex's getter returns its first keycap for an unrecognised id, so without this an
      // id Codex has dropped would silently fire FAST instead of reporting the problem.
      if (!keycap || keycap.id !== wanted) throw new Error('Codex no longer defines the ' + wanted + ' keycap.');
      const action = keycap.action;
      if (!action) throw new Error('The selected Codex Micro keycap has no action.');

      if (action.type === 'command') {
        ${COMMAND_RUNNER_SOURCE}
        const handled = resolved.fn(action.command, 'codex_micro_hid');
        if (!handled) throw new Error('This Codex command is not active in the current view.');
        return { runner: resolved.detail };
      }

      let bus = null;
      for (const url of urls) {
        try {
          const namespace = await import(url);
          bus = Object.values(namespace).find((candidate) => candidate && typeof candidate === 'object' && candidate.handlers instanceof Map && (typeof candidate.dispatchHostMessage === 'function' || typeof candidate.dispatchMessage === 'function'));
          if (bus) break;
        } catch {}
      }
      if (!bus) throw new Error('Codex VS Code event bus was not found.');
      if (action.type === 'external-url' && typeof bus.dispatchMessage === 'function') {
        bus.dispatchMessage('open-in-browser', { url: action.url, source: 'manual', initiator: 'open_in_browser_bridge' });
        return { runner: 'event-bus' };
      }
      if (action.type === 'composer-text' && typeof bus.dispatchHostMessage === 'function') {
        bus.dispatchHostMessage({ type: 'codex-micro-insert-composer-text', text: action.text });
        return { runner: 'event-bus' };
      }
      throw new Error('This Codex Micro keycap action is not supported as a standalone key.');
    })()`;
    try {
      const result = await this.evaluate<{ runner?: string }>(expression);
      if (result?.runner && this.loggedRunner !== result.runner) {
        this.loggedRunner = result.runner;
        this.log(`Codex command runner resolved: ${result.runner}.`);
      }
    } catch (error) {
      // A renderer exception proves the socket is healthy; reconnecting cannot fix page
      // state and would cost a full port rediscovery on every press.
      if (!(error instanceof RendererEvaluationError) || error.kind !== "page") this.disconnect();
      throw error;
    }
  }

  async consumeRateLimitReset(): Promise<void> {
    await this.ensureConnected();
    const redeemRequestId = randomUUID();
    const expression = `(async () => {
      const urls = [...new Set([
        ...[...document.querySelectorAll('link[href], script[src]')].map((element) => element.href || element.src),
        ...performance.getEntriesByType('resource').map((entry) => entry.name)
      ])].filter((url) => url.includes('/assets/') && url.endsWith('.js'));
      let client = null;
      for (const url of urls) {
        try {
          const namespace = await import(url);
          client = Object.values(namespace).find((candidate) =>
            candidate && typeof candidate === 'object' &&
            typeof candidate.safeGet === 'function' && typeof candidate.safePost === 'function'
          );
          if (client) break;
        } catch {}
      }
      if (!client) throw new Error('Codex usage client is unavailable.');

      const summary = await client.safeGet('/wham/usage');
      const applicable = Number(summary?.rate_limit_reset_credits?.applicable_available_count);
      if (Number.isFinite(applicable) && applicable <= 0) throw new Error('No reset credit is currently applicable.');

      const details = await client.safeGet('/wham/rate-limit-reset-credits');
      const credit = Array.isArray(details?.credits)
        ? details.credits.find((candidate) => candidate?.status === 'available' && candidate?.is_supported_by_plan !== false)
        : null;
      if (!credit?.id) throw new Error('No available reset credit was found.');
      const result = await client.safePost('/wham/rate-limit-reset-credits/consume', {
        requestBody: { credit_id: credit.id, redeem_request_id: ${JSON.stringify(redeemRequestId)} }
      });
      if (result?.code !== 'reset' && result?.code !== 'already_redeemed') {
        throw new Error('Codex rejected the reset credit: ' + String(result?.code ?? 'unknown'));
      }

      try {
        const refreshed = await client.safeGet('/wham/usage');
        const root = document.getElementById('root');
        const reactKey = root && Object.getOwnPropertyNames(root).find((key) => key.startsWith('__reactContainer$'));
        const queue = reactKey ? [root[reactKey]] : [];
        const seen = new Set();
        while (queue.length && seen.size < 30000) {
          const fiber = queue.pop();
          if (!fiber || seen.has(fiber)) continue;
          seen.add(fiber);
          const values = [fiber.memoizedProps?.value];
          let dependency = fiber.dependencies?.firstContext;
          while (dependency) { values.push(dependency.memoizedValue); dependency = dependency.next; }
          const queryClient = values.find((value) =>
            value && typeof value.setQueryData === 'function' && typeof value.invalidateQueries === 'function'
          );
          if (queryClient) {
            queryClient.setQueryData(['rate-limit-status'], refreshed);
            void queryClient.invalidateQueries({ queryKey: ['rate-limit-reset-credits'] });
            break;
          }
          queue.push(fiber.child, fiber.sibling);
        }
      } catch {}
      return result.code;
    })()`;
    try {
      await this.evaluate(expression);
      this.lastSnapshot = undefined;
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
      const urls = [...new Set([
        ...[...document.querySelectorAll('link[href], script[src]')].map((element) => element.href || element.src),
        ...performance.getEntriesByType('resource').map((entry) => entry.name)
      ])].filter((url) => url.includes('/assets/') && url.endsWith('.js'));
      let bus = null;
      for (const url of urls) {
        try {
          const namespace = await import(url);
          bus = Object.values(namespace).find((candidate) => candidate && typeof candidate === 'object' && candidate.handlers instanceof Map && (typeof candidate.dispatchHostMessage === 'function' || typeof candidate.dispatchMessage === 'function'));
          if (bus) break;
        } catch {}
      }
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
    const target = selectCodexMainTarget(targets);
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
    if (!socket || socket.readyState !== WebSocket.OPEN) return Promise.reject(new RendererEvaluationError("Codex-Micro-Brücke ist nicht verbunden.", "transport"));
    const id = ++this.nextId;
    // CDP may garbage-collect an awaited Runtime.evaluate promise while a
    // renderer handler or dynamic import is still pending. Keep the exact
    // promise reachable from the renderer until after our own timeout.
    const retainedExpression = retainEvaluationPromise(expression, `${this.evaluationNamespace}-${id}`);
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new RendererEvaluationError("Codex-Runtime-Antwort hat zu lange gedauert.", "transport"));
      }, 5000);
      this.pending.set(id, {
        timer,
        reject,
        resolve: (message) => {
          if (message.error) return reject(new RendererEvaluationError(message.error.message ?? "Unbekannter CDP-Fehler.", "transport"));
          const result = message.result;
          if (result?.exceptionDetails) return reject(new RendererEvaluationError(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text ?? "Codex-Auswertung fehlgeschlagen.", "page"));
          resolve(result?.result?.value as T);
        }
      });
      socket.send(JSON.stringify({ id, method: "Runtime.evaluate", params: { expression: retainedExpression, awaitPromise: true, returnByValue: true } }));
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

export function retainEvaluationPromise(expression: string, id: string | number): string {
  const key = `codex-deck-${id}`;
  return `(() => {
    const store = globalThis.__codexDeckPendingEvaluations ??= new Map();
    const pending = Promise.resolve((${expression}));
    store.set(${JSON.stringify(key)}, pending);
    setTimeout(() => store.delete(${JSON.stringify(key)}), 10000);
    return pending;
  })()`;
}

async function discoverDebugPort(): Promise<number> {
  const fromFile = await readPortFile();
  if (fromFile && await isDebugPort(fromFile)) return fromFile;
  if (process.platform === "darwin") {
    const { stdout } = await execFileAsync("/bin/ps", ["-axo", "command="], { timeout: 4000 });
    for (const line of stdout.split("\n")) {
      if (!line.includes(".app/Contents/MacOS/") || !line.includes("--remote-debugging-address=127.0.0.1")) continue;
      const port = Number.parseInt(line.match(/--remote-debugging-port(?:=|\s+)(\d+)/)?.[1] ?? "", 10);
      if (Number.isInteger(port) && await isDebugPort(port)) return port;
    }
    throw new Error("Codex wurde nicht über den macOS-Micro-Aktivierungsstarter geöffnet.");
  }
  if (process.platform !== "win32") throw new Error("Die native Codex-Micro-Brücke wird auf dieser Plattform nicht unterstützt.");

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
