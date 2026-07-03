#!/usr/bin/env node
import { defaultRoot } from '../src/discover.js';
import { scan } from '../src/scan.js';
import { renderFrame, sortSessions } from '../src/render.js';
import { runApp } from '../src/app.js';
import { makeColors } from '../src/format.js';
import { ACTIVE_SECONDS, STALL_SECONDS } from '../src/summarize.js';
import { liveClaudeCwds } from '../src/processes.js';

const VERSION = '0.1.0';

const HELP = `agentwatch v${VERSION} — a live perch over your Claude Code agents

USAGE
  agentwatch [options]

Live dashboard (default) of every Claude Code session active in the last
--window minutes: what each is doing right now, its tokens, cost, and whether
it's waiting on you. Press q to quit, r to refresh, a to toggle all/active.

OPTIONS
  --window <min>    only show sessions active in the last N minutes  (default 30)
  --all             show every session regardless of age
  --active <sec>    a write this recent counts as "working now"      (default ${ACTIVE_SECONDS})
  --stall <sec>     a pending tool older than this is "stalled"       (default ${STALL_SECONDS})
  --interval <ms>   rescan cadence                                    (default 2000)
  --once            render a single frame and exit (no live loop)
  --json            print session summaries as JSON and exit
  --root <path>     transcript dir   (default ~/.claude/projects)
  --no-color        disable ANSI color
  -h, --help        show this help
  -v, --version     print version

EXAMPLES
  agentwatch                 # live dashboard, last 30 min
  agentwatch --all           # every session on disk
  agentwatch --once          # one snapshot (good for screenshots / cron)
  agentwatch --json | jq .   # machine-readable
`;

function parseArgs(argv) {
  const o = {
    root: defaultRoot(),
    windowMin: 30,
    activeSeconds: ACTIVE_SECONDS,
    stallSeconds: STALL_SECONDS,
    intervalMs: 2000,
    color: process.stdout.isTTY && !process.env.NO_COLOR,
    once: false,
    json: false,
  };
  const num = (v, name) => {
    const n = Number(v);
    if (!Number.isFinite(n)) fail(`--${name} expects a number, got "${v}"`);
    return n;
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '-h': case '--help': process.stdout.write(HELP); process.exit(0); break;
      case '-v': case '--version': process.stdout.write(VERSION + '\n'); process.exit(0); break;
      case '--all': o.windowMin = Infinity; break;
      case '--once': o.once = true; break;
      case '--json': o.json = true; break;
      case '--no-color': o.color = false; break;
      case '--window': o.windowMin = num(argv[++i], 'window'); break;
      case '--active': o.activeSeconds = num(argv[++i], 'active'); break;
      case '--stall': o.stallSeconds = num(argv[++i], 'stall'); break;
      case '--interval': o.intervalMs = num(argv[++i], 'interval'); break;
      case '--root': o.root = argv[++i]; break;
      default:
        if (a.startsWith('-')) fail(`unknown option: ${a}`);
    }
  }
  return o;
}

function fail(msg) {
  process.stderr.write(`agentwatch: ${msg}\n`);
  process.exit(2);
}

function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (opts.json) {
    let sessions;
    try {
      sessions = scan(opts.root, { now: Date.now(), windowMin: opts.windowMin, activeSeconds: opts.activeSeconds, stallSeconds: opts.stallSeconds, liveCwds: liveClaudeCwds() });
    } catch (e) {
      fail(e.message);
    }
    const clean = sortSessions(sessions).map(({ _tail, ...s }) => s);
    process.stdout.write(JSON.stringify(clean, null, 2) + '\n');
    return;
  }

  if (opts.once || !process.stdout.isTTY) {
    let sessions;
    try {
      sessions = scan(opts.root, { now: Date.now(), windowMin: opts.windowMin, activeSeconds: opts.activeSeconds, stallSeconds: opts.stallSeconds, liveCwds: liveClaudeCwds() });
    } catch (e) {
      fail(e.message);
    }
    const colors = makeColors(opts.color);
    const width = process.stdout.columns || 100;
    const height = Math.max(12, Math.min(40, sessions.length + 6));
    process.stdout.write(renderFrame(sessions, { width, height, now: Date.now(), colors, spinnerPhase: 0, windowMin: opts.windowMin }) + '\n');
    return;
  }

  runApp(opts);
}

main();
