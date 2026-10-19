import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// v5/app.js is a classic browser script, so the helper is extracted from the
// shipped source between markers, the same way event-slug.test.mjs does it.
const SRC = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'v5', 'app.js'),
  'utf8'
);

const START = '// --- test:house-link:start ---';
const END = '// --- test:house-link:end ---';

function loadHelpers() {
  const a = SRC.indexOf(START);
  const b = SRC.indexOf(END);
  if (a === -1 || b === -1) throw new Error('house-link markers not found in v5/app.js');
  const block = SRC.slice(a + START.length, b);
  return new Function(`${block}; return { houseHref };`)();
}

describe('houseHref', () => {
  const { houseHref } = loadHelpers();

  it('sends each house name to its short link on reset.club', () => {
    expect(houseHref('COOK')).toBe('https://reset.club/cook');
    expect(houseHref('ZINK')).toBe('https://reset.club/zink');
    expect(houseHref('BARN')).toBe('https://reset.club/barn');
  });

  it('sends HILL4 to /hill, since the 4-guest listing is the only Hill', () => {
    expect(houseHref('HILL4')).toBe('https://reset.club/hill');
  });

  it('returns null for a code with no short link, so the name stays plain text', () => {
    expect(houseHref('VITO')).toBe(null);
  });
});
