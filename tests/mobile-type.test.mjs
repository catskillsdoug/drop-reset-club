import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const css = readFileSync(resolve(root, 'v5/styles.css'), 'utf8');
const app = readFileSync(resolve(root, 'v5/app.js'), 'utf8');
const html = readFileSync(resolve(root, 'v5/index.html'), 'utf8');

const START = '// --- test:toggle-helpers:start ---';
const END = '// --- test:toggle-helpers:end ---';
const block = app.slice(app.indexOf(START) + START.length, app.indexOf(END));

// The phone block: the media query that holds the toggle and type rules.
function phoneBlock() {
  const i = css.indexOf('@media (max-width: 767px)');
  expect(i).toBeGreaterThan(-1);
  let depth = 0;
  for (let j = css.indexOf('{', i); j < css.length; j++) {
    if (css[j] === '{') depth++;
    if (css[j] === '}' && --depth === 0) return css.slice(i, j + 1);
  }
  throw new Error('unterminated media query');
}
// Declarations of the first rule with this exact selector inside text.
function decls(text, selector) {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = text.match(new RegExp('(?:^|[}\\s])' + esc + '\\s*\\{([^}]*)\\}'));
  expect(m, selector).not.toBeNull();
  return m[1].replace(/\s+/g, ' ');
}

// Small fake element tree: a toggle holding a selector and options.
function fakeToggle(opts) {
  const sel = { style: {} };
  const options = opts.map((o) => ({ offsetLeft: o.left, offsetWidth: o.width, style: {} }));
  return {
    sel,
    dataset: {},
    querySelector(q) { expect(q).toBe('.drop-toggle-selector'); return sel; },
    querySelectorAll(q) { expect(q).toBe('.drop-toggle-option'); return options; },
  };
}
function fakeEl() {
  const el = { children: [], attrs: {}, className: '', style: {} };
  let text = '';
  Object.defineProperty(el, 'textContent', { get: () => text, set: (v) => { text = v; el.children.length = 0; } });
  el.appendChild = (c) => { el.children.push(c); return c; };
  el.setAttribute = (k, v) => { el.attrs[k] = v; };
  return el;
}
const fakeDocument = { createElement: () => fakeEl() };
const helpers = new Function('document', block + '\nreturn { placeSelector, setToggleOptionLabel };')(fakeDocument);

describe('phone type (below 768px)', () => {
  const phone = phoneBlock();
  it('sets body and heading size on the root', () => {
    const root = decls(phone, ':root');
    expect(root).toContain('--text-body: 15px');
    expect(root).toContain('--text-heading: 30px');
  });
  it('sets drop rows to 15px', () => {
    expect(phone).toMatch(/\.drop-days,\s*\.drop-dates,\s*\.drop-nights,\s*\.drop-tag,\s*\.drop-sep,\s*\.drop-price\s*\{[^}]*font-size:\s*15px/);
  });
  it('sets toggle labels to 13px, content-sized, 14px padding', () => {
    expect(decls(phone, '.drop-toggle-option')).toContain('font-size: 13px');
    expect(decls(phone, '.drop-toggle-option')).toContain('padding: 0 14px');
    const t = decls(phone, '.drop-toggle');
    expect(t).toContain('width: auto');
    expect(t).toContain('grid-template-columns: auto auto');
  });
  it('lets the day toggle size to its words too', () => {
    expect(decls(phone, '.day-toggle')).toContain('width: auto');
  });
  it('shows the short label and hides the long one', () => {
    expect(decls(phone, '.drop-toggle-option .opt-long')).toContain('display: none');
    expect(decls(phone, '.drop-toggle-option .opt-short')).toContain('display: inline');
  });
});

describe('desktop rules are unchanged', () => {
  it('keeps the 18px / 36px tokens and 18px rows and labels', () => {
    expect(decls(css, ':root')).toContain('--text-body: 18px');
    expect(decls(css, ':root')).toContain('--text-heading: 36px');
    expect(css).toMatch(/\.drop-tag,\s*\.drop-sep,\s*\.drop-price\s*\{[^}]*font-size:\s*18px/);
    expect(decls(css, '.drop-toggle-option')).toContain('font-size: 18px');
  });
  it('keeps the 20rem two-column toggle', () => {
    const t = decls(css, '.drop-toggle');
    expect(t).toContain('grid-template-columns: 1fr 1fr');
    expect(t).toContain('width: 20rem');
  });
  it('hides the short label by default', () => {
    expect(decls(css, '.drop-toggle-option .opt-short')).toContain('display: none');
  });
});

describe('toggle option labels', () => {
  it('renders long and short spans and names the option with the long word', () => {
    const o = fakeEl();
    helpers.setToggleOptionLabel(o, 'Midweek', 'Week', 'Midweek');
    expect(o.children.map((c) => [c.className, c.textContent])).toEqual([
      ['opt-long', 'Midweek'],
      ['opt-short', 'Week'],
    ]);
    expect(o.attrs['aria-label']).toBe('Midweek');
  });
  it('replaces earlier labels instead of stacking', () => {
    const o = fakeEl();
    o.children = [{}, {}, {}];
    helpers.setToggleOptionLabel(o, 'FRI', 'FR', 'Friday');
    expect(o.children).toHaveLength(2);
    expect(o.attrs['aria-label']).toBe('Friday');
  });
  it('app.js uses the short forms from the brief', () => {
    expect(app).toMatch(/'Midweek',\s*'Week'/);
    expect(app).toMatch(/'THU',\s*'TH',\s*'Thursday'/);
    expect(app).toMatch(/'FRI',\s*'FR',\s*'Friday'/);
  });
  it('options are not given raw text any more', () => {
    expect(app).not.toMatch(/span\.textContent = (label|lbl)\b/);
    expect(app).not.toMatch(/o\.textContent = newLabels/);
  });
});

describe('selector pill', () => {
  it('goes through one helper everywhere', () => {
    const outside = app.replace(block, '');
    expect(outside).not.toMatch(/translateX\(\$\{/);
    expect(outside).not.toMatch(/style\.transform\s*=\s*['"`]translateX/);
    expect((outside.match(/placeSelector\(/g) || []).length).toBeGreaterThanOrEqual(15);
  });
  it('places the pill on the active option position and width', () => {
    const t = fakeToggle([{ left: 4, width: 98 }, { left: 102, width: 70 }]);
    helpers.placeSelector(t, 1);
    expect(t.sel.style.transform).toBe('translateX(102px)');
    expect(t.sel.style.width).toBe('70px');
    helpers.placeSelector(t, 0);
    expect(t.sel.style.transform).toBe('translateX(4px)');
    expect(t.sel.style.width).toBe('98px');
  });
  it('remembers the index so a resize can re-place it', () => {
    const t = fakeToggle([{ left: 4, width: 98 }, { left: 102, width: 70 }]);
    helpers.placeSelector(t, 1);
    expect(t.dataset.selIdx).toBe('1');
  });
  it('falls back to column math while the toggle is hidden', () => {
    const t = fakeToggle([{ left: 0, width: 0 }, { left: 0, width: 0 }]);
    helpers.placeSelector(t, 1);
    expect(t.sel.style.transform).toBe('translateX(100%)');
    expect(t.sel.style.width).toBe('');
  });
});

describe('cache bust', () => {
  it('index.html points at bumped files', () => {
    expect(html).not.toContain('styles.css?v=230');
    expect(html).not.toContain('app.js?v=273');
    expect(html).toContain('styles.css?v=233');
    expect(html).toContain('app.js?v=275');
  });
});

describe('pill is placed after labels and colors are set', () => {
  it('day toggle relabel places the pill after the last label swap', () => {
    const i = app.indexOf('const newLabels = isWknd');
    const seg = app.slice(i, app.indexOf('Show day toggle only', i));
    expect(seg.indexOf('placeSelector(')).toBeGreaterThan(seg.lastIndexOf('setToggleOptionLabel('));
  });
  it('reset paths place the pill after the option loop', () => {
    const re = /if \(sel\) sel\.style\.display = '';\n\s*t\.querySelectorAll\('\.drop-toggle-option'\)\.forEach\(\(o, idx\) => \{\n[^\n]*\n\s*\}\);\n\s*if \(sel\) placeSelector\(t, 0\);/g;
    expect((app.match(re) || []).length).toBe(2);
  });
});
