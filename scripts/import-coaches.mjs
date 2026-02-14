import { readFileSync } from 'fs';

// Parse CSV (simple parser for our format)
function parseCSV(content) {
  const lines = content.trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim());
  const rows = [];
  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    
    // Handle commas in quoted fields
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

// Escape SQL string
function esc(str) {
  if (!str) return 'NULL';
  return "'" + str.replace(/'/g, "''") + "'";
}

// Read and process D3 coaches
const d3Content = readFileSync('/Users/ricknini/.openclaw/workspace/d3-golf-coaches/d3_coaches.csv', 'utf8');
const d3Coaches = parseCSV(d3Content);

// Read and process D2 coaches
const d2Content = readFileSync('/Users/ricknini/.openclaw/workspace/d2-golf-coaches/d2_coaches_cleaned.csv', 'utf8');
const d2Coaches = parseCSV(d2Content);

console.log(`-- D3 Coaches: ${d3Coaches.length}`);
console.log(`-- D2 Coaches: ${d2Coaches.length}`);
console.log('');

// Generate INSERT statements
const inserts = [];

// D3 coaches
for (const c of d3Coaches) {
  if (!c['Coach Name'] || c['Coach Name'] === 'TBD' || c['Coach Name'].toLowerCase().includes('tbd')) continue;
  
  const name = esc(c['Coach Name']);
  const title = esc(c['Position']);
  const email = c['Email'] && c['Email'] !== 'Not found' ? esc(c['Email']) : 'NULL';
  const school = esc(c['School']);
  const conference = esc(c['Conference']);
  const program = esc(mapProgram(c['Gender Program']));
  
  inserts.push(`INSERT INTO crm_coaches (name, title, email, school, conference, division, program, status) VALUES (${name}, ${title}, ${email}, ${school}, ${conference}, 'D3', ${program}, 'new_lead');`);
}

// D2 coaches
for (const c of d2Coaches) {
  if (!c['Coach Name'] || c['Coach Name'] === 'TBD' || c['Coach Name'].toLowerCase().includes('tbd')) continue;
  
  const name = esc(c['Coach Name']);
  const title = esc(c['Position']);
  const email = c['Email'] && c['Email'] !== 'Not found' ? esc(c['Email']) : 'NULL';
  const school = esc(c['School']);
  const conference = esc(c['Conference']);
  const program = esc(mapProgram(c['Gender Program']));
  
  inserts.push(`INSERT INTO crm_coaches (name, title, email, school, conference, division, program, status) VALUES (${name}, ${title}, ${email}, ${school}, ${conference}, 'D2', ${program}, 'new_lead');`);
}

console.log(`-- Total valid coaches to insert: ${inserts.length}`);
console.log('');
console.log(inserts.join('\n'));
