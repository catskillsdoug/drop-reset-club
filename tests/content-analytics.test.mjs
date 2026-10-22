import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { POSTHOG_CONTENT_SNIPPET } from '../functions/_posthog-snippet.js';

const home = readFileSync(new URL('../v5/index.html', import.meta.url), 'utf8');
const middleware = readFileSync(new URL('../functions/_middleware.js', import.meta.url), 'utf8');

const KEY = /posthog\.init\("(phc_[A-Za-z0-9]+)"/;
const HOST = /api_host:\s*"([^"]+)"/;

describe('content pages PostHog snippet', () => {
  it('uses the same project key and api_host as the homepage', () => {
    expect(POSTHOG_CONTENT_SNIPPET.match(KEY)[1]).toBe(home.match(KEY)[1]);
    expect(POSTHOG_CONTENT_SNIPPET.match(HOST)[1]).toBe(home.match(HOST)[1]);
  });

  it('wires consent the same way as the homepage', () => {
    for (const s of [home, POSTHOG_CONTENT_SNIPPET]) {
      expect(s).toContain('opt_out_capturing_by_default: false');
      expect(s).toContain('granted ? posthog.opt_in_capturing() : posthog.opt_out_capturing()');
      expect(s).toContain('window.resetAnalyticsConsent = function (granted)');
    }
  });

  it('is held until consent (text/plain data-consent) in the shell, exactly once, before consent.js', () => {
    expect(middleware).toContain("import { POSTHOG_CONTENT_SNIPPET } from './_posthog-snippet.js'");
    const tag = '<script type="text/plain" data-consent="analytics">${POSTHOG_CONTENT_SNIPPET}</script>';
    expect(middleware.split(tag).length - 1).toBe(1);
    expect(middleware.indexOf(tag)).toBeLessThan(middleware.indexOf('<script src="/v5/consent.js?v=2"></script>\n</head>\n<body>\n  <div id="join-wrapper"'));
  });

  it('adds no custom content_page_viewed event', () => {
    expect(POSTHOG_CONTENT_SNIPPET).not.toContain('content_page_viewed');
  });
});
