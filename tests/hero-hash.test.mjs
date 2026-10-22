import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const app = readFileSync(resolve(root, 'v5/app.js'), 'utf8');
const START = '// --- test:section-hash:start ---';
const END = '// --- test:section-hash:end ---';

// Back on the hero the address kept the last section (#collection), so a reload or a shared
// link opened at Collection instead of the top (Doug, 2026-10-22).
describe('section hash follows the section in view', () => {
  let loc, calls, win;
  beforeEach(() => {
    loc = { pathname: '/', search: '', hash: '' };
    calls = [];
    win = { __suppressHashUpdate: false };
  });
  const load = () => {
    expect(app.indexOf(START)).toBeGreaterThan(-1);
    const block = app.slice(app.indexOf(START) + START.length, app.indexOf(END));
    const history = { replaceState: (s, t, url) => { calls.push(url); const i = url.indexOf('#'); loc.hash = i >= 0 ? url.slice(i) : ''; } };
    return new Function('window', 'location', 'history', block + '\nreturn syncSectionHash;')(win, loc, history);
  };

  it('a section writes its id', () => {
    load()('property-cook');
    expect(calls).toEqual(['#property-cook']);
  });

  it('the hero clears a hash left by an earlier section, keeping path and query', () => {
    loc.search = '?type=midweek';
    const sync = load();
    sync('collection');
    sync('hero');
    expect(calls).toEqual(['#collection', '/?type=midweek']);
    expect(loc.hash).toBe('');
  });

  it('the hero with no hash writes nothing', () => {
    load()('hero');
    expect(calls).toEqual([]);
  });

  it('nothing is written while a scripted scroll suppresses updates', () => {
    win.__suppressHashUpdate = true;
    const sync = load();
    sync('property-barn');
    loc.hash = '#collection';
    sync('hero');
    expect(calls).toEqual([]);
  });
});
