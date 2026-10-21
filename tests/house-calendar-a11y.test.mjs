import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

process.env.TZ = 'America/New_York';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const HC = createRequire(import.meta.url)('../v5/house-calendar.js');
const SRC = readFileSync(join(ROOT, 'v5', 'house-calendar.js'), 'utf8');
const CSS = readFileSync(join(ROOT, 'v5', 'styles.css'), 'utf8');
const BLOCK = CSS.slice(CSS.indexOf('/* House calendar */'));
const rule = (sel) => { const m = BLOCK.match(new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\{([^}]*)\\}')); return m ? m[1] : null; };

describe('footSticky', () => {
  it('pins the foot once a stay is picked, in any foot state, and never before', () => {
    expect(HC.footSticky({ sel: null })).toBe(false);
    const sel = { arrival: '2026-10-27', departure: '2026-10-30' };
    expect(HC.footSticky({ sel, quoting: true })).toBe(true);
    expect(HC.footSticky({ sel, quote: { kind: 'ok' } })).toBe(true);
    expect(HC.footSticky({ sel, quote: { kind: 'error' } })).toBe(true);
    expect(HC.footSticky({ sel, hint: 'No stays from that day' })).toBe(true);
  });
});

describe('sticky foot styles and wiring', () => {
  it('sticks to the viewport bottom on the house colour with a 3px top rule and the safe area', () => {
    const r = rule('.hc-foot.stuck');
    expect(r).toContain('position:sticky');
    expect(r).toContain('bottom:0');
    expect(r).toContain('background:var(--c)');
    expect(r).toContain('border-top:3px solid var(--c-ink)');
    expect(r).toContain('env(safe-area-inset-bottom)');
  });
  it('the foot toggles stuck from footSticky, and quote messages sit in flow above it', () => {
    expect(SRC).toContain("foot.classList.toggle('stuck', footSticky(st));");
    expect(SRC).toMatch(/hc\.appendChild\(panel\); hc\.appendChild\(after\); hc\.appendChild\(foot\);/);
  });
});

describe('stripHeight', () => {
  // Phones: one 100% wide month per view. Desktop: two 50% months per view.
  const phone = [{ left: 0, width: 375, height: 287 }, { left: 375, width: 375, height: 335 }, { left: 750, width: 375, height: 287 }];
  it('is the visible month on a phone', () => {
    expect(HC.stripHeight(phone, 0, 375)).toBe(287);
    expect(HC.stripHeight(phone, 375, 375)).toBe(335);
  });
  it('mid-swipe it is the taller of the two in view, so the strip never clips', () => {
    expect(HC.stripHeight(phone, 200, 375)).toBe(335);
  });
  it('treats sub-pixel edges as out of view', () => {
    expect(HC.stripHeight(phone, 0.5, 375)).toBe(287);
    expect(HC.stripHeight(phone, 374.5, 375)).toBe(335);
  });
  it('desktop: the taller of the two visible months', () => {
    const desk = [{ left: 0, width: 600, height: 287 }, { left: 600, width: 600, height: 335 }, { left: 1200, width: 600, height: 287 }, { left: 1800, width: 600, height: 287 }];
    expect(HC.stripHeight(desk, 0, 1200)).toBe(335);
    expect(HC.stripHeight(desk, 1200, 1200)).toBe(287);
  });
  it('wired: strip height follows the scroll, months take their own height, smooth unless reduced motion', () => {
    expect(SRC).toContain('strip.style.height = ');
    expect(rule('.hc-strip')).toContain('align-items:flex-start');
    expect(rule('.hc-strip')).toMatch(/transition:height/);
    expect(BLOCK).toMatch(/@media \(prefers-reduced-motion:reduce\)\{[^@]*\.hc-strip\{transition:none\}/);
  });
});

describe('guest and nights rows', () => {
  it('are the 44px stepper height with no extra vertical padding, day circles still 44px', () => {
    expect(rule('.hc-guests')).toContain('padding:0');
    expect(rule('.hc-step button')).toContain('width:44px;height:44px');
    expect(rule('.hc-grid>button,.hc-grid>span')).toContain('height:44px');
  });
});

describe('dayLabel', () => {
  const c = (date, cls, button) => ({ date, day: +date.slice(8), cls, button });
  it('full date and available', () => {
    expect(HC.dayLabel(c('2026-10-27', [], true))).toBe('Tuesday, October 27, 2026, available');
  });
  it('booked and past days', () => {
    expect(HC.dayLabel(c('2026-10-28', ['off'], false))).toBe('Wednesday, October 28, 2026, booked');
    expect(HC.dayLabel(c('2026-10-01', ['past'], false))).toBe('Thursday, October 1, 2026, past');
  });
  it('the stay: arrival, nights and departure', () => {
    expect(HC.dayLabel(c('2026-10-27', ['sel', 'sel-s'], true))).toBe('Tuesday, October 27, 2026, your arrival');
    expect(HC.dayLabel(c('2026-10-28', ['sel'], true))).toBe('Wednesday, October 28, 2026, in your stay');
    expect(HC.dayLabel(c('2026-10-30', ['sel', 'sel-e'], true))).toBe('Friday, October 30, 2026, your departure');
    expect(HC.dayLabel(c('2026-10-30', ['off', 'sel', 'sel-e'], false))).toBe('Friday, October 30, 2026, your departure, booked');
  });
  it('a drop arriving that day', () => {
    expect(HC.dayLabel(c('2026-11-05', ['drop'], true))).toBe('Thursday, November 5, 2026, available, drop starts');
    expect(HC.dayLabel(c('2026-11-05', ['drop', 'sel', 'sel-s'], true))).toBe('Thursday, November 5, 2026, your arrival, drop starts');
  });
  it('wired: buttons are named by dayLabel, other days carry it as hidden text, the number hidden', () => {
    expect(SRC).toContain("b.setAttribute('aria-label', dayLabel(c));");
    expect(SRC).toContain("el('span', 'hc-sr', dayLabel(c))");
  });
});

describe('bookLabel', () => {
  it('names the dates and the total', () => {
    expect(HC.bookLabel({ arrival: '2026-10-27', departure: '2026-10-30' }, '$1,276.90', 'Cook House')).toBe('Book Cook House, Oct 27 to 30, $1,276.90');
    expect(HC.bookLabel({ arrival: '2026-10-30', departure: '2026-11-02' }, '$900.00', 'Cook House')).toBe('Book Cook House, Oct 30 to Nov 2, $900.00');
    expect(HC.bookLabel({ arrival: '2026-12-30', departure: '2027-01-02' }, '$900.00', 'Hill House')).toBe('Book Hill House, Dec 30 to Jan 2, $900.00');
  });
  it('wired on the live Book link', () => {
    expect(SRC).toContain("book.setAttribute('aria-label', bookLabel(st.sel, q.total, o.name));");
  });
});

describe('liveText', () => {
  const sel = { arrival: '2026-10-27', departure: '2026-10-30' };
  it('the stay and price once quoted', () => {
    expect(HC.liveText({ sel, quote: { kind: 'ok', total: '$1,276.90' } }, 'Cook House')).toBe('Cook House, Tue Oct 27 to Fri Oct 30, 3 nights, $1,276.90 all in');
  });
  it('hints and edit prompts', () => {
    expect(HC.liveText({ sel: null, hint: 'No stays from that day' })).toBe('No stays from that day');
    expect(HC.liveText({ sel, edit: 'arrive' })).toBe('Tap your new arrival day');
    expect(HC.liveText({ sel, edit: 'depart' })).toBe('Tap your new departure day');
  });
  it('quote failures', () => {
    expect(HC.liveText({ sel, quote: { kind: 'gone', message: 'Those dates are taken.' } })).toBe('Those dates are taken.');
    expect(HC.liveText({ sel, quote: { kind: 'error', message: "Couldn't check the price. Try again." } })).toBe("Couldn't check the price. Try again.");
  });
  it('nothing while quoting or before a pick', () => {
    expect(HC.liveText({ sel, quoting: true })).toBe('');
    expect(HC.liveText({ sel, quoting: true, quote: { kind: 'ok', total: '$1,276.90' } }, 'Cook House')).toBe('');
    expect(HC.liveText({ sel: null })).toBe('');
  });
  it('wired: a polite status region, written only when the text changes', () => {
    expect(SRC).toContain("live.setAttribute('aria-live', 'polite');");
    expect(SRC).toMatch(/if \(t !== lastLive\) \{ lastLive = t; live\.textContent = t; \}/);
  });
});

describe('keyStep (arrow keys in the months)', () => {
  const open = new Set(['2026-10-26', '2026-10-27', '2026-10-29', '2026-11-03', '2026-11-05']);
  const has = (d) => open.has(d);
  it('left and right move a day, up and down a week', () => {
    expect(HC.keyStep('2026-10-27', 'ArrowLeft', has)).toBe('2026-10-26');
    expect(HC.keyStep('2026-10-27', 'ArrowDown', has)).toBe('2026-11-03');
    expect(HC.keyStep('2026-11-03', 'ArrowUp', has)).toBe('2026-10-27');
  });
  it('skips booked days in the same direction', () => {
    expect(HC.keyStep('2026-10-27', 'ArrowRight', has)).toBe('2026-10-29');
  });
  it('null when nothing open lies that way, or for another key', () => {
    expect(HC.keyStep('2026-10-26', 'ArrowLeft', has)).toBe(null);
    expect(HC.keyStep('2026-10-27', 'Enter', has)).toBe(null);
  });
});

describe('rovingDate (the one day in the tab order)', () => {
  const dates = ['2026-10-21', '2026-10-27', '2026-11-03', '2026-12-01'];
  it('the last focused day, else the arrival, when in view', () => {
    expect(HC.rovingDate(dates, ['2026-11-03', '2026-10-27'], '2026-10-01', '2026-11-30')).toBe('2026-11-03');
    expect(HC.rovingDate(dates, [null, '2026-10-27'], '2026-10-01', '2026-10-31')).toBe('2026-10-27');
  });
  it('else the first open day in view', () => {
    expect(HC.rovingDate(dates, [null, '2026-10-27'], '2026-12-01', '2026-12-31')).toBe('2026-12-01');
  });
  it('a candidate that is no longer open is skipped', () => {
    expect(HC.rovingDate(dates, ['2026-10-22', null], '2026-10-01', '2026-10-31')).toBe('2026-10-21');
  });
  it('null with no open days', () => {
    expect(HC.rovingDate([], [null, null], '2026-10-01', '2026-10-31')).toBe(null);
  });
  it('wired: day buttons are tabIndex -1 except the roving day, the strip is a labelled group, steppers are groups', () => {
    expect(SRC).toContain('b.tabIndex = b.dataset.k === rove ? 0 : -1;');
    expect(SRC).toContain("strip.setAttribute('role', 'group');");
    expect(SRC).toContain("step.setAttribute('role', 'group');");
  });
});

describe('swipe', () => {
  it('while the strip swipes and its height settles nothing below it can be the scroll anchor, so the grid never jumps vertically', () => {
    expect(SRC).toContain("strip.addEventListener('scroll', swiping, { passive: true });");
    expect(SRC).toMatch(/function swiping\(\) \{\s*hc\.classList\.add\('hc-swiping'\);/);
    expect(SRC).toContain("var after = el('div', 'hc-after');");
    expect(CSS).toContain('.hc-swiping .hc-who,.hc-swiping .hc-after,.hc-swiping .hc-foot{overflow-anchor:none}');
  });
});

describe('keepFocus', () => {
  const b = (disabled) => ({ disabled });
  it('a focused button that disabled itself hands focus to the other enabled one', () => {
    const minus = b(true), plus = b(false);
    expect(HC.keepFocus(minus, [minus, plus])).toBe(plus);
  });
  it('nothing to move when the focused button is still enabled, focus is elsewhere, or every button is off', () => {
    const minus = b(false), plus = b(false);
    expect(HC.keepFocus(minus, [minus, plus])).toBe(null);
    expect(HC.keepFocus(b(true), [minus, plus])).toBe(null);
    const x = b(true), y = b(true);
    expect(HC.keepFocus(x, [x, y])).toBe(null);
  });
});

describe('focus', () => {
  it('steppers keep focus inside when the pressed button hits its limit', () => {
    expect(SRC).toMatch(/var had = document\.activeElement;[\s\S]{0,200}minus\.disabled = [\s\S]{0,120}keepFocus\(had, \[minus, plus\]\)/);
    expect(SRC).toMatch(/keepFocus\(had, \[nMinus, nPlus\]\)/);
  });
  it('a foot repaint that removes the focused control (Try again, an alternative, Book) puts focus back in the foot', () => {
    const foot = SRC.slice(SRC.indexOf('function paintFoot'), SRC.indexOf('function paintAll'));
    expect(foot).toMatch(/var held = foot\.contains\(document\.activeElement\) \|\| after\.contains\(document\.activeElement\);[\s\S]*foot\.innerHTML = ''/);
    expect(foot).toContain('(book.disabled ? foot : book).focus({ preventScroll: true })');
    expect(SRC).toContain('foot.tabIndex = -1;');
  });
  it('a repaint keeps focus on the same day', () => {
    expect(SRC).toContain("if (back) back.focus({ preventScroll: true });");
  });
  it('the stuck foot keeps space above its rule: only the panel rule goes, not its padding', () => {
    expect(BLOCK).toContain('.hc-panel:has(~ .hc-foot.stuck){border-bottom:0}');
  });
  it('moves into the months on open', () => {
    expect(SRC).toContain('strip.focus({ preventScroll: true });');
    // Opening by tap must not draw the focus ring around the whole calendar; keys bring it back.
    expect(SRC).toMatch(/strip\.setAttribute\('data-quiet', ''\);[\s\S]{0,300}strip\.focus\(\{ preventScroll: true \}\)/);
    const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'v5', 'styles.css'), 'utf8');
    expect(css).toContain('.hc-strip[data-quiet]:is(:focus,:focus-visible){outline:none}');
  });
  it('every focusable in the block has a 3px house text colour focus ring', () => {
    const rings = [...BLOCK.matchAll(/:focus-visible\{([^}]*)\}/g)].map((m) => m[1]);
    expect(rings.length).toBeGreaterThan(6);
    rings.forEach((r) => expect(r).toContain('outline:3px solid var(--c-ink)'));
  });
});

describe('past days', () => {
  it('are crossed out like booked days, regular weight', () => {
    const css = readFileSync(join(ROOT, 'v5', 'styles.css'), 'utf8');
    const m = css.match(/\.hc-grid \.past\{([^}]*)\}/);
    expect(m && m[1]).toContain('text-decoration:line-through');
    expect(m && m[1]).toContain('font-weight:400');
  });
});

describe('steppers', () => {
  it('give the number a fixed two-digit slot so every minus and plus lines up', () => {
    const css = readFileSync(join(ROOT, 'v5', 'styles.css'), 'utf8');
    const m = css.match(/\.hc-step b\{([^}]*)\}/);
    expect(m && m[1]).toContain('width:2ch');
    expect(m && m[1]).toContain('text-align:center');
    expect(m && m[1]).toContain('font-variant-numeric:tabular-nums');
  });
});

describe('resizing between one and two months per view', () => {
  it('shows the selected stay month, else the month that was in view', () => {
    expect(HC.resizeTarget({ arrival: '2026-12-05', departure: '2026-12-08' }, '2026-10-01')).toBe('2026-12-05');
    expect(HC.resizeTarget(null, '2026-12-01')).toBe('2026-12-01');
  });
  it('refresh jumps to that month only when the months per view change', () => {
    const SRC2 = readFileSync(join(ROOT, 'v5', 'house-calendar.js'), 'utf8');
    const body = SRC2.slice(SRC2.indexOf('function refresh()'), SRC2.indexOf('function refresh()') + 400);
    expect(body).toMatch(/if \(perView && per !== perView\)[\s\S]*showMonthOf\(target, true\)/);
    expect(SRC2).toContain('return { close: close, refresh: refresh };');
  });
});

describe('open() scope', () => {
  it('declares each inner helper name once, so a later var cannot replace a function (inView broke loading once)', () => {
    const SRC3 = readFileSync(join(ROOT, 'v5', 'house-calendar.js'), 'utf8');
    const body = SRC3.slice(SRC3.indexOf('function open('));
    const names = [...body.matchAll(/(?:function\s+([A-Za-z_$][\w$]*)\s*\(|var\s+([A-Za-z_$][\w$]*)\s*=)/g)].map((m) => m[1] || m[2]);
    const fns = new Set([...body.matchAll(/function\s+([A-Za-z_$][\w$]*)\s*\(/g)].map((m) => m[1]));
    const clashes = [...body.matchAll(/var\s+([A-Za-z_$][\w$]*)\s*=/g)].map((m) => m[1]).filter((n) => fns.has(n));
    expect(names.length).toBeGreaterThan(20);
    expect(clashes).toEqual([]);
  });
});

