# AGENTS.md — agentwatch

Guidance for AI agents working in this repo.

## What this is

A zero-dependency Node CLI that renders a **live terminal dashboard** of active
Claude Code sessions, read from local transcripts in `~/.claude/projects`. It is
the runtime sibling to `agentmeter` (which does historical cost reporting over
the same data). Node ≥ 18, ESM (`"type": "module"`), no runtime dependencies.

## Layout

```
bin/agentwatch.js   CLI: arg parsing, --json / --once / live dispatch
src/discover.js     statAll() — cheap mtime/size walk of the transcript tree
src/summarize.js    summarizeRecords() (pure), summarizeFile(), classify(), restatus(), applyLiveness()
src/scan.js         scan() — window filter + content-keyed parse cache + liveCwds demotion
src/processes.js    liveClaudeCwds() — cwds of running `claude` processes, via ps + lsof
src/render.js       renderFrame() (pure: sessions → frame string), sortSessions()
src/format.js       humanizers (tokens/cost/age), cell()/truncate(), ANSI colors
src/app.js          live loop: alt-screen, raw stdin, paint + scan timers
src/pricing.js      USD pricing model (kept in sync with agentmeter)
src/index.js        public library exports
test/*.test.js      vitest; pure cores are unit-tested with fixtures
```

## Design rules

- **Keep the parse pure and the clock separate.** `summarizeRecords` derives
  everything from a transcript's contents. Age and inferred status depend on
  `now` and are recomputed cheaply via `restatus()` so unchanged files are never
  re-read on a tick. Preserve this split — it's what keeps the loop fast.
- **`renderFrame` is pure** (same inputs → same output). All terminal side
  effects live in `app.js`. New display logic goes in `render.js`/`format.js`
  with a test, not in the loop.
- **Zero dependencies.** Don't add runtime deps. ANSI is written by hand; the
  TUI uses the alternate screen buffer and raw mode directly.
- **Status is a heuristic** over an append-only log (see README "How status is
  inferred"). Changes to `classify()` must update both the README legend and
  `test/summarize.test.js`.
- **Liveness is a deterministic cross-check, not a heuristic.** `processes.js`
  shells out to `ps`/`lsof` to find cwds with a live `claude` process;
  `applyLiveness()` in `summarize.js` uses that to demote stale `await`/`stall`
  to `ended` (see README "How status is inferred"). It only ever demotes, and
  only `await`/`stall` (`ATTENTION_STATES`) — never invents a "dead" verdict
  when liveness is `null` (tool unavailable) or a cwd is unmatched some other
  way. Cache the pre-liveness summary in `scan.js` (`summarizeFile`'s result),
  not the post-liveness one, so liveness is re-applied fresh every tick even
  when a file's parse is reused from cache.
- **Pricing** mirrors `agentmeter/src/pricing.js`. If models/prices change,
  update both repos.

## Working here

- Run tests: `npm test` (vitest). Add tests for any new pure logic.
- Smoke test against real data: `node bin/agentwatch.js --json --window 60` or
  `--once --no-color`. The live loop needs a real TTY.
- Control characters in source: write them via `String.fromCharCode(...)`, never
  as raw bytes in string literals (they don't survive editing reliably).
- After any meaningful change, update **README.md** and this file in the same
  pass.
