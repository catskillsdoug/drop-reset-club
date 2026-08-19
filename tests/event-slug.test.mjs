import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// v5/app.js is a classic browser script (<script defer src>), not a module, so
// we extract the pure slug helpers from the shipped source and evaluate them.
// This tests the code that actually ships — no duplicated logic to drift.
const SRC = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'v5', 'app.js'),
  'utf8'
);

const START = '// --- test:event-slug-helpers:start ---';
const END = '// --- test:event-slug-helpers:end ---';

function loadHelpers() {
  const a = SRC.indexOf(START);
  const b = SRC.indexOf(END);
  if (a === -1 || b === -1) throw new Error('event-slug helper markers not found in v5/app.js');
  const block = SRC.slice(a + START.length, b);
  return new Function(`${block}; return { eventSlugFromPath, eventHref };`)();
}

describe('eventSlugFromPath', () => {
  const { eventSlugFromPath } = loadHelpers();

  it('decodes a percent-encoded slug so it matches the stored value', () => {
    // The leaf-peeps incident: location.pathname never decodes, so a slug
    // stored as "leaf peeps" was compared against "leaf%20peeps" and lost.
    expect(eventSlugFromPath('/e/leaf%20peeps')).toBe('leaf peeps');
  });

  it('reads plain slugs unchanged', () => {
    expect(eventSlugFromPath('/e/star-flood')).toBe('star-flood');
  });

  it('handles the /n/ and /v5/ path prefixes', () => {
    expect(eventSlugFromPath('/n/e/leaf%20peeps')).toBe('leaf peeps');
    expect(eventSlugFromPath('/v5/e/star-flood')).toBe('star-flood');
  });

  it('stops at a query string or hash', () => {
    expect(eventSlugFromPath('/e/star-flood')).toBe('star-flood');
    expect(eventSlugFromPath('/e/leaf%20peeps/extra')).toBe('leaf peeps');
  });

  it('returns null for non-event paths', () => {
    expect(eventSlugFromPath('/')).toBeNull();
    expect(eventSlugFromPath('/stay/properties')).toBeNull();
  });

  it('does not throw on a malformed percent-sequence', () => {
    // decodeURIComponent throws URIError here; an uncaught throw would blank
    // the entire page, which is the failure mode we are fixing.
    expect(() => eventSlugFromPath('/e/%E0%A4%A')).not.toThrow();
    expect(eventSlugFromPath('/e/%E0%A4%A')).toBe('%E0%A4%A');
  });
});

describe('eventHref', () => {
  const { eventHref } = loadHelpers();

  it('encodes a slug containing a space', () => {
    expect(eventHref('', 'leaf peeps', 'ZINK')).toBe('/e/leaf%20peeps?property=ZINK');
  });

  it('leaves a url-safe slug readable', () => {
    expect(eventHref('', 'star-flood', 'ZINK')).toBe('/e/star-flood?property=ZINK');
  });

  it('honours the link base prefix', () => {
    expect(eventHref('/n', 'star-flood', 'COOK')).toBe('/n/e/star-flood?property=COOK');
  });

  it('round-trips: a built href parses back to the original slug', () => {
    const { eventSlugFromPath } = loadHelpers();
    for (const slug of ['leaf peeps', 'star-flood', 'Rollerdisco26', "father's day"]) {
      const href = eventHref('', slug, 'ZINK');
      expect(eventSlugFromPath(new URL(href, 'https://reset.club').pathname)).toBe(slug);
    }
  });
});

describe('call sites use the helpers', () => {
  it('the router parses via eventSlugFromPath, not a raw pathname regex', () => {
    expect(SRC).toContain('eventSlugFromPath(location.pathname)');
  });

  it('the hero pill builds its link via eventHref', () => {
    expect(SRC).toMatch(/navTo:\s*eventHref\(/);
  });
});
