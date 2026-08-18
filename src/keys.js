// Raw-mode keyboard input, dependency-free.
//
// This is the half of the interactive picker that talks to the terminal, kept
// apart from the half that draws: everything here is a side effect on stdin and
// stdout, and everything in picker.js is a pure frame plus a key. Splitting them
// is what lets the picker be tested without a TTY at all.
//
// Raw mode is the part that has to be handled with care. It is a process-wide
// flag on a shared file descriptor, and a run that throws while it is on leaves
// the user's shell with no echo and no visible cursor — the broken-CLI symptom
// that outlives the process that caused it. So the invariant here is: the
// terminal is restored by `close()`, by an uncaught throw, by `process.exit`,
// and by ^C, and restoring twice is harmless.
//
// ^C needs its own handling because raw mode is exactly what stops the kernel
// from turning it into SIGINT: with raw mode on it arrives as an ordinary
// keypress, and a wizard that ignored it would be unquittable. We restore the
// terminal and exit 130 — the shell convention for "killed by SIGINT" — rather
// than routing it into the wizard's own `q`, because `q` promises a clean exit
// path and ^C promises nothing.

import { emitKeypressEvents } from 'node:readline';
import process from 'node:process';

const HIDE_CURSOR = '\u001b[?25l';
const SHOW_CURSOR = '\u001b[?25h';

/**
 * Flatten node's two-argument keypress payload into one shape.
 *
 * `name` is what the switch in the picker reads: readline fills it for keys that
 * have one (`up`, `return`, `a`, `1`), and for everything else — `?` being the
 * one that matters, since it is the help key at every prompt in this CLI — we
 * fall back to the character itself. `char` is set only for a bare printable
 * keypress, so a modifier chord can never be mistaken for typed text.
 */
export function normalizeKey(str, key = {}) {
  const printable = typeof str === 'string' && [...str].length === 1 && !key.ctrl && !key.meta;
  return {
    name: key.name || (printable ? str : ''),
    char: printable ? str : '',
    ctrl: Boolean(key.ctrl),
    meta: Boolean(key.meta),
    shift: Boolean(key.shift),
  };
}

/**
 * Whether this process can drive an arrow-key UI at all.
 *
 * Both ends have to be a terminal: stdin because raw mode is meaningless on a
 * pipe, stdout because there is nothing to redraw in place when the output is
 * being captured. TERM=dumb says so outright. SPECFRAME_NO_KEYS is the escape
 * hatch for the terminal that claims to be a TTY and is not — the answer there
 * has to be a flag, because no heuristic gets it right.
 *
 * Every `false` here lands on the line-based prompts, which stay the baseline
 * rather than a degraded mode.
 */
export function keyboardAvailable({
  input = process.stdin,
  output = process.stdout,
  env = process.env,
} = {}) {
  if (env.SPECFRAME_NO_KEYS !== undefined && env.SPECFRAME_NO_KEYS !== '') return false;
  if (env.TERM === 'dumb') return false;
  return Boolean(input.isTTY && output.isTTY && typeof input.setRawMode === 'function');
}

const IDLE_KEY = { name: '', char: '', ctrl: false, meta: false, shift: false };

/**
 * Open the keyboard.
 *
 * Returns `{ read, close }`, where `read()` resolves with the next key. Keys
 * pressed while nobody is reading are queued rather than dropped: between two
 * frames the picker is briefly not awaiting, and someone holding `down` would
 * otherwise lose the keystrokes that landed in the gap.
 *
 * The reader owns raw mode and the cursor for its whole lifetime, so a picker
 * never has to think about either.
 */
export function createKeyReader({
  input = process.stdin,
  output = process.stdout,
  onInterrupt = null,
} = {}) {
  emitKeypressEvents(input);

  const queue = [];
  let waiting = null;
  let closed = false;

  // What the terminal looked like before we touched it. Restoring to *this*
  // rather than to a flat `false` keeps us honest if we are ever opened inside
  // something that already put stdin in raw mode.
  const wasRaw = input.isRaw === true;
  const wasPaused = input.isPaused();

  const restore = () => {
    if (closed) return;
    closed = true;
    input.off('keypress', onKeypress);
    process.off('exit', restore);
    try {
      if (input.isTTY && input.isRaw !== wasRaw) input.setRawMode(wasRaw);
    } catch {
      // A stdin that went away mid-run cannot be restored, and throwing here
      // would replace whatever real error is unwinding with this one.
    }
    output.write(SHOW_CURSOR);
    if (wasPaused) input.pause();
    if (waiting) {
      const resolve = waiting;
      waiting = null;
      resolve(IDLE_KEY);
    }
  };

  const interrupt =
    onInterrupt ||
    (() => {
      restore();
      output.write('\n');
      process.exit(130);
    });

  function onKeypress(str, key) {
    const normalized = normalizeKey(str, key);
    if (normalized.ctrl && normalized.name === 'c') {
      interrupt();
      return;
    }
    if (waiting) {
      const resolve = waiting;
      waiting = null;
      resolve(normalized);
    } else {
      queue.push(normalized);
    }
  }

  input.on('keypress', onKeypress);
  process.on('exit', restore);
  if (input.isTTY) input.setRawMode(true);
  input.resume();
  output.write(HIDE_CURSOR);

  return {
    read() {
      if (queue.length > 0) return Promise.resolve(queue.shift());
      if (closed) return Promise.resolve(IDLE_KEY);
      return new Promise((resolve) => {
        waiting = resolve;
      });
    },
    close: restore,
  };
}

/**
 * A reader that replays a fixed list of keys, for tests and for driving a picker
 * from a script. Written as key names (`'down'`, `'return'`, `'3'`) so the setup
 * of a test reads as the keystrokes someone would actually type.
 */
export function createScriptedKeyReader(names = []) {
  const queue = names.map((name) =>
    typeof name === 'string'
      ? { ...IDLE_KEY, name, char: [...name].length === 1 ? name : '' }
      : { ...IDLE_KEY, ...name },
  );
  return {
    // An exhausted script answers `return` rather than hanging, which is the
    // same bargain createScriptedIo makes with an empty queue.
    read: async () => queue.shift() ?? { ...IDLE_KEY, name: 'return' },
    close: () => {},
    remaining: () => queue.length,
  };
}
