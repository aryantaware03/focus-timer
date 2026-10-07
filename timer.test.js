import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  PHASES,
  createSession,
  phaseDuration,
  progress,
  tick,
  advance,
  skip,
  start,
  pause,
  reset,
  focusedMinutes,
  formatClock,
} from './timer.js';

test('a new session starts on focus, paused, with a full clock', () => {
  const s = createSession();
  assert.equal(s.phase, PHASES.FOCUS);
  assert.equal(s.running, false);
  assert.equal(s.remaining, 25 * 60);
  assert.equal(s.completedFocusBlocks, 0);
});

test('custom durations are honoured', () => {
  const s = createSession({ durations: { focus: 50 } });
  assert.equal(s.remaining, 50 * 60);
  // Unspecified phases fall back to the defaults.
  assert.equal(s.durations[PHASES.SHORT_BREAK], 5);
});

test('a paused session does not count down', () => {
  const before = createSession();
  const { session, finished } = tick(before);
  assert.equal(session.remaining, before.remaining);
  assert.equal(finished, null);
});

test('a running session loses exactly one second per tick', () => {
  let s = start(createSession());
  s = tick(s).session;
  assert.equal(s.remaining, 25 * 60 - 1);
  assert.equal(s.running, true);
});

test('finishing focus moves to a short break and stops the clock', () => {
  let s = start({ ...createSession(), remaining: 1 });
  const { session, finished } = tick(s);

  assert.equal(finished, PHASES.FOCUS);
  assert.equal(session.phase, PHASES.SHORT_BREAK);
  assert.equal(session.remaining, 5 * 60);
  assert.equal(session.running, false);
  assert.equal(session.completedFocusBlocks, 1);
});

test('the cycle ends in a long break, then resets the cycle counter', () => {
  let s = createSession({ cycleLength: 2 });

  s = advance(s); // focus -> short break, 1 in cycle
  assert.equal(s.phase, PHASES.SHORT_BREAK);
  assert.equal(s.completedInCycle, 1);

  s = advance(s); // short break -> focus
  s = advance(s); // focus -> long break, cycle complete
  assert.equal(s.phase, PHASES.LONG_BREAK);
  assert.equal(s.completedInCycle, 0);
  assert.equal(s.completedFocusBlocks, 2);

  s = advance(s); // long break -> focus
  assert.equal(s.phase, PHASES.FOCUS);
  // The running total is not affected by the cycle resetting.
  assert.equal(s.completedFocusBlocks, 2);
});

test('skip jumps phases without waiting for the clock', () => {
  const s = skip({ ...createSession(), remaining: 900 });
  assert.equal(s.phase, PHASES.SHORT_BREAK);
  assert.equal(s.remaining, 5 * 60);
});

test('pause and start toggle the running flag', () => {
  let s = createSession();
  s = start(s);
  assert.equal(s.running, true);
  s = pause(s);
  assert.equal(s.running, false);
});

test('reset keeps the current phase but refills the clock', () => {
  let s = start(createSession());
  s = tick(tick(s).session).session;
  s = advance(s);
  assert.equal(s.phase, PHASES.SHORT_BREAK);

  s = reset(s);
  assert.equal(s.phase, PHASES.SHORT_BREAK);
  assert.equal(s.remaining, 5 * 60);
  assert.equal(s.running, false);
});

test('progress runs from 0 to 1 across a phase', () => {
  let s = createSession();
  assert.equal(progress(s), 0);

  s = { ...s, remaining: phaseDuration(s) / 2 };
  assert.equal(progress(s), 0.5);

  s = { ...s, remaining: 0 };
  assert.equal(progress(s), 1);
});

test('focused minutes counts finished blocks', () => {
  let s = createSession({ durations: { focus: 30 } });
  s = advance(s);
  s = advance(s); // back to focus
  s = advance(s);
  assert.equal(s.completedFocusBlocks, 2);
  assert.equal(focusedMinutes(s), 60);
});

test('formatClock pads and rolls over correctly', () => {
  assert.equal(formatClock(0), '0:00');
  assert.equal(formatClock(5), '0:05');
  assert.equal(formatClock(65), '1:05');
  assert.equal(formatClock(1500), '25:00');
  assert.equal(formatClock(3599), '59:59');
  assert.equal(formatClock(3600), '1:00:00');
  assert.equal(formatClock(3725), '1:02:05');
  // Negative input is clamped rather than rendering garbage.
  assert.equal(formatClock(-10), '0:00');
});