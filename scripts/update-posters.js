/**
 * Update Airtable recommendations with TMDB poster images
 *
 * Usage: AIRTABLE_TOKEN=pat... TMDB_API_KEY=xxx node update-posters.js
 *
 * Get a free TMDB API key at: https://www.themoviedb.org/settings/api
 */

const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
const AIRTABLE_BASE = 'appV2RmGRFmsRIUzP';
const AIRTABLE_TABLE = 'tblEr6lvULn5bik3c';
const TMDB_API_KEY = process.env.TMDB_API_KEY;
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w500';

if (!AIRTABLE_TOKEN) {
  console.error('Error: AIRTABLE_TOKEN environment variable required');
  process.exit(1);
}

if (!TMDB_API_KEY) {
  console.error('Error: TMDB_API_KEY environment variable required');
  console.error('Get a free API key at: https://www.themoviedb.org/settings/api');
  process.exit(1);
}

async function searchTMDB(title, year) {
  const url = `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(title)}&year=${year}`;
  const response = await fetch(url);
  const data = await response.json();

  if (data.results && data.results.length > 0) {
    const movie = data.results[0];
    if (movie.poster_path) {
      return `${TMDB_IMAGE_BASE}${movie.poster_path}`;
    }
  }
  return null;
}

async function getAirtableRecords() {
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE}/${AIRTABLE_TABLE}`;
  const response = await fetch(url, {
    headers: { 'Authorization': `Bearer ${AIRTABLE_TOKEN}` }
  });
  const data = await response.json();
  return data.records.filter(r => r.fields.Category?.includes('Watch'));
}

async function updateAirtableRecord(recordId, imageUrl) {
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE}/${AIRTABLE_TABLE}/${recordId}`;
  const response = await fetch(url, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${AIRTABLE_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      fields: { Cover_Image_URL: imageUrl }
    })
  });
  return response.ok;
}

async function main() {
  console.log('Fetching Airtable records...');
  const records = await getAirtableRecords();
  console.log(`Found ${records.length} Watch records`);

  // Build title -> poster URL cache
  const posterCache = new Map();
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const record of records) {
    const title = record.fields.Title;
    const year = record.fields.Year;

    // Skip if already has image
    if (record.fields.Cover_Image_URL) {
      console.log(`⏭️  ${title} - already has image`);
      skipped++;
      continue;
    }

    // Check cache first
    const cacheKey = `${title}_${year}`;
    let posterUrl = posterCache.get(cacheKey);

    if (!posterUrl) {
      console.log(`🔍 Searching TMDB for: ${title} (${year})`);
      posterUrl = await searchTMDB(title, year);
      if (posterUrl) {
        posterCache.set(cacheKey, posterUrl);
      }
      // Rate limit
      await new Promise(r => setTimeout(r, 250));
    }

    if (posterUrl) {
      console.log(`📸 Updating ${title} with poster`);
      const success = await updateAirtableRecord(record.id, posterUrl);
      if (success) {
        updated++;
      } else {
        console.error(`❌ Failed to update ${title}`);
        failed++;
      }
    } else {
      console.log(`⚠️  No poster found for: ${title}`);
      failed++;
    }
  }

  console.log('\n--- Summary ---');
  console.log(`Updated: ${updated}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Failed: ${failed}`);
}

main().catch(console.error);
