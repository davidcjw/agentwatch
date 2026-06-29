import { statAll } from './discover.js';
import { summarizeFile, restatus } from './summarize.js';

/**
 * Scan the transcript root and return the session summaries within the active
 * window. Cheap to call on every tick: it stats every file (no reads), filters
 * to the window by mtime, and only parses files whose contents actually changed
 * since the last scan. Unchanged files are re-statused against the new clock.
 *
 * @param {string} root transcript directory
 * @param {{ now:number, windowMin:number, activeSeconds?:number,
 *           stallSeconds?:number, cache?:Map }} opts
 *   windowMin = Infinity to include every session regardless of age.
 * @returns {Array<object>} session summaries
 */
export function scan(root, opts) {
  const cache = opts.cache;
  const windowMs = opts.windowMin === Infinity ? Infinity : opts.windowMin * 60000;
  const out = [];

  for (const e of statAll(root)) {
    if (windowMs !== Infinity && opts.now - e.mtimeMs > windowMs) continue;

    const hit = cache && cache.get(e.file);
    if (hit && hit.mtimeMs === e.mtimeMs && hit.size === e.size) {
      out.push(restatus(hit.summary, opts)); // unchanged file → just refresh the clock
      continue;
    }

    const summary = summarizeFile(e, opts);
    if (!summary) continue;
    if (cache) cache.set(e.file, { mtimeMs: e.mtimeMs, size: e.size, summary });
    out.push(summary);
  }
  return out;
}
