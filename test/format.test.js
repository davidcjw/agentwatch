import { describe, it, expect } from 'vitest';
import { humanTokens, humanCost, humanAge, humanDur, truncate, cell, makeColors, statusStyle } from '../src/format.js';

describe('humanTokens', () => {
  it('formats by magnitude', () => {
    expect(humanTokens(0)).toBe('0');
    expect(humanTokens(999)).toBe('999');
    expect(humanTokens(1500)).toBe('1.5k');
    expect(humanTokens(15000)).toBe('15k');
    expect(humanTokens(2_300_000)).toBe('2.3M');
  });
});

describe('humanCost', () => {
  it('uses cents below a dollar and dollars above', () => {
    expect(humanCost(0)).toBe('$0');
    expect(humanCost(0.004)).toBe('<1¢');
    expect(humanCost(0.42)).toBe('42¢');
    expect(humanCost(1.2)).toBe('$1.20');
    expect(humanCost(77.3)).toBe('$77.30');
  });
});

describe('humanAge', () => {
  it('picks the largest sensible unit', () => {
    expect(humanAge(5)).toBe('5s');
    expect(humanAge(90)).toBe('1m');
    expect(humanAge(3700)).toBe('1h');
    expect(humanAge(90000)).toBe('1d');
  });
});

describe('humanDur', () => {
  it('combines hours and minutes', () => {
    expect(humanDur(45)).toBe('45s');
    expect(humanDur(120)).toBe('2m');
    expect(humanDur(3 * 3600 + 5 * 60)).toBe('3h5m');
  });
});

describe('truncate + cell', () => {
  it('collapses whitespace and ellipsizes', () => {
    expect(truncate('a   b\nc', 99)).toBe('a b c');
    expect(truncate('hello world', 5)).toBe('hell…');
    expect(truncate('x', 0)).toBe('');
  });
  it('cell pads to an exact width', () => {
    expect(cell('hi', 5)).toBe('hi   ');
    expect(cell('hi', 5, 'right')).toBe('   hi');
    expect(cell('toolong', 4)).toBe('too…');
    expect(cell('hi', 5).length).toBe(5);
  });
});

describe('makeColors', () => {
  it('is identity when disabled', () => {
    const c = makeColors(false);
    expect(c.green('x')).toBe('x');
  });
  it('wraps with ANSI when enabled', () => {
    const c = makeColors(true);
    expect(c.green('x')).toBe('\x1b[32mx\x1b[0m');
  });
});

describe('statusStyle', () => {
  it('maps every state to a color + glyph', () => {
    for (const s of ['run', 'think', 'reply', 'await', 'stall', 'idle', 'unknown']) {
      const st = statusStyle(s);
      expect(typeof st.color).toBe('string');
      expect(typeof st.glyph).toBe('string');
    }
  });
});
