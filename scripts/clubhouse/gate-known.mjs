#!/usr/bin/env node
/**
 * Writes e2e/clubhouse-gate/known.ts from a gate report (CH_GATE_REPORT, one JSON line per scan): each failing
 * screen|width|theme|check, marked with the bug that owns that check on that lane. PR 1 runs it to record today's failures.
 * A lane PR doesn't: it deletes the lines it fixed by hand, so a new failure can never slip in as "known".
 *
 *   node scripts/clubhouse/gate-known.mjs <report.jsonl>
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { GATE_LANES } from './gate-lanes.mjs';

const OWNERS = {
  TEAM: { 'card-escape': 'TEAM-1', 'text-clip': 'TEAM-14', 'cramped-text': 'TEAM-26', 'nested-surface': 'QA-8', 'phone-text': 'MOB-TEAM-6', 'tap-target': 'TEAM-12', 'row-inset': 'TEAM-17', 'page-edge': 'TEAM-4', contrast: 'TEAM-25' },
  CRH: { 'card-escape': 'CRH-1', 'text-clip': 'CRH-12', 'cramped-text': 'CRH-3', 'nested-surface': 'CRH-4', 'phone-text': 'CRH-25', 'tap-target': 'CRH-9', 'row-inset': 'CRH-1', 'page-edge': 'MOB-CRH-3', contrast: 'CRH-5' },
  ASK: { 'card-escape': 'ASK-6', 'text-clip': 'MOB-ASK-6', 'cramped-text': 'MOB-ASK-8', 'nested-surface': 'ASK-5', 'phone-text': 'ASK-22', 'tap-target': 'ASK-10', 'row-inset': 'ASK-12', 'page-edge': 'ASK-12', contrast: 'ASK-9' },
  QC: { 'card-escape': 'QC-5', 'text-clip': 'QC-14', 'cramped-text': 'MOB-QC-8', 'nested-surface': 'QC-4', 'phone-text': 'QC-22', 'tap-target': 'MOB-QC-11', 'row-inset': 'FID-QC-8', 'page-edge': 'FID-QC-8', contrast: 'QC-6' },
  PRAC: { 'card-escape': 'PP-10', 'text-clip': 'MOB-PRAC-7', 'cramped-text': 'PP-20', 'nested-surface': 'PP-2', 'phone-text': 'PP-21', 'tap-target': 'PP-22', 'row-inset': 'PP-25', 'page-edge': 'PP-25', contrast: 'PP-17' },
  MSG: { 'card-escape': 'MSG-2', 'text-clip': 'MOB-MSG-14', 'cramped-text': 'MOB-MSG-9', 'nested-surface': 'FID-MSG-2', 'phone-text': 'MSG-19', 'tap-target': 'MSG-13', 'row-inset': 'MOB-MSG-13', 'page-edge': 'MOB-MSG-13', contrast: 'MSG-17' },
  RC: { 'card-escape': 'RC-8', 'text-clip': 'RC-7', 'cramped-text': 'MOB-RC-1', 'nested-surface': 'RC-2', 'phone-text': 'RC-9', 'tap-target': 'RC-12', 'row-inset': 'RC-11', 'page-edge': 'MOB-RC-1', contrast: 'RC-10' },
  CVP: { 'card-escape': 'CVP-9', 'text-clip': 'CVP-5', 'cramped-text': 'CVP-15', 'nested-surface': 'CVP-15', 'phone-text': 'CVP-11', 'tap-target': 'MOB-CVP-7', 'row-inset': 'CVP-12', 'page-edge': 'CVP-2', contrast: 'CVP-16' },
  STATS: { 'card-escape': 'STATS-2', 'text-clip': 'STATS-10', 'cramped-text': 'STATS-10', 'nested-surface': 'FID-STATS-1', 'phone-text': 'STATS-15', 'tap-target': 'STATS-7', 'row-inset': 'FID-STATS-14', 'page-edge': 'STATS-1', contrast: 'STATS-3' },
};

const file = process.argv[2];
if (!file) { console.error('usage: gate-known.mjs <report.jsonl>'); process.exit(2); }
const lines = new Map();
for (const row of readFileSync(file, 'utf8').trim().split('\n')) {
  const { key, findings } = JSON.parse(row);
  const lane = GATE_LANES[key.split('|')[0]];
  for (const check of new Set(findings.map((f) => f.check))) lines.set(`${key}|${check}`, OWNERS[lane]?.[check] ?? `GATE-${lane}`);
}
const body = [...lines.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, id]) => `  '${k}': '${id}',`).join('\n');
const target = 'e2e/clubhouse-gate/known.ts';
const head = readFileSync(target, 'utf8').split('export const KNOWN')[0];
writeFileSync(target, `${head}export const KNOWN: Record<string, string> = {\n${body}\n};\n`);
console.log(`${lines.size} known failures written.`);
