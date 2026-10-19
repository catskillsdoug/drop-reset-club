import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const consent = createRequire(import.meta.url)('../v5/consent.js');

// A fake document: held scripts are { attrs, text }, replaceChild swaps them for the live node.
function fakeDoc(held) {
  const doc = {
    cookie: '',
    location: { hostname: 'drop.reset.club' },
    live: [],
    held: held.map((h) => {
      const attrs = [{ name: 'type', value: 'text/plain' }, { name: 'data-consent', value: 'analytics' }];
      if (h.src) attrs.push({ name: 'src', value: h.src });
      if (h.async) attrs.push({ name: 'async', value: '' });
      const el = { attributes: attrs, textContent: h.text || '' };
      el.parentNode = {
        replaceChild(live) {
          doc.held.splice(doc.held.indexOf(el), 1);
          doc.live.push(live);
        },
      };
      return el;
    }),
    querySelectorAll(sel) {
      expect(sel).toBe('script[type="text/plain"][data-consent]');
      return doc.held.slice();
    },
    createElement(tag) {
      expect(tag).toBe('script');
      const attrs = {};
      return { attrs, textContent: '', setAttribute(n, v) { attrs[n] = v; } };
    },
  };
  return doc;
}

const HELD = [
  { src: 'https://www.googletagmanager.com/gtag/js?id=G-WCT8MYRETF', async: true },
  { text: "gtag('config','G-WCT8MYRETF')" },
  { text: 'posthog.init(...)' },
];

describe('readConsent', () => {
  it('reads granted and denied', () => {
    expect(consent.readConsent('a=1; rc_consent=granted')).toBe('granted');
    expect(consent.readConsent('rc_consent=denied')).toBe('denied');
  });
  it('returns null for missing, bad or look-alike cookies', () => {
    expect(consent.readConsent('')).toBeNull();
    expect(consent.readConsent('rc_consent=yes')).toBeNull();
    expect(consent.readConsent('xrc_consent=granted')).toBeNull();
  });
});

describe('consentCookie', () => {
  it('sets the parent domain on reset.club hosts', () => {
    expect(consent.consentCookie('granted', 'drop.reset.club')).toBe(
      'rc_consent=granted; Domain=reset.club; Path=/; Max-Age=31536000; SameSite=Lax; Secure'
    );
    expect(consent.consentCookie('denied', 'reset.club')).toContain('Domain=reset.club');
  });
  it('omits Domain elsewhere', () => {
    expect(consent.consentCookie('granted', 'localhost')).not.toContain('Domain=');
    expect(consent.consentCookie('granted', 'notreset.club')).not.toContain('Domain=');
  });
});

describe('activateDeferred', () => {
  it('inserts live scripts in document order, keeping src and async, dropping type', () => {
    const doc = fakeDoc(HELD);
    expect(consent.activateDeferred(doc)).toBe(3);
    expect(doc.live.map((s) => s.attrs.src || s.textContent)).toEqual([
      'https://www.googletagmanager.com/gtag/js?id=G-WCT8MYRETF',
      "gtag('config','G-WCT8MYRETF')",
      'posthog.init(...)',
    ]);
    expect(doc.live[0].attrs).toEqual({
      src: 'https://www.googletagmanager.com/gtag/js?id=G-WCT8MYRETF',
      async: '',
    });
    for (const s of doc.live) {
      expect(s.attrs.type).toBeUndefined();
      expect(s.attrs['data-consent']).toBeUndefined();
    }
  });
  it('returns 0 on a second call', () => {
    const doc = fakeDoc(HELD);
    consent.activateDeferred(doc);
    expect(consent.activateDeferred(doc)).toBe(0);
    expect(doc.live).toHaveLength(3);
  });
});

describe('state, accept, decline', () => {
  it('state is null and accept does not throw when document.cookie throws', () => {
    const doc = fakeDoc(HELD);
    Object.defineProperty(doc, 'cookie', {
      get() { throw new Error('blocked'); },
      set() { throw new Error('blocked'); },
    });
    expect(consent.state(doc)).toBeNull();
    expect(() => consent.accept(doc)).not.toThrow();
  });
  it('accept after decline starts the held scripts without a reload', () => {
    const doc = fakeDoc(HELD);
    let jar = '';
    Object.defineProperty(doc, 'cookie', {
      get() { return jar; },
      set(v) { jar = v.split(';')[0]; },
    });
    consent.decline(doc);
    expect(consent.state(doc)).toBe('denied');
    expect(doc.live).toHaveLength(0);
    consent.accept(doc);
    expect(consent.state(doc)).toBe('granted');
    expect(doc.live).toHaveLength(3);
  });
});
