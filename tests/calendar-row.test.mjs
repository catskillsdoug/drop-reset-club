import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = readFileSync(join(ROOT, 'v5', 'app.js'), 'utf8');
const HTML = readFileSync(join(ROOT, 'v5', 'index.html'), 'utf8');
const START = '// --- test:calendar-row:start ---';
const END = '// --- test:calendar-row:end ---';

function loadHelpers() {
  const a = SRC.indexOf(START);
  const b = SRC.indexOf(END);
  if (a === -1 || b === -1) throw new Error('calendar-row markers not found in v5/app.js');
  return new Function(`${SRC.slice(a + START.length, b)}; return { calendarHref, openHouseCalendar };`)();
}
const { calendarHref, openHouseCalendar } = loadHelpers();

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

  it('keeps calendarHref as the href and opens the house calendar on click', () => {
    const line = view.slice(at('Calendar'), view.indexOf('\n', at('Calendar')));
    expect(line).toContain('calendarHref(code)');
    expect(line).toContain('onClick');
    expect(line).toContain('openHouseCalendar(code');
  });
});

describe('openHouseCalendar', () => {
  it('is defined inside the calendar-row markers', () => {
    expect(typeof openHouseCalendar).toBe('function');
  });

  const info = { label: 'Cook House', color: { bg: '#ff551e', text: '#fcf6e9' } };
  const drops = [{ property: { code: 'COOK' } }, { property: { code: 'BARN' } }];
  function run(win) {
    const calls = [];
    globalThis.window = win;
    globalThis.location = { href: '' };
    globalThis.track = () => {};
    if (win.HouseCalendar) win.HouseCalendar.open = (o) => calls.push(o);
    openHouseCalendar('COOK', info, info.color, drops);
    const href = globalThis.location.href;
    delete globalThis.window; delete globalThis.location; delete globalThis.track;
    return { calls, href };
  }

  it('opens in place with only this house drops when HouseCalendar and CalendarCore both exist', () => {
    const r = run({ HouseCalendar: {}, CalendarCore: {} });
    expect(r.href).toBe('');
    expect(r.calls).toHaveLength(1);
    expect(r.calls[0].drops).toEqual([{ property: { code: 'COOK' } }]);
    expect(r.calls[0].fallbackHref).toBe('https://reset.club/stay/cook');
  });

  it('falls back to the booking page when either script is missing', () => {
    expect(run({ CalendarCore: {} })).toEqual({ calls: [], href: 'https://reset.club/stay/cook' });
    const noCore = run({ HouseCalendar: {} });
    expect(noCore.calls).toHaveLength(0);
    expect(noCore.href).toBe('https://reset.club/stay/cook');
  });
});

describe('index.html', () => {
  it('loads calendar-core.js and house-calendar.js before app.js', () => {
    const core = HTML.indexOf('/v5/calendar-core.js');
    const hc = HTML.indexOf('/v5/house-calendar.js');
    const app = HTML.indexOf('/v5/app.js');
    expect(core).toBeGreaterThan(-1);
    expect(hc).toBeGreaterThan(core);
    expect(app).toBeGreaterThan(hc);
  });
});
