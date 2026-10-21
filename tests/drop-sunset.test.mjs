import { describe, it, expect } from 'vitest';
import { sunsetTarget, DROP_SUNSET_MODE } from '../functions/_drop-sunset.js';
import { onRequest } from '../functions/_middleware.js';

// drop.reset.club is sunset: a visitor's page there 301s to the same page on reset.club.
// The reset.club proxy still builds every page from drop.reset.club (it marks its
// requests X-Reset-Proxy: 1), and reset.club pages still load scripts, styles and images
// from it, so those never redirect.

const visitor = (path, { method = 'GET', headers = {}, mode = 'on' } = {}) =>
  sunsetTarget(new URL('https://drop.reset.club' + path), method, new Headers(headers), mode);

describe('sunsetTarget', () => {
  it('a visitor page goes to the same page on reset.club, query kept', () => {
    expect(visitor('/')).toBe('https://reset.club/');
    expect(visitor('/?property=COOK&stay=cook&arrive=2026-11-27&depart=2026-11-30')).toBe('https://reset.club/?property=COOK&stay=cook&arrive=2026-11-27&depart=2026-11-30');
    expect(visitor('/e/peak-foliage')).toBe('https://reset.club/e/peak-foliage');
    expect(visitor('/about')).toBe('https://reset.club/about');
    expect(visitor('/news/the-cook-house-spa')).toBe('https://reset.club/news/the-cook-house-spa');
    expect(visitor('/d/memorial-day')).toBe('https://reset.club/d/memorial-day');
    expect(visitor('/?property=COOK,HILL4&q=a%20b')).toBe('https://reset.club/?property=COOK,HILL4&q=a%20b');
  });

  it('the old /v5 page paths lose their prefix, as reset.club serves them at the root', () => {
    expect(visitor('/v5')).toBe('https://reset.club/');
    expect(visitor('/v5/')).toBe('https://reset.club/');
    expect(visitor('/v5/?type=midweek')).toBe('https://reset.club/?type=midweek');
    expect(visitor('/v5/e/peak-foliage')).toBe('https://reset.club/e/peak-foliage');
  });

  it('never the proxy building reset.club', () => {
    expect(visitor('/', { headers: { 'x-reset-proxy': '1' } })).toBe(null);
    expect(visitor('/about', { headers: { 'x-reset-proxy': '1' } })).toBe(null);
  });

  it('never files, APIs, image endpoints or health checks', () => {
    for (const p of ['/v5/app.js?v=273', '/v5/styles.css?v=230', '/v5/og/default.png', '/og-image.png', '/favicon.ico',
      '/robots.txt', '/sitemap.xml', '/v5/sitemap.xml', '/api/auth/me', '/v5/api/contact', '/n/api/contact',
      '/v5/og', '/ogv5', '/og-image', '/health', '/debug-path', '/.well-known/security.txt']) {
      expect(visitor(p), p).toBe(null);
    }
  });

  it('only reads (GET, HEAD); a POST is never redirected', () => {
    expect(visitor('/', { method: 'HEAD' })).toBe('https://reset.club/');
    expect(visitor('/', { method: 'POST' })).toBe(null);
  });

  it('only drop.reset.club: staging and Pages previews are untouched', () => {
    for (const host of ['https://staging.reset.club/', 'https://ed8635d.drop-reset-club.pages.dev/', 'https://reset.club/']) {
      expect(sunsetTarget(new URL(host), 'GET', new Headers(), 'on')).toBe(null);
    }
  });

  it('test mode redirects only a URL carrying __sunset=1, and drops the flag; off never redirects', () => {
    expect(visitor('/about', { mode: 'test' })).toBe(null);
    expect(visitor('/about?__sunset=1', { mode: 'test' })).toBe('https://reset.club/about');
    expect(visitor('/?property=COOK&__sunset=1', { mode: 'test' })).toBe('https://reset.club/?property=COOK');
    expect(visitor('/?__sunset=1', { mode: 'test', headers: { 'x-reset-proxy': '1' } })).toBe(null);
    expect(visitor('/about', { mode: 'off' })).toBe(null);
  });
});

describe('the middleware entry', () => {
  it('is on (checked live in test mode 10-21), and a visitor page answers 301 before any page work', async () => {
    expect(DROP_SUNSET_MODE).toBe('on');
    const res = await onRequest({ request: new Request('https://drop.reset.club/about'), env: {} });
    expect(res.status).toBe(301);
    expect(res.headers.get('location')).toBe('https://reset.club/about');
  });
});

describe('page meta after the sunset', () => {
  it('meta images come from image.reset.club at their real size, never drop.reset.club', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('../functions/_middleware.js', import.meta.url), 'utf8');
    expect(src).not.toMatch(/https:\/\/drop\.reset\.club\/(v5\/og\/|og-image)/);
    expect(src).toContain('ogImageUrl = `https://image.reset.club/og/drop/${encodeURIComponent(feature)}?fmt=png`;');
    expect(src).toContain("ogImageUrl = 'https://image.reset.club/og/home?fmt=png';");
    expect(src).toContain('<meta property="og:image:width" content="1080">');
    expect(src).toContain('<meta property="og:image:height" content="1350">');
  });
});
