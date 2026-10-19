import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const files = { 'v5/index.html': readFileSync('v5/index.html', 'utf8'), 'functions/_middleware.js': readFileSync('functions/_middleware.js', 'utf8') };

const TRACKER_SRC = /googletagmanager\.com|connect\.facebook\.net|posthog\.com/;
const TRACKER_BODY = /gtag\(\s*'(js|config)'|fbq\(\s*'init'|posthog\.init\(|fbevents\.js|array\.js/;

// Every <script ...>...</script> in the file, with its attribute string and body.
function scripts(text) {
  return [...text.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)].map((m) => ({ attrs: m[1], body: m[2] }));
}

describe.each(Object.entries(files))('%s holds trackers until consent', (name, text) => {
  const trackers = scripts(text).filter((s) => TRACKER_SRC.test(s.attrs) || TRACKER_BODY.test(s.body));

  it('finds the trackers it is meant to hold', () => {
    expect(trackers.length).toBeGreaterThanOrEqual(name.endsWith('index.html') ? 3 : 2);
  });

  it('marks every tracker script held for analytics consent', () => {
    for (const s of trackers) {
      expect(s.attrs, s.body.slice(0, 60) || s.attrs).toMatch(/type="text\/plain"/);
      expect(s.attrs).toMatch(/data-consent="analytics"/);
    }
  });

  it('has no Pixel noscript image', () => {
    expect(text).not.toContain('facebook.com/tr?');
  });

  it('loads consent.js', () => {
    expect(text).toMatch(/<script src="\/v5\/consent\.js\?v=\d+"><\/script>/);
  });
});
