/**
 * CoachHelm Slice 1 back-test, part one (02-accuracy-standard §8): how the
 * five-rung ladder would distribute over the reads production shows today.
 *
 * Read-only and offline. It reads a JSON export produced by
 * `scripts/coachhelm/support-backtest.sql` (run that SELECT through a
 * read-only path and save the single JSON cell), runs the SAME pure pass the
 * engine runs (`evaluatePlayerRun`, one "run" per player over that player's
 * live reads), and prints aggregate counts: per rung, per family × rung, the
 * reasons reads are held at Not enough yet, and reach (players with >= 5
 * countable rounds who would get at least one Observed-or-better read).
 *
 * Two scenarios:
 *   as-is          the evidence exactly as stored;
 *   rounds-stamped rows with no round count get the player's countable
 *                  rounds in the last 90 days as `rounds_n` (what Slice 0b's
 *                  stamping would supply), so the round floor is judged
 *                  instead of failing as "rounds unknown".
 *
 * Not built here (02 §8 steps 1-4, 6): the replay over historical cutoffs
 * that measures held / cleared / contradicted per rung and the calibration
 * of 1 − q. That needs the generators re-run on past windows.
 *
 *   npx tsx scripts/coachhelm/support-backtest.ts --input <export.json> [--json]
 *
 * No credentials, no network, no writes.
 */
import { readFileSync } from 'node:fs';
import { evaluatePlayerRun, type SupportRow } from '../../src/lib/coachhelm/v3/support/evaluate';
import { LADDER_RUNGS, type LadderRung } from '../../src/lib/coachhelm/v3/support/ladder';

/** One element of the export (flat, short keys; see support-backtest.sql). */
export type ExportRow = Record<string, unknown> & { p: string; t: string | null; r90?: number; rt?: number };

/** Short export key → [evidence path]. */
const SHORT_KEYS: Record<string, string[]> = {
  m: ['metric'],
  pol: ['polarity'],
  yv: ['your_value'],
  n: ['sample_n'],
  cv: ['comparison_value'],
  cs: ['comparison_source'],
  si: ['strokes_impact'],
  sm: ['strokes_impact_method'],
  est: ['estimated'],
  rn: ['rounds_n'],
  rp: ['detail', 'rounds_played'],
  ba: ['detail', 'band_attempts'],
  at: ['detail', 'attempts'],
  gh: ['detail', 'green_hit_n'],
  gp: ['detail', 'green_hit_pct'],
  sv: ['detail', 'save_n'],
  sk: ['detail', 'saves_made'],
  dn: ['detail', 'downhill_n'],
  dp: ['detail', 'downhill_pct'],
  ln: ['detail', 'level_n'],
  lp: ['detail', 'level_pct'],
  lt: ['detail', 'ltr_n'],
  rl: ['detail', 'rtl_n'],
  dr: ['detail', 'driver_n'],
  nd: ['detail', 'non_driver_n'],
  dh: ['detail', 'driver_fairway_hits'],
  nh: ['detail', 'non_driver_fairway_hits'],
  se: ['detail', 'gap_se'],
  pr: ['detail', 'practice_rounds'],
  cr: ['detail', 'competitive_rounds'],
  lo: ['detail', 'delta_ci_low'],
  hi: ['detail', 'delta_ci_high'],
  ta: ['standing', 'team_avg'],
  tn: ['standing', 'team_n'],
  la: ['standing', 'level_avg'],
  lc: ['standing', 'level_n'],
};

const HELP = `support-backtest: ladder distribution over an offline export (read-only)

  npx tsx scripts/coachhelm/support-backtest.ts --input <export.json> [--json]

  --input   JSON array from scripts/coachhelm/support-backtest.sql
  --json    print the report as JSON instead of tables
  --help    this text

Reads no credentials and opens no connection.`;

function parseArgs(argv: string[]): { input: string | null; json: boolean; help: boolean } {
  let input: string | null = null;
  let json = false;
  let help = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') help = true;
    else if (a === '--json') json = true;
    else if (a === '--input') input = argv[++i] ?? null;
  }
  return { input, json, help };
}

/** Rebuild an evidence object the pass can read from one export row. */
export function toSupportRow(row: ExportRow, index: number, stampRounds: boolean): SupportRow {
  const e: Record<string, unknown> = {};
  for (const [short, path] of Object.entries(SHORT_KEYS)) {
    if (row[short] === undefined || row[short] === null) continue;
    if (path.length === 1) e[path[0]!] = row[short];
    else {
      const parent = (e[path[0]!] ??= {}) as Record<string, unknown>;
      parent[path[1]!] = row[short];
    }
  }
  if (row.cl === 1) e.diagnosis = { root_cause: 'printed cause line' };
  const nSrc = typeof row.ns === 'number' ? row.ns : 0;
  if (nSrc > 0) e.source_round_ids = Array.from({ length: nSrc }, (_, i) => `r${i}`);
  const detail = (e.detail ?? {}) as Record<string, unknown>;
  const hasRounds =
    typeof e.rounds_n === 'number' ||
    typeof detail.rounds_played === 'number' ||
    (typeof detail.practice_rounds === 'number' && typeof detail.competitive_rounds === 'number') ||
    nSrc > 0;
  if (stampRounds && !hasRounds) e.rounds_n = row.r90 ?? 0;
  return { id: `${row.p}:${index}`, insight_type: row.t, evidence: e };
}

interface ScenarioReport {
  reads: number;
  players: number;
  rungs: Record<LadderRung, number>;
  whatRungs: Record<LadderRung, number>;
  families: Record<string, Record<LadderRung, number>>;
  heldBack: Record<string, number>;
  supported: number;
  testable: number;
  reach: { playersWith5Rounds: number; withObservedOrBetter: number; withObservedOrBetterWhat: number };
  medianTestsPerPlayer: number;
}

function emptyRungs(): Record<LadderRung, number> {
  return Object.fromEntries(LADDER_RUNGS.map((r) => [r, 0])) as Record<LadderRung, number>;
}

export function runScenario(rows: ExportRow[], stampRounds: boolean): ScenarioReport {
  const byPlayer = new Map<string, { rows: SupportRow[]; rt: number }>();
  rows.forEach((r, i) => {
    const bucket = byPlayer.get(r.p) ?? { rows: [], rt: r.rt ?? 0 };
    bucket.rows.push(toSupportRow(r, i, stampRounds));
    byPlayer.set(r.p, bucket);
  });
  const report: ScenarioReport = {
    reads: rows.length,
    players: byPlayer.size,
    rungs: emptyRungs(),
    whatRungs: emptyRungs(),
    families: {},
    heldBack: {},
    supported: 0,
    testable: 0,
    reach: { playersWith5Rounds: 0, withObservedOrBetter: 0, withObservedOrBetterWhat: 0 },
    medianTestsPerPlayer: 0,
  };
  const tests: number[] = [];
  const strong = (r: LadderRung) => r === 'observed' || r === 'seen_repeatedly';
  for (const { rows: playerRows, rt } of byPlayer.values()) {
    const run = evaluatePlayerRun(playerRows);
    tests.push(run.summary.tests_in_run);
    report.supported += run.summary.supported;
    report.testable += run.summary.testable;
    for (const [reason, n] of Object.entries(run.summary.suppressed)) {
      report.heldBack[reason] = (report.heldBack[reason] ?? 0) + n;
    }
    let anyStrong = false;
    let anyStrongWhat = false;
    for (const r of run.rows) {
      report.rungs[r.patch.ladder] += 1;
      report.whatRungs[r.patch.what_ladder] += 1;
      const fam = (report.families[r.family] ??= emptyRungs());
      fam[r.patch.ladder] += 1;
      if (strong(r.patch.ladder)) anyStrong = true;
      if (strong(r.patch.what_ladder)) anyStrongWhat = true;
    }
    if (rt >= 5) {
      report.reach.playersWith5Rounds += 1;
      if (anyStrong) report.reach.withObservedOrBetter += 1;
      if (anyStrongWhat) report.reach.withObservedOrBetterWhat += 1;
    }
  }
  tests.sort((a, b) => a - b);
  report.medianTestsPerPlayer = tests.length ? tests[Math.floor(tests.length / 2)]! : 0;
  return report;
}

const SHORT: Record<LadderRung, string> = {
  seen_repeatedly: 'Seen rep.',
  observed: 'Observed',
  likely: 'Likely',
  working_hypothesis: 'Work. hyp.',
  not_enough_yet: 'Not enough',
};

function table(report: ScenarioReport): string {
  const order = [...LADDER_RUNGS].reverse();
  const lines: string[] = [];
  lines.push(`reads ${report.reads} · players ${report.players} · testable ${report.testable} · BH-supported (q <= 0.10) ${report.supported} · median tests per player ${report.medianTestsPerPlayer}`);
  lines.push('');
  lines.push(`| Family | ${order.map((r) => SHORT[r]).join(' | ')} | Total |`);
  lines.push(`| --- | ${order.map(() => '---:').join(' | ')} | ---: |`);
  const fams = Object.keys(report.families).sort();
  for (const f of fams) {
    const row = report.families[f]!;
    const total = order.reduce((a, r) => a + row[r], 0);
    lines.push(`| ${f} | ${order.map((r) => row[r]).join(' | ')} | ${total} |`);
  }
  lines.push(`| **all (as worded)** | ${order.map((r) => report.rungs[r]).join(' | ')} | ${report.reads} |`);
  lines.push(`| **all (WHAT only)** | ${order.map((r) => report.whatRungs[r]).join(' | ')} | ${report.reads} |`);
  lines.push('');
  lines.push('Held at Not enough yet, first reason:');
  for (const [k, v] of Object.entries(report.heldBack).sort((a, b) => b[1] - a[1])) lines.push(`  ${k}: ${v}`);
  lines.push('');
  lines.push(
    `Reach: ${report.reach.withObservedOrBetter} of ${report.reach.playersWith5Rounds} players with >= 5 countable rounds get an Observed-or-better read as worded; ` +
      `${report.reach.withObservedOrBetterWhat} on the WHAT alone (02 §8 bar: 70%).`,
  );
  return lines.join('\n');
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.input) {
    console.log(HELP);
    process.exit(args.help ? 0 : 1);
  }
  const raw = JSON.parse(readFileSync(args.input!, 'utf8')) as unknown;
  const rows = (Array.isArray(raw) ? raw : []) as ExportRow[];
  const asIs = runScenario(rows, false);
  const stamped = runScenario(rows, true);
  if (args.json) {
    console.log(JSON.stringify({ asIs, roundsStamped: stamped }, null, 2));
    return;
  }
  console.log('## Scenario: as-is (evidence exactly as stored)\n');
  console.log(table(asIs));
  console.log('\n## Scenario: rounds stamped (Slice 0b rounds_n; 90-day countable rounds where a row has none)\n');
  console.log(table(stamped));
}

if (process.argv[1] && /support-backtest\.ts$/.test(process.argv[1])) main();
