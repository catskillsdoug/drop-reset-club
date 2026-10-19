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

describe('boot', () => {
  function bootDoc(readyState) {
    const doc = fakeDoc(HELD);
    doc.cookie = 'rc_consent=granted';
    doc.readyState = readyState;
    doc.listeners = {};
    doc.addEventListener = (type, fn) => { doc.listeners[type] = fn; };
    return doc;
  }
  it('granted while loading waits for DOMContentLoaded, then activates', () => {
    const doc = bootDoc('loading');
    consent.boot(doc);
    expect(doc.live).toHaveLength(0);
    doc.listeners.DOMContentLoaded();
    expect(doc.live).toHaveLength(3);
  });
  it('granted once parsed activates at once', () => {
    const doc = bootDoc('complete');
    consent.boot(doc);
    expect(doc.live).toHaveLength(3);
  });
});

// A fake element tree, enough for open() and appendSettingsLink(): no jsdom in this repo.
function fakeEl(tag) {
  const el = {
    tag, attrs: {}, children: [], listeners: {}, textContent: '', parentNode: null, focused: false,
    setAttribute(n, v) { el.attrs[n] = String(v); },
    getAttribute(n) { return n in el.attrs ? el.attrs[n] : null; },
    appendChild(c) { c.parentNode = el; el.children.push(c); return c; },
    addEventListener(t, fn) { el.listeners[t] = fn; },
    focus() { el.focused = true; },
    remove() { if (el.parentNode) el.parentNode.children.splice(el.parentNode.children.indexOf(el), 1); el.parentNode = null; },
    all() { return el.children.reduce((a, c) => a.concat([c], c.all()), []); },
  };
  return el;
}

function bannerDoc(footerSel) {
  const doc = fakeDoc([]);
  doc.body = fakeEl('body');
  doc.head = fakeEl('head');
  doc.footer = footerSel ? fakeEl(footerSel === 'footer' ? 'footer' : 'div') : null;
  doc.createElement = fakeEl;
  doc.getElementById = (id) => doc.body.all().concat(doc.head.all()).find((e) => e.attrs.id === id) || null;
  doc.querySelector = (sel) => {
    if (sel === '.footer-links' && footerSel === '.footer-links') return doc.footer;
    if (sel === 'footer' && footerSel === 'footer') return doc.footer;
    if (sel === '[data-consent-settings]' && doc.footer) return doc.footer.all().find((e) => 'data-consent-settings' in e.attrs) || null;
    return null;
  };
  return doc;
}

describe('open', () => {
  it('builds one labelled dialog with Privacy link and equal Accept and Decline buttons', () => {
    const doc = bannerDoc();
    consent.open(doc);
    const box = doc.getElementById('rc-consent');
    expect(box.attrs.role).toBe('dialog');
    expect(box.attrs['aria-label']).toBe('Cookie choice');
    const parts = box.all();
    const privacy = parts.find((e) => e.tag === 'a');
    expect(privacy.attrs.href).toBe('https://reset.club/privacy');
    const buttons = parts.filter((e) => e.tag === 'button');
    expect(buttons.map((b) => b.textContent)).toEqual(['Accept', 'Decline']);
    expect(buttons[0].attrs.class).toBe(buttons[1].attrs.class);
    expect(buttons[0].focused).toBe(true);
    expect(JSON.stringify(parts.map((e) => e.textContent))).not.toContain('—');
  });
  it('scopes every style rule under #rc-consent, in a single style element', () => {
    const doc = bannerDoc();
    consent.open(doc);
    const styles = doc.getElementById('rc-consent').all().filter((e) => e.tag === 'style');
    expect(styles).toHaveLength(1);
    const rules = styles[0].textContent.split('}').map((r) => r.trim()).filter(Boolean);
    expect(rules.length).toBeGreaterThan(0);
    rules.forEach((r) => expect(r.startsWith('#rc-consent')).toBe(true));
  });
  it('opening twice leaves one banner', () => {
    const doc = bannerDoc();
    consent.open(doc);
    consent.open(doc);
    expect(doc.body.children.filter((e) => e.attrs.id === 'rc-consent')).toHaveLength(1);
  });
  it('Accept and Decline write the cookie and remove the banner', () => {
    ['Accept', 'Decline'].forEach((label) => {
      const doc = bannerDoc();
      let jar = '';
      Object.defineProperty(doc, 'cookie', { get() { return jar; }, set(v) { jar = v.split(';')[0]; } });
      consent.open(doc);
      const btn = doc.getElementById('rc-consent').all().find((e) => e.textContent === label);
      btn.listeners.click();
      expect(consent.state(doc)).toBe(label === 'Accept' ? 'granted' : 'denied');
      expect(doc.getElementById('rc-consent')).toBeNull();
    });
  });
});

describe('appendSettingsLink', () => {
  it('adds one Cookie settings link to .footer-links, once however often it runs', () => {
    const doc = bannerDoc('.footer-links');
    expect(consent.appendSettingsLink(doc)).toBe(true);
    consent.appendSettingsLink(doc);
    const links = doc.footer.children;
    expect(links).toHaveLength(1);
    expect(links[0].textContent).toBe('Cookie settings');
    expect(links[0].attrs.href).toBe('#');
  });
  it('falls back to the first footer', () => {
    const doc = bannerDoc('footer');
    expect(consent.appendSettingsLink(doc)).toBe(true);
    expect(doc.footer.children).toHaveLength(1);
  });
  it('returns false when there is no footer', () => {
    expect(consent.appendSettingsLink(bannerDoc())).toBe(false);
  });
  it('clicking it opens the banner and cancels the navigation', () => {
    const doc = bannerDoc('footer');
    consent.appendSettingsLink(doc);
    let prevented = false;
    doc.footer.children[0].listeners.click({ preventDefault() { prevented = true; } });
    expect(prevented).toBe(true);
    expect(doc.getElementById('rc-consent')).not.toBeNull();
  });
});

describe('boot settings link', () => {
  it('retries the link on window load when the footer arrives late', () => {
    const doc = bannerDoc();
    doc.cookie = 'rc_consent=denied';
    doc.readyState = 'interactive';
    const win = { listeners: {}, addEventListener(t, fn) { win.listeners[t] = fn; } };
    doc.defaultView = win;
    consent.boot(doc);
    expect(doc.footer).toBeNull();
    doc.footer = fakeEl('footer');
    doc.querySelector = (sel) => (sel === 'footer' ? doc.footer : null);
    win.listeners.load();
    expect(doc.footer.children).toHaveLength(1);
  });
});
