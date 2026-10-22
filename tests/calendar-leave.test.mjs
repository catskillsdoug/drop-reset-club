import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = readFileSync(join(ROOT, 'v5', 'app.js'), 'utf8');
const START = '// --- test:calendar-row:start ---';
const END = '// --- test:calendar-row:end ---';
const a = SRC.indexOf(START);
const b = SRC.indexOf(END);
const { calendarHref, openHouseCalendar } = new Function(`${SRC.slice(a + START.length, b)}; return { calendarHref, openHouseCalendar };`)();

const info = { label: 'Cook House', color: { bg: '#ff551e', text: '#fcf6e9' } };

// Fake DOM in the style of calendar-row.test.mjs, plus an event log so order can be asserted.
function fakeEl(tag, log) {
  const e = {
    tagName: tag, attrs: {}, innerHTML: '', children: [], rows: [],
    style: { setProperty() {}, removeProperty() {} },
    classList: { set: new Set(), add(c) { this.set.add(c); }, remove(c) { this.set.delete(c); }, contains(c) { return this.set.has(c); } },
    getAttribute(k) { return k in e.attrs ? e.attrs[k] : null; },
    setAttribute(k, v) { e.attrs[k] = String(v); }, removeAttribute(k) { delete e.attrs[k]; },
    querySelector() { return e.children[0] || null; },
    querySelectorAll(sel) { return sel === 'a.hero-option' ? e.rows : []; },
    remove() { log.push('mount-removed'); }, scrollIntoView() { log.push('scrollIntoView'); }, focus() { log.push('focus'); },
    after() {},
    getBoundingClientRect() { return { top: e.top || 0, bottom: (e.top || 0) + (e.height || 0), height: e.height || 0 }; },
  };
  return e;
}

// Opens COOK with a fake IntersectionObserver. Returns handles to drive it.
function openWithObserver() {
  const log = [];
  const observers = [];
  const row = fakeEl('a', log);
  row.attrs.href = calendarHref('COOK');
  row.top = 500; row.height = 70;
  const arrow = fakeEl('span', log);
  row.children.push(arrow);
  const section = fakeEl('section', log);
  section.rows = [row];
  const anchor = fakeEl('section', log); // the section now in view
  anchor.top = 300; anchor.height = 800;
  const nav = fakeEl('nav', log); nav.height = 64;
  const html = fakeEl('html', log);
  let snap = '';
  Object.defineProperty(html.style, 'scrollSnapType', { get: () => snap, set: (v) => { snap = v; log.push('snap:' + (v === '' ? 'cleared' : v)); } });
  const win = {
    HouseCalendar: {}, CalendarCore: {}, innerHeight: 900, scrollY: 100,
    scrollTo() {}, scrollBy(o) { log.push({ scrollBy: o }); },
    addEventListener() {}, removeEventListener() {},
    IntersectionObserver: function (cb) {
      const o = { cb, observed: [], disconnected: false, observe(t) { o.observed.push(t); }, disconnect() { o.disconnected = true; log.push('disconnect'); } };
      observers.push(o);
      return o;
    },
  };
  let cal;
  win.HouseCalendar.open = (opts) => { cal = { opts, close() { opts.onClose(); } }; return cal; };
  globalThis.window = win;
  globalThis.location = { href: 'https://reset.club/' };
  globalThis.history = { state: null, replaceState() {} };
  globalThis.track = () => {};
  globalThis.document = {
    createElement: (t) => fakeEl(t, log),
    documentElement: html,
    getElementById: (id) => (id === 'nav' ? nav : id === 'property-cook' ? section : null),
    querySelectorAll: (sel) => (sel === 'section.section' ? [section, anchor] : []),
  };
  openHouseCalendar('COOK', info, info.color, []);
  return {
    log, observers, section, anchor, html, win, module: () => cal,
    report(isIntersecting) { observers[observers.length - 1].cb([{ target: section, isIntersecting }]); },
    done() { delete globalThis.window; delete globalThis.document; delete globalThis.track; },
  };
}

describe('house calendar closes when its house leaves the screen', () => {
  it('creates exactly one observer per open, watching the open section', () => {
    const h = openWithObserver();
    try {
      expect(h.observers).toHaveLength(1);
      expect(h.observers[0].observed).toEqual([h.section]);
    } finally { h.done(); }
  });

  it('a section reported not intersecting closes the calendar in place and snap comes back', () => {
    const h = openWithObserver();
    try {
      h.report(true);
      expect(h.html.style.scrollSnapType).toBe('none');
      h.report(false);
      expect(h.section.classList.contains('hc-open')).toBe(false);
      expect(h.html.style.scrollSnapType).toBe('');
      // stay = true: no scroll back to the house, no focus move
      expect(h.log).not.toContain('scrollIntoView');
      expect(h.log).not.toContain('focus');
    } finally { h.done(); }
  });

  it('a section reported intersecting does not close', () => {
    const h = openWithObserver();
    try {
      h.report(true);
      h.report(true);
      expect(h.section.classList.contains('hc-open')).toBe(true);
      expect(h.html.style.scrollSnapType).toBe('none');
      expect(h.observers[0].disconnected).toBe(false);
    } finally { h.done(); }
  });

  it('ignores callbacks until the open scroll has settled (first report that the section is visible)', () => {
    const h = openWithObserver();
    try {
      h.report(false); // before it was ever seen: still scrolling in
      expect(h.section.classList.contains('hc-open')).toBe(true);
      h.report(true);
      h.report(false);
      expect(h.section.classList.contains('hc-open')).toBe(false);
    } finally { h.done(); }
  });

  it('scroll correction: content lost above the viewport is scrolled back before snap returns', () => {
    const h = openWithObserver();
    try {
      h.report(true);
      // Anchor sits at 300. Closing removes N = 766 px above it, so it will be at -466 after the mount goes.
      const N = 766;
      h.log.length = 0;
      const hook = h.log.push.bind(h.log);
      // the mount's removal is when layout shrinks
      h.log.push = (x) => { if (x === 'mount-removed') h.anchor.top -= N; return hook(x); };
      h.report(false);
      const i = h.log.findIndex((x) => x && x.scrollBy);
      expect(i).toBeGreaterThan(-1);
      expect(h.log[i].scrollBy).toEqual({ top: -N, behavior: 'instant' });
      expect(h.log.indexOf('mount-removed')).toBeLessThan(i);
      expect(i).toBeLessThan(h.log.indexOf('snap:cleared'));
    } finally { h.done(); }
  });

  it('no correction when nothing moved', () => {
    const h = openWithObserver();
    try {
      h.report(true);
      h.log.length = 0;
      h.report(false);
      expect(h.log.some((x) => x && x.scrollBy)).toBe(false);
      expect(h.log).toContain('snap:cleared');
    } finally { h.done(); }
  });

  it('the observer is disconnected when the calendar closes by any path', () => {
    // leaving the screen
    let h = openWithObserver();
    try { h.report(true); h.report(false); expect(h.observers[0].disconnected).toBe(true); } finally { h.done(); }
    // the calendar module closing itself (its own close control)
    h = openWithObserver();
    try { h.module().close(); expect(h.observers[0].disconnected).toBe(true); } finally { h.done(); }
  });

  it('tapping Calendar again closes and disconnects, and a re-open makes one new observer', () => {
    const h = openWithObserver();
    try {
      openHouseCalendar('COOK', info, info.color, []); // second tap closes
      expect(h.observers).toHaveLength(1);
      expect(h.observers[0].disconnected).toBe(true);
      openHouseCalendar('COOK', info, info.color, []); // third tap re-opens
      expect(h.observers).toHaveLength(2);
      expect(h.observers[1].disconnected).toBe(false);
    } finally { h.done(); }
  });

  it('final anchor top equals the initial top even when the browser also anchors part of the shift', () => {
    const h = openWithObserver();
    try {
      h.report(true);
      const N = 349;
      const before = h.anchor.top;
      const hook = h.log.push.bind(h.log);
      let anchoringOn = true;
      h.log.push = (x) => {
        if (x === 'mount-removed') {
          h.anchor.top -= N;
          // the browser's own scroll anchoring moves the page too, unless overflow-anchor is none
          if (h.html.style.overflowAnchor !== 'none') h.anchor.top += 103;
        }
        if (x && x.scrollBy) h.anchor.top -= x.scrollBy.top;
        return hook(x);
      };
      h.report(false);
      expect(anchoringOn).toBe(true);
      expect(h.anchor.top).toBe(before);
      expect(h.html.style.overflowAnchor).toBe('');
    } finally { h.done(); }
  });
});
