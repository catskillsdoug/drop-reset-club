import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

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

describe('guestLabel', () => {
  it('labels guests, with infants named separately', () => {
    expect(HC.guestLabel({ ad: 2, ch: 0, inf: 0 })).toBe('2 guests');
    expect(HC.guestLabel({ ad: 1, ch: 0, inf: 0 })).toBe('1 guest');
    expect(HC.guestLabel({ ad: 2, ch: 1, inf: 1 })).toBe('3 guests + 1 infant');
    expect(HC.guestLabel({ ad: 2, ch: 0, inf: 2 })).toBe('2 guests + 2 infants');
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

describe('tapAny (Any dates taps)', () => {
  const CC = createRequire(import.meta.url)('../v5/calendar-core.js');
  const days = [];
  for (let i = 0; i < 30; i++) days.push({ date: CC.addDays('2026-11-01', i), status: 'available', min_nights: 2, max_nights: 7, no_checkout: false });
  const map = CC.dayMap(days);
  const TODAY = '2026-10-20';
  const withStay = { sel: { arrival: '2026-11-10', departure: '2026-11-13' }, pick: null, quote: { kind: 'ok' }, quoting: true, seq: 4 };
  const newPick = (d, seq) => ({ pick: d, sel: null, quote: null, quoting: false, seq, hint: '' });

  it('a tap on or before arrival abandons the stay: clears sel and quote, bumps seq', () => {
    expect(HC.tapAny(withStay, '2026-11-08', map, TODAY)).toEqual(newPick('2026-11-08', 5));
    expect(HC.tapAny(withStay, '2026-11-10', map, TODAY)).toEqual(newPick('2026-11-10', 5));
  });
  it('a later day that fails stayCheck abandons the stay too', () => {
    expect(HC.tapAny(withStay, '2026-11-25', map, TODAY)).toEqual(newPick('2026-11-25', 5));
  });
  it('a later day that passes stayCheck re-extends the stay', () => {
    expect(HC.tapAny(withStay, '2026-11-15', map, TODAY)).toEqual({ stay: { arrival: '2026-11-10', departure: '2026-11-15' } });
  });
  it('with a pick: on or before moves the pick, later sets the stay', () => {
    const picking = { sel: null, pick: '2026-11-10', quote: null, quoting: false, seq: 2 };
    expect(HC.tapAny(picking, '2026-11-09', map, TODAY)).toEqual(newPick('2026-11-09', 3));
    expect(HC.tapAny(picking, '2026-11-12', map, TODAY)).toEqual({ stay: { arrival: '2026-11-10', departure: '2026-11-12' } });
  });
});

describe('footText', () => {
  it('uses singular and plural nights like the leaves', () => {
    expect(HC.footText('$500.00', 1)).toBe('$500.00 all in \u00b7 1 night');
    expect(HC.footText('$938.56', 2)).toBe('$938.56 all in \u00b7 2 nights');
  });
});
