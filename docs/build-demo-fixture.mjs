// Build a synthetic transcript root for the agentwatch live-TUI demo GIF.
// Fresh, backdated file mtimes drive the five status states. No real data.
import { mkdirSync, writeFileSync, rmSync, utimesSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const ROOT = join(homedir(), 'agentwatch-demo');
rmSync(ROOT, { recursive: true, force: true });

const now = Date.now();
const iso = (msAgo) => new Date(now - msAgo).toISOString();

function usage(mult = 1) {
  return {
    input_tokens: 400 * mult,
    output_tokens: 1200 * mult,
    cache_read_input_tokens: 90000 * mult,
    cache_creation_input_tokens: 6000 * mult,
  };
}
function asst(msAgo, content, { model = 'claude-opus-4-8', mult = 1, sidechain = false, proj } = {}) {
  const r = { type: 'assistant', timestamp: iso(msAgo), cwd: `/home/dev/${proj}`,
    message: { model, content, usage: usage(mult) } };
  if (sidechain) r.isSidechain = true;
  return r;
}
const text = (t) => ({ type: 'text', text: t });
const toolUse = (name) => ({ type: 'tool_use', id: 'toolu_x', name, input: {} });
const userResult = (msAgo, isError = false) => ({ type: 'user', timestamp: iso(msAgo),
  message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_x', is_error: isError, content: 'ok' }] } });
const title = (t) => ({ type: 'ai-title', aiTitle: t });

// Each session: { proj, ageMs (drives file mtime + status), records }
const sessions = [
  { proj: 'payments-api', ageMs: 190_000, mult: 9, // AWAITING YOU (last block = assistant text, age>15s)
    records: [ title('Fix the failing auth-token refresh test'),
      asst(300_000, [toolUse('Read')], { proj: 'payments-api', mult: 4 }),
      userResult(260_000),
      asst(190_000, [text('The refresh path drops the expiry claim — want me to patch it?')], { proj: 'payments-api', mult: 5 }) ] },

  { proj: 'acme-dashboard', ageMs: 5_000, mult: 6, // WORKING (last block = tool_use, fresh)
    records: [ title('Add the cohort retention heatmap'),
      asst(40_000, [text('Building the chart component now.')], { proj: 'acme-dashboard', mult: 3 }),
      asst(5_000, [toolUse('Edit')], { proj: 'acme-dashboard', mult: 3 }) ] },

  { proj: 'mobile-app', ageMs: 4_000, mult: 3, // THINKING (last block = tool_result, fresh) — subagent
    records: [ title('Wire up push notifications'),
      asst(9_000, [toolUse('Grep')], { proj: 'mobile-app', mult: 2, sidechain: true }),
      userResult(4_000) ] },

  { proj: 'data-pipeline', ageMs: 900_000, mult: 12, // STALLED (tool_use pending >600s)
    records: [ title('Backfill last quarter of events'),
      asst(1_000_000, [text('Kicking off the backfill job.')], { proj: 'data-pipeline', mult: 6 }),
      asst(900_000, [toolUse('Bash')], { proj: 'data-pipeline', mult: 6 }) ] },

  { proj: 'blog-engine', ageMs: 1_500_000, mult: 2, // IDLE (tool_result, age 25m)
    records: [ title('Draft the release-notes post'),
      asst(1_560_000, [toolUse('Write')], { proj: 'blog-engine', mult: 1 }),
      userResult(1_500_000) ] },
];

let n = 0;
for (const s of sessions) {
  const dir = join(ROOT, `-home-dev-${s.proj}`);
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `session-${n++}.jsonl`);
  writeFileSync(file, s.records.map((r) => JSON.stringify(r)).join('\n') + '\n');
  const mtime = (now - s.ageMs) / 1000; // seconds for utimes
  utimesSync(file, mtime, mtime);
}
console.log('built', ROOT, '·', n, 'sessions');
