import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const CSS = readFileSync(new URL('../v5/styles.css', import.meta.url), 'utf8');

// iOS Safari's floating toolbar: 100dvh is shorter than the screen, so a section with
// little content let the next section's colour show under the bar (Doug, iPhone, 2026-10-22).
describe('snap sections cover the whole screen', () => {
  const rule = CSS.match(/\n\.section \{([^}]*)\}/)[1];

  it('ends with min-height 100lvh, after the vh and dvh fallbacks', () => {
    const heights = [...rule.matchAll(/min-height:\s*([^;]+);/g)].map(m => m[1].trim());
    expect(heights).toEqual(['100vh', '100dvh', '100lvh']);
  });

  it('keeps snapping to the section start', () => {
    expect(rule).toMatch(/scroll-snap-align:\s*start/);
  });
});
