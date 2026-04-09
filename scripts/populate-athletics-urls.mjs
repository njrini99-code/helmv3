/**
 * Populate athletics_url for CRM coaches.
 * Uses DuckDuckGo HTML search (no API key needed) to find each school's
 * athletics golf coaches page.
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing env vars. Run: node --env-file=.env.local scripts/populate-athletics-urls.mjs');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function searchDDG(school) {
  const query = encodeURIComponent(`${school} men's golf coaches athletics site`);
  try {
    const res = await fetch(`https://html.duckduckgo.com/html/?q=${query}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
    });
    const html = await res.text();
    
    // Extract URLs from DDG results
    const urlMatches = html.match(/uddg=([^&"]+)/g) || [];
    const urls = urlMatches.map(m => decodeURIComponent(m.replace('uddg=', '')));
    
    // Priority 1: Direct golf coaches page
    const golfCoaches = urls.find(u => 
      (u.includes('/sports/mens-golf/coaches') || u.includes('/sports/mgolf/coaches') || u.includes('/sports/golf/coaches')) &&
      !u.includes('ncsasports') && !u.includes('wikipedia') && !u.includes('sportsrecruits')
    );
    if (golfCoaches) return golfCoaches;
    
    // Priority 2: Golf roster/schedule page (close enough — same athletics site)
    const golfPage = urls.find(u =>
      (u.includes('/sports/mens-golf') || u.includes('/sports/mgolf') || u.includes('/sports/golf')) &&
      !u.includes('ncsasports') && !u.includes('wikipedia') && !u.includes('sportsrecruits')
    );
    if (golfPage) {
      // Convert roster/schedule URL to coaches URL
      return golfPage.replace(/\/roster.*/, '/coaches').replace(/\/schedule.*/, '/coaches');
    }
    
    // Priority 3: Staff directory on athletics site
    const staffDir = urls.find(u =>
      u.includes('staff-directory') &&
      !u.includes('ncsasports') && !u.includes('wikipedia')
    );
    if (staffDir) return staffDir;
    
    return null;
  } catch (err) {
    console.error(`  Search error: ${err.message}`);
    return null;
  }
}

async function main() {
  const { data: coaches, error } = await supabase
    .from('crm_coaches')
    .select('id, school')
    .is('athletics_url', null)
    .eq('is_archived', false)
    .order('school');

  if (error) { console.error('Fetch error:', error); process.exit(1); }
  
  const schoolMap = new Map();
  for (const c of coaches) {
    if (!schoolMap.has(c.school)) schoolMap.set(c.school, []);
    schoolMap.get(c.school).push(c.id);
  }
  
  console.log(`${schoolMap.size} schools to look up\n`);
  
  let found = 0, notFound = 0;
  const notFoundSchools = [];
  
  for (const [school, ids] of schoolMap) {
    process.stdout.write(`[${found + notFound + 1}/${schoolMap.size}] ${school}... `);
    
    const url = await searchDDG(school);
    
    if (url) {
      found++;
      console.log(`✓ ${url}`);
      await supabase.from('crm_coaches').update({ athletics_url: url }).in('id', ids);
    } else {
      notFound++;
      notFoundSchools.push(school);
      console.log('✗');
    }
    
    // Rate limit: 1 request per 2 seconds to be polite
    await new Promise(r => setTimeout(r, 2000));
  }
  
  console.log(`\n✅ Done! Found: ${found}, Not found: ${notFound}`);
  if (notFoundSchools.length > 0) {
    console.log(`\nSchools not found:\n${notFoundSchools.join('\n')}`);
  }
}

main();
