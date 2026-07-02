import { existsSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

// agentmeter is a sibling repo, not a dependency — it's only present when both
// repos are checked out side by side on disk (not guaranteed, e.g. this repo's
// own CI checks out only this repo). Skip the whole suite when it's absent.
// Checked relative to the repo root (process.cwd() under `npm test`), per the
// path this repo's docs use to describe the sibling.
const hasSibling = existsSync('../agentmeter/src/pricing.js');
// Dynamic import() resolves relative specifiers against this file's own
// location (test/), not process.cwd(), hence the extra '../'.
const SIBLING_PRICING_FROM_TEST_FILE = '../../agentmeter/src/pricing.js';

describe.skipIf(!hasSibling)('pricing sync with agentmeter', () => {
  it('keeps PRICING and cache multipliers byte-for-byte equivalent', async () => {
    const [ours, theirs] = await Promise.all([
      import('../src/pricing.js'),
      import(SIBLING_PRICING_FROM_TEST_FILE),
    ]);

    expect(ours.PRICING).toEqual(theirs.PRICING);
    expect(ours.CACHE_WRITE_5M).toBe(theirs.CACHE_WRITE_5M);
    expect(ours.CACHE_WRITE_1H).toBe(theirs.CACHE_WRITE_1H);
    expect(ours.CACHE_READ).toBe(theirs.CACHE_READ);
  });
});
