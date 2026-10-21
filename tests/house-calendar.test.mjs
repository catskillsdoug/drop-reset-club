import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

process.env.TZ = 'America/New_York';
const HC = createRequire(import.meta.url)('../v5/house-calendar.js');

describe('leafText', () => {
  it('names the weekday, day and month of an ISO date without timezone drift', () => {
    expect(HC.leafText('2026-11-05')).toEqual({ dow: 'Thu', day: '5', mon: 'Nov' });
    expect(HC.leafText('2026-11-01')).toEqual({ dow: 'Sun', day: '1', mon: 'Nov' });
    expect(HC.leafText('2027-03-08')).toEqual({ dow: 'Mon', day: '8', mon: 'Mar' });
  });
});

describe('guestCount', () => {
  it('counts adults and children, never infants', () => {
    expect(HC.guestCount({ ad: 2, ch: 1, inf: 1 })).toBe(3);
    expect(HC.guestCount({ ad: 1, ch: 0, inf: 2 })).toBe(1);
  });
});

describe('quoteView', () => {
  // Field names as agent-booking /v1/quote returns them (test/v1.test.js, src/v1.js, src/tools.js).
  const ok = {
    available: true, property_code: 'COOK', checkin: '2026-11-05', checkout: '2026-11-08', guests: 2,
    total: '2376.00', currency: 'USD', nights: 3,
    total_cents: 237600, rent_cents: 180000, fees_cents: 30000, taxes_cents: 27600,
    checkout_url: 'https://reset.club/stay/cook-house-orp5b5d7d1x?or_arrival=2026-11-05&or_departure=2026-11-08&or_guests=2',
    cancellation: { policy: null, free_until: null }, quote_id: '6b1f3c2e-0000-4000-8000-000000000000',
  };

  it('ok: the formatted total and the checkout_url as href', () => {
    const v = HC.quoteView(200, ok);
    expect(v.kind).toBe('ok');
    expect(v.total).toBe('$2,376.00');
    expect(v.href).toBe(ok.checkout_url);
  });

  // Built exactly as agent-booking src/tools.js unavailable() builds it.
  const agentMessage = (code, reason, minN, hasAlts) =>
    (reason === 'min_nights' ? `${code} needs at least ${minN} nights from that arrival.` : 'Those dates are not available.') +
    (hasAlts ? ' Nearest open stays of the same length are below, each already priced; pass its quote_id to create_hold.' : '');
  const alt = { checkin: '2026-11-05', checkout: '2026-11-08', nights: 3, total: '2376.00', currency: 'USD', quote_id: 'q1', expires_at: 'x' };
  const gone = (reason, alts, extra = {}) => Object.assign({
    available: false, reason, message: agentMessage('COOK', reason, extra.min_nights, alts.length > 0),
    alternatives: alts, note: 'Not held.',
  }, extra);

  it('gone: guest copy from the reason, then the priced alternatives', () => {
    const v = HC.quoteView(200, gone('booked', [alt]));
    expect(v.kind).toBe('gone');
    expect(v.message).toBe('Those dates are taken. Nearest open stays:');
    expect(v.alternatives).toEqual([{ checkin: '2026-11-05', checkout: '2026-11-08', total: '$2,376.00', label: 'Thu, Nov 5 \u2013 Sun, Nov 8 \u00b7 $2,376.00' }]);
  });

  it('gone: each reason has its own guest copy, with no alternatives lead when there are none', () => {
    expect(HC.quoteView(200, gone('booked', [])).message).toBe('Those dates are taken.');
    expect(HC.quoteView(200, gone('min_nights', [], { min_nights: 3 })).message).toBe('Stays from that day are at least 3 nights.');
    expect(HC.quoteView(200, gone('max_nights', [])).message).toBe('That stay is longer than this house allows.');
    expect(HC.quoteView(200, gone('no_checkout', [])).message).toBe("Those dates aren't available.");
    expect(HC.quoteView(200, gone('min_nights', [alt], { min_nights: 3 })).message).toBe('Stays from that day are at least 3 nights. Nearest open stays:');
  });

  it('gone: never shows the agent-facing message', () => {
    for (const reason of ['booked', 'min_nights', 'max_nights', 'unknown']) {
      const out = JSON.stringify(HC.quoteView(200, gone(reason, [alt], { min_nights: 3 })));
      expect(out).not.toContain('quote_id');
      expect(out).not.toContain('create_hold');
      expect(out).not.toContain('COOK');
    }
  });

  it('refused: the OwnerRez rules text from a 422', () => {
    const v = HC.quoteView(422, { error: 'Minimum stay is 3 nights.', reason: 'rules' });
    expect(v).toEqual({ kind: 'refused', message: 'Minimum stay is 3 nights.' });
  });

  it('error: 502, 400 and a network failure all ask to try again', () => {
    const msg = "Couldn't check the price. Try again.";
    expect(HC.quoteView(502, { error: 'The booking system did not answer. Try again shortly.' })).toEqual({ kind: 'error', message: msg });
    expect(HC.quoteView(400, { error: 'checkout must be after checkin.' })).toEqual({ kind: 'error', message: msg });
    expect(HC.quoteView(0, null)).toEqual({ kind: 'error', message: msg });
  });
});

describe('calendarFallback', () => {
  it('points at the booking page with the fixed message', () => {
    expect(HC.calendarFallback('https://reset.club/stay/cook')).toEqual({
      message: "The calendar didn't load. See open dates on the booking page.",
      href: 'https://reset.club/stay/cook',
    });
  });
});

describe('guest quote debounce', () => {
  it('fires once, 300 ms after the last guest change, and cancel drops it', () => {
    vi.useFakeTimers();
    try {
      let n = 0;
      const q = HC.debounce(() => { n++; }, HC.GUEST_DEBOUNCE_MS);
      expect(HC.GUEST_DEBOUNCE_MS).toBe(300);
      q(); vi.advanceTimersByTime(200); q(); vi.advanceTimersByTime(200); q();
      vi.advanceTimersByTime(299);
      expect(n).toBe(0);
      vi.advanceTimersByTime(1);
      expect(n).toBe(1);
      q(); q.cancel(); vi.advanceTimersByTime(1000);
      expect(n).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });
  it('guest changes go through the debounce, stay changes cancel it and quote at once', () => {
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'v5', 'house-calendar.js'), 'utf8');
    const guests = src.slice(src.indexOf('function guestsChanged'), src.indexOf('prev.addEventListener'));
    expect(guests).toContain('quoteSoon()');
    expect(guests).not.toContain('requestQuote()');
    const stay = src.slice(src.indexOf('function setStay'), src.indexOf('function guestsChanged'));
    expect(stay).toContain('quoteSoon.cancel()');
    expect(stay).toContain('requestQuote()');
  });
});

describe('guestStep and bookLive (Book state after a guest change)', () => {
  const ok = { kind: 'ok', total: '$1,277.82', total_cents: 127782, href: 'https://x/checkout' };
  const priced = (over = {}) => Object.assign({ sel: { arrival: '2026-11-13', departure: '2026-11-15' }, quote: ok, quoting: false, seq: 4, edit: null, hint: '' }, over);

  it('Adults or Children with a stay: the old price goes and Book is off at once, before the debounce', () => {
    for (const key of ['ad', 'ch']) {
      const st = priced();
      expect(HC.bookLive(st)).toBe(true);
      expect(HC.guestStep(st, key)).toBe(true);
      expect(st.quote).toBe(null);
      expect(st.quoting).toBe(true);
      expect(HC.bookLive(st)).toBe(false);
    }
  });
  it('bumps seq, so a quote in flight for the old guest count is dropped when it lands', () => {
    const st = priced();
    const inFlight = st.seq;
    HC.guestStep(st, 'ad');
    expect(st.seq).not.toBe(inFlight);
  });
  it('Infants are never sent: a repaint only, price and Book stay', () => {
    const st = priced();
    expect(HC.guestStep(st, 'inf')).toBe(false);
    expect(st).toEqual(priced());
    expect(HC.bookLive(st)).toBe(true);
  });
  it('no stay yet: nothing to quote, nothing changes', () => {
    const st = priced({ sel: null, quote: null });
    expect(HC.guestStep(st, 'ad')).toBe(false);
    expect(st).toEqual(priced({ sel: null, quote: null }));
  });
  it('Book is live only on a current ok total: never while editing a date, while quoting, or with no or a failed quote', () => {
    expect(HC.bookLive(priced())).toBe(true);
    expect(HC.bookLive(priced({ edit: 'arrive' }))).toBe(false);
    expect(HC.bookLive(priced({ edit: 'depart' }))).toBe(false);
    expect(HC.bookLive(priced({ quoting: true }))).toBe(false);
    expect(HC.bookLive(priced({ quote: null }))).toBe(false);
    for (const kind of ['gone', 'refused', 'error']) expect(HC.bookLive(priced({ quote: { kind, message: 'x' } }))).toBe(false);
  });
  it('a tap that finds no stay keeps the price and Book of the stay still selected; the hint shows beside it', () => {
    const st = priced({ hint: 'No stays from that day' });
    expect(HC.bookLive(st)).toBe(true);
    expect(HC.footTotal(st)).toBe(true);
    expect(HC.footTotal(priced({ hint: 'No stays from that day', sel: null, quote: null }))).toBe(false);
    expect(HC.footTotal(priced({ quoting: true }))).toBe(false);
    expect(HC.footTotal(priced({ edit: 'arrive' }))).toBe(false);
    expect(HC.footTotal(priced({ quote: { kind: 'gone', message: 'x' } }))).toBe(false);
  });
  it('is wired: guest steppers go through guestStep and repaint the foot before the debounce, paintFoot asks bookLive', () => {
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'v5', 'house-calendar.js'), 'utf8');
    const guests = src.slice(src.indexOf('function guestsChanged'), src.indexOf('prev.addEventListener'));
    expect(guests).toMatch(/if \(guestStep\(st, key\)\) \{ paintFoot\(\); quoteSoon\(\); \}/);
    expect(src).toMatch(/guestsChanged\('ad'\)|guestsChanged\(key\)/);
    const foot = src.slice(src.indexOf('function paintFoot'), src.indexOf('function paintAll'));
    expect(foot).toContain('if (bookLive(st))');
  });
});

describe('fetchTo and stripMonths (no unfetched day is ever drawn)', () => {
  it('the drops span when it fits in 399 days', () => {
    expect(HC.fetchTo('2026-10-20', '2027-04-30')).toBe('2027-04-30');
  });
  it('past 399 days: the last whole month inside the cap, never a part month', () => {
    expect(HC.fetchTo('2026-10-20', '2028-01-31')).toBe('2027-10-31'); // cap 2027-11-23
    expect(HC.fetchTo('2026-10-27', '2028-01-31')).toBe('2027-11-30'); // cap is a month end
    expect(HC.fetchTo('2026-12-31', '2028-06-30')).toBe('2028-01-31'); // cap 2028-02-03, across the year
  });
  it('the strip stops at the fetched month, even when a suggestion departs after it', () => {
    const months = HC.stripMonths({ from: '2026-10-01', to: '2027-11-30' }, '2027-10-31');
    expect(months[months.length - 1]).toEqual({ year: 2027, month1: 10 });
    expect(months).toHaveLength(13);
  });
  it('a span inside the fetch is unchanged', () => {
    expect(HC.stripMonths({ from: '2026-10-01', to: '2027-04-30' }, '2027-10-31')).toEqual(HC.monthsInSpan({ from: '2026-10-01', to: '2027-04-30' }));
  });
  it('load fetches to fetchTo and builds stripMonths from it', () => {
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'v5', 'house-calendar.js'), 'utf8');
    const load = src.slice(src.indexOf('// ---- load ----'));
    expect(load).toContain('var to = fetchTo(today, CC.monthSpan(today, o.drops).to);');
    expect(load).toContain('var list = stripMonths(CC.monthSpan(today, st.sugs), to);');
  });
});

describe('desktop arrows stay current', () => {
  it('repaint on strip scroll and scrollend, and open() hands back a refresh for resize', () => {
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'v5', 'house-calendar.js'), 'utf8');
    expect(src).toContain("strip.addEventListener('scroll', paintNav, { passive: true });");
    expect(src).toContain("strip.addEventListener('scrollend', paintNav);");
    expect(src).toContain('return { close: close, refresh: refresh };');
    expect(src.slice(src.indexOf('function refresh()'), src.indexOf('function refresh()') + 400)).toContain('paintNav();');
  });
});

describe('footText', () => {
  it('uses singular and plural nights like the leaves', () => {
    expect(HC.footText('$500.00', 1)).toBe('$500.00 all in \u00b7 1 night');
    expect(HC.footText('$938.56', 2)).toBe('$938.56 all in \u00b7 2 nights');
  });
});

// Minimal fake DOM: only what open() touches before the calendar fetch resolves.
function fakeEl(tag) {
  const e = {
    tagName: String(tag).toUpperCase(), children: [], parentNode: null, dataset: {}, attrs: {},
    style: { setProperty(k, v) { this[k] = v; } },
    classList: { set: new Set(), add(...c) { c.forEach((x) => this.set.add(x)); }, remove(...c) { c.forEach((x) => this.set.delete(x)); }, contains(c) { return this.set.has(c); } },
    appendChild(c) { c.parentNode = e; e.children.push(c); return c; },
    remove() { if (e.parentNode) { e.parentNode.children = e.parentNode.children.filter((x) => x !== e); e.parentNode = null; } },
    setAttribute(k, v) { e.attrs[k] = String(v); }, getAttribute(k) { return k in e.attrs ? e.attrs[k] : null; },
    addEventListener() {}, insertAdjacentHTML() {},
  };
  return e;
}

describe('open() with a mount', () => {
  it('renders into the mount, adds no overlay or gallery-open, and close removes it and calls onClose', () => {
    const body = fakeEl('body');
    const html = fakeEl('html');
    globalThis.document = { createElement: fakeEl, body, documentElement: html, querySelectorAll: () => [] };
    globalThis.fetch = () => new Promise(() => {});
    try {
      const mount = fakeEl('div');
      let closed = 0;
      const h = HC.open({
        code: 'COOK', name: 'Cook House', colour: { bg: '#ff551e', text: '#fcf6e9' }, drops: [],
        fallbackHref: 'https://reset.club/stay/cook', mount, onClose: () => { closed++; },
      });
      expect(mount.children).toHaveLength(1);
      expect(mount.children[0].className).toBe('hc');
      expect(body.children).toHaveLength(0);
      expect(body.classList.contains('gallery-open')).toBe(false);
      expect(html.classList.contains('gallery-open')).toBe(false);
      h.close();
      expect(mount.children).toHaveLength(0);
      expect(closed).toBe(1);
    } finally {
      delete globalThis.document; delete globalThis.fetch;
    }
  });

  it('has no overlay code path left', () => {
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'v5', 'house-calendar.js'), 'utf8');
    expect(src).not.toContain('gallery-overlay');
    expect(src).not.toContain('gallery-open');
  });
});

describe('house calendar styles', () => {
  const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'v5', 'styles.css'), 'utf8');
  const block = css.slice(css.indexOf('/* House calendar */'));

  it('the block exists', () => {
    expect(css.indexOf('/* House calendar */')).toBeGreaterThan(-1);
    expect(block).toContain('.hc-grid');
  });

  it('the open mount fills down to the viewport bottom via --hc-fill', () => {
    expect(block).toMatch(/\.section\.hc-open \.hc-mount\{[^}]*min-height:var\(--hc-fill/);
  });

  it('draws no dashed outlines anywhere in the block', () => {
    expect(block).not.toContain('dashed');
  });

  it('draws on the house colour: no black, no sand, no greys, no typed hex at all', () => {
    expect(block).not.toMatch(/#000/i);
    expect(block).not.toMatch(/#fcf6e9/i);
    expect(block).not.toMatch(/#C4C4C4|#D0D0D0/i);
    expect(block).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });
});

describe('stayRows', () => {
  it('a stay: dates with 4 pm and 12 pm, and its nights', () => {
    expect(HC.stayRows({ arrival: '2026-10-27', departure: '2026-10-30' })).toEqual({
      arrive: { dow: 'Tue', date: 'Oct 27', time: '4 pm' },
      depart: { dow: 'Fri', date: 'Oct 30', time: '12 pm' },
      nights: 3,
    });
  });
  it('nothing chosen: no parts and no nights', () => {
    expect(HC.stayRows(null)).toEqual({ arrive: null, depart: null, nights: null });
  });
  it('the trip: Arrive left, Depart right-aligned, the link-row arrow between, a rule before the guests', () => {
    const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'v5', 'styles.css'), 'utf8');
    const block = css.slice(css.indexOf('/* House calendar */'));
    expect(block).toMatch(/\.hc-trip\{[^}]*display:grid;[^}]*grid-template-columns:1fr auto 1fr/);
    expect(block).toMatch(/\.hc-trip-out\{[^}]*text-align:right/);
    // Calmer (Doug 10-21): no rule between the trip and the steppers, no underlines; the whole side is the tap target.
    expect(block).not.toMatch(/\.hc-guests\.hc-rule\{[^}]*border-top/);
    expect(block).not.toMatch(/\.hc-trip-date\{[^}]*border-bottom/);
    expect(block).toContain(".hc-trip-date::after{content:'';position:absolute;inset:0}");
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'v5', 'house-calendar.js'), 'utf8');
    expect(src).toContain('M5 12h14M13 5l7 7-7 7');
    expect(src).toContain("nRow.classList.add('hc-rule')");
    expect(src).not.toContain("sAd.row.classList.add('hc-rule')");
  });
});

describe('nightsStep', () => {
  const CC = createRequire(import.meta.url)('../v5/calendar-core.js');
  const TODAY = '2026-10-20';
  const mk = (booked = [], noCheckout = []) => {
    const days = [];
    for (let i = 0; i < 20; i++) {
      const date = CC.addDays('2026-10-25', i);
      days.push({ date, status: booked.includes(date) ? 'booked' : 'available', min_nights: 2, max_nights: 7, no_checkout: noCheckout.includes(date) });
    }
    return CC.dayMap(days);
  };
  const sel = { arrival: '2026-10-27', departure: '2026-10-30' };

  it('plus 1 extends checkout a day, arrival fixed', () => {
    expect(HC.nightsStep(mk(), sel, 1, TODAY)).toEqual({ arrival: '2026-10-27', departure: '2026-10-31' });
  });
  it('minus 1 shortens checkout a day, arrival fixed', () => {
    expect(HC.nightsStep(mk(), sel, -1, TODAY)).toEqual({ arrival: '2026-10-27', departure: '2026-10-29' });
  });
  it('minus is blocked at min nights', () => {
    expect(HC.nightsStep(mk(), { arrival: '2026-10-27', departure: '2026-10-29' }, -1, TODAY)).toBeNull();
  });
  it('plus is blocked by a booked night', () => {
    expect(HC.nightsStep(mk(['2026-10-30']), sel, 1, TODAY)).toBeNull();
  });
  it('plus is blocked onto a no-checkout day', () => {
    expect(HC.nightsStep(mk([], ['2026-10-31']), sel, 1, TODAY)).toBeNull();
  });
  it('null when there is no stay', () => {
    expect(HC.nightsStep(mk(), null, 1, TODAY)).toBeNull();
  });
});

describe('tapEdit and toggleEdit', () => {
  const CC = createRequire(import.meta.url)('../v5/calendar-core.js');
  const TODAY = '2026-10-20';
  const mk = (booked = [], min = 2) => {  // min null: a day with no minimum
    const days = [];
    for (let i = 0; i < 20; i++) {
      const date = CC.addDays('2026-10-25', i);
      days.push({ date, status: booked.includes(date) ? 'booked' : 'available', min_nights: min == null ? undefined : min, max_nights: 7, no_checkout: false });
    }
    return CC.dayMap(days);
  };
  const sel = { arrival: '2026-10-27', departure: '2026-10-30' };
  const st = (edit) => ({ sel, edit });

  it('arrive keeps the departure', () => {
    expect(HC.tapEdit(st('arrive'), '2026-10-26', mk(), TODAY)).toEqual({ stay: { arrival: '2026-10-26', departure: '2026-10-30' } });
  });
  it('arrive falls back to the same number of nights', () => {
    expect(HC.tapEdit(st('arrive'), '2026-10-29', mk(), TODAY)).toEqual({ stay: { arrival: '2026-10-29', departure: '2026-11-01' } });
  });
  it('arrive after the departure keeps the nights, never a backwards stay', () => {
    expect(HC.tapEdit(st('arrive'), '2026-11-02', mk([], null), TODAY)).toEqual({ stay: { arrival: '2026-11-02', departure: '2026-11-05' } });
  });
  it('arrive fallback uses the current nights, whatever they are', () => {
    const s4 = { sel: { arrival: '2026-10-27', departure: '2026-10-31' }, edit: 'arrive' };
    expect(HC.tapEdit(s4, '2026-10-30', mk(), TODAY)).toEqual({ stay: { arrival: '2026-10-30', departure: '2026-11-03' } });
  });
  it('arrive refused gives the hint and the caller stays in edit mode', () => {
    expect(HC.tapEdit(st('arrive'), '2026-10-26', mk(['2026-10-26', '2026-10-27']), TODAY)).toEqual({ hint: "Can't arrive that day with these dates" });
  });
  it('depart extends, arrival fixed', () => {
    expect(HC.tapEdit(st('depart'), '2026-10-31', mk(), TODAY)).toEqual({ stay: { arrival: '2026-10-27', departure: '2026-10-31' } });
  });
  it('depart before the arrival is refused', () => {
    expect(HC.tapEdit(st('depart'), '2026-10-26', mk(), TODAY)).toEqual({ hint: "Can't depart that day" });
  });
  it('depart on or before the arrival is refused even when one night is allowed', () => {
    expect(HC.tapEdit(st('depart'), '2026-10-26', mk([], null), TODAY)).toEqual({ hint: "Can't depart that day" });
    expect(HC.tapEdit(st('depart'), '2026-10-27', mk([], null), TODAY)).toEqual({ hint: "Can't depart that day" });
  });
  it('depart onto a booked night is refused', () => {
    expect(HC.tapEdit(st('depart'), '2026-11-01', mk(['2026-10-31']), TODAY)).toEqual({ hint: "Can't depart that day" });
  });
  it('tapping the same field toggles edit off, another switches, none from off', () => {
    expect(HC.toggleEdit({ edit: 'arrive' }, 'arrive')).toBeNull();
    expect(HC.toggleEdit({ edit: 'arrive' }, 'depart')).toBe('depart');
    expect(HC.toggleEdit({ edit: null }, 'arrive')).toBe('arrive');
  });
});

describe('selNight', () => {
  const sel = { arrival: '2026-11-05', departure: '2026-11-08' };
  it('is true on the nights of the stay only, never its checkout day', () => {
    expect(HC.selNight(sel, '2026-11-05')).toBe(true);
    expect(HC.selNight(sel, '2026-11-07')).toBe(true);
    expect(HC.selNight(sel, '2026-11-08')).toBe(false);
    expect(HC.selNight(sel, '2026-11-04')).toBe(false);
    expect(HC.selNight(null, '2026-11-05')).toBe(false);
  });
  it('the tap and the drag grab test nights by date, not the drawn sel class', () => {
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'v5', 'house-calendar.js'), 'utf8');
    const click = src.slice(src.indexOf("strip.addEventListener('click'"), src.indexOf('// ---- load ----'));
    expect(click).toContain('tapDay(st, d');
    expect(src.slice(src.indexOf('function tapDay'), src.indexOf('function selNight'))).toContain('selNight(st.sel, d)');
    expect(click).not.toContain("classList.contains('sel')");
    const down = src.slice(src.indexOf("strip.addEventListener('pointerdown'"), src.indexOf("strip.addEventListener('pointermove'"));
    expect(down).toContain('selNight(st.sel, b.dataset.k)');
    expect(down).not.toContain('button.sel');
  });
});

describe('tapDay (one tap rule)', () => {
  const CC = createRequire(import.meta.url)('../v5/calendar-core.js');
  const TODAY = '2026-10-20';
  const mk = (booked, min = 2, max = 7) => {
    const days = [];
    for (let i = 0; i < 30; i++) {
      const date = CC.addDays('2026-10-25', i);
      days.push({ date, status: booked.includes(date) ? 'booked' : 'available', min_nights: min, max_nights: max, no_checkout: false });
    }
    return CC.dayMap(days);
  };
  const HINT = 'No stays from that day';
  const drop = { arrival: '2026-10-27', departure: '2026-10-29' };
  const st = (sugs, sel) => ({ sugs, sel: sel || null });

  it('with a stay set, tapping its checkout day extends by that night', () => {
    const sel = { arrival: '2026-10-27', departure: '2026-10-30' };
    expect(HC.tapDay(st([], sel), '2026-10-30', mk([]), TODAY, [])).toEqual({ stay: { arrival: '2026-10-27', departure: '2026-10-31' } });
  });
  it('with a stay set, tapping a later day extends through that night', () => {
    const sel = { arrival: '2026-10-27', departure: '2026-10-30' };
    expect(HC.tapDay(st([], sel), '2026-11-01', mk([]), TODAY, [])).toEqual({ stay: { arrival: '2026-10-27', departure: '2026-11-02' } });
  });
  it('a later day that cannot extend (booked night between) starts a new stay there', () => {
    const sel = { arrival: '2026-10-27', departure: '2026-10-30' };
    expect(HC.tapDay(st([], sel), '2026-11-01', mk(['2026-10-31']), TODAY, [])).toEqual({ stay: { arrival: '2026-11-01', departure: '2026-11-04' } });
  });
  it('an extension past max_nights starts a new stay there', () => {
    const sel = { arrival: '2026-10-27', departure: '2026-10-30' };
    expect(HC.tapDay(st([], sel), '2026-11-05', mk([], 2, 7), TODAY, [])).toEqual({ stay: { arrival: '2026-11-05', departure: '2026-11-08' } });
  });
  it('3 nights when open, even when a 2-night drop arrives that day', () => {
    expect(HC.tapDay(st([drop]), '2026-10-27', mk([]), TODAY, [drop])).toEqual({ stay: { arrival: '2026-10-27', departure: '2026-10-30' } });
  });
  it('falls back to the shortest valid length when 3 is blocked', () => {
    const map = mk(['2026-10-29']);
    expect(HC.tapDay(st([]), '2026-10-27', map, TODAY, [])).toEqual({ stay: { arrival: '2026-10-27', departure: '2026-10-29' } });
  });
  it('starts the length search at the min_nights of the arrival day', () => {
    const map = mk(['2026-10-30'], 4, 7);
    expect(HC.tapDay(st([]), '2026-10-27', map, TODAY, [])).toEqual({ hint: HINT });
    expect(HC.tapDay(st([]), '2026-10-27', mk(['2026-11-01'], 4, 7), TODAY, [])).toEqual({ stay: { arrival: '2026-10-27', departure: '2026-10-31' } });
  });
  it('falls back to the drop arriving that day when no length works', () => {
    const map = mk(['2026-10-27']);
    expect(HC.tapDay(st([]), '2026-10-27', map, TODAY, [drop])).toEqual({ stay: { arrival: '2026-10-27', departure: '2026-10-29' } });
  });
  it('gives the hint when nothing works, and ignores a drop that only covers the day', () => {
    const map = mk(['2026-10-27']);
    expect(HC.tapDay(st([]), '2026-10-27', map, TODAY, [])).toEqual({ hint: HINT });
    expect(HC.tapDay(st([]), '2026-10-27', map, TODAY, [{ arrival: '2026-10-26', departure: '2026-10-28' }])).toEqual({ hint: HINT });
  });
  it('does nothing on a night of the current stay', () => {
    const sel = { arrival: '2026-10-27', departure: '2026-10-30' };
    expect(HC.tapDay(st([drop], sel), '2026-10-28', mk([]), TODAY, [drop])).toBeNull();
    expect(HC.tapDay(st([drop], sel), '2026-10-27', mk([]), TODAY, [drop])).toBeNull();
  });
  it('has no mode switch or Any dates path left in the source', () => {
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'v5', 'house-calendar.js'), 'utf8');
    expect(src).not.toMatch(/Any dates|3-night stays|tapAny|tapThree|st\.mode|st\.pick/);
    expect(HC.tapAny).toBeUndefined();
  });
});

describe('monthLabel', () => {
  it('gives the three-letter uppercase month and the year', () => {
    expect(HC.monthLabel('2026-11-01')).toEqual({ mon: 'NOV', year: '2026' });
    expect(HC.monthLabel('2026-10-15')).toEqual({ mon: 'OCT', year: '2026' });
    expect(HC.monthLabel('2027-01-31')).toEqual({ mon: 'JAN', year: '2027' });
  });
});

describe('house-calendar.js source', () => {
  it('no longer carries the Choose dates heading', () => {
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../v5/house-calendar.js'), 'utf8');
    expect(src).not.toContain('Choose dates');
  });
});

describe('monthsInSpan', () => {
  it('lists every month from span.from to span.to, across the year end', () => {
    expect(HC.monthsInSpan({ from: '2026-10-01', to: '2027-02-28' })).toEqual([
      { year: 2026, month1: 10 }, { year: 2026, month1: 11 }, { year: 2026, month1: 12 },
      { year: 2027, month1: 1 }, { year: 2027, month1: 2 },
    ]);
  });
  it('a span inside one month is that one month', () => {
    expect(HC.monthsInSpan({ from: '2026-10-01', to: '2026-10-31' })).toEqual([{ year: 2026, month1: 10 }]);
  });
});

describe('startIndex', () => {
  const months = HC.monthsInSpan({ from: '2026-10-01', to: '2027-04-30' });
  it('opens on the month of the first suggested drop', () => {
    expect(HC.startIndex(months, { arrival: '2027-01-15', departure: '2027-01-18' }, '2026-10-20')).toBe(3);
  });
  it('opens on the current month when there is no suggestion', () => {
    expect(HC.startIndex(months, null, '2026-11-02')).toBe(1);
  });
  it('falls back to the first month when the month is outside the span', () => {
    expect(HC.startIndex(months, { arrival: '2028-01-01', departure: '2028-01-03' }, '2026-10-20')).toBe(0);
  });
});

describe('navEnds', () => {
  it('disables back at the start and forward at the end of the strip', () => {
    expect(HC.navEnds(0, 2000, 500)).toEqual({ prev: false, next: true });
    expect(HC.navEnds(1000, 2000, 500)).toEqual({ prev: true, next: true });
    expect(HC.navEnds(1500, 2000, 500)).toEqual({ prev: true, next: false });
  });
  it('treats sub-pixel scroll positions at the ends as the ends', () => {
    expect(HC.navEnds(0.5, 2000, 500)).toEqual({ prev: false, next: true });
    expect(HC.navEnds(1499.4, 2000, 500)).toEqual({ prev: true, next: false });
  });
});

describe('house calendar line weights and corners', () => {
  const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'v5', 'styles.css'), 'utf8');
  const block = css.slice(css.indexOf('/* House calendar */'));
  const rowRule = css.match(/\.hero-option \{[^}]*border-bottom: (\d+px) solid/)[1];

  it('every border and outline inside the calendar uses the house view row rule width, one value', () => {
    expect(rowRule).toBe('3px');
    const widths = [...block.matchAll(/(?:border(?:-top|-bottom|-left|-right)?|outline):(\d+px) /g)].map((m) => m[1]);
    expect(widths.length).toBeGreaterThan(10);
    expect(new Set(widths)).toEqual(new Set([rowRule]));
  });
  it('steppers are circles the size of the day circles, alternative stays square like Book', () => {
    const rule = (sel) => { const m = block.match(new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\{([^}]*)\\}')); return m ? m[1] : null; };
    expect(rule('.hc-step button')).toContain('border-radius:50%');
    expect(rule('.hc-step button')).toContain('width:44px;height:44px');
    expect(rule('.hc-alts button')).toContain('border-radius:0');
    const round = [...block.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{[^}]*border-radius:(?!0[;}])[^;}]+/g)].map((m) => m[1].trim());
    expect(round).toEqual(['.hc-grid .drop::after', '.hc-grid .sel-s::before,.hc-grid .sel-e::before', '.hc-step button']);
  });
});

describe('house calendar swipe months styles', () => {
  const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'v5', 'styles.css'), 'utf8');
  const block = css.slice(css.indexOf('/* House calendar */'));
  const rule = (sel) => { const m = block.match(new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\{([^}]*)\\}')); return m ? m[1] : null; };

  it('weekday letters use the day-number size and weight, no caps styling', () => {
    const dow = rule('.hc-dow span');
    expect(dow).toContain('font-size:var(--text-body)');
    expect(dow).not.toMatch(/font-weight|letter-spacing|text-transform/);
  });
  it('the month strip snaps one block at a time, hides its scrollbar and never moves the page', () => {
    const strip = rule('.hc-strip');
    expect(strip).toContain('scroll-snap-type:x mandatory');
    expect(strip).toContain('overscroll-behavior-x:contain');
    expect(strip).toContain('scrollbar-width:none');
    expect(block).toContain('.hc-strip::-webkit-scrollbar{display:none}');
  });
  it('phones show one month per width and no arrows, desktop two months and the arrows', () => {
    expect(rule('.hc-month')).toContain('flex:0 0 100%');
    expect(rule('.hc-mode')).toContain('display:none');
    const desk = block.slice(block.indexOf('@media (min-width:768px)'));
    expect(block.indexOf('@media (min-width:768px)')).toBeGreaterThan(-1);
    expect(desk).toMatch(/\.hc-month\{[^}]*flex:0 0 50%/);
    expect(desk).toMatch(/\.hc-mode\{[^}]*display:flex/);
  });
  it('dragging a stay suspends the strip pan', () => {
    expect(rule('.hc-strip.dragging')).toContain('touch-action:none');
  });
});

describe('firstStay (the stay pre-selected on open: the earliest open stay from today)', () => {
  const CC = createRequire(import.meta.url)('../v5/calendar-core.js');
  const TODAY = '2026-10-25';
  const mk = (booked, from = '2026-10-25', min = 2, max = 7) => {
    const days = [];
    for (let i = 0; i < 30; i++) {
      const date = CC.addDays(from, i);
      days.push({ date, status: booked.includes(date) ? 'booked' : 'available', min_nights: min, max_nights: max, no_checkout: false });
    }
    return CC.dayMap(days);
  };
  it('3 nights from today when open, as a tap on today would give', () => {
    expect(HC.firstStay(mk([]), TODAY, [])).toEqual({ arrival: '2026-10-25', departure: '2026-10-28' });
  });
  it('skips booked days and days with no stay to the first day that has one', () => {
    // Oct 25 open but 26 booked: no 2-night stay from 25; 26 booked; 27 on gives 3 nights.
    expect(HC.firstStay(mk(['2026-10-26']), TODAY, [])).toEqual({ arrival: '2026-10-27', departure: '2026-10-30' });
  });
  it('the earliest stay even when a drop comes later', () => {
    const drop = { arrival: '2026-11-01', departure: '2026-11-03' };
    expect(HC.firstStay(mk([]), TODAY, [drop]).arrival).toBe('2026-10-25');
  });
  it('never a past day, and null when nothing is open', () => {
    expect(HC.firstStay(mk([], '2026-10-20'), TODAY, []).arrival).toBe('2026-10-25');
    const all = []; for (let i = 0; i < 30; i++) all.push(CC.addDays(TODAY, i));
    expect(HC.firstStay(mk(all), TODAY, [])).toBe(null);
  });
  it('is wired: on load the stay is set quietly, tracked as a preset, quoted, and the strip opens on its month', () => {
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'v5', 'house-calendar.js'), 'utf8');
    const load = src.slice(src.indexOf('// ---- load ----'));
    expect(load).toMatch(/var first = shared \|\| firstStay\(st\.map, today, st\.sugs\);\s*if \(first\) \{ setStay\(first, true\); track\(shared \? 'calendar_shared_opened' : 'calendar_stay_preset', \{ house: house, nights: nights\(\) \}\); requestQuote\(shared \? 0 : PRESET_TRIES\); \}/);
    expect(load).toContain('startIndex(list, first || st.sugs[0] || null, today)');
  });
  it('after a refused arrival, the earliest stay arriving later (same-day check-in after noon is refused by OwnerRez)', () => {
    expect(HC.firstStay(mk([]), TODAY, [], '2026-10-25')).toEqual({ arrival: '2026-10-26', departure: '2026-10-29' });
    expect(HC.firstStay(mk(['2026-10-27']), TODAY, [], '2026-10-25')).toEqual({ arrival: '2026-10-28', departure: '2026-10-31' });
  });
  it('is wired: a refused preset quote moves the preset on, at most PRESET_TRIES times, and only for the preset', () => {
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'v5', 'house-calendar.js'), 'utf8');
    expect(src).toMatch(/var PRESET_TRIES = 3;/);
    expect(src).toMatch(/if \(v\.kind === 'refused' && presetLeft > 0\) \{\s*var next = firstStay\(st\.map, today, st\.sugs, st\.sel\.arrival\);\s*if \(next\) \{ setStay\(next, true\); showMonthOf\(next\.arrival, true\); requestQuote\(presetLeft - 1\); return; \}\s*\}/);
    const load = src.slice(src.indexOf('// ---- load ----'));
    expect(load).toMatch(/requestQuote\(shared \? 0 : PRESET_TRIES\); \}/);
  });
});

describe('shareParams and readShare (the Pick dates link a guest can send a friend)', () => {
  const sel = { arrival: '2026-12-01', departure: '2026-12-04' };
  it('writes house, dates, adults and children; never infants', () => {
    expect(HC.shareParams('COOK', sel, { ad: 2, ch: 1, inf: 1 })).toEqual({ stay: 'cook', arrive: '2026-12-01', depart: '2026-12-04', adults: '2', children: '1' });
  });
  it('no stay yet: the house only, so the link still opens Pick dates', () => {
    expect(HC.shareParams('HILL4', null, { ad: 2, ch: 0, inf: 0 })).toEqual({ stay: 'hill4' });
  });
  it('reads a link back to the house code, the stay and the guests', () => {
    expect(HC.readShare('?stay=cook&arrive=2026-12-01&depart=2026-12-04&adults=3&children=1')).toEqual({ code: 'COOK', sel, g: { ad: 3, ch: 1 } });
    expect(HC.readShare('?utm_source=x&stay=hill4')).toEqual({ code: 'HILL4', sel: null, g: null });
  });
  it('round-trips', () => {
    const q = '?' + new URLSearchParams(HC.shareParams('ZINK', sel, { ad: 1, ch: 2, inf: 0 })).toString();
    expect(HC.readShare(q)).toEqual({ code: 'ZINK', sel, g: { ad: 1, ch: 2 } });
  });
  it('drops what does not parse: no house, bad dates, depart not after arrive, over 30 nights, odd guest counts', () => {
    expect(HC.readShare('')).toBe(null);
    expect(HC.readShare('?property=COOK')).toBe(null);
    expect(HC.readShare('?stay=<x>')).toBe(null);
    expect(HC.readShare('?stay=cook&arrive=2026-12-1&depart=2026-12-04').sel).toBe(null);
    expect(HC.readShare('?stay=cook&arrive=2026-12-04&depart=2026-12-04').sel).toBe(null);
    expect(HC.readShare('?stay=cook&arrive=2026-12-01&depart=2027-02-01').sel).toBe(null);
    expect(HC.readShare('?stay=cook&adults=0&children=1').g).toBe(null);
    expect(HC.readShare('?stay=cook&adults=2&children=-1').g).toBe(null);
    expect(HC.readShare('?stay=cook&adults=abc').g).toBe(null);
  });
  it('is wired: every repaint of the guests block reports the link, the shared stay opens if still open, else the first stay with a note', () => {
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'v5', 'house-calendar.js'), 'utf8');
    const who = src.slice(src.indexOf('function paintWho'), src.indexOf("more.addEventListener('click'"));
    expect(who).toContain('if (o.onChange) o.onChange(shareParams(house, st.sel, st.g));');
    const load = src.slice(src.indexOf('// ---- load ----'));
    expect(load).toMatch(/var shared = o\.initial && o\.initial\.sel && CC\.stayCheck\(st\.map, o\.initial\.sel\.arrival, o\.initial\.sel\.departure, today\)\.ok \? o\.initial\.sel : null;/);
    expect(load).toContain("st.hint = SHARED_GONE;");
  });
});

describe('guest rows copy', () => {
  it('the Infants row says baby accessories are available, never a crib on request (Doug 10-21)', () => {
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'v5', 'house-calendar.js'), 'utf8');
    expect(src).toContain("stepper('Infants', 'Under 2 · baby accessories available', 'inf'");
    expect(src).not.toMatch(/crib/i);
  });
});
