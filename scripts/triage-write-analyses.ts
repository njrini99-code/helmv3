/**
 * Triage — write analyses (operator path).
 *
 * `npm run triage` collects, groups and closes the deterministically-closeable
 * set, and the `selfheal-triage` cron writes LLM-generated analyses. Neither
 * covers the case triage-contract.md STEP 3 actually describes for a human:
 * an operator who has done the root-cause work by hand and needs to write one
 * analysis to every fingerprint of a group, then close the group under STEP 4.
 * Before this script that meant hand-rolled SQL, which is how the two-write
 * resolve shape got half-done (measured 2026-08-27: 12 fingerprints resolved,
 * `admin_error_resolutions` held zero rows).
 *
 * Input is a JSON array — one entry per MEMBER, not per group, because the
 * analysis is stored per fingerprint:
 *
 *   [{ fingerprint, origin, lastSeen, resolvable, analysis: { ...rcaAnalysisSchema },
 *      resolve?: { sha?: string, note: string } }]
 *
 * `analysis` must satisfy `rcaAnalysisSchema` (src/lib/admin/rca.ts). The
 * shape this script guards hardest is `suspectFiles`: an array of STRINGS
 * inserts fine and fails `safeParse` on read, and both readers return null on
 * a parse failure, so the Bridge renders an empty panel that looks exactly
 * like the job never ran. That check is local and runs before any write.
 *
 * Dry run by default. `--apply` writes.
 */
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../src/lib/types/database';
import { resolveTriageMember, type AdminClient } from '../src/lib/admin/triage-apply';
import { deriveRcaCategory } from '../src/lib/admin/rca-category';

const RCA_TITLE_PREFIX = 'RCA analysis: ';

interface Entry {
  fingerprint: string;
  origin: string;
  lastSeen: string;
  resolvable?: boolean;
  analysis: Record<string, unknown>;
  resolve?: { sha?: string; note: string };
}

function get(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
}

/** Local shape gate — the silent-failure modes named in triage-contract.md
 *  STEP 3, checked before anything is written rather than discovered later as
 *  an empty Bridge panel. */
function validate(a: Record<string, unknown>, fp: string): string[] {
  const bad: string[] = [];
  if (typeof a.probableCause !== 'string' || !a.probableCause.trim()) bad.push('probableCause');
  if (typeof a.suggestedFix !== 'string' || !a.suggestedFix.trim()) bad.push('suggestedFix');
  if (!['high', 'medium', 'low'].includes(a.confidence as string)) bad.push('confidence');
  if (typeof a.model !== 'string' || !a.model.trim()) bad.push('model');
  if (typeof a.generatedAt !== 'string' || !a.generatedAt.trim()) bad.push('generatedAt');
  if (!Array.isArray(a.relatedFingerprints)) bad.push('relatedFingerprints (must be an array)');
  const sf = a.suspectFiles;
  if (!Array.isArray(sf)) bad.push('suspectFiles (must be an array)');
  else if (
    sf.some((f) => typeof f !== 'object' || f === null || Array.isArray(f) || typeof (f as { path?: unknown }).path !== 'string')
  ) {
    bad.push('suspectFiles (must be objects with a string `path`, NOT strings)');
  }
  if (deriveRcaCategory(a.suggestedFix as string) === 'uncategorized') {
    bad.push(`suggestedFix derives to uncategorized — must open with a RCA_CANONICAL_PREFIX string (${fp})`);
  }
  return bad;
}

async function main() {
  const inputPath = get('--input');
  if (!inputPath) throw new Error('--input <file.json> is required');
  const apply = process.argv.includes('--apply');
  const canary = process.argv.includes('--canary');
  // Write even when an analysis already exists — the readers take the NEWEST
  // row per fingerprint, so this is how an off-contract (uncategorized)
  // analysis gets replaced with one that opens with a canonical prefix.
  const supersede = process.argv.includes('--supersede');
  const limitRaw = get('--limit');

  let entries: Entry[] = JSON.parse(readFileSync(inputPath, 'utf8'));
  if (canary) entries = entries.slice(0, 1);
  else if (limitRaw) entries = entries.slice(0, Number(limitRaw));

  const problems = entries.flatMap((e) => validate(e.analysis, e.fingerprint).map((p) => `${e.fingerprint}: ${p}`));
  if (problems.length) {
    console.error(`REFUSING TO WRITE — ${problems.length} shape problem(s):`);
    for (const p of problems.slice(0, 20)) console.error(`  ${p}`);
    process.exit(1);
  }
  console.log(`shape OK for ${entries.length} entr${entries.length === 1 ? 'y' : 'ies'}`);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are required');
  const admin = createClient<Database>(url, key, { auth: { persistSession: false } }) as unknown as AdminClient;

  if (!apply) {
    console.log(`# DRY RUN — nothing written. ${entries.length} analyses, ${entries.filter((e) => e.resolvable !== false && e.resolve).length} resolves. Re-run with --apply.`);
    return;
  }

  let written = 0, skipped = 0, failed = 0, rowsResolved = 0, ledger = 0, declined = 0, held = 0;
  for (const e of entries) {
    // Idempotent: one analysis per fingerprint, never a second on a re-run.
    const { data: existing } = await admin
      .from('admin_events').select('id')
      .eq('event_type', 'rca_analysis').eq('fingerprint', e.fingerprint).limit(1);
    if (existing && existing.length > 0 && !supersede) { skipped += 1; }
    else {
      const nowIso = new Date().toISOString();
      const { error } = await admin.from('admin_events').insert({
        event_type: 'rca_analysis',
        title: `${RCA_TITLE_PREFIX}${e.fingerprint}`,
        severity: 'info',
        source: 'system',
        feature: 'admin_dashboard',
        fingerprint: e.fingerprint,
        metadata: e.analysis as never,
        resolved: true,
        resolved_at: nowIso,
      });
      if (error) { console.error(`  analysis ${e.fingerprint} FAILED: ${error.message}`); failed += 1; continue; }
      written += 1;
    }

    if (!e.resolve) continue;
    if (e.resolvable === false) { held += 1; console.log(`  HOLD ${e.fingerprint} — last_seen ${e.lastSeen} does not predate the fix`); continue; }
    const r = await resolveTriageMember(admin, { key: e.fingerprint, origin: e.origin, lastSeen: e.lastSeen }, e.resolve.note, e.resolve.sha);
    rowsResolved += r.rowsResolved;
    if (r.ledger === 'recorded') ledger += 1;
    else if (r.ledger === 'declined') declined += 1;
  }
  console.log(`analyses written=${written} skipped(existing)=${skipped} failed=${failed}`);
  console.log(`resolve rowsResolved=${rowsResolved} ledgerRecorded=${ledger} ledgerDeclined=${declined} held=${held}`);
}

main().catch((e) => { console.error('triage-write-analyses failed:', e instanceof Error ? e.message : String(e)); process.exit(1); });
