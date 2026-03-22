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

  // Skip for og-image endpoint and static assets
  if (url.pathname === '/og-image' ||
      url.pathname.match(/\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2)$/)) {
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
  const title = `Reset Club Drops - ${filterSummary}`;
  const description = `Book ${filterSummary.toLowerCase()} in the Catskills. Limited availability drops at Reset Club properties.`;

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

  // Use static PNG for social platforms (they don't support SVG)
  const ogImageUrl = `https://drop.reset.club/og-image.png`;
  const pageUrl = url.href;

  // OG meta tags to inject
  const ogTags = `
    <!-- Dynamic Open Graph Tags -->
    <meta property="og:type" content="website">
    <meta property="og:url" content="${escapeHtml(pageUrl)}">
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
  `;

  // Get HTML and inject OG tags
  let html = await response.text();

  // Remove any existing OG tags to avoid duplicates
  html = html.replace(/<meta\s+property="og:[^"]*"[^>]*>/gi, '');
  html = html.replace(/<meta\s+name="twitter:[^"]*"[^>]*>/gi, '');

  // Inject new OG tags before </head>
  html = html.replace('</head>', ogTags + '\n</head>');

  return new Response(html, {
    headers: response.headers,
  });
}

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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
