#!/usr/bin/env node
/**
 * schema.mjs — query the generated schema instead of reading prose about it.
 *
 *   npm run schema -- golf_rounds          # one table: Row columns + relationships
 *   npm run schema -- --grep shot          # table names matching a substring
 *   npm run schema -- --enums              # all enum names
 *   npm run schema -- --enums round_type   # one enum's values
 *
 * Source: src/lib/types/database.ts — generated from the production schema
 * and the single source of truth for every table and column. This command
 * exists so a schema lookup costs ~300 tokens of exact truth instead of a
 * read through hand-written column listings that can rot (the knowledge base
 * once carried 59 identifiers that did not exist in production).
 *
 * Pure stdlib; read-only.
 */
import { readFileSync } from 'node:fs';

const SRC = 'src/lib/types/database.ts';
const text = readFileSync(SRC, 'utf8');

function block(src, startIdx) {
  // startIdx points at a '{' in src. Return the substring to its matching '}'.
  let depth = 0;
  for (let i = startIdx; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) return src.slice(startIdx, i + 1); }
  }
  return '';
}

// Anchor into the `public:` schema — graphql_public comes first in the file
// and its Tables block is empty, so a bare indexOf('Tables: {') finds the
// wrong one.
const publicIdx = text.indexOf('\n  public: {');
const publicBlock = block(text, text.indexOf('{', publicIdx + 1));

function section(name) {
  const idx = publicBlock.indexOf(`${name}: {`);
  if (idx < 0) return '';
  return block(publicBlock, publicBlock.indexOf('{', idx));
}

function tableNames() {
  const names = [];
  for (const m of section('Tables').matchAll(/^ {6}([a-z0-9_]+): \{$/gm)) names.push(m[1]);
  return names;
}

const args = process.argv.slice(2).filter((a) => a !== '--');

if (args[0] === '--grep') {
  const q = (args[1] ?? '').toLowerCase();
  const hits = tableNames().filter((n) => n.includes(q));
  console.log(hits.length ? hits.join('\n') : `(no table name contains "${q}")`);
  process.exit(0);
}

if (args[0] === '--enums') {
  const body = section('Enums');
  if (!args[1]) {
    for (const m of body.matchAll(/^ {6}([a-z0-9_]+):/gm)) console.log(m[1]);
    process.exit(0);
  }
  const em = body.match(new RegExp(`^      ${args[1]}:\\s*\\n?([\\s\\S]*?)(?=^      [a-z0-9_]+:|\\})`, 'm'));
  if (!em) { console.error(`enum "${args[1]}" not found`); process.exit(1); }
  const vals = [...em[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  console.log(vals.join('\n'));
  process.exit(0);
}

const table = args[0];
if (!table) {
  console.error('usage: npm run schema -- <table> | --grep <substr> | --enums [name]');
  process.exit(1);
}

const tables = section('Tables');
const marker = `\n      ${table}: {`;
const idx = tables.indexOf(marker);
if (idx < 0) {
  const near = tableNames().filter((n) => n.includes(table)).slice(0, 8);
  console.error(`table "${table}" not found in ${SRC}.`);
  if (near.length) console.error(`did you mean: ${near.join(', ')}`);
  console.error('(remember the sport prefix: golf_*, baseball_*, helm_lifting_*)');
  process.exit(1);
}
const tbl = block(tables, tables.indexOf('{', idx + 1));

const rowIdx = tbl.indexOf('Row: {');
const row = block(tbl, tbl.indexOf('{', rowIdx));
console.log(`${table} — Row (from generated production types):`);
for (const line of row.split('\n').slice(1, -1)) {
  const t = line.trim();
  if (t) console.log(`  ${t}`);
}

const relIdx = tbl.indexOf('Relationships: [');
if (relIdx >= 0) {
  const rel = tbl.slice(relIdx);
  const fks = [...rel.matchAll(/foreignKeyName: "([^"]+)"[\s\S]*?columns: \["([^"]+)"\][\s\S]*?referencedRelation: "([^"]+)"[\s\S]*?referencedColumns: \["([^"]+)"\]/g)];
  if (fks.length) {
    console.log('\nRelationships:');
    for (const [, name, col, refTable, refCol] of fks) {
      console.log(`  ${col} -> ${refTable}.${refCol}  (${name})`);
    }
  }
}
