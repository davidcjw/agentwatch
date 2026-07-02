import { execFileSync } from 'node:child_process';
import { basename } from 'node:path';

/**
 * cwds of every `claude` process currently running on this machine
 * (interactive, a still-executing `claude -p`, or one hosted inside the
 * Claude desktop app). Used to disprove stale `await`/`stall` labels: the
 * content heuristic in classify() can't tell "still waiting on you" from
 * "the process already exited after its last write" — a process table can.
 *
 * Best-effort and shells out to `ps`/`lsof`, so macOS/Linux only. Returns
 * `null` — not an empty Set — when either tool is unavailable or fails
 * outright, so callers can tell "checked, nothing's running" apart from
 * "couldn't check" and skip demotion rather than wrongly marking every
 * session ended.
 *
 * @returns {Set<string>|null}
 */
export function liveClaudeCwds() {
  let pids;
  try {
    pids = listClaudePids();
  } catch {
    return null;
  }
  if (!pids.length) return new Set();
  try {
    return cwdsForPids(pids);
  } catch {
    return null;
  }
}

/** PIDs whose executable basename is exactly `claude` (excludes the Electron
 * desktop app itself, its helpers, etc. — those report as `Claude`/`Claude Helper`). */
function listClaudePids() {
  const out = execFileSync('ps', ['-axo', 'pid=,comm='], { encoding: 'utf8' });
  const pids = [];
  for (const line of out.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const sp = trimmed.indexOf(' ');
    if (sp < 0) continue;
    const pid = trimmed.slice(0, sp);
    const comm = trimmed.slice(sp + 1).trim();
    if (basename(comm) === 'claude') pids.push(pid);
  }
  return pids;
}

/** Batches every pid into one `lsof` call and reads back each process's cwd. */
function cwdsForPids(pids) {
  let out;
  try {
    out = execFileSync('lsof', ['-a', '-p', pids.join(','), '-d', 'cwd', '-Fn'], { encoding: 'utf8' });
  } catch (e) {
    // A pid can race away between listClaudePids() and here — lsof then exits
    // non-zero but still reports every pid it *did* find on stdout. Only a
    // missing stdout (lsof absent, permission denied, ...) is a real failure.
    if (typeof e.stdout === 'string') out = e.stdout;
    else throw e;
  }
  const cwds = new Set();
  for (const line of out.split('\n')) {
    if (line.startsWith('n')) cwds.add(line.slice(1));
  }
  return cwds;
}
