import {
  cell,
  truncate,
  humanTokens,
  humanCost,
  humanAge,
  statusStyle,
} from './format.js';
import { ATTENTION_STATES, LIVE_STATES } from './summarize.js';

export const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

const CLR_EOL = '\x1b[K'; // erase from cursor to end of line (wipes last frame's tail)

/** Rank for ordering: things that need you first, then live work, then idle. */
function rank(s) {
  if (ATTENTION_STATES.has(s.status.state)) return 0;
  if (LIVE_STATES.has(s.status.state)) return 1;
  return 2;
}

/** Sort sessions for display: attention, then live, then idle; recent first within each. */
export function sortSessions(sessions) {
  return [...sessions].sort((a, b) => rank(a) - rank(b) || b.lastActivityMs - a.lastActivityMs);
}

function counts(sessions) {
  let live = 0, attn = 0, idle = 0, cost = 0;
  for (const s of sessions) {
    cost += s.cost || 0;
    if (ATTENTION_STATES.has(s.status.state)) attn++;
    else if (LIVE_STATES.has(s.status.state)) live++;
    else idle++;
  }
  return { live, attn, idle, cost };
}

/**
 * Build the full-screen frame as a string. Pure: same inputs → same output.
 * @param {Array<object>} sessions session summaries (unsorted is fine)
 * @param {{ width:number, height:number, now:number, colors:object,
 *           spinnerPhase?:number, windowMin?:number, paused?:boolean }} opts
 */
export function renderFrame(sessions, opts) {
  const { colors: c, now } = opts;
  const width = Math.max(40, opts.width || 80);
  const height = Math.max(8, opts.height || 24);
  const phase = opts.spinnerPhase || 0;
  const ordered = sortSessions(sessions);
  const { live, attn, idle, cost } = counts(sessions);

  const lines = [];

  // ── Title bar ──────────────────────────────────────────────────────────
  const clock = new Date(now).toLocaleTimeString();
  const dot = live > 0 ? c.green('●') : attn > 0 ? c.yellow('●') : c.gray('●');
  const left = `${dot} ${c.bold('agentwatch')}`;
  const right = c.dim(clock);
  lines.push(padBetween(left, right, width, 12 + clock.length));

  // ── Stats line ─────────────────────────────────────────────────────────
  const stats = [
    c.green(`${live} working`),
    attn > 0 ? c.yellow(`${attn} need you`) : c.dim(`${attn} need you`),
    c.dim(`${idle} idle`),
    c.dim('·'),
    `${c.dim('window spend')} ${c.bold(humanCost(cost))}`,
  ].join('  ');
  lines.push(stats + CLR_EOL);
  lines.push(CLR_EOL);

  // ── Column header ──────────────────────────────────────────────────────
  const cols = layout(width);
  const head =
    cell('STATUS', cols.state) + ' ' +
    cell('PROJECT', cols.project) + ' ' +
    cell('WHAT', cols.what) + ' ' +
    cell('MODEL', cols.model) + ' ' +
    cell('TOK', cols.tok, 'right') + ' ' +
    cell('COST', cols.cost, 'right') + ' ' +
    cell('AGE', cols.age, 'right');
  lines.push(c.dim(head) + CLR_EOL);

  // ── Rows ───────────────────────────────────────────────────────────────
  const bodyRows = height - lines.length - 1; // reserve 1 for footer
  const shown = ordered.slice(0, Math.max(0, bodyRows));
  if (ordered.length === 0) {
    lines.push(c.dim('  no sessions in the active window — start a Claude Code session, or pass --all') + CLR_EOL);
  }
  for (const s of shown) {
    lines.push(renderRow(s, cols, c, phase) + CLR_EOL);
  }
  // Pad remaining body lines so the footer sits at the bottom and old rows clear.
  const usedBody = shown.length || (ordered.length === 0 ? 1 : 0);
  for (let i = usedBody; i < bodyRows; i++) lines.push(CLR_EOL);

  // ── Footer ─────────────────────────────────────────────────────────────
  const more = ordered.length > shown.length ? `  +${ordered.length - shown.length} more` : '';
  const foot = `${c.dim('q')} quit  ${c.dim('r')} refresh  ${c.dim('a')} all/active${more}`;
  lines.push(c.dim(foot) + CLR_EOL);

  return lines.join('\n');
}

function renderRow(s, cols, c, phase) {
  const { color, glyph } = statusStyle(s.status.state);
  const paint = c[color] || c.dim;
  const live = LIVE_STATES.has(s.status.state);
  const mark = live ? SPINNER[phase % SPINNER.length] : glyph;
  const stateText = `${mark} ${s.status.label}`;
  const what = s.title || s.lastPrompt || c.dim('(untitled)');

  return (
    paint(cell(stateText, cols.state)) + ' ' +
    c.cyan(cell(s.project || '?', cols.project)) + ' ' +
    cell(what, cols.what) + ' ' +
    c.dim(cell(s.model || '?', cols.model)) + ' ' +
    c.dim(cell(humanTokens(s.tokens.input + s.tokens.output + s.tokens.cacheRead + s.tokens.cacheWrite), cols.tok, 'right')) + ' ' +
    cell(humanCost(s.cost), cols.cost, 'right') + ' ' +
    c.dim(cell(humanAge(s.ageSec), cols.age, 'right'))
  );
}

/** Allocate column widths for a given terminal width; "what" takes the slack. */
function layout(width) {
  const state = 16;
  const project = 14;
  const model = 9;
  const tok = 7;
  const cost = 6;
  const age = 5;
  const gaps = 6; // single space between 7 columns
  const fixed = state + project + model + tok + cost + age + gaps;
  const what = Math.max(8, width - fixed);
  return { state, project, what, model, tok, cost, age };
}

/** Left text + right text on one line of exactly `width`, accounting for ANSI. */
function padBetween(left, right, width, visibleLen) {
  const gap = Math.max(1, width - visibleLen);
  return left + ' '.repeat(gap) + right + CLR_EOL;
}
