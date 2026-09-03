/**
 * Triage, run on demand.
 *
 * Reads the last N hours from ALL THREE sources — `admin_events`, plus the
 * correlated Sentry/Supabase/Vercel signals the reliability collector writes
 * to `background_job_logs.reliability-snapshot` — groups them by cause, and
 * prints the plan. The decisions live in `src/lib/admin/triage-engine.ts`,
 * which is pure; the collection lives in `src/lib/admin/triage-collect.ts` and
 * the apply path in `src/lib/admin/triage-apply.ts` (both plain I/O, no
 * `server-only`, importable from a Vercel cron route too — see
 * `src/app/api/cron/selfheal-triage/route.ts`, which now runs the automated
 * half of what this CLI does manually). This file is argument parsing,
 * output formatting, and process wiring only.
 *
 *   npm run triage                    # 72h, DRY RUN, human-readable
 *   npm run triage -- --hours 24      # narrower window
 *   npm run triage -- --json          # machine-readable, for a routine
 *   npm run triage -- --apply         # write: close what is provably closeable
 *   npm run triage -- --input dump.json   # run against a saved dump, no DB
 *
 * DRY RUN IS THE DEFAULT and `--apply` is the only thing that writes. That is
 * deliberate: this reads a SHARED PRODUCTION database serving live users, and
 * a triage tool whose first accidental invocation resolves incidents is worse
 * than no tool.
 *
 * `--input` exists so the plan can be produced and reviewed WITHOUT holding a
 * service-role key — the same reason the engine is pure. Dump once, iterate on
 * the plan offline, apply deliberately.
 *
 * This CLI stays the full-contract operator fallback: it is the only path
 * that can carry a human's SHA-ancestry judgement (triage-contract.md STEP 2)
 * for an "ALREADY FIXED" analysis naming a commit — the automated cron cannot
 * check `git merge-base --is-ancestor` from inside a Vercel function, so it
 * deliberately leaves a SHA-bearing claim open for this CLI or the nightly
 * `auto-resolve.ts` sweep. See docs/ai-system/selfheal/triage-contract.md.
 */
import 'dotenv/config';
import { readFileSync, writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../src/lib/types/database';
import {
  buildTriagePlan,
  type TriageCandidate,
  type SourceHealth,
  type TriagePlan,
  type TriageGroup,
} from '../src/lib/admin/triage-engine';
import {
  collectAdminEvents,
  collectReliabilitySignals,
  collectRelAnalyses,
  type AdminClient,
} from '../src/lib/admin/triage-collect';
import { applyPlan } from '../src/lib/admin/triage-apply';

interface Args {
  hours: number;
  json: boolean;
  apply: boolean;
  input: string | null;
  dump: string | null;
}

function parseArgs(argv: readonly string[]): Args {
  const get = (flag: string): string | null => {
    const i = argv.indexOf(flag);
    return i >= 0 ? (argv[i + 1] ?? null) : null;
  };
  const hoursRaw = get('--hours');
  const hours = hoursRaw ? Number(hoursRaw) : 72;
  if (!Number.isFinite(hours) || hours <= 0) {
    throw new Error(`--hours must be a positive number, got ${hoursRaw}`);
  }
  return {
    hours,
    json: argv.includes('--json'),
    apply: argv.includes('--apply'),
    input: get('--input'),
    dump: get('--dump'),
  };
}

/** What a dump holds — exactly the engine's inputs, nothing derived. */
interface TriageDump {
  candidates: TriageCandidate[];
  sourceHealth: SourceHealth[];
  windowHours: number;
  collectedAt: string;
}

/**
 * The CLI builds its own client rather than importing `createAdminClient`.
 *
 * That helper calls `Sentry.instrumentSupabaseClient`, which only exists once
 * the Next.js Sentry SDK has initialised — in a bare `tsx` process it is
 * `undefined` and the whole script dies on
 * `Sentry.instrumentSupabaseClient is not a function` before reading a single
 * row. Same credentials, same `Database` typing, same read-only intent; it
 * simply does not drag a framework runtime into a command-line tool.
 */
function createTriageClient(): AdminClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || /placeholder\.supabase\.co/i.test(url)) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL is missing or a placeholder.');
  }
  if (!serviceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is missing.');
  }
  return createClient<Database>(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

const BAR = '─'.repeat(78);

function renderGroup(g: TriageGroup, index: number): string {
  const lines: string[] = [];
  const flags = [
    g.corroborated ? `CORROBORATED(${g.origins.join('+')})` : null,
    g.category ? `category=${g.category}` : null,
  ].filter(Boolean);
  lines.push(
    `${String(index + 1).padStart(3)}. [${g.severity.toUpperCase()}] ${g.title}`,
  );
  lines.push(
    `     ${g.occurrences} occurrence${g.occurrences === 1 ? '' : 's'}` +
      ` · ${g.members.length} fingerprint${g.members.length === 1 ? '' : 's'}` +
      ` · last ${g.lastSeen}` +
      (flags.length ? ` · ${flags.join(' · ')}` : ''),
  );
  if (g.route) lines.push(`     route  ${g.route}`);
  if (g.errorCode) lines.push(`     code   ${g.errorCode}`);
  lines.push(`     why    ${g.reason}`);
  if (g.members.length > 1) {
    lines.push(`     keys   ${g.members.map((m) => m.key).join(', ')}`);
  }
  for (const url of g.evidenceUrls.slice(0, 2)) lines.push(`     stack  ${url}`);
  return lines.join('\n');
}

function renderPlan(plan: TriagePlan): string {
  const out: string[] = [];
  out.push(BAR);
  out.push(`TRIAGE — last ${plan.windowHours}h — ${plan.generatedAt}`);
  out.push(BAR);

  out.push('');
  out.push('SOURCES');
  for (const s of plan.sourceHealth) {
    const mark = s.status === 'ok' ? 'ok    ' : s.status === 'degraded' ? 'DEGRADED' : 'BLIND ';
    out.push(`  ${mark} ${s.source}${s.reason ? ` — ${s.reason}` : ''}`);
  }
  if (plan.blindSources.length > 0) {
    out.push('');
    out.push(
      `  !! THIS PLAN IS INCOMPLETE. ${plan.blindSources.join(', ')} could not be read.`,
    );
    out.push('     A source that failed to read is UNKNOWN, not clean.');
  }

  const c = plan.counts;
  out.push('');
  out.push(
    `${c.candidates} candidates → ${c.groups} causes (${c.collapsed} collapsed)` +
      ` · ${c.needsAnalysis} need analysis · ${c.notADefect} closeable` +
      ` · ${c.quietUnrecognised} quiet/unrecognised · ${c.analysed} already analysed` +
      ` · ${c.corroborated} corroborated`,
  );

  out.push('');
  out.push(BAR);
  out.push(`NEEDS ANALYSIS (${plan.queue.length}) — this is the list to act on`);
  out.push(BAR);
  if (plan.queue.length === 0) {
    out.push('  nothing — every actionable cause in the window carries an analysis');
  }
  plan.queue.forEach((g, i) => out.push(renderGroup(g, i)));

  out.push('');
  out.push(BAR);
  out.push(`CLOSEABLE (${plan.closeable.length}) — non-actionable by their own content`);
  out.push(BAR);
  plan.closeable.forEach((g, i) => out.push(renderGroup(g, i)));

  out.push('');
  out.push(BAR);
  out.push(
    `QUIET, UNRECOGNISED (${plan.quiet.length}) — logged at info, matched by no rule.`,
  );
  out.push('  Reported, never auto-closed: "nothing recognised it" is not a verdict.');
  out.push(BAR);
  plan.quiet.forEach((g, i) => out.push(renderGroup(g, i)));

  const analysed = plan.groups.filter((g) => g.verdict === 'analysed');
  out.push('');
  out.push(BAR);
  out.push(`ALREADY ANALYSED (${analysed.length})`);
  out.push(BAR);
  analysed.forEach((g, i) => out.push(renderGroup(g, i)));

  return out.join('\n');
}

// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const now = new Date();
  const since = new Date(now.getTime() - args.hours * 3600_000).toISOString();

  let candidates: TriageCandidate[];
  let sourceHealth: SourceHealth[];

  if (args.input) {
    const dump = JSON.parse(readFileSync(args.input, 'utf-8')) as TriageDump;
    candidates = dump.candidates;
    sourceHealth = dump.sourceHealth;
    console.log(`# input: ${args.input} (collected ${dump.collectedAt})`);
  } else {
    const admin = createTriageClient();
    const relAnalyses = await collectRelAnalyses(admin);
    const [events, reliability] = await Promise.all([
      collectAdminEvents(admin, since),
      collectReliabilitySignals(admin, since, relAnalyses),
    ]);
    candidates = [...events.candidates, ...reliability.candidates];
    sourceHealth = [events.health, ...reliability.health];
  }

  if (args.dump) {
    const dump: TriageDump = {
      candidates,
      sourceHealth,
      windowHours: args.hours,
      collectedAt: now.toISOString(),
    };
    writeFileSync(args.dump, JSON.stringify(dump, null, 2));
    console.log(`# dumped ${candidates.length} candidates → ${args.dump}`);
  }

  const plan = buildTriagePlan({ candidates, sourceHealth, windowHours: args.hours, now });

  if (args.json) {
    console.log(JSON.stringify(plan, null, 2));
  } else {
    console.log(renderPlan(plan));
  }

  if (args.apply) {
    if (args.input) {
      throw new Error('--apply cannot be combined with --input: apply must write against the same live state it read.');
    }
    const result = await applyPlan(createTriageClient(), plan);
    console.log('');
    console.log(BAR);
    console.log(
      `APPLIED — ${result.rowsResolved} admin_events rows resolved, ` +
        `${result.ledgerRecorded} ledger rows recorded, ` +
        `${result.ledgerDeclined} declined (a human had already resolved them — the RPC working)`,
    );
    console.log(BAR);
  } else {
    console.log('');
    console.log('# DRY RUN — nothing was written. Re-run with --apply to close the closeable set.');
  }
}

main().catch((err) => {
  console.error('run-triage failed:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
