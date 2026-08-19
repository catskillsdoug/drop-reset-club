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
  return new Function(`${block}; return { collapseToPrimaryDay, hasBothArrivalDays };`)();
}

const { collapseToPrimaryDay, hasBothArrivalDays } = loadHelpers();

const drop = (arrival, sold = false) => ({ arrival, _sold: sold });

// ZINK / Leaf Peepin' as it stood once the drop feed was unfrozen: two open
// weekends, each bookable on a Thu arrival AND a Fri arrival, surrounded by
// sold synthetics for the weekends that really are booked.
const ZINK_WEEKEND = [
  drop('2026-10-22'),        // Thu — open
  drop('2026-10-23'),        // Fri — open
  drop('2026-10-29'),        // Thu — open
  drop('2026-10-30'),        // Fri — open
  drop('2026-09-25'),        // Fri — open
  drop('2026-10-01', true),  // Thu — sold
  drop('2026-10-02', true),  // Fri — sold
  drop('2026-10-08', true),  // Thu — sold
  drop('2026-10-09', true),  // Fri — sold
  drop('2026-10-15', true),  // Thu — sold
  drop('2026-10-16', true),  // Fri — sold
];

describe('collapseToPrimaryDay', () => {
  it('never hides a bookable drop, however long the list gets', () => {
    const out = collapseToPrimaryDay(ZINK_WEEKEND, 4);
    const bookable = ZINK_WEEKEND.filter(d => !d._sold);
    for (const d of bookable) {
      expect(out, `${d.arrival} must survive the collapse`).toContain(d);
    }
  });

  it('keeps Friday-arrival weekends that the old >7 rule dropped', () => {
    const out = collapseToPrimaryDay(ZINK_WEEKEND, 4).map(d => d.arrival);
    expect(out).toContain('2026-10-23');
    expect(out).toContain('2026-10-30');
    expect(out).toContain('2026-09-25');
  });

  it('still trims sold noise to the primary arrival day', () => {
    const out = collapseToPrimaryDay(ZINK_WEEKEND, 4);
    const soldDows = out.filter(d => d._sold)
      .map(d => new Date(d.arrival + 'T12:00:00Z').getUTCDay());
    expect(soldDows.every(dow => dow === 4)).toBe(true);
    expect(out.length).toBeLessThan(ZINK_WEEKEND.length);
  });

  it('leaves a short list untouched', () => {
    const short = [drop('2026-10-22'), drop('2026-10-23'), drop('2026-10-01', true)];
    expect(collapseToPrimaryDay(short, 4)).toEqual(short);
  });

  it('midweek collapses against Sunday', () => {
    const midweek = [
      drop('2026-10-25'), drop('2026-10-26'),
      drop('2026-09-27'), drop('2026-09-28'),
      drop('2026-10-04', true), drop('2026-10-05', true),
      drop('2026-10-11', true), drop('2026-10-12', true),
    ];
    const out = collapseToPrimaryDay(midweek, 0);
    expect(out.map(d => d.arrival)).toContain('2026-10-26'); // Mon, bookable
    const soldDows = out.filter(d => d._sold)
      .map(d => new Date(d.arrival + 'T12:00:00Z').getUTCDay());
    expect(soldDows.every(dow => dow === 0)).toBe(true);
  });
});

describe('hasBothArrivalDays', () => {
  // The day toggle used to be gated on the ALREADY-collapsed list, so once the
  // collapse ran the toggle hid itself — stranding the Friday drops with no
  // control to reach them. It must read the full list, like rebuildEvGrid does.
  it('is true when the full list holds both Thu and Fri arrivals', () => {
    expect(hasBothArrivalDays(ZINK_WEEKEND, true)).toBe(true);
  });

  it('is false when only one arrival day exists', () => {
    expect(hasBothArrivalDays([drop('2026-10-22'), drop('2026-10-29')], true)).toBe(false);
  });

  it('checks Sun/Mon for midweek', () => {
    expect(hasBothArrivalDays([drop('2026-10-25'), drop('2026-10-26')], false)).toBe(true);
    expect(hasBothArrivalDays([drop('2026-10-25')], false)).toBe(false);
  });
});
