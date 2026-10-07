# Focus Timer

A Pomodoro timer that runs entirely in the browser. No frameworks, no build
step, no dependencies. Open `index.html` and it works.

<img src="https://img.shields.io/badge/tests-12%20passing-brightgreen" alt="12 tests passing">
<img src="https://img.shields.io/badge/dependencies-0-blue" alt="no dependencies">

## Features

- 25/5/15 defaults, all three durations and the cycle length are configurable
- Long break after every Nth focus block (default 4)
- Progress ring around the cycle counter
- Optional two-note chime at the end of each phase
- Task list for what you're working on, with the open count shown up top
- Settings and tasks persist across reloads via `localStorage`
- Keyboard shortcuts: <kbd>Space</kbd> start/pause, <kbd>R</kbd> reset, <kbd>S</kbd> skip
- Honours `prefers-reduced-motion` and keeps working in private mode

## Running it

Open `index.html` in a browser. That's the whole setup, including for the tests,
since everything is plain ES modules:

```sh
npm test
```

## Layout

```
index.html   markup
styles.css   dark theme, CSS custom properties, no preprocessor
timer.js     the state machine: phases, ticking, cycle bookkeeping
app.js       DOM wiring, persistence, sound, keyboard
demo.js      runs the state machine at 60x in the terminal
```

The interesting design decision is that **`timer.js` has no DOM in it**.
Everything in there is a pure function over a plain session object, which is
why `demo.js` can run the exact same timer in a terminal and why the tests can
drive a 25-minute cycle in microseconds:

```sh
node demo.js
```

## How the phase cycle works

`advance()` is the only thing that changes phase:

- After a focus block, the cycle counter goes up. If it hits `cycleLength`,
  the next phase is a long break and the counter resets; otherwise it's a
  short break.
- After either kind of break, the next phase is always focus.
- The running total of completed focus blocks is never reset by the cycle
  wrapping, so session stats stay accurate across multiple cycles.

## The wall clock, not the tick count

`app.js` stores *when* the current phase is due to end and derives the
remaining seconds from that timestamp on each tick, rather than subtracting one
second per callback. Browsers throttle timers in background tabs, so a naive
counter drifts badly if you switch away. `visibilitychange` re-syncs on return.

## Testing

12 tests over the state machine, covering the phase order, cycle wrapping, the
paused-tick no-op, clock formatting, and progress:

```sh
$ npm test
ℹ tests 12
ℹ pass 12
ℹ fail 0
```

## License

MIT