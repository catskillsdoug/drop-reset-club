import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const consent = createRequire(import.meta.url)('../v5/consent.js');
const APP = readFileSync(new URL('../v5/app.js', import.meta.url), 'utf8');
const HTML = readFileSync(new URL('../v5/index.html', import.meta.url), 'utf8');
const JOIN = readFileSync(new URL('../v5/join.js', import.meta.url), 'utf8');

// The default footer is the template literal assigned to FOOTER_HTML
function defaultFooter() {
  const m = APP.match(/let FOOTER_HTML = `([^`]*)`;/);
  expect(m).not.toBeNull();
  return m[1];
}

// Fake tree: a footer-links row that records appended children and answers querySelector
function fakeFooterDoc() {
  const children = [];
  const sep = { tag: 'span', textContent: '·', cloneNode() { return { tag: 'span', textContent: '·', clone: true }; } };
  const row = {
    style: {},
    children,
    querySelector(sel) {
      if (sel === '[data-consent-settings]') return children.find((c) => c.attrs && 'data-consent-settings' in c.attrs) || null;
      if (sel === 'span') return sep; // v2 separators are bare spans, no .footer-sep
      return null;
    },
    appendChild(c) { children.push(c); return c; },
  };
  const doc = {
    location: { hostname: 'drop.reset.club' },
    classes: [],
    querySelectorAll(sel) { return sel === '.footer-links' ? [row] : []; },
    querySelector() { return null; },
    createElement() {
      const attrs = {};
      return { attrs, textContent: '', setAttribute(n, v) { attrs[n] = v; }, addEventListener() {} };
    },
  };
  return { doc, row, children };
}

describe('homepage footer v2', () => {
  it('default FOOTER_HTML has the v2 shape', () => {
    const f = defaultFooter();
    expect(f).toContain('<details');
    expect(f).toContain('rc-foot');
    expect(f).toContain('footer-links');
    expect(f).not.toContain('/about');
    expect(f).toContain('/privacy');
    expect(f).toContain('/disclaimer');
    expect(f).toContain('/terms');
  });

  it('fetches /footer/v2', () => {
    expect(APP).toContain("fetch('https://brand.reset.club/footer/v2')");
    expect(APP).not.toContain("brand.reset.club/footer')");
  });

  it('cookie settings is appended exactly once inside .footer-links', () => {
    expect(defaultFooter()).toMatch(/class="footer-links[ "]/);
    const { doc, row, children } = fakeFooterDoc();
    consent.appendSettingsLink(doc);
    consent.appendSettingsLink(doc); // after the fetched footer replaces the fallback it runs again
    const links = children.filter((c) => c.attrs && 'data-consent-settings' in c.attrs);
    expect(links).toHaveLength(1);
    expect(links[0].textContent).toBe('Cookie settings');
    expect(row.style.flexWrap).toBe('wrap');
  });

  it('cookie settings gets the same dot separator as the links before it', () => {
    const { doc, children } = fakeFooterDoc();
    consent.appendSettingsLink(doc);
    expect(children).toHaveLength(2);
    expect(children[0]).toMatchObject({ tag: 'span', textContent: '·', clone: true });
    expect(children[1].textContent).toBe('Cookie settings');
  });
});

describe('homepage header and menu', () => {
  it('index.html has the menu toggle and no #nav-join', () => {
    expect(HTML).toMatch(/<button class="rc-nav-toggle" aria-label="Menu" aria-controls="rc-menu" aria-expanded="false">/);
    expect(HTML).not.toContain('nav-join');
    expect(HTML).toContain('<script type="module" src="https://brand.reset.club/main/menu.js"></script>');
    expect(HTML).toContain('/v5/join.js?v=201');
  });

  it('app.js no longer references #nav-join and mounts the menu with the listeners first', () => {
    expect(APP).not.toContain('nav-join');
    const l = APP.indexOf("'rc-menu:join'");
    const m = APP.indexOf('resetMenu.mount');
    expect(l).toBeGreaterThan(-1);
    expect(m).toBeGreaterThan(l);
    for (const e of ['rc-menu:login', 'rc-menu:account']) expect(APP.indexOf(e)).toBeGreaterThan(-1);
    expect(APP).toContain("surface: 'home'");
    expect(APP).toContain("menuUrl: 'https://brand.reset.club/menu'");
  });
});

describe('join.js opts.mode', () => {
  function load(loggedIn) {
    const win = { __loggedInName: loggedIn };
    const ctx = {
      window: win,
      document: { getElementById: () => ({}), createElement: () => ({}), head: { appendChild() {} } },
      location: { hostname: 'reset.club', pathname: '/' },
      fetch: async () => ({ json: async () => ({}) }),
      setTimeout: () => 0,
      console,
    };
    win.document = ctx.document;
    vm.createContext(ctx);
    vm.runInContext(JOIN, ctx);
    return win.ResetJoin;
  }
  function panel() {
    const els = {};
    return {
      style: {},
      html: '',
      set innerHTML(v) { this.html = v; for (const k of Object.keys(els)) delete els[k]; },
      querySelector(sel) { return els[sel] || (els[sel] = { value: '', style: {}, focus() {}, textContent: '', disabled: false }); },
      querySelectorAll() { return []; },
    };
  }
  const run = (loggedIn, opts) => { const p = panel(); load(loggedIn).init(p, opts); return p.html; };

  it('mode join, login and account render their views', () => {
    expect(run(null, { mode: 'login' })).toContain('SEND CODE');
    expect(run(null, { mode: 'join' })).not.toContain('SEND CODE');
    expect(run('Ann', { mode: 'join' })).not.toContain('LOG OUT');
    expect(run('Ann', { mode: 'account' })).toContain('LOG OUT');
    expect(run(null, { mode: 'account' })).toContain('LOG OUT');
  });

  it('default keeps today behaviour', () => {
    expect(run('Ann', {})).toContain('LOG OUT');
    expect(run(null, {})).not.toContain('LOG OUT');
    expect(run(null, {})).not.toContain('SEND CODE');
  });
});

describe('content pages shell (renderPageShell)', () => {
  const V2 = '<div class="rc-foot">FETCHED-V2</div>';
  async function render(fetchImpl, userName) {
    const orig = globalThis.fetch;
    globalThis.fetch = fetchImpl;
    try {
      const { renderPageShell } = await import('../functions/_middleware.js');
      return await renderPageShell('About', '<h1>About</h1>', '', userName, '');
    } finally {
      globalThis.fetch = orig;
    }
  }
  const ok = async (url) => { ok.url = url; return { ok: true, text: async () => V2 }; };
  const down = async () => { throw new Error('down'); };
  const count = (s, needle) => s.split(needle).length - 1;

  it('fetches /footer/v2 and uses it when it succeeds', async () => {
    const html = await render(ok);
    expect(ok.url).toBe('https://brand.reset.club/footer/v2');
    expect(html).toContain('FETCHED-V2');
  });

  it('falls back to the v2 footer shape when the fetch fails', async () => {
    const html = await render(down);
    expect(html).toContain('<details class="rc-foot__more">');
    expect(html).toContain('class="footer-links rc-foot__links"');
    expect(html).toContain('href="https://reset.club/privacy"');
    expect(html).toContain('href="https://reset.club/terms"');
    expect(html).not.toContain('/about');
    expect(html).toContain(`© ${new Date().getFullYear()} Reset Club Holdings LLC`);
  });

  it('has the toggle, no #nav-join, no inline footer CSS, and the menu module once', async () => {
    const html = await render(ok);
    expect(html).toMatch(/<button class="rc-nav-toggle" aria-label="Menu" aria-controls="rc-menu" aria-expanded="false">/);
    expect(html).toContain('<a href="/v5/" class="nav-logo">RESET</a>');
    expect(html).not.toContain('nav-join');
    expect(html).not.toMatch(/\.footer-line\s*\{\s*width:\s*100%;\s*height:\s*3px/);
    expect(html).not.toMatch(/footer-line/);
    expect(count(html, '<script type="module" src="https://brand.reset.club/main/menu.js"></script>')).toBe(1);
    expect(count(html, '/v5/join.js?v=201')).toBe(1);
    expect(count(html, '/v5/consent.js?v=3')).toBe(1);
    expect(html).toContain("surface: 'content'");
    expect(html).toContain("menuUrl: 'https://brand.reset.club/menu'");
    const l = html.indexOf("'rc-menu:join'");
    expect(l).toBeGreaterThan(-1);
    expect(html.indexOf('resetMenu.mount')).toBeGreaterThan(l);
  });

  it('sets no __loggedInName for guests', async () => {
    expect(await render(ok)).not.toContain('window.__loggedInName = "');
  });

  it('falls back to the /me session check, guarded so a server-set name wins', async () => {
    const html = await render(ok);
    expect(html).toContain("fetch(authBase + '/me', { credentials: 'include' })");
    expect(html).toContain("var authBase = (function()");
    expect(html).toContain('if (!window.__loggedInName) {');
    expect(html).toContain('data.authenticated && data.guest && !window.__loggedInName');
    const named = await render(ok, 'Ann');
    expect(named).toContain('window.__loggedInName = "Ann";');
    expect(named.indexOf('window.__loggedInName = "Ann";')).toBeLessThan(named.indexOf('if (!window.__loggedInName) {'));
  });

  it('escapes a hostile userName in the __loggedInName assignment', async () => {
    const html = await render(ok, 'Ann</script><b>x');
    expect(html).not.toContain('</script><b>');
    expect(html).toContain('window.__loggedInName = "Ann\\u003c/script>\\u003cb>x";');
  });
});

describe('homepage footer colour', () => {
  const CSS = readFileSync(new URL('../v5/styles.css', import.meta.url), 'utf8');
  it('footer text and rule take the section colour, sand on house colours', () => {
    expect(CSS).toMatch(/\.footer-row \.rc-foot\s*\{[^}]*color:\s*inherit/);
  });
});

describe('header colour', () => {
  const CSS = readFileSync(new URL('../v5/styles.css', import.meta.url), 'utf8');
  it('switches with the section at once, no colour fade (Doug 2026-10-23)', () => {
    const nav = CSS.match(/\nnav \{[^}]*\}/)[0];
    expect(nav).toContain('transition: opacity 0.3s ease, transform 0.3s ease;');
    expect(nav).not.toMatch(/transition:[^;]*(background-color|[^-]color)/);
  });
});

describe('collection house rows', () => {
  const CSS = readFileSync(new URL('../v5/styles.css', import.meta.url), 'utf8');
  it('hover shows the house colour at full strength instead of dimming (Doug 2026-10-23)', () => {
    expect(APP).toContain("row.classList.add('hero-option--house')");
    expect(APP).toContain("row.style.setProperty('--house', info.color.bg)");
    expect(CSS).toMatch(/\.hero-option--house:hover\s*\{[^}]*opacity:\s*1[^}]*color:\s*var\(--house\)/);
  });
});

describe('browser theme colour', () => {
  it('index.html declares theme-color and showSection keeps it equal to the page background (Doug 2026-10-23)', () => {
    expect(HTML).toMatch(/<meta name="theme-color" content="#fcf6e9">/);
    const show = APP.slice(APP.indexOf('function showSection'), APP.indexOf('sections.forEach(s => { observer.observe(s)'));
    expect(show).toMatch(/const pageBg = entry\.target\.dataset\.navBg === 'transparent' \? theme\.bg : \(entry\.target\.dataset\.navBg \|\| theme\.bg\);/);
    expect(show).toContain('document.body.style.backgroundColor = pageBg;');
    expect(show).toMatch(/querySelector\('meta\[name="theme-color"\]'\)[\s\S]*content = pageBg/);
  });
});
