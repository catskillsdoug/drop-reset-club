import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const SRC = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'v5', 'app.js'),
  'utf8'
);
const START = '// --- test:season-row:start ---';
const END = '// --- test:season-row:end ---';

function loadHelpers() {
  const a = SRC.indexOf(START);
  const b = SRC.indexOf(END);
  if (a === -1 || b === -1) throw new Error('season-row markers not found in v5/app.js');
  const w = SRC.indexOf('const WINDOWS = [');
  const windowsSrc = SRC.slice(w, SRC.indexOf('];', w) + 2);
  return new Function(`${windowsSrc}; ${SRC.slice(a + START.length, b)}; return { seasonRowFor, WINDOWS };`)();
}
const { seasonRowFor: rowFor, WINDOWS } = loadHelpers();
const seasonRowFor = today => rowFor(today, WINDOWS);

// Local-time dates, matching what the browser's new Date() gives a guest.
const on = (y, m, d) => new Date(y, m - 1, d, 12);

describe('seasonRowFor', () => {
  it('is Autumn in mid October, covering the autumn micro seasons', () => {
    const row = seasonRowFor(on(2026, 10, 14));
    expect(row.label).toBe('Autumn');
    expect(row.seasonRange).toEqual(['early-fall', 'harvest', 'peak-foliage', 'late-autumn', 'first-frost', 'bare-branches']);
  });

  it('stays Autumn through Nov 30 and flips to Winter on Dec 1', () => {
    expect(seasonRowFor(on(2026, 11, 30)).label).toBe('Autumn');
    expect(seasonRowFor(on(2026, 12, 1)).label).toBe('Winter');
  });

  it('keeps Winter across the new year and through February', () => {
    expect(seasonRowFor(on(2027, 1, 10)).label).toBe('Winter');
    expect(seasonRowFor(on(2027, 2, 28)).seasonRange).toEqual(['early-winter', 'holidays', 'new-years', 'deep-winter', 'long-nights', 'frost', 'thaw']);
  });

  it('is Spring in March and Summer in June', () => {
    expect(seasonRowFor(on(2027, 3, 1)).label).toBe('Spring');
    expect(seasonRowFor(on(2027, 6, 1)).label).toBe('Summer');
  });

  it('keeps the row always shown with its NOW OPEN tag', () => {
    const row = seasonRowFor(on(2026, 10, 14));
    expect(row).toMatchObject({ key: 'season', alwaysShow: true, tag: 'NOW OPEN' });
    expect(row.seasonTarget).toBeUndefined();
  });
});
