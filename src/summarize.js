import { readFileSync } from 'node:fs';
import { costForUsage, shortModel } from './pricing.js';
import { projectLabel } from './discover.js';

// Default thresholds (seconds). Overridable from the CLI.
export const ACTIVE_SECONDS = 15; // file written this recently → something is happening now
export const STALL_SECONDS = 600; // a pending tool_use older than this looks stuck / waiting on you

/**
 * Status states, ordered by "needs my attention". `attention` rows are surfaced
 * first by the dashboard.
 *   run    — a tool is executing right now
 *   think  — the model is generating (after a tool result / your message)
 *   reply  — the model is streaming its answer
 *   await  — finished its turn, waiting for your next message
 *   stall  — a tool_use has been pending a long time (long run, or a permission prompt)
 *   idle   — no recent activity
 */
export const ATTENTION_STATES = new Set(['await', 'stall']);
export const LIVE_STATES = new Set(['run', 'think', 'reply']);

function blocks(r) {
  const c = r && r.message && r.message.content;
  return Array.isArray(c) ? c : [];
}

/**
 * Pure core: fold a transcript's already-parsed records into one session
 * summary. Kept side-effect free so it can be unit-tested with fixtures.
 *
 * @param {Array<object>} records parsed JSONL objects, in file order
 * @param {{ mtimeMs: number, now: number, activeSeconds?: number, stallSeconds?: number }} opts
 */
export function summarizeRecords(records, opts) {
  const { mtimeMs, now } = opts;
  const activeSeconds = opts.activeSeconds ?? ACTIVE_SECONDS;
  const stallSeconds = opts.stallSeconds ?? STALL_SECONDS;

  let sessionId = null;
  let cwd = null;
  let title = null;
  let lastPrompt = null;
  let model = null;
  let startMs = null;
  let lastTsMs = null;
  let messages = 0;
  let toolCalls = 0;
  let errors = 0;
  let priced = false;
  const tokens = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  let cost = 0;

  // Tail tracking: the kind of the most recent meaningful content block tells
  // us what the session is doing right now.
  let lastKind = null; // 'tool_use' | 'tool_result' | 'assistant_text' | 'user_text'
  let lastTool = null;
  let lastSidechain = false;

  for (const r of records) {
    if (!r || typeof r !== 'object') continue;
    if (!sessionId && r.sessionId) sessionId = r.sessionId;
    if (!cwd && r.cwd) cwd = r.cwd;
    if (r.type === 'ai-title' && r.aiTitle) title = r.aiTitle; // keep the latest
    if (r.type === 'last-prompt' && r.lastPrompt) lastPrompt = r.lastPrompt; // keep latest non-empty

    const tsMs = r.timestamp ? Date.parse(r.timestamp) : NaN;
    if (Number.isFinite(tsMs)) {
      if (startMs == null) startMs = tsMs;
      lastTsMs = tsMs;
    }

    if (r.type === 'assistant') {
      messages++;
      if (r.message && r.message.model) model = r.message.model;
      const usage = r.message && r.message.usage;
      if (usage) {
        tokens.input += usage.input_tokens || 0;
        tokens.output += usage.output_tokens || 0;
        tokens.cacheRead += usage.cache_read_input_tokens || 0;
        tokens.cacheWrite += usage.cache_creation_input_tokens || 0;
        const c = costForUsage(usage, r.message.model);
        cost += c.total;
        priced = priced || c.priced;
      }
      for (const b of blocks(r)) {
        if (b.type === 'tool_use') {
          toolCalls++;
          lastKind = 'tool_use';
          lastTool = b.name || 'tool';
          lastSidechain = Boolean(r.isSidechain);
        } else if (b.type === 'text' && typeof b.text === 'string' && b.text.trim()) {
          lastKind = 'assistant_text';
          lastSidechain = Boolean(r.isSidechain);
        }
      }
    } else if (r.type === 'user') {
      const c = r.message && r.message.content;
      if (Array.isArray(c)) {
        for (const b of c) {
          if (b && b.type === 'tool_result') {
            lastKind = 'tool_result';
            if (b.is_error) errors++;
          }
        }
      } else if (typeof c === 'string') {
        lastKind = 'user_text';
      }
    }
  }

  const lastActivityMs = Math.max(mtimeMs || 0, lastTsMs || 0);
  const ageSec = Math.max(0, (now - lastActivityMs) / 1000);
  const status = classify({ ageSec, lastKind, lastTool, sidechain: lastSidechain, activeSeconds, stallSeconds });

  return {
    sessionId,
    project: projectLabel(opts.projectDir, cwd),
    cwd,
    title: title || null,
    lastPrompt: lastPrompt || null,
    model: model ? shortModel(model) : null,
    rawModel: model,
    status,
    ageSec,
    durationSec: startMs != null && lastTsMs != null ? Math.max(0, (lastTsMs - startMs) / 1000) : 0,
    lastActivityMs,
    messages,
    toolCalls,
    errors,
    tokens,
    cost,
    priced,
    // Tail state for cheap re-classification on later ticks (see restatus).
    _tail: { lastKind, lastTool, sidechain: lastSidechain },
  };
}

/**
 * Re-derive a session's age + status against a new `now`, without re-reading the
 * file. The parse result (tokens, title, tail kind) is content-derived and
 * stable; only age and the inferred status drift with the clock.
 */
export function restatus(summary, opts) {
  const ageSec = Math.max(0, (opts.now - summary.lastActivityMs) / 1000);
  const t = summary._tail || {};
  const status = classify({
    ageSec,
    lastKind: t.lastKind,
    lastTool: t.lastTool,
    sidechain: t.sidechain,
    activeSeconds: opts.activeSeconds ?? ACTIVE_SECONDS,
    stallSeconds: opts.stallSeconds ?? STALL_SECONDS,
  });
  return { ...summary, ageSec, status };
}

/**
 * Decide what a session is doing from the age of its last write and the kind of
 * its last content block. Heuristic — see README "How status is inferred".
 */
export function classify({ ageSec, lastKind, lastTool, sidechain, activeSeconds, stallSeconds }) {
  const tool = lastTool || 'tool';
  const sub = sidechain ? 'sub:' : '';

  // A pending, unanswered tool_use means a tool is still running (or a permission
  // prompt is open). Treat as live until it has been pending unusually long.
  if (lastKind === 'tool_use') {
    if (ageSec > stallSeconds) return { state: 'stall', label: `stalled: ${tool}` };
    return { state: 'run', label: `${sub}${tool}` };
  }

  if (ageSec <= activeSeconds) {
    if (lastKind === 'tool_result' || lastKind === 'user_text') return { state: 'think', label: 'thinking' };
    if (lastKind === 'assistant_text') return { state: 'reply', label: 'replying' };
    return { state: 'run', label: 'working' };
  }

  if (lastKind === 'assistant_text') return { state: 'await', label: 'awaiting you' };
  return { state: 'idle', label: 'idle' };
}

/**
 * Read and summarize one transcript file. Returns null if it can't be read or
 * has no usable records.
 * @param {{ file: string, projectDir: string, mtimeMs: number }} entry
 * @param {{ now: number, activeSeconds?: number, stallSeconds?: number }} opts
 */
export function summarizeFile(entry, opts) {
  let data;
  try {
    data = readFileSync(entry.file, 'utf8');
  } catch {
    return null;
  }
  const records = [];
  for (const line of data.split('\n')) {
    if (!line) continue;
    try {
      records.push(JSON.parse(line));
    } catch {
      /* skip malformed line */
    }
  }
  if (!records.length) return null;
  const summary = summarizeRecords(records, {
    mtimeMs: entry.mtimeMs,
    now: opts.now,
    projectDir: entry.projectDir,
    activeSeconds: opts.activeSeconds,
    stallSeconds: opts.stallSeconds,
  });
  summary.file = entry.file;
  return summary;
}
