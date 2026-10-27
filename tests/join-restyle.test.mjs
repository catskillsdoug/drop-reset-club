import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// The sign-in and join forms speak the menu's language: Sign in and Join, sentence case, labels over 1px
// underlines, all type in the text colour, the menu's 44px button. Nothing takes focus on its own, so the
// iPhone keyboard never opens and jumps the page. In the menu, Sign in opens in place under YOU and Join
// has its own view (Doug, 27 Oct).
const JOIN = readFileSync(new URL('../v5/join.js', import.meta.url), 'utf8');
const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

function load() {
  const win = { __loggedInName: null };
  const ctx = {
    window: win,
    document: { getElementById: () => ({}), createElement: () => ({}), head: { appendChild() {} } },
    location: { hostname: 'reset.club', pathname: '/' },
    fetch: async () => ({ json: async () => ({ success: true }) }),
    setTimeout: () => 0,
    console,
  };
  win.document = ctx.document;
  vm.createContext(ctx);
  vm.runInContext(JOIN, ctx);
  return win.ResetJoin;
}
function panel(dataset) {
  const els = {}, focused = [];
  return {
    style: {}, html: '', focused, dataset,
    set innerHTML(v) { this.html = v; for (const k of Object.keys(els)) delete els[k]; },
    querySelector(sel) { return els[sel] || (els[sel] = { value: '', style: {}, focus(o) { focused.push([sel, o]); }, textContent: '', disabled: false }); },
    querySelectorAll() { return []; },
  };
}
const open = (mode, dataset) => { const p = panel(dataset); load().init(p, { mode }); return p; };

describe('the forms read like the menu', () => {
  it('Sign in: a title, a labelled mobile number, US numbers only, Use email instead, Send code', () => {
    const h = open('login').html;
    for (const s of ['>Sign in<', '>Mobile number<', '>US numbers only<', '>Use email instead<', '>Send code<']) expect(h).toContain(s);
    expect(h).not.toMatch(/LOGIN|SIGN-UP|SEND CODE|US NUMBERS ONLY/);
  });

  it('Join: first and last name paired, email and mobile each on their own line, the legal line in sentence case', () => {
    const h = open('join').html;
    for (const s of ['>Join<', '>First name<', '>Last name<', '>Email<', '>Mobile number<', 'By joining you agree to our']) expect(h).toContain(s);
    expect(h).toMatch(/<div class="rj-field rj-field--wide"><label class="rj-label" for="rj-em">Email<\/label>/);
    expect(h).toMatch(/<div class="rj-field rj-field--wide"><label class="rj-label" for="rj-ph">Mobile number<\/label>/);
    expect(h).not.toMatch(/SIGN-UP|>JOIN<|BY JOINING/);
  });

  it('no field has a placeholder, so no type is greyed out', () => {
    for (const m of ['login', 'join']) expect(open(m).html).not.toContain('placeholder=');
    const css = JOIN.slice(JOIN.indexOf("s.textContent ="), JOIN.indexOf('document.head.appendChild(s)'));
    expect(css).not.toMatch(/text-transform:uppercase/);
    expect(css).not.toMatch(/\.rj-(title|toggle|hint|mode-toggle|label|disclosure|otp-hint|word)[^{]*\{[^}]*opacity:0\./);
  });

  it('the button is the menu button: 44px tall, 13px bold, sentence case', () => {
    expect(JOIN).toMatch(/\.rj-btn \{[^}]*height:44px[^}]*font-size:13px[^}]*font-weight:700/);
    expect(JOIN).toMatch(/\.rj-fields input \{[^}]*font-size:16px/); // 16px, so iPhone never zooms into a field
  });
});

describe('nothing takes focus on its own', () => {
  it('Sign in and Join open with no field focused', () => {
    expect(open('login').focused).toEqual([]);
    expect(open('join').focused).toEqual([]);
  });

  it('the code field, after Send code, takes focus without scrolling the page', async () => {
    const p = open('login');
    p.querySelector('#rj-ph').value = '8455550123';
    await p.querySelector('#rj-btn').onclick();
    expect(p.html).toContain('>Enter the code<');
    expect(p.focused).toEqual([['#rj-otp', { preventScroll: true }]]);
  });
});

describe('in the menu: Sign in in place, Join in its own view', () => {
  it('Sign in in the YOU slot offers Join instead and Cancel, both for the menu to handle', () => {
    const h = open('login', { menuInline: '1' }).html;
    expect(h).toMatch(/<button type="button" class="rj-word" data-join>Join instead<\/button>/);
    expect(h).toMatch(/<button type="button" class="rj-word" data-menu-back>Cancel<\/button>/);
    expect(h).not.toContain('id="rj-toggle"');
  });

  it('Join in a view the menu can sign in from offers Sign in for the menu to handle', () => {
    const h = open('join', { menuInlineLogin: '1' }).html;
    expect(h).toMatch(/Have an account\? <button type="button" class="rj-word" data-menu-login>Sign in<\/button>/);
    expect(h).not.toContain('id="rj-toggle"');
  });

  it('anywhere else the form switches between Sign in and Join itself, as before', () => {
    const p = open('join');
    expect(p.html).toContain('id="rj-toggle"');
    p.querySelector('#rj-toggle').onclick();
    expect(p.html).toContain('>Send code<');
    expect(p.html).not.toContain('data-menu-back');
  });
});

describe('pages load the new join.js', () => {
  it('v5/index.html and the content pages ask for ?v=203', () => {
    expect(read('v5/index.html')).toContain('/v5/join.js?v=203');
    expect(read('functions/_middleware.js')).toContain('/v5/join.js?v=203');
  });
});
