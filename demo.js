/**
 * Runs the session state machine at 60x speed so you can watch a full
 * Pomodoro cycle without waiting 25 minutes. Handy for demos and for
 * eyeballing that phase transitions behave.
 *
 *   node demo.js
 */
import {
  createSession,
  tick,
  start,
  formatClock,
  PHASES,
} from './timer.js';

const SPEED = 60;

let session = start(
  createSession({ durations: { focus: 2, shortBreak: 1, longBreak: 3 }, cycleLength: 2 }),
);

console.log(`Focus Timer demo - running at ${SPEED}x speed. Ctrl+C to stop.`);
console.log('');

const interval = setInterval(() => {
  let { session: next, finished } = tick(session);

  if (finished) {
    const label = finished === PHASES.FOCUS ? 'focus block done' : 'break over';
    console.log(`\n  [${label}] -> ${next.phase}`);
    // advance() deliberately leaves the clock paused, but the demo runs
    // hands-free, so kick off the next phase straight away.
    session = start(next);
    return;
  }

  session = next;
  process.stdout.write(`\r${session.phase.padEnd(11)} ${formatClock(session.remaining)}   `);
}, 1000 / SPEED);

// Keep a handle so the process stays alive until interrupted.
process.on('SIGINT', () => {
  clearInterval(interval);
  console.log('\nstopped');
});