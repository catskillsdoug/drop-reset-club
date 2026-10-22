import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const MW = readFileSync(new URL('../functions/_middleware.js', import.meta.url), 'utf8');
const HTML = readFileSync(new URL('../v5/index.html', import.meta.url), 'utf8');

describe('content page footer inset', () => {
  it('insets the footer wrapper to match the header and content', () => {
    expect(MW).toContain('.footer { padding: 0 16px 48px; width: 100%; }');
    expect(MW).toContain('@media (min-width: 641px) { .footer { padding: 0 24px 48px; } }');
    expect(MW).toContain('@media (min-width: 1024px) { .footer { padding: 0 48px 48px; } }');
  });

  it('carries no footer colours or typography', () => {
    expect(MW).not.toMatch(/\.footer[^{]*\{[^}]*(color|font)/);
  });
});

describe('home page cache bust', () => {
  it('loads app.js v278 so old app.js never pairs with the new header', () => {
    expect(HTML).toContain('/v5/app.js?v=278');
    expect(HTML).not.toContain('/v5/app.js?v=277');
  });
});
