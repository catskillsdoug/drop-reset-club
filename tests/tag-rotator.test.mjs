import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const app = readFileSync(resolve(root, 'v5/app.js'), 'utf8');
const html = readFileSync(resolve(root, 'v5/index.html'), 'utf8');

const START = '// --- test:tag-rotator:start ---';
const END = '// --- test:tag-rotator:end ---';
const block = app.slice(app.indexOf(START) + START.length, app.indexOf(END));

// Fake element: its rendered width comes from widthOf(text), so tests control the "font".
function fakeTag(ctx, initial) {
  const make = () => {
    const el = { style: {}, isConnected: true, text: '' };
    el.classList = { remove() {}, add() {} };
    Object.defineProperty(el, 'textContent', { get: () => el.text, set: (v) => { el.text = v; } });
    el.getBoundingClientRect = () => ({ width: ctx.widthOf(el.text) });
    return el;
  };
  const el = make();
  el.text = initial;
  el.minWidthWrites = [];
  let mw = '';
  Object.defineProperty(el.style, 'minWidth', { get: () => mw, set: (v) => { mw = v; el.minWidthWrites.push(v); }, enumerable: true });
  el.parentNode = {
    appendChild(c) { c.parentNode = el.parentNode; return c; },
  };
  el.cloneNode = () => { const p = make(); p.remove = () => {}; return p; };
  return el;
}

function load(opts = {}) {
  const win = {
    handlers: {},
    matchMedia: () => ({ matches: !!opts.reduce }),
    addEventListener(t, fn) { win.handlers[t] = fn; },
    removeEventListener() {},
  };
  const observers = [];
  class RO { constructor(cb) { this.cb = cb; observers.push(this); } observe() {} disconnect() {} }
  const doc = { fonts: { ready: Promise.resolve() } };
  const setup = new Function('window', 'document', 'ResizeObserver', block + '\nreturn setupTagRotator;')(win, doc, RO);
  return { setup, win, observers };
}

const TAGS = ['Hot tub', 'Fireplace', 'Cinema'];
const widths = { 'Hot tub': 70, Fireplace: 95, Cinema: 60 };

describe('setupTagRotator keeps one width', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('sets min-width to the widest tag before the first swap', () => {
    const ctx = { widthOf: (t) => widths[t] };
    const el = fakeTag(ctx, TAGS[0]);
    load().setup(el, TAGS);
    expect(el.style.minWidth).toBe('95px');
    expect(el.text).toBe('Hot tub');
  });

  it('measures prefix plus tag', () => {
    const ctx = { widthOf: (t) => t.length * 10 };
    const el = fakeTag(ctx, '# Cinema');
    load().setup(el, TAGS, '# ');
    expect(el.style.minWidth).toBe(String('# Fireplace'.length * 10) + 'px');
  });

  it('never changes min-width across swaps', () => {
    const ctx = { widthOf: (t) => widths[t] };
    const el = fakeTag(ctx, TAGS[0]);
    load().setup(el, TAGS);
    const seen = new Set();
    for (let n = 0; n < 12; n++) {
      vi.advanceTimersByTime(1700);
      seen.add(el.text);
      expect(el.style.minWidth).toBe('95px');
    }
    expect(seen.size).toBeGreaterThan(1);
    expect(el.minWidthWrites).toEqual(['95px']);
  });

  it('never writes 0px for an element that is not laid out, then sizes it once visible', () => {
    const ctx = { widthOf: () => 0 };
    const el = fakeTag(ctx, TAGS[0]);
    const { setup, observers } = load();
    setup(el, TAGS);
    expect(el.minWidthWrites).toEqual([]);
    ctx.widthOf = (t) => widths[t];
    observers.forEach((o) => o.cb([]));
    expect(el.minWidthWrites).toEqual(['95px']);
  });

  it('re-measures on resize when the font size changes', () => {
    const ctx = { widthOf: (t) => widths[t] };
    const el = fakeTag(ctx, TAGS[0]);
    const { setup, win } = load();
    setup(el, TAGS);
    ctx.widthOf = (t) => widths[t] * 2;
    win.handlers.resize();
    vi.advanceTimersByTime(300);
    expect(el.style.minWidth).toBe('190px');
  });

  it('leaves the reduced-motion path alone', () => {
    const ctx = { widthOf: (t) => widths[t] };
    const el = fakeTag(ctx, TAGS[0]);
    load({ reduce: true }).setup(el, TAGS);
    expect(el.minWidthWrites).toEqual([]);
    vi.advanceTimersByTime(20000);
    expect(el.text).toBe('Hot tub');
  });

  it('busts the app.js cache query', () => {
    expect(html).toContain('/v5/app.js?v=275');
  });
});
