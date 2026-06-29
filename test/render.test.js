import { describe, it, expect } from 'vitest';
import { renderFrame, sortSessions } from '../src/render.js';
import { makeColors } from '../src/format.js';

function session(state, over = {}) {
  return {
    sessionId: 's', project: 'proj', title: over.title ?? 'A title', lastPrompt: 'p',
    model: 'opus-4-8', status: { state, label: state }, ageSec: over.ageSec ?? 10,
    durationSec: 0, lastActivityMs: over.lastActivityMs ?? 1000, messages: 1, toolCalls: 0,
    errors: 0, tokens: { input: 10, output: 5, cacheRead: 0, cacheWrite: 0 }, cost: over.cost ?? 0.5,
    _tail: {},
  };
}

const colors = makeColors(false);

describe('sortSessions', () => {
  it('orders attention, then live, then idle; recent first within a group', () => {
    const sessions = [
      session('idle', { lastActivityMs: 500 }),
      session('run', { lastActivityMs: 100 }),
      session('await', { lastActivityMs: 200 }),
      session('run', { lastActivityMs: 300 }),
    ];
    const ordered = sortSessions(sessions).map((s) => `${s.status.state}@${s.lastActivityMs}`);
    expect(ordered).toEqual(['await@200', 'run@300', 'run@100', 'idle@500']);
  });
});

describe('renderFrame', () => {
  it('renders a header, the session, and a footer within the given height', () => {
    const frame = renderFrame([session('run')], { width: 100, height: 14, now: 1000, colors });
    const lines = frame.split('\n');
    expect(lines.length).toBe(14);
    expect(frame).toContain('agentwatch');
    expect(frame).toContain('STATUS');
    expect(frame).toContain('proj');
    expect(frame).toContain('A title');
    expect(frame).toContain('quit');
  });

  it('counts working vs needs-you vs idle in the stats line', () => {
    const frame = renderFrame([session('run'), session('await'), session('idle')], { width: 100, height: 16, now: 1000, colors });
    expect(frame).toMatch(/1 working/);
    expect(frame).toMatch(/1 need you/);
    expect(frame).toMatch(/1 idle/);
  });

  it('shows an empty-state hint when there are no sessions', () => {
    const frame = renderFrame([], { width: 100, height: 14, now: 1000, colors });
    expect(frame).toMatch(/no sessions/);
  });

  it('reports overflow with "+N more" when rows exceed the height', () => {
    const many = Array.from({ length: 30 }, () => session('idle'));
    const frame = renderFrame(many, { width: 100, height: 12, now: 1000, colors });
    expect(frame).toMatch(/\+\d+ more/);
  });
});
