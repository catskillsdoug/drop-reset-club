import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const SRC = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'v5', 'app.js'),
  'utf8'
);

const START = '// --- test:event-view-helpers:start ---';
const END = '// --- test:event-view-helpers:end ---';

function loadHelpers() {
  const a = SRC.indexOf(START);
  const b = SRC.indexOf(END);
  if (a === -1 || b === -1) throw new Error('event-view helper markers not found in v5/app.js');
  const block = SRC.slice(a + START.length, b);
  return new Function(`${block}; return { windowsForEventSection, shouldShowEventNotFound };`)();
}

describe('windowsForEventSection', () => {
  const { windowsForEventSection } = loadHelpers();

  // visible_seasons=4 capped the homepage to 4 season windows. The event
  // section reused that capped list, so Leaf Peepin' (Sep 25 - Oct 31) showed
  // nothing past Oct 14 — the 4th window's end — even though the event ran
  // three more weeks.
  const upcoming = ['golden-hour', 'early-fall', 'harvest', 'peak-foliage', 'late-autumn', 'first-frost'];
  const capped = upcoming.slice(0, 4);

  it('an event page is NOT truncated by the homepage season cap', () => {
    const got = windowsForEventSection(true, upcoming, capped);
    expect(got).toEqual(upcoming);
    expect(got).toContain('late-autumn');
  });

  it('the homepage still honours the season cap', () => {
    expect(windowsForEventSection(false, upcoming, capped)).toEqual(capped);
  });

  it('treats a null slug as the homepage', () => {
    expect(windowsForEventSection(null, upcoming, capped)).toEqual(capped);
  });
});

describe('shouldShowEventNotFound', () => {
  const { shouldShowEventNotFound } = loadHelpers();

  it('flags an event URL that matched nothing', () => {
    expect(shouldShowEventNotFound('harvest', 0)).toBe(true);
    expect(shouldShowEventNotFound('typo-slug', 0)).toBe(true);
  });

  it('stays quiet when the event matched', () => {
    expect(shouldShowEventNotFound('leaf-peeps', 1)).toBe(false);
  });

  it('never fires on the homepage, which legitimately shows zero events', () => {
    expect(shouldShowEventNotFound(null, 0)).toBe(false);
    expect(shouldShowEventNotFound('', 0)).toBe(false);
  });
});

describe('call sites', () => {
  it('the event section draws its windows via windowsForEventSection', () => {
    expect(SRC).toMatch(/windowsForEventSection\(\s*singleEventSlug/);
  });

  it('the not-found branch is wired up', () => {
    expect(SRC).toMatch(/shouldShowEventNotFound\(\s*singleEventSlug/);
  });

  it('an unmatched event page is marked noindex, not left indexable', () => {
    expect(SRC).toContain('noindex');
  });

  it('no raw pathname event regex survives — all parsing goes through the helper', () => {
    const rawMatches = SRC.match(/location\.pathname\.match\(\/\^\\\/\(\?:\(\?:n\|v5\)/g) || [];
    expect(rawMatches).toHaveLength(0);
  });
});
