// Pure warming state machine for AI calls. No React, no timers of its own — the
// clock is injected on every query so it is fully deterministic under test. The
// useAI hook owns the real timer that polls isWarming() and re-renders.
//
// "Warming" means: some tracked call has been in flight longer than the
// threshold (the scale-to-zero service is booting a cold container). It clears
// the moment that call settles. This drives a one-time "warming up" hint on a
// feature's own surface — never per-row noise (FR-0.8).

export const WARMING_THRESHOLD_MS = 3000;

// A fresh tracker. `inflight` maps a call id → the time it started.
export function createWarming() {
  return { inflight: new Map(), nextId: 1 };
}

// Register a starting call; returns its id (pass it back to endCall).
export function startCall(state, now) {
  const id = state.nextId++;
  state.inflight.set(id, now);
  return id;
}

// A call settled (success or failure) — stop tracking it.
export function endCall(state, id) {
  state.inflight.delete(id);
}

// True once ANY tracked call has been pending longer than the threshold.
export function isWarming(state, now, threshold = WARMING_THRESHOLD_MS) {
  for (const startedAt of state.inflight.values()) {
    if (now - startedAt > threshold) return true;
  }
  return false;
}

// Whether anything is still in flight (the hook uses this to stop its poller).
export function anyInflight(state) {
  return state.inflight.size > 0;
}
