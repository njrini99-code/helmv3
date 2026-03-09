/**
 * fetch-background.js — Stock image sourcing from Pixabay
 *
 * Fetches high-quality golf/sports backgrounds for creative compositing.
 * Free API, 100 requests/min, no attribution required.
 *
 * Usage:
 *   node fetch-background.js "golf course fairway" [--out=bg.jpg] [--count=5]
 *
 * Setup:
 *   Set PIXABAY_API_KEY env variable (free at https://pixabay.com/api/docs/)
 *
 * Examples:
 *   node fetch-background.js "golf course green grass"
 *   node fetch-background.js "golf sunset landscape" --count=10
 *   node fetch-background.js "dark green texture abstract" --out=dark-bg.jpg
 */

import fetch from 'node-fetch';
import { writeFile, mkdir, readFile } from 'fs/promises';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// Auto-load .env if present
const __dirname = dirname(fileURLToPath(import.meta.url));
try {
  const env = await readFile(resolve(__dirname, '.env'), 'utf-8');
  env.split('\n').forEach(line => {
    const [key, ...val] = line.split('=');
    if (key && val.length) process.env[key.trim()] = val.join('=').trim();
  });
} catch {}

const API_KEY = process.env.PIXABAY_API_KEY || '';
const BASE_URL = 'https://pixabay.com/api/';

// Curated search queries optimized for GolfHelm backgrounds
const CURATED_QUERIES = {
  'grass':     'golf course green grass close up texture',
  'fairway':   'golf fairway landscape aerial green',
  'sunset':    'golf course sunset golden hour landscape',
  'dark':      'dark green abstract texture minimal',
  'aerial':    'golf course aerial view green landscape',
  'morning':   'golf course morning dew mist',
  'texture':   'green grass texture close up bokeh',
  'abstract':  'dark green abstract gradient minimal',
  'course':    'golf course scenic landscape beautiful',
  'premium':   'luxury golf club landscape scenic',
};

async function fetchBackgrounds(query, options = {}) {
  const {
    count = 5,
    outputDir = './backgrounds',
    minWidth = 1920,
    orientation = 'vertical',
    category = 'nature',
  } = options;

  if (!API_KEY) {
    console.log(`
⚠️  No Pixabay API key found.

Get your free key:
  1. Go to https://pixabay.com/api/docs/
  2. Sign up (free)
  3. Copy your API key
  4. Set it: export PIXABAY_API_KEY="your-key-here"

Or add to .env: PIXABAY_API_KEY=your-key-here
`);
    // Return curated suggestion instead
    console.log('📋 In the meantime, here are curated Pixabay search URLs:\n');
    const resolved = CURATED_QUERIES[query] || query;
    console.log(`   https://pixabay.com/images/search/${encodeURIComponent(resolved)}/?orientation=${orientation}&min_width=${minWidth}`);
    return [];
  }

  // Resolve curated aliases
  const searchQuery = CURATED_QUERIES[query] || query;

  const params = new URLSearchParams({
    key: API_KEY,
    q: searchQuery,
    image_type: 'photo',
    orientation,
    category,
    min_width: minWidth,
    min_height: Math.round(minWidth * 1.25), // 4:5 aspect minimum
    per_page: Math.max(3, Math.min(count * 2, 200)), // Pixabay min is 3
    safesearch: 'true',
    order: 'popular',
    editors_choice: 'true',
  });

  console.log(`🔍 Searching Pixabay: "${searchQuery}"`);

  const res = await fetch(`${BASE_URL}?${params}`);
  const data = await res.json();

  if (!data.hits || data.hits.length === 0) {
    // Retry without editors_choice
    params.set('editors_choice', 'false');
    const res2 = await fetch(`${BASE_URL}?${params}`);
    const data2 = await res2.json();
    if (!data2.hits || data2.hits.length === 0) {
      console.log('❌ No results found. Try a different query.');
      return [];
    }
    data.hits = data2.hits;
  }

  // Sort by resolution (largest first) and take top N
  const sorted = data.hits
    .sort((a, b) => (b.imageWidth * b.imageHeight) - (a.imageWidth * a.imageHeight))
    .slice(0, count);

  console.log(`📸 Found ${data.totalHits} images, downloading top ${sorted.length}...\n`);

  await mkdir(resolve(outputDir), { recursive: true });
  const downloaded = [];

  for (let i = 0; i < sorted.length; i++) {
    const img = sorted[i];
    const filename = `bg-${query.replace(/\s+/g, '-')}-${i + 1}.jpg`;
    const filepath = resolve(outputDir, filename);

    // Use largeImageURL (1920px) — fullHDURL requires paid plan
    const imageUrl = img.largeImageURL;

    try {
      const imgRes = await fetch(imageUrl);
      const buffer = Buffer.from(await imgRes.arrayBuffer());
      await writeFile(filepath, buffer);

      console.log(`  ✅ ${filename} (${img.imageWidth}×${img.imageHeight}, ${(buffer.length / 1024).toFixed(0)}KB)`);
      console.log(`     Tags: ${img.tags}`);
      console.log(`     Preview: ${img.pageURL}\n`);

      downloaded.push({
        path: filepath,
        width: img.imageWidth,
        height: img.imageHeight,
        tags: img.tags,
        url: img.pageURL,
      });
    } catch (err) {
      console.log(`  ❌ Failed to download: ${err.message}`);
    }
  }

  console.log(`\n✅ Downloaded ${downloaded.length} backgrounds to ${resolve(outputDir)}`);
  return downloaded;
}

// Only run CLI when executed directly (not when imported as a module)
const __fetchbg_filename = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === __fetchbg_filename) {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.log(`
GolfHelm Background Fetcher (Pixabay)
──────────────────────────────────────
Usage: node fetch-background.js <query|alias> [options]

Options:
  --count=N    Number of images (default: 5)
  --out=DIR    Output directory (default: ./backgrounds)
  --orient=V   Orientation: vertical, horizontal, all (default: vertical)

Curated Aliases:
  grass     Golf course close-up grass texture
  fairway   Aerial fairway landscape
  sunset    Golden hour golf course
  dark      Dark green abstract texture
  aerial    Bird's eye golf course
  morning   Morning dew/mist on course
  texture   Bokeh grass texture
  abstract  Dark green gradient
  course    Scenic golf landscape
  premium   Luxury golf club

Examples:
  node fetch-background.js grass
  node fetch-background.js "golf sunset" --count=10
  node fetch-background.js dark --out=./dark-backgrounds
`);
    process.exit(0);
  }

  const query = args.find(a => !a.startsWith('--'));
  const parseArg = (name) => {
    const arg = args.find(a => a.startsWith(`--${name}=`));
    return arg ? arg.split('=')[1] : undefined;
  };

  fetchBackgrounds(query, {
    count: parseInt(parseArg('count') || '5'),
    outputDir: parseArg('out') || './backgrounds',
    orientation: parseArg('orient') || 'vertical',
  }).catch(err => {
    console.error('❌ Fetch failed:', err.message);
    process.exit(1);
  });
}

export { fetchBackgrounds, CURATED_QUERIES };
