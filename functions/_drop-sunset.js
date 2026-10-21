// drop.reset.club is sunset (Doug 10-21): a visitor's page there 301s to the same page on reset.club.
// The reset.club proxy still builds every page from drop.reset.club and marks those requests
// X-Reset-Proxy: 1, so they pass. (Cloudflare's CF-Worker stamp does not reach this function on the
// proxy's same-zone fetch: test mode showed the proxy redirected and served the old Squarespace
// origin, 10-21.) Anyone sending the mark only sees drop.reset.club as before. reset.club pages still load scripts, styles and
// images from drop.reset.club, so files, APIs and image endpoints pass too.
//
// mode: 'on' redirects; 'test' redirects only a URL carrying __sunset=1 (to check both paths live
// before switching on); 'off' never.
export const DROP_SUNSET_MODE = 'on';

const KEEP_PREFIXES = ['/api/', '/v5/api/', '/n/api/', '/.well-known/'];
const KEEP_PATHS = ['/v5/og', '/ogv5', '/og-image', '/health', '/debug-path'];

export function sunsetTarget(url, method, headers, mode = DROP_SUNSET_MODE) {
  if (mode === 'off' || url.hostname !== 'drop.reset.club') return null;
  if (method !== 'GET' && method !== 'HEAD') return null;
  if (headers.get('x-reset-proxy') === '1') return null;
  const path = url.pathname;
  if (/\.[a-z0-9]+$/i.test(path)) return null; // a file: script, style, image, robots, sitemap
  if (KEEP_PATHS.includes(path) || KEEP_PREFIXES.some((p) => path.startsWith(p))) return null;
  let query = url.search; // as sent, never re-encoded
  if (mode === 'test') {
    const search = new URLSearchParams(url.search);
    if (search.get('__sunset') !== '1') return null;
    search.delete('__sunset');
    query = search.toString() ? '?' + search.toString() : '';
  }
  const page = path === '/v5' || path === '/v5/' ? '/' : path.startsWith('/v5/') ? path.slice(3) : path;
  return 'https://reset.club' + page + query;
}
