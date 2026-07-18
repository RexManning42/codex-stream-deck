export type WatcherObservation = {
  now: number;
  generation: string | null;
  bridgeHealthy: boolean;
};

export type WatcherAction =
  | { type: "preserve-initial-session" }
  | { type: "reuse-bridge" }
  | { type: "wait"; reason: string }
  | { type: "launch-bridge"; reason: string }
  | { type: "restart-for-recovery"; generation: string; reason: string };

export type WatcherPolicyState = {
  initialized: boolean;
  startupGraceUntil: number;
  lastGeneration: string | null;
  suppressedInitialGeneration: string | null;
  stoppedSince: number | null;
  hadHealthyBridge: boolean;
  recoveryPendingUntil: number;
  recoveryAttempts: string[];
};

export const DEFAULT_STARTUP_GRACE_MS = 5_000;
export const DEFAULT_STOPPED_GRACE_MS = 2_000;
export const DEFAULT_RECOVERY_STARTUP_MS = 30_000;

export function createWatcherPolicyState(now = Date.now()): WatcherPolicyState {
  return {
    initialized: false,
    startupGraceUntil: now + DEFAULT_STARTUP_GRACE_MS,
    lastGeneration: null,
    suppressedInitialGeneration: null,
    stoppedSince: null,
    hadHealthyBridge: false,
    recoveryPendingUntil: 0,
    recoveryAttempts: []
  };
}

export function resumeWatcherPolicyState(
  stored: WatcherPolicyState | null,
  now = Date.now()
): WatcherPolicyState {
  if (!stored) return createWatcherPolicyState(now);
  return {
    ...stored,
    startupGraceUntil: now + DEFAULT_STARTUP_GRACE_MS,
    stoppedSince: null,
    recoveryPendingUntil: 0,
    recoveryAttempts: [...stored.recoveryAttempts].slice(-16)
  };
}

export function evaluateWatcherPolicy(
  state: WatcherPolicyState,
  observation: WatcherObservation
): { state: WatcherPolicyState; action: WatcherAction } {
  const next: WatcherPolicyState = {
    ...state,
    recoveryAttempts: [...state.recoveryAttempts]
  };
  const { now, generation, bridgeHealthy } = observation;

  if (!state.initialized) {
    next.initialized = true;
    next.lastGeneration = generation;
    if (generation != null) {
      next.stoppedSince = null;
      if (bridgeHealthy) {
        next.hadHealthyBridge = true;
        return { state: next, action: { type: "reuse-bridge" } };
      }
      next.suppressedInitialGeneration = generation;
      return { state: next, action: { type: "preserve-initial-session" } };
    }
    next.stoppedSince = now;
    return { state: next, action: { type: "wait", reason: "launch-agent-startup-grace" } };
  }

  if (generation == null) {
    if (next.stoppedSince == null) next.stoppedSince = now;
    if (now < next.recoveryPendingUntil) {
      return { state: next, action: { type: "wait", reason: "bridge-startup-pending" } };
    }
    if (now < next.startupGraceUntil) {
      return { state: next, action: { type: "wait", reason: "launch-agent-startup-grace" } };
    }
    if (now - next.stoppedSince < DEFAULT_STOPPED_GRACE_MS) {
      return { state: next, action: { type: "wait", reason: "confirm-stopped-interval" } };
    }
    next.recoveryPendingUntil = now + DEFAULT_RECOVERY_STARTUP_MS;
    next.stoppedSince = now;
    return { state: next, action: { type: "launch-bridge", reason: "observed-stopped-interval" } };
  }

  const previousGeneration = next.lastGeneration;
  const observedStoppedInterval = next.stoppedSince != null;
  const generationChanged = previousGeneration != null && previousGeneration !== generation;
  next.lastGeneration = generation;
  next.stoppedSince = null;

  if (bridgeHealthy) {
    next.hadHealthyBridge = true;
    next.recoveryPendingUntil = 0;
    next.suppressedInitialGeneration = null;
    return { state: next, action: { type: "reuse-bridge" } };
  }

  if (now < next.recoveryPendingUntil) {
    return { state: next, action: { type: "wait", reason: "bridge-startup-pending" } };
  }

  if (previousGeneration == null && next.suppressedInitialGeneration == null && !next.hadHealthyBridge && now < next.startupGraceUntil) {
    next.suppressedInitialGeneration = generation;
    return { state: next, action: { type: "preserve-initial-session" } };
  }

  if (now < next.startupGraceUntil && (generationChanged || observedStoppedInterval)) {
    return { state: next, action: { type: "wait", reason: "launch-agent-startup-grace" } };
  }

  if (generation === next.suppressedInitialGeneration && !generationChanged && !observedStoppedInterval) {
    return { state: next, action: { type: "preserve-initial-session" } };
  }

  if (next.recoveryAttempts.includes(generation)) {
    return { state: next, action: { type: "wait", reason: "recovery-already-attempted-for-generation" } };
  }

  const shouldRecover = generationChanged || observedStoppedInterval || next.hadHealthyBridge || now >= next.startupGraceUntil;
  if (!shouldRecover) {
    return { state: next, action: { type: "wait", reason: "launch-agent-startup-grace" } };
  }

  next.recoveryAttempts = [...next.recoveryAttempts.slice(-15), generation];
  next.recoveryPendingUntil = now + DEFAULT_RECOVERY_STARTUP_MS;
  const reason = generationChanged
    ? "main-process-generation-changed"
    : observedStoppedInterval
      ? "normal-launch-after-stopped-interval"
      : next.hadHealthyBridge
        ? "previous-healthy-bridge-missing"
        : "normal-launch-after-startup-grace";
  return { state: next, action: { type: "restart-for-recovery", generation, reason } };
}
