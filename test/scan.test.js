import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scan } from '../src/scan.js';

const T0 = Date.parse('2026-06-30T00:00:00.000Z');
const iso = (ms) => new Date(ms).toISOString();

function jsonl(records) {
  return records.map((r) => JSON.stringify(r)).join('\n') + '\n';
}
function setMtime(file, ms) {
  const d = new Date(ms);
  utimesSync(file, d, d);
}

let root;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'agentwatch-'));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function writeSession(project, name, records, mtimeMs) {
  const dir = join(root, project);
  mkdirSync(dir, { recursive: true });
  const file = join(dir, name + '.jsonl');
  writeFileSync(file, jsonl(records));
  setMtime(file, mtimeMs);
  return file;
}

const live = [
  { type: 'last-prompt', lastPrompt: 'go' },
  { type: 'assistant', timestamp: iso(T0), message: { model: 'claude-opus-4-8', usage: { input_tokens: 5, output_tokens: 5 }, content: [{ type: 'tool_use', id: 't1', name: 'Bash', input: {} }] } },
];

describe('scan', () => {
  it('includes only sessions within the window by mtime', () => {
    writeSession('-Users-x-recent', 'a', live, T0); // fresh
    writeSession('-Users-x-old', 'b', live, T0 - 60 * 60 * 1000); // 60 min old

    const recent = scan(root, { now: T0 + 1000, windowMin: 30 });
    expect(recent.length).toBe(1);
    expect(recent[0].status.state).toBe('run');

    const all = scan(root, { now: T0 + 1000, windowMin: Infinity });
    expect(all.length).toBe(2);
  });

  it('populates the cache and reuses it for unchanged files', () => {
    writeSession('-Users-x-p', 'a', live, T0);
    const cache = new Map();
    const first = scan(root, { now: T0 + 1000, windowMin: 60, cache });
    expect(cache.size).toBe(1);
    const cachedSummary = [...cache.values()][0].summary;

    // Re-scan later; file unchanged → same parsed summary object reused, but age refreshed.
    const second = scan(root, { now: T0 + 5 * 60 * 1000, windowMin: 60, cache });
    expect([...cache.values()][0].summary).toBe(cachedSummary); // not re-parsed
    expect(second[0].ageSec).toBeGreaterThan(first[0].ageSec); // re-statused against new clock
  });

  it('re-parses when a file changes', () => {
    const file = writeSession('-Users-x-p', 'a', live, T0);
    const cache = new Map();
    scan(root, { now: T0 + 1000, windowMin: 60, cache });

    const grown = [...live, { type: 'last-prompt', lastPrompt: 'changed' }];
    writeFileSync(file, jsonl(grown));
    setMtime(file, T0 + 2000);
    const out = scan(root, { now: T0 + 3000, windowMin: 60, cache });
    expect(out[0].lastPrompt).toBe('changed');
  });

  it('demotes a cached await session to ended once its cwd falls out of liveCwds, without re-reading the file', () => {
    const awaiting = [
      { type: 'assistant', timestamp: iso(T0), message: { model: 'claude-opus-4-8', usage: { input_tokens: 5, output_tokens: 5 }, content: [{ type: 'text', text: 'done' }] } },
      { cwd: '/tmp/proj-cwd-marker' },
    ];
    writeSession('-tmp-p', 'a', awaiting, T0);
    const cache = new Map();

    const stillRunning = scan(root, { now: T0 + 120000, windowMin: 60, cache, liveCwds: new Set(['/tmp/proj-cwd-marker']) });
    expect(stillRunning[0].status.state).toBe('await');
    expect(cache.size).toBe(1); // liveness isn't baked into the cached summary

    const processExited = scan(root, { now: T0 + 180000, windowMin: 60, cache, liveCwds: new Set() });
    expect(processExited[0].status.state).toBe('ended');
  });
});
