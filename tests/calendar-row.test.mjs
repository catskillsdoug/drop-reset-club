import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const SRC = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'v5', 'app.js'),
  'utf8'
);
const START = '// --- test:calendar-row:start ---';
const END = '// --- test:calendar-row:end ---';

function loadHelpers() {
  const a = SRC.indexOf(START);
  const b = SRC.indexOf(END);
  if (a === -1 || b === -1) throw new Error('calendar-row markers not found in v5/app.js');
  return new Function(`${SRC.slice(a + START.length, b)}; return { calendarHref };`)();
}
const { calendarHref } = loadHelpers();

describe('calendarHref', () => {
  it('sends each house to its OwnerRez page on reset.club, from either site', () => {
    expect(calendarHref('COOK')).toBe('https://reset.club/stay/cook');
    expect(calendarHref('HILL4')).toBe('https://reset.club/stay/hill4');
    expect(calendarHref('BARN')).toBe('https://reset.club/stay/barn');
    expect(calendarHref('ZINK')).toBe('https://reset.club/stay/zink');
  });
});

describe('house view rows', () => {
  // The live house view (#property-<code>), not the dead if (false) one above it.
  const view = SRC.slice(SRC.indexOf("propSection.id = 'property-'"));
  const at = (label) => view.indexOf(`addPropRow('${label}'`);

  it('has a Calendar row second, between Gallery and Reviews', () => {
    expect(at('Calendar')).toBeGreaterThan(-1);
    expect(at('Gallery')).toBeLessThan(at('Calendar'));
    expect(at('Calendar')).toBeLessThan(at('Reviews'));
  });

  it('links the Calendar row to calendarHref for that house', () => {
    const line = view.slice(at('Calendar'), view.indexOf('\n', at('Calendar')));
    expect(line).toContain('calendarHref(code)');
  });
});
