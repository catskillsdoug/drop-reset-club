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

  it('gone: the message and the priced alternatives', () => {
    const body = {
      available: false, reason: 'booked', message: 'Those dates are not available.',
      alternatives: [{ checkin: '2026-11-05', checkout: '2026-11-08', nights: 3, total: '2376.00', currency: 'USD', quote_id: 'q1', expires_at: 'x' }],
      note: 'Not held.',
    };
    const v = HC.quoteView(200, body);
    expect(v.kind).toBe('gone');
    expect(v.message).toBe('Those dates are not available.');
    expect(v.alternatives).toEqual([{ checkin: '2026-11-05', checkout: '2026-11-08', total: '$2,376.00', label: 'Thu, Nov 5 – Sun, Nov 8 · $2,376.00' }]);
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
