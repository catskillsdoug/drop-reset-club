export function normalizeContact(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const s = raw.trim();
  if (s.includes('@')) {
    const email = s.toLowerCase();
    // pragmatic check: something@something.tld
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return null;
    return { kind: 'email', value: email };
  }
  const digits = s.replace(/[^\d]/g, '');
  if (s.startsWith('+') && digits.length >= 11 && digits.length <= 15) {
    return { kind: 'phone', value: '+' + digits };
  }
  if (digits.length === 10) return { kind: 'phone', value: '+1' + digits };
  if (digits.length === 11 && digits.startsWith('1')) return { kind: 'phone', value: '+' + digits };
  return null;
}

const B62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
export function makeToken() {
  const buf = new Uint8Array(12);
  crypto.getRandomValues(buf);
  let out = '';
  for (const b of buf) out += B62[b % 62];
  return out;
}
