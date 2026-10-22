import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const SRC = readFileSync(new URL('../v5/join.js', import.meta.url), 'utf8');

// Minimal fake DOM: a panel whose querySelector hands back persistent stub elements by selector.
function fakePanel() {
  const els = {};
  return {
    style: {},
    els,
    set innerHTML(v) { for (const k of Object.keys(els)) delete els[k]; },
    querySelector(sel) {
      if (!els[sel]) els[sel] = { value: '', style: {}, focus() {}, textContent: '', disabled: false };
      return els[sel];
    },
    querySelectorAll() { return []; },
  };
}

function load({ posthog, fetchImpl, pathname = '/', loggedIn = null }) {
  const calls = [];
  const win = { __loggedInName: loggedIn };
  if (posthog === 'live') win.posthog = { capture: (n, p) => calls.push([n, p]) };
  else if (posthog === 'stub') win.posthog = {};
  const ctx = {
    window: win,
    document: { getElementById: () => ({}), createElement: () => ({}), head: { appendChild() {} } },
    location: { hostname: 'reset.club', pathname },
    fetch: fetchImpl,
    setTimeout: () => 0,
    console,
  };
  ctx.window.document = ctx.document;
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx);
  return { J: ctx.window.ResetJoin, calls, win };
}

const ok = (body) => async () => ({ ok: true, status: 200, json: async () => body });
const flush = () => new Promise((r) => setImmediate(r));

describe('join panel events', () => {
  it('opening in join mode captures join_opened with surface', () => {
    const { J, calls } = load({ posthog: 'live' });
    J.init(fakePanel(), {});
    expect(calls).toEqual([['join_opened', { surface: 'homepage' }]]);
  });

  it('surface is content off the homepage', () => {
    const { J, calls } = load({ posthog: 'live', pathname: '/about' });
    J.init(fakePanel(), {});
    expect(calls[0][1].surface).toBe('content');
  });

  it('does not capture join_opened for a logged-in account panel', () => {
    const { J, calls } = load({ posthog: 'live', loggedIn: 'Sam' });
    J.init(fakePanel(), {});
    expect(calls).toEqual([]);
  });

  it('switching to login captures login_opened', () => {
    const { J, calls } = load({ posthog: 'live' });
    const p = fakePanel();
    J.init(p, {});
    p.querySelector('#rj-toggle').onclick();
    expect(calls.map((c) => c[0])).toEqual(['join_opened', 'login_opened']);
  });

  it('never throws when posthog is missing or a stub', () => {
    for (const mode of [undefined, 'stub']) {
      const { J } = load({ posthog: mode });
      const p = fakePanel();
      J.init(p, {});
      expect(() => p.querySelector('#rj-toggle').onclick()).not.toThrow();
    }
  });

  async function toOtp(fetchImpl, phoneOrEmail = 'phone') {
    const t = load({ posthog: 'live', fetchImpl });
    const p = fakePanel();
    t.J.init(p, {});
    p.querySelector('#rj-toggle').onclick();
    if (phoneOrEmail === 'email') {
      p.querySelector('#rj-mt').onclick();
      p.querySelector('#rj-em').value = 'a@b.co';
    } else p.querySelector('#rj-ph').value = '(555) 555-1234';
    t.calls.length = 0;
    await p.querySelector('#rj-btn').onclick();
    return { ...t, p };
  }

  it('successful request-otp captures login_code_requested with method', async () => {
    const t = await toOtp(ok({ success: true }));
    expect(t.calls).toEqual([['login_code_requested', { surface: 'homepage', method: 'phone' }]]);
    const e = await toOtp(ok({ success: true }), 'email');
    expect(e.calls[0][1].method).toBe('email');
  });

  it('failed request-otp captures nothing', async () => {
    const t = await toOtp(ok({ success: false }));
    expect(t.calls).toEqual([]);
  });

  it('successful verify captures login_completed, failed verify does not', async () => {
    let body = { success: true, user: { name: 'Sam Lee' } };
    const t = await toOtp(async (url) => ({ ok: true, json: async () => (url.endsWith('/verify-otp') ? body : { success: true }) }));
    t.p.querySelector('#rj-otp').value = '123456';
    t.calls.length = 0;
    await t.p.querySelector('#rj-btn').onclick();
    expect(t.calls).toEqual([['login_completed', { surface: 'homepage', method: 'phone' }]]);

    body = { success: false };
    const f = await toOtp(async (url) => ({ ok: true, json: async () => (url.endsWith('/verify-otp') ? body : { success: true }) }));
    f.p.querySelector('#rj-otp').value = '123456';
    f.calls.length = 0;
    await f.p.querySelector('#rj-btn').onclick();
    expect(f.calls).toEqual([]);
  });

  async function signup(fetchImpl) {
    const t = load({ posthog: 'live', fetchImpl });
    const p = fakePanel();
    t.J.init(p, {});
    p.querySelector('#rj-fn').value = 'Sam';
    p.querySelector('#rj-ln').value = 'Lee';
    p.querySelector('#rj-em').value = 'sam@example.com';
    p.querySelector('#rj-ph').value = '5555551234';
    t.calls.length = 0;
    await p.querySelector('#rj-btn').onclick();
    return t;
  }

  it('successful sign-up captures signup_completed, failure does not', async () => {
    const good = await signup(async () => ({ ok: true, status: 202 }));
    expect(good.calls.map((c) => c[0])).toContain('signup_completed');
    const bad = await signup(async () => ({ ok: false, status: 400 }));
    expect(bad.calls.map((c) => c[0])).not.toContain('signup_completed');
  });

  it('no captured property holds an @ or a run of 7+ digits', async () => {
    const t = await signup(async () => ({ ok: true, status: 202 }));
    for (const [, props] of t.calls) {
      const s = JSON.stringify(props);
      expect(s).not.toMatch(/@/);
      expect(s).not.toMatch(/\d{7,}/);
      expect(Object.keys(props).every((k) => ['surface', 'method'].includes(k))).toBe(true);
    }
  });
});
