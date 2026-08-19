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
  return new Function(`${block}; return { windowGroupsForDrops, collapsedWindowStays, stayGroupKey, resolveSeasonGrouping };`)();
}
const { windowGroupsForDrops, collapsedWindowStays, stayGroupKey } = loadHelpers();

// The three windows Leaf Peepin' (Sep 25 - Oct 31) actually spans.
const HARVEST = { slug: 'harvest', name: 'Harvest', dates: 'Sep 15–30' };
const PEAK = { slug: 'peak-foliage', name: 'Peak Foliage', dates: 'Oct 1–14' };
const LATE = { slug: 'late-autumn', name: 'Late Autumn', dates: 'Oct 15–31' };
const windowForDate = (a) => {
  const m = Number(a.slice(5, 7)), d = Number(a.slice(8, 10));
  if (m === 9 && d >= 15) return HARVEST;
  if (m === 10 && d <= 14) return PEAK;
  if (m === 10 && d >= 15) return LATE;
  return null;
};

const drop = (arrival, code = 'ZINK', sold = false) => ({ arrival, _sold: sold, property: { code } });

describe('stayGroupKey', () => {
  // A Thu arrival and a Fri arrival are two ways into the SAME weekend. They
  // must not consume both of a window's two collapsed slots.
  it('a Thu arrival and the Fri after it share one key', () => {
    expect(stayGroupKey('2026-10-22')).toBe(stayGroupKey('2026-10-23'));
  });

  it('different weekends do not collide', () => {
    expect(stayGroupKey('2026-10-22')).not.toBe(stayGroupKey('2026-10-29'));
  });

  it('a Sun arrival and the Mon after it share one key', () => {
    expect(stayGroupKey('2026-10-25')).toBe(stayGroupKey('2026-10-26'));
  });
});

describe('windowGroupsForDrops', () => {
  const drops = [
    drop('2026-10-22'), drop('2026-09-25'), drop('2026-10-02'), drop('2026-10-30'),
  ];

  it('groups into season windows in chronological order', () => {
    const got = windowGroupsForDrops(drops, windowForDate);
    expect(got.map(g => g.window.slug)).toEqual(['harvest', 'peak-foliage', 'late-autumn']);
  });

  it('sorts drops within a window by arrival', () => {
    const got = windowGroupsForDrops([drop('2026-10-30'), drop('2026-10-22')], windowForDate);
    expect(got[0].drops.map(d => d.arrival)).toEqual(['2026-10-22', '2026-10-30']);
  });

  it('omits windows with no drops rather than rendering empty headers', () => {
    const got = windowGroupsForDrops([drop('2026-10-02')], windowForDate);
    expect(got.map(g => g.window.slug)).toEqual(['peak-foliage']);
  });

  it('drops outside every window are skipped, not crashed on', () => {
    expect(windowGroupsForDrops([drop('2026-06-01')], windowForDate)).toEqual([]);
  });
});

describe('collapsedWindowStays', () => {
  it('shows the two soonest bookable stays', () => {
    const got = collapsedWindowStays([drop('2026-10-30'), drop('2026-10-22'), drop('2026-10-29')], 2);
    expect(got.map(d => d.arrival)).toEqual(['2026-10-22', '2026-10-29']);
  });

  it('never spends both slots on two ways into the same weekend', () => {
    // Thu Oct 22 and Fri Oct 23 are one weekend; Thu Oct 29 is the next.
    const got = collapsedWindowStays([drop('2026-10-22'), drop('2026-10-23'), drop('2026-10-29')], 2);
    expect(got.map(d => d.arrival)).toEqual(['2026-10-22', '2026-10-29']);
  });

  it('skips sold rows so the collapsed view is always actionable', () => {
    const got = collapsedWindowStays([drop('2026-10-01', 'ZINK', true), drop('2026-10-22')], 2);
    expect(got.map(d => d.arrival)).toEqual(['2026-10-22']);
  });

  it('falls back to sold rows when a window has nothing bookable', () => {
    const sold = [drop('2026-10-01', 'ZINK', true), drop('2026-10-08', 'ZINK', true)];
    expect(collapsedWindowStays(sold, 2).map(d => d.arrival)).toEqual(['2026-10-01', '2026-10-08']);
  });

  it('returns everything when a window holds fewer stays than the limit', () => {
    expect(collapsedWindowStays([drop('2026-10-22')], 2)).toHaveLength(1);
  });
});

describe('resolveSeasonGrouping', () => {
  const { resolveSeasonGrouping } = loadHelpers();

  it('follows the admin flag when no override is present', () => {
    expect(resolveSeasonGrouping(null, true)).toBe(true);
    expect(resolveSeasonGrouping(null, false)).toBe(false);
  });

  it('?seasons=0 forces the flat layout even when the flag is on', () => {
    expect(resolveSeasonGrouping('0', true)).toBe(false);
  });

  it('?seasons=1 forces grouping even when the flag is off', () => {
    expect(resolveSeasonGrouping('1', false)).toBe(true);
  });

  it('treats a missing or unset flag as off', () => {
    expect(resolveSeasonGrouping(null, undefined)).toBe(false);
  });
});
