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
  return new Function(`${SRC.slice(a + START.length, b)}; return { calendarHref, openHouseCalendar, closeHouseCalendar };`)();
}
const { calendarHref, openHouseCalendar, closeHouseCalendar } = loadHelpers();

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
    expect(at('Pick dates')).toBeGreaterThan(-1);
    expect(at('Gallery')).toBeLessThan(at('Pick dates'));
    expect(at('Pick dates')).toBeLessThan(at('Reviews'));
  });

  it('keeps calendarHref as the href and opens the house calendar on click', () => {
    const line = view.slice(at('Pick dates'), view.indexOf('\n', at('Pick dates')));
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
  // Minimal fake house view: a section with Gallery, Calendar, Reviews rows and a footer.
  function fakeEl(tag, attrs = {}) {
    const e = {
      tagName: tag, attrs: { ...attrs }, innerHTML: '',
      style: { setProperty(k, v) { this[k] = v; }, removeProperty(k) { delete this[k]; } }, children: [], after: null, removed: false, scrolled: 0,
      classList: { set: new Set(), add(c) { this.set.add(c); }, remove(c) { this.set.delete(c); }, contains(c) { return this.set.has(c); } },
      getAttribute(k) { return k in e.attrs ? e.attrs[k] : null; },
      setAttribute(k, v) { e.attrs[k] = String(v); }, removeAttribute(k) { delete e.attrs[k]; },
      querySelector() { return e.children[0] || null; },
      querySelectorAll(sel) { return sel === 'a.hero-option' ? e.rows : []; },
      remove() { e.removed = true; },
      scrollIntoView() { e.scrolled++; },
      focus(o) { e.focused = (e.focused || 0) + 1; e.focusOpts = o; },
      getBoundingClientRect() { return { top: e.top || 0, height: e.height || 0 }; },
    };
    e.after = (n) => { e.placed = n; };
    return e;
  }
  function house(code) {
    const rows = ['#', calendarHref(code), '#'].map((href) => {
      const r = fakeEl('a', { href });
      const arrow = fakeEl('span');
      arrow.innerHTML = '<svg>arrow</svg>';
      r.children.push(arrow);
      return r;
    });
    const section = fakeEl('section');
    section.rows = rows;
    rows[1].top = 500;
    rows[1].height = 70;
    return { section, row: rows[1], arrow: rows[1].children[0] };
  }
  // The nav crumb: its child nodes (a link, a dot, a label) must come back as the same objects.
  function fakeCrumb() {
    const link = { nodeName: 'A', listener: 'drops' };
    const c = { childNodes: [link, { nodeName: '#text', data: 'CATSKILLS' }], link };
    Object.defineProperty(c, 'textContent', {
      get() { return c.childNodes.map((n) => n.data || '').join(''); },
      set(v) { c.childNodes = [{ nodeName: '#text', data: v }]; },
    });
    c.replaceChildren = (...n) => { c.childNodes = n; };
    return c;
  }
  let crumbEl = null;
  function run(win, houses = { COOK: house('COOK') }, code = 'COOK') {
    const calls = [];
    globalThis.window = win;
    globalThis.location = { href: '' };
    globalThis.track = () => {};
    const nav = fakeEl('nav');
    nav.height = 64;
    win.scrollY = 100;
    win.scrolls = [];
    win.scrollTo = (o) => { win.scrolls.push(o); };
    win.innerHeight = 900;
    win.listeners = win.listeners || {};
    win.addEventListener = (t, f) => { (win.listeners[t] = win.listeners[t] || []).push(f); };
    win.removeEventListener = (t, f) => { win.listeners[t] = (win.listeners[t] || []).filter((x) => x !== f); };
    globalThis.document = {
      createElement: (t) => fakeEl(t),
      documentElement: fakeEl('html'),
      getElementById: (id) => (id === 'nav' ? nav : id === 'nav-crumb' ? crumbEl : (houses[id.replace('property-', '').toUpperCase()] || {}).section || null),
    };
    if (win.HouseCalendar) win.HouseCalendar.open = (o) => { calls.push(o); return { close() { o.closedByModule = true; o.onClose(); }, refresh() { o.refreshed = (o.refreshed || 0) + 1; } }; };
    openHouseCalendar(code, info, info.color, drops);
    calls.forEach((o) => { o.htmlForTest = globalThis.document.documentElement; });
    const href = globalThis.location.href;
    delete globalThis.window; delete globalThis.location; delete globalThis.track; delete globalThis.document;
    return { calls, href };
  }

  it('opens in place with only this house drops when HouseCalendar and CalendarCore both exist', () => {
    const r = run({ HouseCalendar: {}, CalendarCore: {} });
    expect(r.href).toBe('');
    expect(r.calls).toHaveLength(1);
    expect(r.calls[0].drops).toEqual([{ property: { code: 'COOK' } }]);
    expect(r.calls[0].fallbackHref).toBe('https://reset.club/stay/cook');
  });

  it('expands the house section in place: mount after the Calendar row, a close control, other rows hidden by class', () => {
    const h = house('COOK');
    const r = run({ HouseCalendar: {}, CalendarCore: {} }, { COOK: h });
    const o = r.calls[0];
    expect(o.mount).toBeTruthy();
    expect(h.row.placed).toBe(o.mount);
    expect(typeof o.onClose).toBe('function');
    expect(h.section.classList.contains('hc-open')).toBe(true);
    expect(h.row.getAttribute('aria-expanded')).toBe('true');
    expect(h.arrow.getAttribute('aria-label')).toBe('Close calendar');
  });

  it('scrolls the Calendar row to the top of the viewport, just below the fixed nav (measured)', () => {
    const h = house('COOK');
    const win = { HouseCalendar: {}, CalendarCore: {} };
    run(win, { COOK: h });
    // row top 500 in the viewport + scrollY 100 - nav height 64
    expect(win.scrolls).toHaveLength(1);
    expect(win.scrolls[0].top).toBe(536);
    expect(h.section.scrolled).toBe(0);
  });

  it('fills the viewport below the Calendar row (viewport - nav - row), refits on resize, clears on close', () => {
    const h = house('COOK');
    const win = { HouseCalendar: {}, CalendarCore: {} };
    run(win, { COOK: h });
    expect(h.section.style['--hc-fill']).toBe('766px'); // 900 - 64 - 70
    expect(win.listeners.resize).toHaveLength(1);
    win.innerHeight = 667;
    globalThis.window = win;
    win.listeners.resize[0]();
    delete globalThis.window;
    expect(h.section.style['--hc-fill']).toBe('533px');
    run(win, { COOK: h });
    expect(h.section.style['--hc-fill']).toBe(undefined);
    expect(win.listeners.resize).toHaveLength(0);
  });

  it('tapping Calendar again closes and restores the row; opening another house closes the first', () => {
    const a = house('COOK');
    const b = house('BARN');
    const houses = { COOK: a, BARN: b };
    const win = { HouseCalendar: {}, CalendarCore: {} };
    const first = run(win, houses, 'COOK').calls[0];
    run(win, houses, 'COOK');
    expect(first.closedByModule).toBe(true);
    expect(first.mount.removed).toBe(true);
    expect(a.section.classList.contains('hc-open')).toBe(false);
    expect(a.row.getAttribute('aria-expanded')).toBe('false');
    expect(a.arrow.innerHTML).toBe('<svg>arrow</svg>');
    expect(a.arrow.getAttribute('aria-label')).toBe(null);

    const again = run(win, houses, 'COOK').calls[0];
    run(win, houses, 'BARN');
    expect(again.closedByModule).toBe(true);
    expect(a.section.classList.contains('hc-open')).toBe(false);
    expect(b.section.classList.contains('hc-open')).toBe(true);
  });

  it('closeHouseCalendar runs the open calendar restore without scrolling to the house: snap back, resize off, section back', () => {
    const h = house('COOK');
    const win = { HouseCalendar: {}, CalendarCore: {} };
    const o = run(win, { COOK: h }).calls[0];
    const html = o.htmlForTest;
    expect(h.section.classList.contains('hc-open')).toBe(true);
    expect(win.listeners.resize).toHaveLength(1);
    globalThis.window = win;
    closeHouseCalendar();
    delete globalThis.window;
    expect(o.closedByModule).toBe(true);
    expect(o.mount.removed).toBe(true);
    expect(h.section.classList.contains('hc-open')).toBe(false);
    expect(h.section.style['--hc-fill']).toBe(undefined);
    expect(win.listeners.resize).toHaveLength(0);
    expect(html.style.scrollSnapType).toBe('');
    expect(h.section.scrolled).toBe(0);
    expect(h.row.getAttribute('aria-expanded')).toBe('false');
    expect(() => closeHouseCalendar()).not.toThrow();
  });

  it('tapping Calendar to close still scrolls back to the house', () => {
    const h = house('COOK');
    const win = { HouseCalendar: {}, CalendarCore: {} };
    run(win, { COOK: h });
    run(win, { COOK: h });
    expect(h.section.scrolled).toBe(1);
  });

  it('closing by the row puts focus back on the Pick dates row, a nav close leaves focus to the nav', () => {
    const h = house('COOK');
    const win = { HouseCalendar: {}, CalendarCore: {} };
    run(win, { COOK: h });
    expect(h.row.focused).toBe(undefined);
    run(win, { COOK: h });
    expect(h.row.focused).toBe(1);
    expect(h.row.focusOpts).toEqual({ preventScroll: true });
    const g = house('COOK');
    run(win, { COOK: g });
    globalThis.window = win;
    closeHouseCalendar();
    delete globalThis.window;
    expect(g.row.focused).toBe(undefined);
  });

  it('while open the nav crumb names the house, and every close puts its own nodes back', () => {
    crumbEl = fakeCrumb();
    const before = [...crumbEl.childNodes];
    try {
      const h = house('COOK');
      const win = { HouseCalendar: {}, CalendarCore: {} };
      run(win, { COOK: h });
      expect(crumbEl.textContent).toBe('COOK HOUSE');
      run(win, { COOK: h });
      expect(crumbEl.childNodes).toEqual(before);
      expect(crumbEl.childNodes[0]).toBe(crumbEl.link);
      run(win, { COOK: h });
      expect(crumbEl.textContent).toBe('COOK HOUSE');
      globalThis.window = win;
      closeHouseCalendar();
      delete globalThis.window;
      expect(crumbEl.childNodes[0]).toBe(crumbEl.link);
      expect(crumbEl.textContent).toBe('CATSKILLS');
    } finally {
      crumbEl = null;
    }
  });

  it('the section watcher keeps the house name on the crumb while that house is open', () => {
    expect(SRC).toContain('crumb.textContent = houseCalOpen && houseCalOpen.section === entry.target ? houseCalOpen.crumb : collMeta().crumb;');
  });

  it('resize refits and refreshes the calendar arrows', () => {
    const h = house('COOK');
    const win = { HouseCalendar: {}, CalendarCore: {} };
    const o = run(win, { COOK: h }).calls[0];
    globalThis.window = win;
    win.listeners.resize[0]();
    delete globalThis.window;
    expect(o.refreshed).toBe(1);
    run(win, { COOK: h });
  });

  it('in-page navigations close the open calendar first: every filter, both nav crumb jumps', () => {
    const filters = SRC.slice(SRC.indexOf('window.__applyAllFilters = function() {'));
    expect(filters.slice(0, filters.indexOf('\n', filters.indexOf('{') + 2) + 60)).toMatch(/\{\n\s*closeHouseCalendar\(\);/);
    const crumbs = [...SRC.matchAll(/crumb\.onclick = \(e\) => \{\n\s*e\.preventDefault\(\);\n\s*closeHouseCalendar\(\);/g)];
    expect(crumbs).toHaveLength(2);
    expect([...SRC.matchAll(/crumb\.onclick = \(e\) => \{/g)]).toHaveLength(2);
  });

  it('never builds an overlay', () => {
    const region = SRC.slice(SRC.indexOf(START), SRC.indexOf(END));
    expect(region).not.toContain('gallery-overlay');
    expect(region).toContain('mount');
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
