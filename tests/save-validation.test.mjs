import { describe, it, expect } from 'vitest';
import { createSave } from '../functions/api/save.js';

describe('createSave validation', () => {
  it('rejects prototype-chain property_code (__proto__) before touching the network', async () => {
    const res = await createSave({}, {
      contact: '212 203 1247', property_code: '__proto__', arrival: '2026-08-14', source: 'save',
    });
    expect(res).toEqual({ status: 400, body: { ok: false, error: 'invalid_drop' } });
  });

  it('rejects prototype-chain property_code (toString) before touching the network', async () => {
    const res = await createSave({}, {
      contact: '212 203 1247', property_code: 'toString', arrival: '2026-08-14', source: 'save',
    });
    expect(res).toEqual({ status: 400, body: { ok: false, error: 'invalid_drop' } });
  });

  it('rejects a malformed arrival date for a valid property code', async () => {
    const res = await createSave({}, {
      contact: '212 203 1247', property_code: 'COOK', arrival: '2026-8-1', source: 'save',
    });
    expect(res).toEqual({ status: 400, body: { ok: false, error: 'invalid_drop' } });
  });
});
