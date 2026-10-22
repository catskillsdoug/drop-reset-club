import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const css = readFileSync(resolve(root, 'v5/styles.css'), 'utf8');
const app = readFileSync(resolve(root, 'v5/app.js'), 'utf8');

const START = '// --- test:tag-rotator:start ---';
const END = '// --- test:tag-rotator:end ---';
const block = app.slice(app.indexOf(START) + START.length, app.indexOf(END));

// Body of every @media (max-width: 767px) block, joined.
function phoneCss() {
  let out = '';
  let from = 0;
  for (;;) {
    const i = css.indexOf('@media (max-width: 767px)', from);
    if (i < 0) return out;
    let depth = 0;
    let j = css.indexOf('{', i);
    const start = j + 1;
    for (; j < css.length; j++) {
      if (css[j] === '{') depth++;
      if (css[j] === '}' && --depth === 0) break;
    }
    out += css.slice(start, j) + '\n';
    from = j;
  }
}
// Selector lists of phone rules whose body is display: none.
function phoneHidden() {
  const hidden = [];
  for (const m of phoneCss().matchAll(/([^{}]+)\{\s*display:\s*none(?:\s*!important)?;?\s*\}/g)) {
    m[1].split(',').forEach((s) => hidden.push(s.trim()));
  }
  return hidden;
}

describe('phone hides the badge tags', () => {
  it('hides hero tags, rotating house tags and row badge spans', () => {
    const hidden = phoneHidden();
    expect(hidden).toContain('.hero-option-tag');
    expect(hidden).toContain('.prop-flip-tag');
    expect(hidden).toContain('.prop-row-tag');
  });
  it('desktop .hero-option-tag rule is unchanged', () => {
    const i = css.indexOf('.hero-option-tag {');
    const body = css.slice(i, css.indexOf('}', i));
    expect(body).toContain('display: inline-block');
    expect(body).toContain('border: 3px solid currentColor');
    expect(body).toContain('margin-left: 12px');
    expect(body).not.toContain('none');
  });
  it('the unclassed row badge spans now carry the class', () => {
    expect(app).toMatch(/tagEl\.className = 'prop-row-tag';/);
  });
});

describe('inline display on tag elements', () => {
  // Every place app.js builds an element with one of the tag classes, with its next few lines.
  const sites = [...app.matchAll(/className = '(hero-option-tag|prop-flip-tag|prop-row-tag)'[^\n]*\n([^\n]*\n){0,3}/g)];
  it('finds the tag-building sites', () => {
    expect(sites.length).toBeGreaterThanOrEqual(4);
  });
  it('phone rule beats any inline display with !important', () => {
    const inlineDisplay = sites.some((m) => /cssText\s*=\s*'[^']*display:/.test(m[0]));
    expect(inlineDisplay).toBe(true);
    expect(phoneCss()).toMatch(/display: none !important/);
    ['.hero-option-tag', '.prop-flip-tag', '.prop-row-tag'].forEach((sel) => {
      const rule = phoneCss().match(new RegExp('[^{}]*' + sel.replace('.', '\\.') + '[^{}]*\\{([^}]*)\\}'));
      expect(rule, sel).not.toBeNull();
      expect(rule[1]).toContain('display: none !important');
    });
  });
});

describe('rotator skips the swap when not rendered', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());
  function run(offsetParent) {
    const win = { matchMedia: () => ({ matches: false }) };
    const setup = new Function('window', block + '\nreturn setupTagRotator;')(win);
    const el = { isConnected: true, offsetParent, textContent: 'A', classList: { add() {}, remove() {} } };
    setup(el, ['A', 'B', 'C']);
    vi.advanceTimersByTime(15000);
    return el;
  }
  it('swaps text when rendered', () => {
    expect(run({}).textContent).not.toBe('A');
  });
  it('does not touch the text when offsetParent is null', () => {
    expect(run(null).textContent).toBe('A');
  });
});
