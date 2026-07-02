import { describe, it, expect, vi, beforeEach } from 'vitest';

const execFileSync = vi.fn();
vi.mock('node:child_process', () => ({ execFileSync: (...args) => execFileSync(...args) }));

const { liveClaudeCwds } = await import('../src/processes.js');

beforeEach(() => {
  execFileSync.mockReset();
});

describe('liveClaudeCwds', () => {
  it('matches only pids whose executable basename is exactly "claude"', () => {
    execFileSync.mockImplementation((cmd, args) => {
      if (cmd === 'ps') {
        return [
          '111 claude',
          '222 /Applications/Claude.app/Contents/MacOS/Claude', // desktop app itself — different case, not a match
          '333 Support/Claude/claude-code/2.1.197/claude.app/Contents/MacOS/claude',
          '444 /Applications/Claude.app/Contents/Helpers/disclaimer',
        ].join('\n') + '\n';
      }
      if (cmd === 'lsof') {
        expect(args).toContain('111,333');
        return ['p111', 'fcwd', 'n/Users/x/proj-a', 'p333', 'fcwd', 'n/Users/x/proj-b'].join('\n') + '\n';
      }
      throw new Error(`unexpected command: ${cmd}`);
    });

    const cwds = liveClaudeCwds();
    expect(cwds).toEqual(new Set(['/Users/x/proj-a', '/Users/x/proj-b']));
  });

  it('returns an empty set (not null) when no claude processes are running', () => {
    execFileSync.mockImplementation((cmd) => {
      if (cmd === 'ps') return '';
      throw new Error('lsof should not be called with no candidate pids');
    });
    expect(liveClaudeCwds()).toEqual(new Set());
  });

  it('recovers from lsof exiting non-zero because a pid raced away, using its partial stdout', () => {
    execFileSync.mockImplementation((cmd) => {
      if (cmd === 'ps') return '111 claude\n222 claude\n';
      if (cmd === 'lsof') {
        const err = new Error('lsof: exited 1');
        err.stdout = ['p111', 'fcwd', 'n/Users/x/still-alive'].join('\n') + '\n'; // pid 222 already gone
        throw err;
      }
    });
    expect(liveClaudeCwds()).toEqual(new Set(['/Users/x/still-alive']));
  });

  it('returns null when ps is unavailable, so callers skip demotion instead of assuming everything is dead', () => {
    execFileSync.mockImplementation(() => {
      throw new Error('ENOENT: ps not found');
    });
    expect(liveClaudeCwds()).toBeNull();
  });

  it('returns null when lsof fails without any usable stdout', () => {
    execFileSync.mockImplementation((cmd) => {
      if (cmd === 'ps') return '111 claude\n';
      if (cmd === 'lsof') throw new Error('ENOENT: lsof not found'); // no .stdout attached
    });
    expect(liveClaudeCwds()).toBeNull();
  });
});
