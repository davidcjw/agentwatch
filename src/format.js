// Small, dependency-free formatting + ANSI helpers.

const ANSI = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

/** Build a colorizer. When disabled, every method is an identity function. */
export function makeColors(enabled) {
  const wrap = (code) => (s) => (enabled ? code + s + ANSI.reset : String(s));
  return {
    enabled,
    bold: wrap(ANSI.bold),
    dim: wrap(ANSI.dim),
    red: wrap(ANSI.red),
    green: wrap(ANSI.green),
    yellow: wrap(ANSI.yellow),
    blue: wrap(ANSI.blue),
    magenta: wrap(ANSI.magenta),
    cyan: wrap(ANSI.cyan),
    gray: wrap(ANSI.gray),
  };
}

/** Per-status accent color name + glyph. */
export function statusStyle(state) {
  switch (state) {
    case 'run': return { color: 'green', glyph: '●' };
    case 'think': return { color: 'cyan', glyph: '◐' };
    case 'reply': return { color: 'green', glyph: '◑' };
    case 'await': return { color: 'yellow', glyph: '▲' };
    case 'stall': return { color: 'red', glyph: '■' };
    case 'ended': return { color: 'gray', glyph: '○' };
    default: return { color: 'gray', glyph: '·' };
  }
}

/** 1234 -> "1.2k", 1_500_000 -> "1.5M". */
export function humanTokens(n) {
  n = n || 0;
  if (n < 1000) return String(n);
  if (n < 1_000_000) return (n / 1000).toFixed(n < 10_000 ? 1 : 0) + 'k';
  return (n / 1_000_000).toFixed(1) + 'M';
}

export function humanCost(n) {
  n = n || 0;
  if (n === 0) return '$0';
  if (n < 0.01) return '<1¢';
  if (n < 1) return Math.round(n * 100) + '¢';
  return '$' + n.toFixed(2);
}

/** Seconds -> compact age, e.g. "4s", "12m", "3h", "2d". */
export function humanAge(sec) {
  sec = Math.max(0, Math.round(sec));
  if (sec < 60) return sec + 's';
  if (sec < 3600) return Math.floor(sec / 60) + 'm';
  if (sec < 86400) return Math.floor(sec / 3600) + 'h';
  return Math.floor(sec / 86400) + 'd';
}

/** Seconds -> "1h23m" / "12m" / "45s". */
export function humanDur(sec) {
  sec = Math.max(0, Math.round(sec));
  if (sec < 60) return sec + 's';
  const m = Math.floor(sec / 60);
  if (m < 60) return m + 'm';
  const h = Math.floor(m / 60);
  return h + 'h' + (m % 60) + 'm';
}

/** Truncate to width with an ellipsis; collapses internal newlines/whitespace. */
export function truncate(s, width) {
  s = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  if (width <= 0) return '';
  if (s.length <= width) return s;
  if (width === 1) return '…';
  return s.slice(0, width - 1) + '…';
}

/** Pad/clip a plain string to exactly `width` columns. */
export function cell(s, width, align = 'left') {
  s = truncate(s, width);
  const gap = width - s.length;
  if (gap <= 0) return s;
  return align === 'right' ? ' '.repeat(gap) + s : s + ' '.repeat(gap);
}
