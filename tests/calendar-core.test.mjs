import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

process.env.TZ = 'America/New_York';
const CC = createRequire(import.meta.url)('../v5/calendar-core.js');

const TODAY = '2026-10-20';
function makeDays(overrides = {}) {
  const days = [];
  for (let i = 0; i < 60; i++) {
    const date = CC.addDays('2026-11-01', i);
    days.push(Object.assign({ date, status: 'available', min_nights: 3, max_nights: 7, no_checkout: false }, overrides[date] || {}));
  }
  return days;
}
const mapOf = (overrides) => CC.dayMap(makeDays(overrides));
const drop = (arrival, departure, extra = {}) => Object.assign({
  dropId: 'id-' + arrival, arrival, departure,
  nights: CC.nightsBetween(arrival, departure), dropStatus: 'Available',
  pricing: { total: 2376.4 }, property: { code: 'HILL4' },
}, extra);

describe('addDays / nightsBetween', () => {
  it('crosses DST changes without drifting', () => {
    expect(CC.addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(CC.addDays('2026-11-01', 1)).toBe('2026-11-02');
    expect(CC.addDays('2026-11-01', -1)).toBe('2026-10-31');
    expect(CC.addDays('2027-03-07', 1)).toBe('2027-03-08');
    expect(CC.addDays('2027-03-08', 1)).toBe('2027-03-09');
    expect(CC.addDays('2027-03-01', 14)).toBe('2027-03-15');
    expect(CC.nightsBetween('2026-10-31', '2026-11-03')).toBe(3);
    expect(CC.nightsBetween('2027-03-07', '2027-03-10')).toBe(3);
  });
});

describe('stayCheck', () => {
  it('reports past', () => {
    expect(CC.stayCheck(mapOf(), '2026-11-05', '2026-11-08', '2026-11-06')).toEqual({ ok: false, reason: 'past' });
  });
  it('reports unknown', () => {
    expect(CC.stayCheck(mapOf(), '2026-12-29', '2027-01-03', TODAY)).toEqual({ ok: false, reason: 'unknown' });
  });
  it('reports booked', () => {
    const m = mapOf({ '2026-11-06': { status: 'booked' } });
    expect(CC.stayCheck(m, '2026-11-05', '2026-11-08', TODAY)).toEqual({ ok: false, reason: 'booked' });
  });
  it('reports min_nights', () => {
    expect(CC.stayCheck(mapOf(), '2026-11-05', '2026-11-07', TODAY)).toEqual({ ok: false, reason: 'min_nights' });
  });
  it('reports max_nights', () => {
    expect(CC.stayCheck(mapOf(), '2026-11-05', '2026-11-13', TODAY)).toEqual({ ok: false, reason: 'max_nights' });
  });
  it('does not refuse when max_nights or min_nights is null', () => {
    const m = mapOf({ '2026-11-05': { min_nights: null, max_nights: null } });
    expect(CC.stayCheck(m, '2026-11-05', '2026-11-13', TODAY)).toEqual({ ok: true });
    expect(CC.stayCheck(m, '2026-11-05', '2026-11-06', TODAY)).toEqual({ ok: true });
  });
  it('reports no_checkout', () => {
    const m = mapOf({ '2026-11-11': { no_checkout: true } });
    expect(CC.stayCheck(m, '2026-11-08', '2026-11-11', TODAY)).toEqual({ ok: false, reason: 'no_checkout' });
  });
  it('is ok when only the departure day is booked', () => {
    const m = mapOf({ '2026-11-08': { status: 'booked' } });
    expect(CC.stayCheck(m, '2026-11-05', '2026-11-08', TODAY)).toEqual({ ok: true });
  });
});

describe('suggestions', () => {
  const m = mapOf({ '2026-11-16': { status: 'booked' } });
  it('keeps open Available drops, drops Booked and blocked ones', () => {
    const list = CC.suggestions([
      drop('2026-11-14', '2026-11-17', { dropId: 'blocked' }),
      drop('2026-11-10', '2026-11-13', { dropId: 'sold', dropStatus: 'Booked' }),
      drop('2026-11-05', '2026-11-08', { dropId: 'good' }),
    ], m, TODAY);
    expect(list).toEqual([{ arrival: '2026-11-05', departure: '2026-11-08', nights: 3, total: 2376.4, dropId: 'good' }]);
  });
});

describe('suggestionAt', () => {
  const list = [
    { arrival: '2026-11-05', departure: '2026-11-08', nights: 3, total: 1, dropId: 'thu' },
    { arrival: '2026-11-06', departure: '2026-11-09', nights: 3, total: 2, dropId: 'fri' },
  ];
  it('prefers the one arriving on the date, else earliest covering', () => {
    expect(CC.suggestionAt(list, '2026-11-06').dropId).toBe('fri');
    expect(CC.suggestionAt(list, '2026-11-07').dropId).toBe('thu');
    expect(CC.suggestionAt(list, '2026-11-20')).toBeNull();
  });
});

describe('slide', () => {
  const m = mapOf({ '2026-11-09': { status: 'booked' } });
  it('moves an open stay', () => {
    expect(CC.slide(m, { arrival: '2026-11-05', departure: '2026-11-08' }, 1, TODAY)).toEqual({ arrival: '2026-11-06', departure: '2026-11-09' });
  });
  it('returns null when the move hits a booked night', () => {
    expect(CC.slide(m, { arrival: '2026-11-05', departure: '2026-11-08' }, 2, TODAY)).toBeNull();
  });
});

describe('cellsForMonth', () => {
  const base = (over = {}) => Object.assign({
    map: mapOf({ '2026-11-12': { status: 'booked' }, '2026-11-08': { status: 'booked' }, '2026-11-07': { status: 'booked', } }),
    today: '2026-11-03', suggestions: [], sel: null,
  }, over);
  const at = (cells, date) => cells.find((c) => c && c.date === date);

  it('is Monday-first with leading nulls', () => {
    const cells = CC.cellsForMonth(2026, 11, base());
    expect(cells.slice(0, 7).map((c) => c === null)).toEqual([true, true, true, true, true, true, false]);
    expect(cells[6].date).toBe('2026-11-01');
    expect(cells[6].day).toBe(1);
  });
  it('marks off and past without buttons', () => {
    const cells = CC.cellsForMonth(2026, 11, base());
    expect(at(cells, '2026-11-12').cls).toContain('off');
    expect(at(cells, '2026-11-12').button).toBe(false);
    expect(at(cells, '2026-11-02').cls).toContain('past');
    expect(at(cells, '2026-11-02').button).toBe(false);
    expect(at(cells, '2026-11-20').button).toBe(true);
  });
  it('marks a past day absent from the map as past only, never off', () => {
    const m = CC.dayMap(makeDays().filter((d) => d.date >= '2026-11-03'));
    const cells = CC.cellsForMonth(2026, 11, base({ map: m }));
    expect(at(cells, '2026-11-01').cls).toEqual(['past']);
    expect(at(cells, '2026-11-02').cls).toEqual(['past']);
    expect(at(cells, '2026-11-02').button).toBe(false);
  });
  const dropDays = (cells) => cells.filter((c) => c && c.cls.includes('drop')).map((c) => c.date);
  it('marks the arrival day of a suggestion drop, and no other day of that stay', () => {
    const s = { arrival: '2026-11-05', departure: '2026-11-08', nights: 3, total: 1, dropId: 'a' };
    const cells = CC.cellsForMonth(2026, 11, base({ map: mapOf(), suggestions: [s] }));
    expect(at(cells, '2026-11-05').cls).toContain('drop');
    for (const d of ['04', '06', '07', '08']) expect(at(cells, '2026-11-' + d).cls).not.toContain('drop');
    expect(dropDays(cells)).toEqual(['2026-11-05']);
  });
  it('two overlapping drops arriving 11-05 and 11-06 give drop on both', () => {
    const sugs = [
      { arrival: '2026-11-05', departure: '2026-11-08', nights: 3, total: 1, dropId: 'thu' },
      { arrival: '2026-11-06', departure: '2026-11-09', nights: 3, total: 2, dropId: 'fri' },
    ];
    const cells = CC.cellsForMonth(2026, 11, base({ map: mapOf(), suggestions: sugs }));
    expect(dropDays(cells)).toEqual(['2026-11-05', '2026-11-06']);
  });
  it('back-to-back and separate drops: drop on each arrival day only', () => {
    const sugs = [
      { arrival: '2026-11-05', departure: '2026-11-08', nights: 3, total: 1, dropId: 'a' },
      { arrival: '2026-11-08', departure: '2026-11-11', nights: 3, total: 2, dropId: 'b' },
      { arrival: '2026-11-14', departure: '2026-11-15', nights: 1, total: 3, dropId: 'c' },
    ];
    const cells = CC.cellsForMonth(2026, 11, base({ map: mapOf(), suggestions: sugs }));
    expect(dropDays(cells)).toEqual(['2026-11-05', '2026-11-08', '2026-11-14']);
  });
  it('drops are dotted with no mode at all', () => {
    const s = { arrival: '2026-11-05', departure: '2026-11-08', nights: 3, total: 1, dropId: 'a' };
    const cells = CC.cellsForMonth(2026, 11, base({ map: mapOf(), suggestions: [s] }));
    expect(dropDays(cells)).toEqual(['2026-11-05']);
  });
  it('no cell ever carries bs, bm, be, blk or nob', () => {
    const sugs = [
      { arrival: '2026-11-02', departure: '2026-11-05', nights: 3, total: 1, dropId: 'before' },
      { arrival: '2026-11-05', departure: '2026-11-08', nights: 3, total: 2, dropId: 'picked' },
      { arrival: '2026-11-07', departure: '2026-11-10', nights: 3, total: 3, dropId: 'overlap' },
      { arrival: '2026-11-10', departure: '2026-11-13', nights: 3, total: 4, dropId: 'touch' },
    ];
    const states = [
      { suggestions: sugs },
      { suggestions: sugs, sel: { arrival: '2026-11-05', departure: '2026-11-08' } },
      { suggestions: sugs, sel: { arrival: '2026-11-05', departure: '2026-11-08' } },
    ];
    for (const st of states) {
      const cells = CC.cellsForMonth(2026, 11, base(Object.assign({ map: mapOf(), today: '2026-11-01' }, st)));
      for (const c of cells) if (c) for (const k of ['bs', 'bm', 'be', 'blk', 'nob']) expect(c.cls).not.toContain(k);
    }
  });
  const selOf = (c) => c.cls.filter((k) => ['sel', 'sel-s', 'sel-e'].includes(k));
  it('marks a selected drop sel-s, sel, sel-e, and its arrival keeps drop', () => {
    const s = { arrival: '2026-11-05', departure: '2026-11-08', nights: 3, total: 1, dropId: 'a' };
    const cells = CC.cellsForMonth(2026, 11, base({ map: mapOf(), suggestions: [s], sel: { arrival: '2026-11-05', departure: '2026-11-08' } }));
    expect(['04', '05', '06', '07', '08', '09'].map((d) => selOf(at(cells, '2026-11-' + d))))
      .toEqual([[], ['sel', 'sel-s'], ['sel'], ['sel'], ['sel', 'sel-e'], []]);
    expect(dropDays(cells)).toEqual(['2026-11-05']);
  });
  it('draws a stay afternoon in, morning out: the checkout day is part of the selection', () => {
    const cells = CC.cellsForMonth(2026, 11, base({ map: mapOf(), sel: { arrival: '2026-11-05', departure: '2026-11-08' } }));
    expect(['04', '05', '06', '07', '08', '09'].map((d) => selOf(at(cells, '2026-11-' + d))))
      .toEqual([[], ['sel', 'sel-s'], ['sel'], ['sel'], ['sel', 'sel-e'], []]);
  });
  it('a selection among overlapping drops leaves every drop arrival dotted', () => {
    const sugs = [
      { arrival: '2026-11-02', departure: '2026-11-05', nights: 3, total: 1, dropId: 'before' },
      { arrival: '2026-11-05', departure: '2026-11-08', nights: 3, total: 2, dropId: 'picked' },
      { arrival: '2026-11-07', departure: '2026-11-10', nights: 3, total: 3, dropId: 'overlap' },
    ];
    const sel = { arrival: '2026-11-05', departure: '2026-11-08' };
    const cells = CC.cellsForMonth(2026, 11, base({ map: mapOf(), today: '2026-11-01', suggestions: sugs, sel }));
    expect(dropDays(cells)).toEqual(['2026-11-02', '2026-11-05', '2026-11-07']);
    expect(selOf(at(cells, '2026-11-07'))).toEqual(['sel']);
  });
});

describe('monthSpan', () => {
  it('extends to the furthest departure month', () => {
    const list = [{ arrival: '2027-05-30', departure: '2027-06-02', nights: 3, total: 1, dropId: 'x' }];
    expect(CC.monthSpan('2026-10-20', list)).toEqual({ from: '2026-10-01', to: '2027-06-30' });
  });
  it('defaults to today + 180 days', () => {
    expect(CC.monthSpan('2026-10-20', [])).toEqual({ from: '2026-10-01', to: '2027-04-30' });
  });
});

describe('colours', () => {
  const hex = (a) => '#' + a.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
  const lum = (rgb) => { const [r, g, b] = rgb.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const rgbOf = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  it('derives tint and a readable deep', () => {
    const c = CC.colours('#ff551e', '#fcf6e9');
    expect(c.c).toBe('#ff551e');
    expect(c.ink).toBe('#fcf6e9');
    const bg = [255, 85, 30];
    expect(c.tint).toBe(hex(bg.map((v, i) => v + (255 - v) * 0.88)));
    expect(1.05 / (lum(rgbOf(c.deep)) + 0.05)).toBeGreaterThanOrEqual(4.5);
  });
  it('falls back to the stronger darkening when .35 is not readable', () => {
    const bg = [255, 204, 0];
    const c = CC.colours('#ffcc00', '#000000');
    expect(c.deep).toBe(hex(bg.map((v) => v * 0.4)));
    expect(1.05 / (lum(rgbOf(c.deep)) + 0.05)).toBeGreaterThanOrEqual(4.5);
  });
});
