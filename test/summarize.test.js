import { describe, it, expect } from 'vitest';
import { summarizeRecords, classify, restatus } from '../src/summarize.js';

const T0 = Date.parse('2026-06-30T00:00:00.000Z');
const iso = (ms) => new Date(ms).toISOString();

function assistant(tOffsetSec, { usage, content, model = 'claude-opus-4-8', sidechain = false }) {
  return { type: 'assistant', timestamp: iso(T0 + tOffsetSec * 1000), isSidechain: sidechain, message: { model, usage, content } };
}
function userTool(tOffsetSec, { id = 't1', isError = false } = {}) {
  return { type: 'user', timestamp: iso(T0 + tOffsetSec * 1000), message: { content: [{ type: 'tool_result', tool_use_id: id, is_error: isError, content: 'ok' }] } };
}

describe('summarizeRecords', () => {
  it('sums tokens + cost, captures title/prompt/model', () => {
    const usage = { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 1000, cache_creation_input_tokens: 200 };
    const records = [
      { type: 'ai-title', aiTitle: 'Build the TUI' },
      { type: 'last-prompt', lastPrompt: 'Let us do the TUI' },
      assistant(1, { usage, content: [{ type: 'text', text: 'sure' }] }),
      assistant(2, { usage, content: [{ type: 'tool_use', id: 't1', name: 'Bash', input: {} }] }),
    ];
    const s = summarizeRecords(records, { mtimeMs: T0 + 2000, now: T0 + 3000, projectDir: '-Users-x-proj' });
    expect(s.title).toBe('Build the TUI');
    expect(s.lastPrompt).toBe('Let us do the TUI');
    expect(s.model).toBe('opus-4-8');
    expect(s.tokens.input).toBe(200);
    expect(s.tokens.output).toBe(100);
    expect(s.tokens.cacheRead).toBe(2000);
    expect(s.cost).toBeGreaterThan(0);
    expect(s.messages).toBe(2);
    expect(s.toolCalls).toBe(1);
  });

  it('keeps the latest title/prompt when several appear', () => {
    const records = [
      { type: 'ai-title', aiTitle: 'first' },
      { type: 'last-prompt', lastPrompt: 'first prompt' },
      { type: 'ai-title', aiTitle: 'second' },
      { type: 'last-prompt', lastPrompt: 'second prompt' },
      assistant(1, { usage: { input_tokens: 1, output_tokens: 1 }, content: [{ type: 'text', text: 'hi' }] }),
    ];
    const s = summarizeRecords(records, { mtimeMs: T0 + 1000, now: T0 + 1000 });
    expect(s.title).toBe('second');
    expect(s.lastPrompt).toBe('second prompt');
  });

  it('classifies a session that just ran a tool as run, naming the tool', () => {
    const records = [assistant(0, { usage: { input_tokens: 1, output_tokens: 1 }, content: [{ type: 'tool_use', id: 't1', name: 'Edit', input: {} }] })];
    const s = summarizeRecords(records, { mtimeMs: T0, now: T0 + 3000 });
    expect(s.status.state).toBe('run');
    expect(s.status.label).toContain('Edit');
  });

  it('classifies a finished turn (assistant text, gone quiet) as await', () => {
    const records = [assistant(0, { usage: { input_tokens: 1, output_tokens: 1 }, content: [{ type: 'text', text: 'done!' }] })];
    const s = summarizeRecords(records, { mtimeMs: T0, now: T0 + 120000 }); // 2 min later
    expect(s.status.state).toBe('await');
  });

  it('marks sidechain tool activity with a sub: prefix', () => {
    const records = [assistant(0, { sidechain: true, usage: { input_tokens: 1, output_tokens: 1 }, content: [{ type: 'tool_use', id: 't1', name: 'Grep', input: {} }] })];
    const s = summarizeRecords(records, { mtimeMs: T0, now: T0 + 1000 });
    expect(s.status.label).toContain('sub:');
  });
});

describe('classify', () => {
  const base = { activeSeconds: 15, stallSeconds: 600, lastTool: 'Bash', sidechain: false };
  it('pending tool, recent → run', () => {
    expect(classify({ ...base, ageSec: 3, lastKind: 'tool_use' }).state).toBe('run');
  });
  it('pending tool, very old → stall', () => {
    expect(classify({ ...base, ageSec: 900, lastKind: 'tool_use' }).state).toBe('stall');
  });
  it('tool_result recent → think', () => {
    expect(classify({ ...base, ageSec: 2, lastKind: 'tool_result' }).state).toBe('think');
  });
  it('assistant_text recent → reply', () => {
    expect(classify({ ...base, ageSec: 2, lastKind: 'assistant_text' }).state).toBe('reply');
  });
  it('assistant_text gone quiet → await', () => {
    expect(classify({ ...base, ageSec: 200, lastKind: 'assistant_text' }).state).toBe('await');
  });
  it('quiet with no clear last turn → idle', () => {
    expect(classify({ ...base, ageSec: 200, lastKind: 'tool_result' }).state).toBe('idle');
  });
});

describe('restatus', () => {
  it('re-derives age + status against a new clock without the file', () => {
    const records = [assistant(0, { usage: { input_tokens: 1, output_tokens: 1 }, content: [{ type: 'text', text: 'done' }] })];
    const s = summarizeRecords(records, { mtimeMs: T0, now: T0 + 1000 });
    expect(s.status.state).toBe('reply'); // recent
    const later = restatus(s, { now: T0 + 300000, activeSeconds: 15, stallSeconds: 600 });
    expect(later.status.state).toBe('await'); // 5 min later
    expect(later.ageSec).toBeGreaterThan(s.ageSec);
    expect(later.cost).toBe(s.cost); // content-derived fields unchanged
  });
});
