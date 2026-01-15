// Dynamic OG Image Generator for Social Sharing
// Returns SVG for now - social platforms that support it will work
// For full PNG support, consider using an image service like Cloudinary

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const params = url.searchParams;

  // Get filter parameters
  const timing = params.get('timing') || 'all';
  const nights = params.get('nights') || '3';
  const stayType = params.get('stayType') || 'all';
  const property = params.get('property') || 'all';
  const vibe = params.get('vibe') || 'all';
  const occasion = params.get('occasion') || 'all';

  // Get colors for gradient
  const bg = params.get('bg') || 'FF5500';
  const bg2 = params.get('bg2') || '1a1a1a';

  // Build filter summary text
  const summaryParts = [];

  if (nights !== 'all') {
    summaryParts.push(`${nights} Night`);
  }

  if (stayType !== 'all') {
    summaryParts.push(stayType + 's');
  } else {
    summaryParts.push('Stays');
  }

  const timingLabels = {
    'last-minute': 'Last Minute',
    'this-week': 'This Week',
    'next-week': 'Next Week',
    'this-month': 'This Month'
  };
  if (timing !== 'all' && timingLabels[timing]) {
    summaryParts.unshift(timingLabels[timing]);
  }

  if (property !== 'all') {
    const propertyNames = {
      'BARN': 'Barn Studio',
      'COOK': 'Cook House',
      'HILL': 'Hill Studio',
      'ZINK': 'Zink Cabin'
    };
    summaryParts.push(`at ${propertyNames[property] || property}`);
  }

  if (vibe !== 'all') {
    summaryParts.push(`· ${vibe}`);
  }

  if (occasion !== 'all') {
    summaryParts.push(`for ${occasion}`);
  }

  const filterSummary = summaryParts.join(' ') || 'All Available Drops';

  // Normalize colors
  const color1 = bg.startsWith('#') ? bg : '#' + bg;
  const color2 = bg2.startsWith('#') ? bg2 : '#' + bg2;

  function getLuminance(hex) {
    let h = hex.replace('#', '');
    if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
    const r = parseInt(h.substring(0,2), 16) / 255;
    const g = parseInt(h.substring(2,4), 16) / 255;
    const b = parseInt(h.substring(4,6), 16) / 255;
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  const avgLuminance = (getLuminance(color1) + getLuminance(color2)) / 2;
  const textColor = avgLuminance < 0.5 ? '#FCF6E9' : '#000000';

  // Generate SVG image (1200x630 is standard OG size)
  const svg = `<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" style="stop-color:${color1}"/>
      <stop offset="100%" style="stop-color:${color2}"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <text x="600" y="260" font-family="Arial, Helvetica, sans-serif" font-size="96" font-weight="bold" fill="${textColor}" text-anchor="middle" letter-spacing="3">RESET CLUB DROPS</text>
  <text x="600" y="380" font-family="Arial, Helvetica, sans-serif" font-size="42" fill="${textColor}" text-anchor="middle" opacity="0.9">${escapeXml(filterSummary)}</text>
  <text x="600" y="560" font-family="Arial, Helvetica, sans-serif" font-size="28" fill="${textColor}" text-anchor="middle" opacity="0.6">drop.reset.club</text>
</svg>`;

  return new Response(svg, {
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'public, max-age=86400',
    },
  });
}

function escapeXml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
