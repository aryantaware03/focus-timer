/**
 * Focus Timer — pure session state machine.
 *
 * No DOM, no timers, no side effects. Everything here is a plain function or
 * returns a new state object, which is what makes it testable and what lets
 * the same logic drive the UI and the command-line demo.
 */

export const PHASES = {
  FOCUS: 'focus',
  SHORT_BREAK: 'shortBreak',
  LONG_BREAK: 'longBreak',
};

export const DEFAULT_DURATIONS = {
  [PHASES.FOCUS]: 25,
  [PHASES.SHORT_BREAK]: 5,
  [PHASES.LONG_BREAK]: 15,
};

/** Pomodoro practice: a long break after every Nth focus block. */
export const DEFAULT_CYCLE_LENGTH = 4;

export function createSession(options = {}) {
  const durations = { ...DEFAULT_DURATIONS, ...(options.durations ?? {}) };
  const cycleLength = options.cycleLength ?? DEFAULT_CYCLE_LENGTH;

  return {
    phase: PHASES.FOCUS,
    /** Seconds left in the current phase. */
    remaining: durations[PHASES.FOCUS] * 60,
    /** True while the clock is counting down. */
    running: false,
    /** Focus blocks finished since the session began. */
    completedFocusBlocks: 0,
    /** Focus blocks finished in the current cycle, 0..cycleLength-1. */
    completedInCycle: 0,
    cycleLength,
    durations,
  };
}

/** Total seconds a phase lasts. */
export function phaseDuration(session, phase = session.phase) {
  return (session.durations[phase] ?? DEFAULT_DURATIONS[phase] ?? 0) * 60;
}

/** 0 at the start of a phase, 1 when it ends. */
export function progress(session) {
  const total = phaseDuration(session);
  if (total <= 0) return 1;
  return clamp((total - session.remaining) / total, 0, 1);
}

/**
 * Tick one second. Returns { session, finished } where `finished` is the phase
 * that just ended, or null. Finishing a phase advances to the next one but
 * leaves the clock paused, so the user decides when to start.
 */
export function tick(session) {
  if (!session.running) return { session, finished: null };

  const remaining = session.remaining - 1;
  if (remaining > 0) {
    return { session: { ...session, remaining }, finished: null };
  }

  // The clock reached zero on this tick, so the phase is over.
  return { session: advance(session), finished: session.phase };
}

/** Move to whatever phase comes after the current one. */
export function advance(session) {
  if (session.phase === PHASES.FOCUS) {
    const completedInCycle = session.completedInCycle + 1;
    const cycleComplete = completedInCycle >= session.cycleLength;
    const next = cycleComplete ? PHASES.LONG_BREAK : PHASES.SHORT_BREAK;

    return withRemaining(
      {
        ...session,
        phase: next,
        completedFocusBlocks: session.completedFocusBlocks + 1,
        completedInCycle: cycleComplete ? 0 : completedInCycle,
      },
      next,
    );
  }

  return withRemaining({ ...session, phase: PHASES.FOCUS }, PHASES.FOCUS);
}

/** Skip straight to the next phase, ignoring whatever time is left. */
export function skip(session) {
  const next = advance(session);
  return withRemaining(next, next.phase);
}

export function start(session) {
  return { ...session, running: true };
}

export function pause(session) {
  return { ...session, running: false };
}

export function reset(session) {
  return withRemaining({ ...session, running: false }, session.phase);
}

/** Total focused minutes completed so far. */
export function focusedMinutes(session) {
  return session.completedFocusBlocks * session.durations[PHASES.FOCUS];
}

/** "25:00" for a normal phase, "1:05:00" once an hour is on the clock. */
export function formatClock(totalSeconds) {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;

  const pad = (n) => String(n).padStart(2, '0');
  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(seconds)}`
    : `${minutes}:${pad(seconds)}`;
}

function withRemaining(session, phase) {
  return { ...session, remaining: phaseDuration(session, phase), running: false };
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}