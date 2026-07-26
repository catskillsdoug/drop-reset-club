import { describe, it, expect } from 'vitest';
import { normalizeContact, makeToken } from '../functions/api/_lib.js';

describe('normalizeContact', () => {
  it('normalizes 10-digit US phones to E.164', () => {
    expect(normalizeContact('(212) 203-1247')).toEqual({ kind: 'phone', value: '+12122031247' });
  });
  it('accepts 11-digit with leading 1', () => {
    expect(normalizeContact('1 212 203 1247')).toEqual({ kind: 'phone', value: '+12122031247' });
  });
  it('passes through +E.164', () => {
    expect(normalizeContact('+12122031247')).toEqual({ kind: 'phone', value: '+12122031247' });
  });
  it('lowercases and trims email', () => {
    expect(normalizeContact('  Doug@Reset.Club ')).toEqual({ kind: 'email', value: 'doug@reset.club' });
  });
  it('rejects garbage', () => {
    expect(normalizeContact('hello')).toBeNull();
    expect(normalizeContact('123')).toBeNull();
    expect(normalizeContact('a@b')).toBeNull();
  });
});

describe('makeToken', () => {
  it('makes 12-char base62 tokens, unique-ish', () => {
    const t = makeToken();
    expect(t).toMatch(/^[0-9A-Za-z]{12}$/);
    expect(makeToken()).not.toEqual(t);
  });
});
