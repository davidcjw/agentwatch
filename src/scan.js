import { statAll } from './discover.js';
import { summarizeFile, restatus, applyLiveness } from './summarize.js';

/**
 * Scan the transcript root and return the session summaries within the active
 * window. Cheap to call on every tick: it stats every file (no reads), filters
 * to the window by mtime, and only parses files whose contents actually changed
 * since the last scan. Unchanged files are re-statused against the new clock.
 *
 * @param {string} root transcript directory
 * @param {{ now:number, windowMin:number, activeSeconds?:number,
 *           stallSeconds?:number, cache?:Map, liveCwds?:Set<string>|null }} opts
 *   windowMin = Infinity to include every session regardless of age. liveCwds,
 *   when passed, demotes stale await/stall sessions to `ended` (see
 *   applyLiveness()); the cache stores the pre-liveness summary so liveness is
 *   always re-applied fresh even when a cached file's parse is reused.
 * @returns {Array<object>} session summaries
 */
export function scan(root, opts) {
  const cache = opts.cache;
  const liveCwds = opts.liveCwds ?? null;
  const windowMs = opts.windowMin === Infinity ? Infinity : opts.windowMin * 60000;
  const out = [];

  for (const e of statAll(root)) {
    if (windowMs !== Infinity && opts.now - e.mtimeMs > windowMs) continue;

    const hit = cache && cache.get(e.file);
    if (hit && hit.mtimeMs === e.mtimeMs && hit.size === e.size) {
      out.push(applyLiveness(restatus(hit.summary, opts), liveCwds)); // unchanged file → just refresh the clock
      continue;
    }

    const summary = summarizeFile(e, opts);
    if (!summary) continue;
    if (cache) cache.set(e.file, { mtimeMs: e.mtimeMs, size: e.size, summary });
    out.push(applyLiveness(summary, liveCwds));
  }
  return out;
}
