import { renderBillboardSvg } from '/Users/dougjaeger/reset-image/src/cards/render';
import type { CardData } from '/Users/dougjaeger/reset-image/src/cards/types';
import { writeFileSync, readFileSync } from 'node:fs';
const SHIFT = +(process.env.SHIFT || 0);
const SAND = '#fcf6e9', W = 1080, PAD = 56, RULE_Y = 1218;
const photo = (f: string) => 'data:image/jpeg;base64,' + readFileSync('/Users/dougjaeger/.claude/jobs/fdaa83d4/tmp/photos/' + f).toString('base64');
const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'], DOW3 = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const day = (iso: string) => new Date(iso + 'T12:00:00Z');
// Club mark, the site's LOGO_SVG, cream, top right at the wordmark's height.
const MARK = `<svg x="${W - PAD - 64}" y="52" width="64" height="64" viewBox="0 0 1036 1039" fill="${SAND}"><g transform="matrix(1.095135,0,0,1.097945,-1333.455038,-262.316488)"><g transform="matrix(1.615813,0,0,1.611679,-751.897301,-146.705066)"><g transform="matrix(4.262421,-0,0,4.262421,1457.921775,511.1485)"><path d="M0,6.017L7.244,6.017L7.244,-2.963C-0.173,-5.281 -5.272,-12.134 -5.272,-19.923C-5.272,-29.758 2.736,-37.765 12.57,-37.765C22.405,-37.765 30.412,-29.758 30.412,-19.923C30.412,-12.125 25.313,-5.272 17.906,-2.954L17.906,6.017L25.141,6.017C27.458,-1.4 34.311,-6.499 42.11,-6.499C51.944,-6.499 59.952,1.509 59.952,11.352C59.952,21.187 51.944,29.194 42.11,29.194C34.32,29.194 27.467,24.095 25.15,16.679L17.906,16.679L17.906,33.112L30.421,33.103L30.421,43.773L-5.054,43.782L-5.054,33.112L7.244,33.112L7.244,16.679L0,16.679C-2.318,24.095 -9.171,29.194 -16.969,29.194C-26.804,29.194 -34.811,21.187 -34.811,11.352C-34.811,1.509 -26.804,-6.499 -16.969,-6.499C-9.171,-6.499 -2.318,-1.4 0,6.017"/></g><g transform="matrix(4.262421,-0,0,4.262421,1511.482079,776.71907)"><path d="M0,-114.422C31.548,-114.422 57.216,-88.763 57.216,-57.215C57.216,-25.667 31.548,0.001 0,0.001C-31.548,0.001 -57.207,-25.667 -57.207,-57.215C-57.207,-88.763 -31.548,-114.422 0,-114.422M-67.877,-57.215C-67.877,-19.786 -37.429,10.671 0,10.671C37.429,10.671 67.887,-19.786 67.887,-57.215C67.887,-94.644 37.429,-125.093 0,-125.093C-37.429,-125.093 -67.877,-94.644 -67.877,-57.215"/></g></g></g></svg>`;
function base(house: string, file: string, arrive: string, out: string, bottomText: string): string {
  const card: CardData = { class: 'stay', wordmark: 'RESET CLUB', hero: { mode: 'image', url: photo(file) }, kicker: 'KERHONKSON, NY', headline: house, textColor: SAND, urlDisplay: bottomText, urlDest: '/', updatedAt: '' };
  let svg = renderBillboardSvg(card);
  // Prototype of a smaller HEADLINE_BOTTOM: the kicker and the headline move down by SHIFT together.
  svg = svg.replace(/(<text [^>]*>KERHONKSON, NY<\/text>\n?<text [^>]*letter-spacing="-2.2"[^>]*>[\s\S]*?<\/text>)/, '<g transform="translate(0,' + SHIFT + ')">$1</g>');
  return svg.slice(0, svg.lastIndexOf('</svg>'));
}
function rangeText(a: string, b: string) {
  const A = day(a), B = day(b);
  return `${DOW3[A.getUTCDay()]} ${MON[A.getUTCMonth()]} ${A.getUTCDate()} TO ${DOW3[B.getUTCDay()]} ${MON[B.getUTCMonth()]} ${B.getUTCDate()}`;
}
// B: the bottom row as the calendar. Month, then each day with its weekday letter; one continuous band, circles on the ends.
function strip(a: string, b: string): string {
  const A = day(a), B = day(b), n = Math.round((+B - +A) / 86400000);
  const m1 = MON[A.getUTCMonth()], m2 = MON[B.getUTCMonth()], label = m1 === m2 ? m1 : m1 + '·' + m2;
  const LINK_ROW_Y = 1276, r = 28, cy = LINK_ROW_Y - 16, lettersY = cy - r - 16; // month on the link-row baseline
  const labelW = label.length * 30 + 24;
  const x0 = PAD + labelW + 24, avail = W - PAD - 56 - 40 - x0; // the template arrow keeps its place at the end
  const step = Math.min(84, (avail - 2 * r) / n);
  const cx = (i: number) => x0 + r + i * step;
  let s = `<text x="${PAD}" y="${LINK_ROW_Y}" font-family="Inter, system-ui, sans-serif" font-size="44" font-weight="700" letter-spacing="2.2" fill="${SAND}">${label}</text>`;
  s += `<rect x="${cx(0)}" y="${cy - r}" width="${cx(n) - cx(0)}" height="${2 * r}" fill="${SAND}" fill-opacity="0.28"/>`;
  for (let i = 0; i <= n; i++) {
    const d = new Date(+A + i * 86400000), end = i === 0 || i === n;
    s += `<text x="${cx(i)}" y="${lettersY}" text-anchor="middle" font-family="Inter, system-ui, sans-serif" font-size="24" font-weight="700" letter-spacing="1" fill="${SAND}">${DOW[d.getUTCDay()]}</text>`;
    if (end) s += `<circle cx="${cx(i)}" cy="${cy}" r="${r}" fill="${SAND}"/>`;
    s += `<text x="${cx(i)}" y="${cy + 10}" text-anchor="middle" font-family="Inter, system-ui, sans-serif" font-size="28" font-weight="700" fill="${end ? '#000000' : SAND}">${d.getUTCDate()}</text>`;
  }
  return s;
}
const stays = [
  ['Cook House', 'cook.jpg', '2026-11-27', '2026-11-30'],
  ['Hill Studio', 'hill.jpg', '2026-11-01', '2026-11-04'],
  ['Zink Cabin', 'zink.jpg', '2026-12-14', '2026-12-16'],
  ['Barn Studio', 'barn.jpg', '2027-01-15', '2027-01-22'],
  ['Cook House', 'cook.jpg', '2026-11-29', '2026-12-02'],
];
stays.forEach(([h, f, a, b], i) => {
  const svgA = base(h, f, a, b, rangeText(a, b)) + MARK + '</svg>';
  writeFileSync(`A${i + 1}.svg`, svgA);
  // B: drop the template's bottom text and arrow, draw the calendar row instead.
  let svgB = base(h, f, a, b, '@@ROW@@');
  svgB = svgB.replace(/<line [^>]*\/>\n?/, '').replace(/<text[^>]*>@@ROW@@<\/text>\n?/, '');
  writeFileSync(`B${i + 1}.svg`, svgB + strip(a, b) + MARK + '</svg>');
});
