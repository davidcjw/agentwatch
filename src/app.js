import { scan } from './scan.js';
import { renderFrame } from './render.js';
import { makeColors } from './format.js';
import { liveClaudeCwds } from './processes.js';

const ALT_ON = '\x1b[?1049h';
const ALT_OFF = '\x1b[?1049l';
const HIDE_CURSOR = '\x1b[?25l';
const SHOW_CURSOR = '\x1b[?25h';
const HOME = '\x1b[H';
const CLEAR = '\x1b[2J';

const PAINT_MS = 200; // spinner cadence — cheap, redraws cached data
const KEY_CTRL_C = String.fromCharCode(3);
const KEY_ESC = String.fromCharCode(27);

/**
 * Run the interactive dashboard. Two timers: a fast painter for the spinner and
 * a slower scanner that re-reads changed transcripts. Restores the terminal on
 * any exit path.
 * @param {{ root:string, windowMin:number, activeSeconds:number,
 *           stallSeconds:number, intervalMs:number, color:boolean }} opts
 */
export function runApp(opts) {
  const out = process.stdout;
  const colors = makeColors(opts.color);
  const cache = new Map();
  let windowMin = opts.windowMin;
  let sessions = [];
  let phase = 0;
  let err = null;
  let paintTimer = null;
  let scanTimer = null;

  function refresh() {
    try {
      sessions = scan(opts.root, {
        now: Date.now(),
        windowMin,
        activeSeconds: opts.activeSeconds,
        stallSeconds: opts.stallSeconds,
        cache,
        liveCwds: liveClaudeCwds(), // process table can change between ticks — recheck every scan
      });
      err = null;
    } catch (e) {
      err = e;
    }
    paint();
  }

  function paint() {
    const width = out.columns || 80;
    const height = out.rows || 24;
    if (err) {
      out.write(HOME + CLEAR + colors.red(`agentwatch: ${err.message}`) + '\n');
      return;
    }
    const frame = renderFrame(sessions, {
      width,
      height,
      now: Date.now(),
      colors,
      spinnerPhase: phase++,
      windowMin,
    });
    out.write(HOME + frame);
  }

  function cleanup() {
    if (paintTimer) clearInterval(paintTimer);
    if (scanTimer) clearInterval(scanTimer);
    try {
      if (process.stdin.isTTY) process.stdin.setRawMode(false);
    } catch {
      /* ignore */
    }
    process.stdin.pause();
    out.write(SHOW_CURSOR + ALT_OFF);
  }

  function quit(code) {
    cleanup();
    process.exit(code || 0);
  }

  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (key) => {
      if (key === 'q' || key === KEY_CTRL_C || key === KEY_ESC) quit(0);
      else if (key === 'r') refresh();
      else if (key === 'a') {
        windowMin = windowMin === Infinity ? opts.windowMin : Infinity;
        cache.clear();
        refresh();
      }
    });
  }
  process.on('SIGINT', () => quit(0));
  process.on('SIGTERM', () => quit(0));
  out.on('resize', paint);

  out.write(ALT_ON + HIDE_CURSOR + CLEAR);
  refresh();
  paintTimer = setInterval(paint, PAINT_MS);
  scanTimer = setInterval(refresh, opts.intervalMs);
}
