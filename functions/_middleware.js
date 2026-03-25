// Middleware to inject dynamic OG meta tags based on URL parameters

// Dashboard password - set via environment variable DASH_PASSWORD
const DASH_REALM = 'Reset Home Dashboard';

export async function onRequest(context) {
  const url = new URL(context.request.url);

  // Password protect /dash routes
  if (url.pathname.startsWith('/dash')) {
    const authResult = checkBasicAuth(context.request, context.env);
    if (!authResult.authorized) {
      return new Response('Unauthorized', {
        status: 401,
        headers: {
          'WWW-Authenticate': `Basic realm="${DASH_REALM}", charset="UTF-8"`,
        },
      });
    }
  }

  // Debug endpoint
  if (url.pathname === '/debug-path') {
    return new Response(JSON.stringify({ pathname: url.pathname, href: url.href }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // OG image for v5 — handled entirely in middleware
  if (url.pathname === '/v5/og' || url.pathname === '/ogv5') {
    try {
      return handleV5OgImage(url);
    } catch (e) {
      return new Response('OG Error: ' + e.message, { status: 500 });
    }
  }

  // Sitemap.xml — generated dynamically
  if (url.pathname === '/sitemap.xml' || url.pathname === '/v5/sitemap.xml') {
    return handleSitemap();
  }

  // Skip for og endpoints and static assets (including robots.txt)
  if (url.pathname === '/og-image' ||
      url.pathname === '/robots.txt' ||
      url.pathname.match(/\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|txt)$/)) {
    return context.next();
  }

  // Proxy health dashboard from worker
  if (url.pathname === '/health') {
    const workerUrl = `https://reset-inventory-sync.doug-6f9.workers.dev/health${url.search}`;
    const response = await fetch(workerUrl, {
      method: context.request.method,
      headers: context.request.headers,
    });
    return new Response(response.body, {
      status: response.status,
      headers: response.headers,
    });
  }

  // Get the response
  const response = await context.next();

  // Only modify HTML responses
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('text/html')) {
    return response;
  }

  // Get filter parameters
  const params = url.searchParams;
  const timing = params.get('timing') || 'all';
  const nights = params.get('nights') || '3';
  const stayType = params.get('stayType') || 'all';
  const property = params.get('property') || 'all';
  const vibe = params.get('vibe') || 'all';
  const occasion = params.get('occasion') || 'all';
  const bg = params.get('bg') || 'FF5500';
  const bg2 = params.get('bg2') || '1a1a1a';

  // Build filter summary for title/description
  const summaryParts = [];

  if (nights !== 'all') summaryParts.push(`${nights} Night`);
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

  if (occasion !== 'all') {
    summaryParts.push(`for ${occasion}`);
  }

  const filterSummary = summaryParts.join(' ') || 'All Available Drops';
  let title, description;
  const feature = params.get('feature');
  if (url.pathname.startsWith('/v5') && feature === 'full-moon') {
    title = 'Full Moon Drops | The Reset Club';
    description = 'Stays that land on or near the full moon. Dark skies, bright light, no screens.';
  } else if (url.pathname.startsWith('/v5') && feature === 'star-flood') {
    title = 'Star Flood | The Reset Club';
    description = 'New moon weekends with zero light pollution. The Milky Way visible from every property.';
  } else if (url.pathname.startsWith('/v5') && property !== 'all') {
    const propNames = { BARN: 'Barn Studio', COOK: 'Cook House', HILL4: 'Hill Studio', ZINK: 'Zink Cabin' };
    // Named combos
    const sorted = property.split(',').sort().join(',');
    const comboNames = {
      'HILL4,ZINK': 'Mountain Views',
      'COOK,HILL4,BARN': 'Fire Pit',
      'COOK,ZINK': 'Hot Tub',
    };
    const comboName = comboNames[sorted];
    if (comboName) {
      title = `${comboName} Drops | The Reset Club`;
      description = `${comboName} properties — available stays in the Catskills.`;
    } else {
      const props = property.split(',').map(c => propNames[c] || c);
      title = `${props.join(' + ')} Drops | The Reset Club`;
      description = `Available stays at ${props.join(' and ')} in the Catskills.`;
    }
  } else if (url.pathname.startsWith('/v5')) {
    title = 'Stay Drops | The Reset Club';
    description = '3-night stays in the Catskills. Pick what matters to you.';
  } else {
    title = `Reset Club Drops - ${filterSummary}`;
    description = `Book ${filterSummary.toLowerCase()} in the Catskills. Limited availability drops at Reset Club properties.`;
  }

  // Build OG image URL with same parameters
  const ogImageParams = new URLSearchParams();
  if (timing !== 'all') ogImageParams.set('timing', timing);
  if (nights !== 'all') ogImageParams.set('nights', nights);
  if (stayType !== 'all') ogImageParams.set('stayType', stayType);
  if (property !== 'all') ogImageParams.set('property', property);
  if (vibe !== 'all') ogImageParams.set('vibe', vibe);
  if (occasion !== 'all') ogImageParams.set('occasion', occasion);
  ogImageParams.set('bg', bg);
  ogImageParams.set('bg2', bg2);

  // OG image — static PNGs for v5 seasons/events, SVG for legacy
  let ogImageUrl;
  const pageUrl = url.href;
  if (url.pathname.startsWith('/v5')) {
    const feature = params.get('feature');
    if (feature === 'full-moon' || feature === 'star-flood') {
      ogImageUrl = `https://drop.reset.club/v5/og/${feature}.png`;
    } else if (property !== 'all') {
      // Check for named combo image first
      const sorted = property.split(',').sort().join(',');
      const comboSlugs = { 'HILL4,ZINK': 'mountain-views' };
      const comboSlug = comboSlugs[sorted];
      if (comboSlug) {
        ogImageUrl = `https://drop.reset.club/v5/og/${comboSlug}.png`;
      } else {
        const firstProp = property.split(',')[0].toLowerCase();
        ogImageUrl = `https://drop.reset.club/v5/og/${firstProp}.png`;
      }
    } else {
      ogImageUrl = `https://drop.reset.club/v5/og/default.png`;
    }
  } else {
    ogImageUrl = `https://drop.reset.club/og-image.png`;
  }

  // Canonical URL — use reset.club as the canonical domain
  const canonicalUrl = `https://reset.club${url.pathname}${url.search}`;

  // JSON-LD structured data
  const orgSchema = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Reset Club',
    url: 'https://reset.club',
    logo: 'https://drop.reset.club/v5/og/default.png',
    sameAs: [
      'https://instagram.com/thereset.club',
      'https://instagram.com/reset.catskills'
    ]
  };

  let structuredData = [orgSchema];

  // Add LodgingBusiness on homepage/drops pages
  if (url.pathname.startsWith('/v5')) {
    structuredData.push({
      '@context': 'https://schema.org',
      '@type': 'LodgingBusiness',
      name: 'Reset Club',
      description: 'Four design-led properties in the Catskills. Two hours from the city.',
      url: 'https://reset.club',
      address: {
        '@type': 'PostalAddress',
        addressLocality: 'Kerhonkson',
        addressRegion: 'NY',
        postalCode: '12446',
        addressCountry: 'US'
      },
      priceRange: '$$$$',
      aggregateRating: {
        '@type': 'AggregateRating',
        ratingValue: '5',
        reviewCount: '620',
        bestRating: '5'
      }
    });
  }

  const jsonLd = structuredData.map(s =>
    `<script type="application/ld+json">${JSON.stringify(s)}</script>`
  ).join('\n    ');

  // All meta tags to inject
  const ogTags = `
    <!-- SEO Meta -->
    <meta name="description" content="${escapeHtml(description)}">
    <link rel="canonical" href="${escapeHtml(canonicalUrl)}">
    <link rel="icon" href="https://drop.reset.club/v5/og/default.png" type="image/png">

    <!-- Open Graph -->
    <meta property="og:type" content="website">
    <meta property="og:url" content="${escapeHtml(canonicalUrl)}">
    <meta property="og:title" content="${escapeHtml(title)}">
    <meta property="og:description" content="${escapeHtml(description)}">
    <meta property="og:image" content="${escapeHtml(ogImageUrl)}">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">

    <!-- Twitter Card -->
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${escapeHtml(title)}">
    <meta name="twitter:description" content="${escapeHtml(description)}">
    <meta name="twitter:image" content="${escapeHtml(ogImageUrl)}">

    <!-- Structured Data -->
    ${jsonLd}
  `;

  // Get HTML and inject OG tags
  let html = await response.text();

  // Remove any existing meta tags to avoid duplicates
  html = html.replace(/<meta\s+property="og:[^"]*"[^>]*>/gi, '');
  html = html.replace(/<meta\s+name="twitter:[^"]*"[^>]*>/gi, '');
  html = html.replace(/<meta\s+name="description"[^>]*>/gi, '');
  html = html.replace(/<link\s+rel="canonical"[^>]*>/gi, '');
  html = html.replace(/<script\s+type="application\/ld\+json"[^>]*>[\s\S]*?<\/script>/gi, '');

  // Inject new OG tags before </head>
  html = html.replace('</head>', ogTags + '\n</head>');

  return new Response(html, {
    headers: response.headers,
  });
}

function handleSitemap() {
  const base = 'https://reset.club';
  const now = new Date().toISOString().split('T')[0];
  const urls = [
    { loc: '/', priority: '1.0', changefreq: 'daily' },
    { loc: '/?property=COOK', priority: '0.8', changefreq: 'daily' },
    { loc: '/?property=ZINK', priority: '0.8', changefreq: 'daily' },
    { loc: '/?property=HILL4', priority: '0.8', changefreq: 'daily' },
    { loc: '/?property=BARN', priority: '0.8', changefreq: 'daily' },
    { loc: '/?feature=full-moon', priority: '0.7', changefreq: 'weekly' },
    { loc: '/?feature=star-flood', priority: '0.7', changefreq: 'weekly' },
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url>
    <loc>${base}${u.loc}</loc>
    <lastmod>${now}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`).join('\n')}
</urlset>`;

  return new Response(xml, {
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      'cache-control': 'public, max-age=3600',
    },
  });
}

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Get current season slug based on date
function getCurrentSeasonSlug() {
  const now = new Date();
  const m = now.getMonth() + 1;
  const d = now.getDate();
  const windows = [
    { slug: 'deep-winter', sm: 1, sd: 1, em: 1, ed: 14 },
    { slug: 'long-nights', sm: 1, sd: 15, em: 1, ed: 28 },
    { slug: 'frost', sm: 2, sd: 1, em: 2, ed: 14 },
    { slug: 'thaw', sm: 2, sd: 15, em: 2, ed: 28 },
    { slug: 'false-spring', sm: 3, sd: 1, em: 3, ed: 14 },
    { slug: 'early-spring', sm: 3, sd: 15, em: 3, ed: 28 },
    { slug: 'first-green', sm: 4, sd: 1, em: 4, ed: 14 },
    { slug: 'bloom', sm: 4, sd: 15, em: 4, ed: 28 },
    { slug: 'late-spring', sm: 5, sd: 1, em: 5, ed: 14 },
    { slug: 'warm-days', sm: 5, sd: 15, em: 5, ed: 28 },
    { slug: 'early-summer', sm: 6, sd: 1, em: 6, ed: 14 },
    { slug: 'solstice', sm: 6, sd: 15, em: 6, ed: 28 },
    { slug: 'high-summer', sm: 7, sd: 1, em: 7, ed: 14 },
    { slug: 'dog-days', sm: 7, sd: 15, em: 7, ed: 28 },
    { slug: 'late-summer', sm: 8, sd: 1, em: 8, ed: 14 },
    { slug: 'golden-hour', sm: 8, sd: 15, em: 8, ed: 28 },
    { slug: 'early-fall', sm: 9, sd: 1, em: 9, ed: 14 },
    { slug: 'harvest', sm: 9, sd: 15, em: 9, ed: 28 },
    { slug: 'peak-foliage', sm: 10, sd: 1, em: 10, ed: 14 },
    { slug: 'late-autumn', sm: 10, sd: 15, em: 10, ed: 28 },
    { slug: 'first-frost', sm: 11, sd: 1, em: 11, ed: 14 },
    { slug: 'bare-branches', sm: 11, sd: 15, em: 11, ed: 28 },
    { slug: 'early-winter', sm: 12, sd: 1, em: 12, ed: 14 },
    { slug: 'holidays', sm: 12, sd: 15, em: 12, ed: 28 },
  ];
  for (const w of windows) {
    if (m === w.sm && d >= w.sd && d <= w.ed) return w.slug;
  }
  return 'early-spring';
}

// Check Basic Auth for dashboard
function checkBasicAuth(request, env) {
  const authHeader = request.headers.get('Authorization');

  if (!authHeader || !authHeader.startsWith('Basic ')) {
    return { authorized: false };
  }

  try {
    const base64 = authHeader.slice(6);
    const decoded = atob(base64);
    const [username, password] = decoded.split(':');

    // Password from environment variable (set in Cloudflare Pages settings)
    const expectedPassword = env.DASH_PASSWORD || 'reset2026';

    // Username can be anything, we only check password
    if (password === expectedPassword) {
      return { authorized: true, username };
    }
  } catch (e) {
    // Invalid base64 or other error
  }

  return { authorized: false };
}

// Dynamic OG image — season-themed SVG
function handleV5OgImage(url) {
  const OG_WINDOWS = {
    'deep-winter': { name: 'Deep Winter', dates: 'Jan 1–14', theme: 'haze' },
    'long-nights': { name: 'Long Nights', dates: 'Jan 15–28', theme: 'wave' },
    'frost': { name: 'Frost', dates: 'Feb 1–14', theme: 'wave' },
    'thaw': { name: 'Thaw', dates: 'Feb 15–28', theme: 'haze' },
    'false-spring': { name: 'False Spring', dates: 'Mar 1–14', theme: 'dirt' },
    'early-spring': { name: 'Early Spring', dates: 'Mar 15–28', theme: 'moss' },
    'first-green': { name: 'First Green', dates: 'Apr 1–14', theme: 'mist' },
    'bloom': { name: 'Bloom', dates: 'Apr 15–28', theme: 'tree' },
    'late-spring': { name: 'Late Spring', dates: 'May 1–14', theme: 'mint' },
    'warm-days': { name: 'Warm Days', dates: 'May 15–28', theme: 'moon' },
    'early-summer': { name: 'Early Summer', dates: 'Jun 1–14', theme: 'sand' },
    'solstice': { name: 'Solstice', dates: 'Jun 15–28', theme: 'sand' },
    'high-summer': { name: 'High Summer', dates: 'Jul 1–14', theme: 'pine' },
    'dog-days': { name: 'Dog Days', dates: 'Jul 15–28', theme: 'melo' },
    'late-summer': { name: 'Late Summer', dates: 'Aug 1–14', theme: 'pine' },
    'golden-hour': { name: 'Golden Hour', dates: 'Aug 15–28', theme: 'melo' },
    'early-fall': { name: 'Early Fall', dates: 'Sep 1–14', theme: 'toma' },
    'harvest': { name: 'Harvest', dates: 'Sep 15–28', theme: 'melo' },
    'peak-foliage': { name: 'Peak Foliage', dates: 'Oct 1–14', theme: 'melo' },
    'late-autumn': { name: 'Late Autumn', dates: 'Oct 15–28', theme: 'dirt' },
    'first-frost': { name: 'First Frost', dates: 'Nov 1–14', theme: 'sand' },
    'bare-branches': { name: 'Bare Branches', dates: 'Nov 15–28', theme: 'soak' },
    'early-winter': { name: 'Early Winter', dates: 'Dec 1–14', theme: 'haze' },
    'holidays': { name: 'Holidays', dates: 'Dec 15–28', theme: 'wave' },
    'new-years': { name: "New Year's", dates: 'Dec 29–31', theme: 'ink' },
  };
  const OG_THEMES = {
    ink:  { bg: '#000000', text: '#fcf6e9' },
    sand: { bg: '#fcf6e9', text: '#000000' },
    toma: { bg: '#ff551e', text: '#fcf6e9' },
    melo: { bg: '#ffc974', text: '#000000' },
    pine: { bg: '#fcddab', text: '#000000' },
    dirt: { bg: '#9c8336', text: '#fcf6e9' },
    tree: { bg: '#019740', text: '#fcf6e9' },
    moss: { bg: '#9c9b34', text: '#fcf6e9' },
    moon: { bg: '#e9f782', text: '#000000' },
    mint: { bg: '#bbf5d0', text: '#000000' },
    mist: { bg: '#d3f7e0', text: '#000000' },
    wave: { bg: '#3f65f6', text: '#fcf6e9' },
    haze: { bg: '#e6edfd', text: '#000000' },
    soak: { bg: '#d2e6f1', text: '#000000' },
  };

  const seasonSlug = url.searchParams.get('season') || '';
  const property = url.searchParams.get('property') || '';
  const season = OG_WINDOWS[seasonSlug];
  const theme = season ? OG_THEMES[season.theme] || OG_THEMES.sand : OG_THEMES.sand;

  const title = season ? season.name : 'Stay Drops';
  const subtitle = season ? season.dates : '3-night stays in the Catskills';
  const propertyLine = property ? property.split(',').map(c => {
    const names = { COOK: 'Cook House', ZINK: 'Zink Cabin', HILL4: 'Hill Studio', BARN: 'Barn Studio' };
    return names[c] || c;
  }).join(' · ') : '';

  const titleLen = title.length;
  const fontSize = Math.min(200, Math.floor(1100 / (titleLen * 0.55)));

  const svg = `<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
  <rect width="1200" height="630" fill="${theme.bg}"/>
  <text x="48" y="${fontSize + 40}" font-family="Arial, Helvetica, sans-serif" font-size="${fontSize}" font-weight="bold" fill="${theme.text}" letter-spacing="-3">${escapeHtml(title)}</text>
  <text x="48" y="${fontSize + 100}" font-family="Arial, Helvetica, sans-serif" font-size="36" font-weight="bold" fill="${theme.text}" opacity="0.7">${escapeHtml(subtitle)}</text>
  ${propertyLine ? `<text x="48" y="${fontSize + 150}" font-family="Arial, Helvetica, sans-serif" font-size="32" font-weight="500" fill="${theme.text}" opacity="0.5">${escapeHtml(propertyLine)}</text>` : ''}
  <text x="48" y="590" font-family="Arial, Helvetica, sans-serif" font-size="28" font-weight="bold" fill="${theme.text}" opacity="0.4">RESET · DROPS</text>
  <text x="1152" y="590" font-family="Arial, Helvetica, sans-serif" font-size="28" font-weight="bold" fill="${theme.text}" opacity="0.4" text-anchor="end">drop.reset.club</text>
</svg>`;

  return new Response(svg, {
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
