import { readFileSync } from 'fs';

const supabaseUrl = 'https://qmnssrrolpinvwjjnufo.supabase.co';
const serviceRoleKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFtbnNzcnJvbHBpbnZ3ampudWZvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODMyNjg0MCwiZXhwIjoyMDgzOTAyODQwfQ.pW8-66rT0Y3LXcPYSXMPqj0_y0K_AYnPj22nXjdMU6I';

// Parse CSV
function parseCSV(content) {
  const lines = content.trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim());
  const rows = [];
  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    
    const values = [];
    let current = '';
    let inQuotes = false;
    
    for (const char of line) {
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim());
    
    const row = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx] || '';
    });
    rows.push(row);
  }
  
  return rows;
}

// Map gender to program type
function mapProgram(gender) {
  const g = (gender || '').toLowerCase();
  if (g.includes('men') && g.includes('women')) return 'both';
  if (g.includes("men's") && !g.includes("women")) return 'mens';
  if (g.includes("women")) return 'womens';
  return 'both';
}

// Read coaches
const d3Content = readFileSync('/Users/ricknini/.openclaw/workspace/d3-golf-coaches/d3_coaches.csv', 'utf8');
const d3Coaches = parseCSV(d3Content);

const d2Content = readFileSync('/Users/ricknini/.openclaw/workspace/d2-golf-coaches/d2_coaches_cleaned.csv', 'utf8');
const d2Coaches = parseCSV(d2Content);

// Build records
const records = [];

for (const c of d3Coaches) {
  if (!c['Coach Name'] || c['Coach Name'] === 'TBD' || c['Coach Name'].toLowerCase().includes('tbd')) continue;
  
  records.push({
    name: c['Coach Name'],
    title: c['Position'] || null,
    email: (c['Email'] && c['Email'] !== 'Not found') ? c['Email'] : null,
    school: c['School'],
    conference: c['Conference'],
    division: 'D3',
    program: mapProgram(c['Gender Program']),
    status: 'new_lead'
  });
}

for (const c of d2Coaches) {
  if (!c['Coach Name'] || c['Coach Name'] === 'TBD' || c['Coach Name'].toLowerCase().includes('tbd')) continue;
  
  records.push({
    name: c['Coach Name'],
    title: c['Position'] || null,
    email: (c['Email'] && c['Email'] !== 'Not found') ? c['Email'] : null,
    school: c['School'],
    conference: c['Conference'],
    division: 'D2',
    program: mapProgram(c['Gender Program']),
    status: 'new_lead'
  });
}

console.log(`Inserting ${records.length} coaches...`);

// Batch insert (100 at a time)
const batchSize = 100;
let success = 0;
let failed = 0;

for (let i = 0; i < records.length; i += batchSize) {
  const batch = records.slice(i, i + batchSize);
  
  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/crm_coaches`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': serviceRoleKey,
        'Authorization': `Bearer ${serviceRoleKey}`,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify(batch)
    });
    
    if (response.ok) {
      success += batch.length;
      console.log(`Inserted batch ${Math.floor(i/batchSize) + 1}: ${success} total`);
    } else {
      const error = await response.text();
      console.log(`Failed batch ${Math.floor(i/batchSize) + 1}: ${error}`);
      failed += batch.length;
    }
  } catch (err) {
    console.log(`Error on batch ${Math.floor(i/batchSize) + 1}: ${err.message}`);
    failed += batch.length;
  }
}

console.log(`\nDone! Success: ${success}, Failed: ${failed}`);
