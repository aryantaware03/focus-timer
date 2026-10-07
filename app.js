/**
 * Wires the timer state machine in timer.js to the page.
 *
 * The wall clock is the source of truth: we store the timestamp the current
 * phase is due to end, and derive the remaining seconds from it on every tick.
 * That way the timer stays accurate when the tab is backgrounded and the
 * interval throttles.
 */
import {
  PHASES,
  createSession,
  progress,
  advance,
  start as startSession,
  pause as pauseSession,
  reset as resetSession,
  skip as skipPhase,
  focusedMinutes,
  formatClock,
} from './timer.js';

const STORAGE_KEY = 'focus-timer/v1';
const CIRCUMFERENCE = 2 * Math.PI * 54;

const el = {
  clock: document.querySelector('.clock'),
  phase: document.getElementById('phase'),
  time: document.getElementById('time'),
  ringFill: document.getElementById('ringFill'),
  cycleLabel: document.getElementById('cycleLabel'),
  startBtn: document.getElementById('startBtn'),
  resetBtn: document.getElementById('resetBtn'),
  skipBtn: document.getElementById('skipBtn'),
  soundBtn: document.getElementById('soundBtn'),
  focusMin: document.getElementById('focusMin'),
  shortMin: document.getElementById('shortMin'),
  longMin: document.getElementById('longMin'),
  cycleLen: document.getElementById('cycleLen'),
  blocksDone: document.getElementById('blocksDone'),
  minutesDone: document.getElementById('minutesDone'),
  taskCount: document.getElementById('taskCount'),
  taskText: document.getElementById('taskText'),
  addTaskBtn: document.getElementById('addTaskBtn'),
  taskList: document.getElementById('taskList'),
  taskEmpty: document.getElementById('taskEmpty'),
};

let session = createSession();
let dueAt = null; // timestamp in ms when the running phase ends
let intervalId = null;
let soundOn = true;

const PHASE_LABELS = {
  [PHASES.FOCUS]: 'Focus',
  [PHASES.SHORT_BREAK]: 'Short break',
  [PHASES.LONG_BREAK]: 'Long break',
};

/* ---------- rendering ---------- */

function render() {
  el.clock.dataset.phase = session.phase;
  el.phase.textContent = PHASE_LABELS[session.phase];
  el.time.textContent = formatClock(session.remaining);

  const offset = CIRCUMFERENCE * (1 - progress(session));
  el.ringFill.style.strokeDashoffset = String(offset);

  const inCycle = session.completedInCycle;
  // While focusing, show how many blocks are already banked this cycle. During
  // a break, show the full count, since that is the position just earned.
  const shown = session.phase === PHASES.FOCUS ? inCycle : inCycle + 1;
  el.cycleLabel.textContent = `${shown === session.cycleLength ? session.cycleLength : shown} / ${session.cycleLength}`;

  el.startBtn.textContent = session.running ? 'Pause' : 'Start';

  el.blocksDone.textContent = String(session.completedFocusBlocks);
  el.minutesDone.textContent = String(focusedMinutes(session));

  const open = tasks.filter((t) => !t.done).length;
  el.taskCount.textContent = String(open);

  save();
}

/* ---------- clock ---------- */

function stopInterval() {
  if (intervalId !== null) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

function startInterval() {
  stopInterval();
  intervalId = setInterval(onTick, 250);
}

/** Recompute remaining time from the due timestamp, finishing phases as needed. */
function onTick() {
  if (!session.running) return;

  const secondsLeft = Math.max(0, Math.round((dueAt - Date.now()) / 1000));

  if (secondsLeft === 0) {
    const finished = session.phase;
    // advance() fills the clock for the next phase and leaves it paused, which
    // is exactly the behaviour we want: the user starts the next block.
    session = advance(session);
    dueAt = null;
    stopInterval();
    render();
    notify(finished);
    document.title = `${PHASE_LABELS[session.phase]} — Focus Timer`;
    return;
  }

  session = { ...session, remaining: secondsLeft };
  render();
}

function startClock() {
  if (session.running) return;
  session = startSession(session);
  dueAt = Date.now() + session.remaining * 1000;
  document.title = `${PHASE_LABELS[session.phase]} — Focus Timer`;
  render();
  startInterval();
}

function pauseClock() {
  if (!session.running) return;
  session = { ...pauseSession(session), remaining: remainingFromDue() };
  dueAt = null;
  stopInterval();
  document.title = 'Focus Timer';
  render();
}

function remainingFromDue() {
  if (dueAt === null) return session.remaining;
  return Math.max(0, Math.round((dueAt - Date.now()) / 1000));
}

function remainingForPhase() {
  const minutes = session.durations[session.phase] ?? 0;
  return minutes * 60;
}



/* ---------- controls ---------- */

el.startBtn.addEventListener('click', () => (session.running ? pauseClock() : startClock()));

el.resetBtn.addEventListener('click', () => {
  stopInterval();
  session = { ...resetSession(session), remaining: remainingForPhase() };
  dueAt = null;
  document.title = 'Focus Timer';
  render();
});

el.skipBtn.addEventListener('click', () => {
  stopInterval();
  session = skipPhase(session);
  dueAt = null;
  render();
});

el.soundBtn.addEventListener('click', () => {
  soundOn = !soundOn;
  el.soundBtn.textContent = `Sound: ${soundOn ? 'on' : 'off'}`;
  el.soundBtn.setAttribute('aria-pressed', String(soundOn));
});

for (const [input, phase] of [
  [el.focusMin, PHASES.FOCUS],
  [el.shortMin, PHASES.SHORT_BREAK],
  [el.longMin, PHASES.LONG_BREAK],
]) {
  input.addEventListener('change', () => {
    const value = Number.parseInt(input.value, 10);
    if (!Number.isFinite(value)) return;
    const clamped = Math.min(Math.max(value, Number(input.min)), Number(input.max));
    input.value = String(clamped);

    const previousPhase = session.phase;
    const previousBlocks = session.completedFocusBlocks;
    const previousInCycle = session.completedInCycle;

    // Adopt the new duration and rewind the current phase so the change takes
    // effect immediately, without discarding how much work is already banked.
    const durations = { ...session.durations, [phase]: clamped };
    session = { ...createSession({ durations, cycleLength: session.cycleLength }) };
    session = {
      ...session,
      phase: previousPhase,
      completedFocusBlocks: previousBlocks,
      completedInCycle: previousInCycle,
      running: false,
      remaining: (durations[previousPhase] ?? 0) * 60,
    };
    stopInterval();
    dueAt = null;
    document.title = 'Focus Timer';
    render();
  });
}

el.cycleLen.addEventListener('change', () => {
  const value = Number.parseInt(el.cycleLen.value, 10);
  if (!Number.isFinite(value)) return;
  const clamped = Math.min(Math.max(value, 2), 12);
  el.cycleLen.value = String(clamped);
  session = { ...session, cycleLength: clamped };
  render();
});

document.addEventListener('keydown', (event) => {
  // Never hijack keys while the user is typing.
  if (event.target.matches('input, textarea')) return;

  if (event.code === 'Space') {
    event.preventDefault();
    session.running ? pauseClock() : startClock();
  } else if (event.key.toLowerCase() === 'r') {
    el.resetBtn.click();
  } else if (event.key.toLowerCase() === 's') {
    el.skipBtn.click();
  }
});

// A backgrounded tab throttles timers, so re-sync on return.
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && session.running) onTick();
});

/* ---------- sound ---------- */

function notify(phase) {
  if (!soundOn) return;
  try {
    const Ctx = window.AudioContext ?? window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = (notify.ctx ??= new Ctx());
    if (ctx.state === 'suspended') ctx.resume();

    const now = ctx.currentTime;
    // A short two-note chime, higher after a finished focus block.
    const notes = phase === PHASES.FOCUS ? [660, 880] : [520, 392];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const startAt = now + i * 0.18;
      gain.gain.setValueAtTime(0.0001, startAt);
      gain.gain.exponentialRampToValueAtTime(0.2, startAt + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.32);
      osc.connect(gain).connect(ctx.destination);
      osc.start(startAt);
      osc.stop(startAt + 0.35);
    });
  } catch {
    // Audio is a nicety; a blocked or missing context must not break the timer.
  }
}

/* ---------- tasks ---------- */

let tasks = [];

function renderTasks() {
  el.taskList.replaceChildren();

  for (const task of tasks) {
    const li = document.createElement('li');
    if (task.done) li.classList.add('done');

    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = task.done;
    box.addEventListener('change', () => {
      task.done = box.checked;
      render();
    });

    const label = document.createElement('span');
    label.textContent = task.text;

    const remove = document.createElement('button');
    remove.className = 'remove';
    remove.textContent = '×';
    remove.title = 'Remove task';
    remove.addEventListener('click', () => {
      tasks = tasks.filter((t) => t.id !== task.id);
      render();
    });

    li.append(box, label, remove);
    el.taskList.append(li);
  }

  el.taskEmpty.classList.toggle('hidden', tasks.length > 0);
  render();
}

function addTask() {
  const text = el.taskText.value.trim();
  if (!text) return;
  tasks.push({ id: String(tasks.length) + Date.now().toString(36), text, done: false });
  el.taskText.value = '';
  render();
}

el.addTaskBtn.addEventListener('click', addTask);
el.taskText.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') addTask();
});

/* ---------- persistence ---------- */

function save() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        durations: session.durations,
        cycleLength: session.cycleLength,
        completedFocusBlocks: session.completedFocusBlocks,
        completedInCycle: session.completedInCycle,
        soundOn,
        tasks,
      }),
    );
  } catch {
    // Private browsing or a full quota: the timer still works, it just won't persist.
  }
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);

    if (data.durations) el.focusMin.value = String(data.durations[PHASES.FOCUS] ?? 25);
    if (data.durations) el.shortMin.value = String(data.durations[PHASES.SHORT_BREAK] ?? 5);
    if (data.durations) el.longMin.value = String(data.durations[PHASES.LONG_BREAK] ?? 15);
    if (data.cycleLength) el.cycleLen.value = String(data.cycleLength);

    if (typeof data.soundOn === 'boolean') {
      soundOn = data.soundOn;
      el.soundBtn.textContent = `Sound: ${soundOn ? 'on' : 'off'}`;
      el.soundBtn.setAttribute('aria-pressed', String(soundOn));
    }

    tasks = Array.isArray(data.tasks) ? data.tasks : [];

    const restored = createSession({
      durations: data.durations,
      cycleLength: data.cycleLength,
    });
    session = {
      ...restored,
      completedFocusBlocks: data.completedFocusBlocks ?? 0,
      completedInCycle: data.completedInCycle ?? 0,
      remaining: remainingForPhase(),
    };
  } catch {
    // Corrupt or unreadable storage should never stop the app from starting.
  }
}

load();
renderTasks();