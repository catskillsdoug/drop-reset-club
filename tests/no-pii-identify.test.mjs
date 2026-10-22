import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// PostHog events carry no personal data: a join must never attach the email to a PostHog person.
describe('no email reaches PostHog on join', () => {
  for (const file of ['v5/index.html', 'functions/_posthog-snippet.js', 'v5/join.js']) {
    it(`${file} never calls posthog.identify`, () => {
      expect(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')).not.toMatch(/posthog\.identify\(/);
    });
  }
  it('the join card still counts sign-ups', () => {
    expect(readFileSync(new URL('../v5/index.html', import.meta.url), 'utf8')).toContain('posthog.capture("email_signup", { source: "join_card" });');
  });
});
