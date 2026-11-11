/**
 * CoachHelm analyst: the dry run's logic, apart from the script that calls it
 * (`scripts/coachhelm/analyst-dry-run.ts`) so it is proven with fixtures.
 *
 * For one team: every active player's fact sheet and candidates, and the team-level read of them: how many players
 * share each candidate (the future team read), how many distinct kinds of candidate the team has, and what share of
 * players share the most common one. Those last two are the numbers to set beside today's engine (716 visible insights
 * from 24 title shapes; 91% of players carrying the same approach card).
 *
 * Read-only, and it refuses production: the target comes from explicit flags, never from an env file.
 * No names are read or printed, only ids.
 */
import { benjaminiHochberg } from '@/lib/coachhelm/v3/support/multiplicity';
import { assembleFactSheets, loadTeamRows } from './fact-sheet';
import { STROKES_GAINED_AREA_IDS } from './measures';
import { FALSE_DISCOVERY_RATE, findNotable, type Certainty, type Notability, type Priority, type Rule, type TestRecord } from './notability';
import { comparePuttDefinitions, type PuttDefinitionCount } from './putt-definitions';
import type { AnalystSources } from './sources';
import type { FactSheet } from './types';

/** The one production Supabase project (AGENTS.md "Database"). The dry run never runs against it. */
export const PRODUCTION_PROJECT_REF = 'qmnssrrolpinvwjjnufo';

export const DRY_RUN_USAGE = `analyst-dry-run: fact sheets and candidates for one team. Read-only.

  --url <url>                 the Supabase project to read (required; refused when it is production)
  --service-key-env <NAME>    the NAME of the environment variable holding the service key (required; the key is never printed)
  --team <uuid>               the team to read (required)
  --out <file>                write the full JSON (every sheet and its candidates) here; without it only the summary is printed
  --as-of <YYYY-MM-DD>        the day the run is for (default: today)
  --help                      this text

No env file is loaded. Nothing is written to any database.`;

export interface DryRunArgs {
  url: string | null;
  serviceKeyEnv: string | null;
  team: string | null;
  out: string | null;
  asOf: string | null;
  help: boolean;
}

export function parseDryRunArgs(argv: readonly string[]): DryRunArgs {
  const args: DryRunArgs = { url: null, serviceKeyEnv: null, team: null, out: null, asOf: null, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = (): string | null => argv[++i] ?? null;
    if (a === '--help' || a === '-h') args.help = true;
    else if (a === '--url') args.url = next();
    else if (a === '--service-key-env') args.serviceKeyEnv = next();
    else if (a === '--team') args.team = next();
    else if (a === '--out') args.out = next();
    else if (a === '--as-of') args.asOf = next();
    else throw new Error(`unknown argument: ${a}`);
  }
  return args;
}

/** The project a Supabase JWT key was issued for (its `ref` claim); null for a key that is not a JWT. The key itself is never returned. */
export function projectRefOfKey(key: string): string | null {
  const payload = key.split('.')[1];
  if (!payload) return null;
  try {
    const json = JSON.parse(Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')) as { ref?: unknown };
    return typeof json.ref === 'string' ? json.ref : null;
  } catch {
    return null;
  }
}

/**
 * Why this target must not be read, or null when it may be. Production is refused on the URL and, where the key is a
 * JWT, on the project the key was issued for, so a production key behind another host name is refused too.
 */
export function refusal(url: string, key: string | undefined): string | null {
  if (!/^https?:\/\//i.test(url)) return 'the --url must start with http:// or https://';
  if (url.toLowerCase().includes(PRODUCTION_PROJECT_REF)) return 'the --url is the production project: the dry run never reads production';
  if (!key) return 'the environment variable named by --service-key-env is not set';
  if (projectRefOfKey(key) === PRODUCTION_PROJECT_REF) return 'the service key was issued for the production project: the dry run never reads production';
  return null;
}

/** The args as a run can use them, or the reason it cannot start. */
export function checkDryRunArgs(args: DryRunArgs, env: Record<string, string | undefined>): { ok: true; url: string; key: string; team: string; out: string | null; now: Date } | { ok: false; why: string } {
  if (!args.url || !args.serviceKeyEnv || !args.team) return { ok: false, why: '--url, --service-key-env and --team are all required' };
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(args.team)) return { ok: false, why: '--team must be a team id (uuid)' };
  const key = env[args.serviceKeyEnv];
  const why = refusal(args.url, key);
  if (why || !key) return { ok: false, why: why ?? 'no service key' };
  let now = new Date();
  if (args.asOf) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(args.asOf) || Number.isNaN(new Date(`${args.asOf}T12:00:00Z`).getTime())) return { ok: false, why: '--as-of must be a day, YYYY-MM-DD' };
    now = new Date(`${args.asOf}T12:00:00Z`);
  }
  return { ok: true, url: args.url, key, team: args.team, out: args.out, now };
}

export interface PlayerRead {
  sheet: FactSheet;
  notability: Notability;
}

/**
 * PROPOSED, NOT APPLIED. A smaller family of tests declared before looking: the four strokes-gained areas and the
 * scoring average. The dry run shows what would be supported if the correction for many tests ran over these alone,
 * beside what the full family supports today.
 */
export const PROPOSED_FAMILY: readonly string[] = [...STROKES_GAINED_AREA_IDS, 'scoring_average'];

export interface WouldFire {
  player_id: string;
  measure_id: string;
  rule: Rule;
  verdict: 'worse' | 'better';
  p_value: number;
  /** Benjamini-Hochberg adjusted within the proposed family. */
  q_value: number;
}

export interface TeamReport {
  team_id: string;
  as_of: string;
  players: number;
  per_player: Array<{
    player_id: string;
    rounds_last10: number;
    rounds_previous10: number | null;
    rounds_season: number;
    rounds_with_shots_logged: number;
    measured_rounds_season: number;
    tests_run: number;
    tests_by_rule: Record<Rule, number>;
    /** The signal tier. */
    candidates: Array<{ measure_id: string; rules: Rule[]; strokes_per_round: number | null }>;
    /** The priority tier: one per player with enough measured rounds this season. */
    priority: {
      measure_id: string;
      certainty: Certainty;
      strokes_per_round: number;
      low: number;
      high: number;
      rounds: number;
      same_as_team: boolean | null;
      vs_team: 'better' | 'same' | 'worse' | null;
      vs_team_difference: number | null;
      /** One level down: the band and the counted pattern. */
      finding: 'band' | 'spread_evenly' | 'not_traced';
      band: string | null;
      band_shots: number | null;
      /** The pattern the table prints: the lead miss side when traced, else the band's first traced pattern. */
      pattern: { id: string; value: number; count: number; of: number; unit: 'percent' | 'feet'; team_median: number | null; differs_from_team: boolean; scope: 'band' | 'area' } | null;
      signature: string;
    } | null;
    /** The same golf under another player id has the same fingerprint (staging holds cloned players). */
    data_fingerprint: string;
    priority_missing: string | null;
    good_news: number;
    /** The measures behind `good_news`: supported reads in the player's favor. */
    good_news_measures: string[];
    unremarkable: number;
    not_checked: number;
  }>;
  /** "N players share candidate X", most shared first: the future team read. */
  shared: Array<{ measure_id: string; players: number; player_ids: string[]; rules: Record<Rule, number> }>;
  /** "N players share priority X", with how sure each is and how they sit against the team. */
  shared_priority: Array<{ measure_id: string; players: number; certainty: Record<Certainty, number>; vs_team: { better: number; same: number; worse: number } }>;
  summary: {
    players_with_candidates: number;
    players_without_candidates: number;
    candidates: number;
    /** How many different measures are a candidate for at least one player. */
    distinct_candidate_kinds: number;
    most_common: { measure_id: string; players: number; share_of_players: number } | null;
    rules_fired: Record<Rule, number>;
    players_with_priority: number;
    players_with_neither: number;
    distinct_priority_kinds: number;
    most_common_priority: { measure_id: string; players: number; share_of_players: number } | null;
    priority_certainty: Record<Certainty, number>;
  };
  /** Rule (c), over the season: players tested, both ranges passing, supported after the correction. */
  biggest_cost: { tested: number; passes_ranges: number; supported: number };
  /**
   * How many players' priorities differ from every teammate's at band-plus-pattern level (area, band, lead miss side).
   * `deduplicated` counts players with identical rounds once.
   */
  distinctness: {
    players_with_priority: number;
    named_band: number;
    spread_evenly: number;
    not_traced: number;
    /** Reported only: how many would have a band named on the plain 95% range, without widening for the bands compared. */
    named_without_widening: number;
    /** Priorities whose lead pattern sits clear of the teammates' median. */
    lead_differs_from_team: number;
    distinct_from_every_teammate: number;
    deduplicated: { players: number; distinct_from_every_teammate: number };
    signatures: Array<{ signature: string; players: number }>;
  };
  /** Why rule (a) does or does not fire: how many tests a player's run holds, and the p-values before any correction. */
  changed: {
    players_with_previous_window: number;
    /** Rule (a) tests per player, and every rule's tests per player (the family the correction runs over). */
    tests_per_player: { min: number; median: number; max: number };
    family_per_player: { min: number; median: number; max: number };
    /** The smallest p a single test needs to be supported alone in a family of the median size: q / m. */
    p_needed_alone: number | null;
    /** Rule (a) p-values before correction, in bins. With no real change about 5% fall under 0.05. */
    p_values: { tests: number; under_0_001: number; under_0_01: number; under_0_05: number; under_0_10: number; under_0_50: number; from_0_50: number };
    range_excludes_zero: number;
    supported: number;
    /** Each player's smallest rule (a) p, smallest first. */
    smallest_p: Array<{ player_id: string; measure_id: string; p_value: number; q_value: number; tests: number }>;
    proposed_family: {
      measures: readonly string[];
      /** Rule (a) on the proposed measures, corrected among themselves. */
      rule_a_alone: { tests: number; would_fire: WouldFire[] };
      /** Rules (a), (b) and (c) on the proposed measures, corrected together. */
      all_rules: { tests: number; would_fire: WouldFire[] };
    };
  };
  /** Finding: the app's two make-rate definitions, counted over every shot this run read. */
  putt_definitions: PuttDefinitionCount | null;
}

const noRules = (): Record<Rule, number> => ({ changed: 0, stands_out_in_team: 0, biggest_cost: 0 });
const noCertainty = (): Record<Certainty, number> => ({ clear: 0, likely: 0, leaning: 0 });

function spreadOf(values: readonly number[]): { min: number; median: number; max: number } {
  if (values.length === 0) return { min: 0, median: 0, max: 0 };
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return { min: s[0]!, median: s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2, max: s[s.length - 1]! };
}

const share = (n: number, of: number): number => (of ? Math.round((n / of) * 1000) / 1000 : 0);

/**
 * A short key of a player's season (round dates, stored strokes gained, and the shots and strokes of every band):
 * equal for the same golf under two player ids, different as soon as one shot differs in a way a band can see.
 */
function fingerprintOf(sheet: FactSheet): string {
  const text = JSON.stringify([
    sheet.windows.season.rounds,
    // Sorted by content: two rounds on one day are ordered by round id, and a clone's ids differ.
    sheet.strokes_gained_by_round_season.map((r) => JSON.stringify([r.date, r.total, r.approach, r.putting])).sort(),
    sheet.breakdowns.map((a) => a.bands.map((b) => [b.shots, b.strokes_gained_per_round?.value ?? null])),
  ]);
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) >>> 0;
  return h.toString(16).padStart(8, '0');
}

/** The pattern the table prints for a priority: the lead miss side, else the band's first traced pattern. */
function printedPattern(p: Priority): NonNullable<TeamReport['per_player'][number]['priority']>['pattern'] {
  const pick = p.where.lead_pattern;
  return pick && pick.value != null
    ? { id: pick.id, value: pick.value, count: pick.count, of: pick.of, unit: pick.unit, team_median: pick.team?.median ?? null, differs_from_team: pick.differs_from_team, scope: p.where.patterns_scope }
    : null;
}

function distinctnessOf(rows: ReadonlyArray<{ signature: string; fingerprint: string; finding: string; plain: boolean; differs: boolean }>): TeamReport['distinctness'] {
  const count = (list: ReadonlyArray<{ signature: string }>) => {
    const n = new Map<string, number>();
    for (const r of list) n.set(r.signature, (n.get(r.signature) ?? 0) + 1);
    return n;
  };
  const all = count(rows);
  const unique = [...new Map(rows.map((r) => [r.fingerprint, r])).values()];
  const dedup = count(unique);
  return {
    players_with_priority: rows.length,
    named_band: rows.filter((r) => r.finding === 'band').length,
    spread_evenly: rows.filter((r) => r.finding === 'spread_evenly').length,
    not_traced: rows.filter((r) => r.finding === 'not_traced').length,
    named_without_widening: rows.filter((r) => r.plain).length,
    lead_differs_from_team: rows.filter((r) => r.differs).length,
    // A priority that could not be traced one level down says nothing a teammate's does not: it is never distinct.
    distinct_from_every_teammate: rows.filter((r) => r.finding !== 'not_traced' && all.get(r.signature) === 1).length,
    deduplicated: { players: unique.length, distinct_from_every_teammate: unique.filter((r) => r.finding !== 'not_traced' && dedup.get(r.signature) === 1).length },
    signatures: [...all].map(([signature, players]) => ({ signature, players })).sort((a, b) => b.players - a.players || a.signature.localeCompare(b.signature)),
  };
}

/** What a family of test records would support if the correction ran over them alone. */
function wouldFire(playerId: string, records: readonly TestRecord[]): WouldFire[] {
  const bh = benjaminiHochberg(records.map((r) => r.p_value), FALSE_DISCOVERY_RATE);
  return records.flatMap((r, i) =>
    bh.rejected[i] && r.range_excludes_zero && r.also_holds
      ? [{ player_id: playerId, measure_id: r.measure_id, rule: r.rule, verdict: r.verdict, p_value: r.p_value, q_value: Math.round((bh.qAdj[i] ?? 1) * 1e4) / 1e4 }]
      : [],
  );
}

function changedDiagnosis(reads: readonly PlayerRead[]): TeamReport['changed'] {
  const perPlayer = reads.map(({ sheet, notability }) => ({ id: sheet.player_id, log: notability.test_log, changed: notability.test_log.filter((t) => t.rule === 'changed') }));
  const ps = perPlayer.flatMap((p) => p.changed.map((t) => t.p_value));
  const between = (lo: number, hi: number) => ps.filter((p) => p >= lo && p < hi).length;
  const family = spreadOf(perPlayer.map((p) => p.log.length));
  const inFamily = (t: TestRecord) => PROPOSED_FAMILY.includes(t.measure_id);
  const alone = perPlayer.map((p) => ({ id: p.id, records: p.changed.filter(inFamily) }));
  const all = perPlayer.map((p) => ({ id: p.id, records: p.log.filter(inFamily) }));
  return {
    players_with_previous_window: reads.filter((r) => r.sheet.windows.previous10 != null).length,
    tests_per_player: spreadOf(perPlayer.map((p) => p.changed.length)),
    family_per_player: family,
    p_needed_alone: family.median > 0 ? FALSE_DISCOVERY_RATE / family.median : null,
    p_values: { tests: ps.length, under_0_001: between(0, 0.001), under_0_01: between(0.001, 0.01), under_0_05: between(0.01, 0.05), under_0_10: between(0.05, 0.1), under_0_50: between(0.1, 0.5), from_0_50: between(0.5, Infinity) },
    range_excludes_zero: perPlayer.reduce((a, p) => a + p.changed.filter((t) => t.range_excludes_zero).length, 0),
    supported: perPlayer.reduce((a, p) => a + p.changed.filter((t) => t.supported).length, 0),
    smallest_p: perPlayer
      .flatMap((p) => {
        const best = [...p.changed].sort((a, b) => a.p_value - b.p_value)[0];
        return best ? [{ player_id: p.id, measure_id: best.measure_id, p_value: best.p_value, q_value: best.q_value, tests: p.log.length }] : [];
      })
      .sort((a, b) => a.p_value - b.p_value),
    proposed_family: {
      measures: PROPOSED_FAMILY,
      rule_a_alone: { tests: alone.reduce((a, p) => a + p.records.length, 0), would_fire: alone.flatMap((p) => wouldFire(p.id, p.records)) },
      all_rules: { tests: all.reduce((a, p) => a + p.records.length, 0), would_fire: all.flatMap((p) => wouldFire(p.id, p.records)) },
    },
  };
}

/** The team-level read of the players' candidates and priorities. Pure. */
export function teamReport(teamId: string, reads: readonly PlayerRead[], puttDefinitions: PuttDefinitionCount | null = null): TeamReport {
  const shared = new Map<string, { player_ids: string[]; rules: Record<Rule, number> }>();
  const sharedPriority = new Map<string, { players: number; certainty: Record<Certainty, number>; vs_team: { better: number; same: number; worse: number } }>();
  const fired = noRules();
  const certainty = noCertainty();
  const perPlayer = reads.map(({ sheet, notability }) => {
    const candidates = notability.candidates.map((c) => {
      const rules = [...new Set(c.reasons.filter((r) => r.verdict === 'worse').map((r) => r.rule))];
      const entry = shared.get(c.measure_id) ?? { player_ids: [], rules: noRules() };
      entry.player_ids.push(sheet.player_id);
      for (const rule of rules) {
        entry.rules[rule] += 1;
        fired[rule] += 1;
      }
      shared.set(c.measure_id, entry);
      return { measure_id: c.measure_id, rules, strokes_per_round: c.strokes_at_stake?.per_round ?? null };
    });
    const p = notability.priority;
    if (p) {
      const entry = sharedPriority.get(p.measure_id) ?? { players: 0, certainty: noCertainty(), vs_team: { better: 0, same: 0, worse: 0 } };
      entry.players += 1;
      entry.certainty[p.certainty] += 1;
      if (p.team_shape) entry.vs_team[p.team_shape.player_vs_team.verdict] += 1;
      certainty[p.certainty] += 1;
      sharedPriority.set(p.measure_id, entry);
    }
    const byRule = noRules();
    for (const t of notability.test_log) byRule[t.rule] += 1;
    return {
      player_id: sheet.player_id,
      rounds_last10: sheet.windows.last10.rounds,
      rounds_previous10: sheet.windows.previous10?.rounds ?? null,
      rounds_season: sheet.windows.season.rounds,
      rounds_with_shots_logged: sheet.strokes_gained_by_round.filter((r) => r.measured).length,
      measured_rounds_season: sheet.strokes_gained_by_round_season.filter((r) => r.measured).length,
      tests_run: notability.tests.run,
      tests_by_rule: byRule,
      candidates,
      priority: p
        ? {
            measure_id: p.measure_id,
            certainty: p.certainty,
            strokes_per_round: p.strokes_per_round.value,
            low: p.strokes_per_round.low,
            high: p.strokes_per_round.high,
            rounds: p.rounds,
            same_as_team: p.team_shape?.same_as_team ?? null,
            vs_team: p.team_shape?.player_vs_team.verdict ?? null,
            vs_team_difference: p.team_shape?.player_vs_team.difference ?? null,
            finding: p.where.finding,
            band: p.where.band?.band ?? null,
            band_shots: p.where.band?.shots ?? null,
            pattern: printedPattern(p),
            signature: p.where.signature,
          }
        : null,
      data_fingerprint: fingerprintOf(sheet),
      priority_missing: notability.priority_missing,
      good_news: notability.good_news.length,
      good_news_measures: notability.good_news.map((g) => g.measure_id),
      unremarkable: notability.unremarkable.length,
      not_checked: notability.not_checked.length,
    };
  });
  const sharedList = [...shared]
    .map(([measure_id, v]) => ({ measure_id, players: v.player_ids.length, player_ids: [...v.player_ids].sort(), rules: v.rules }))
    .sort((a, b) => b.players - a.players || a.measure_id.localeCompare(b.measure_id));
  const priorityList = [...sharedPriority].map(([measure_id, v]) => ({ measure_id, ...v })).sort((a, b) => b.players - a.players || a.measure_id.localeCompare(b.measure_id));
  const top = sharedList[0];
  const topPriority = priorityList[0];
  const withCandidates = perPlayer.filter((p) => p.candidates.length > 0).length;
  const costLog = reads.flatMap((r) => r.notability.test_log.filter((t) => t.rule === 'biggest_cost'));
  return {
    team_id: teamId,
    as_of: reads[0]?.sheet.as_of ?? '',
    players: reads.length,
    per_player: perPlayer,
    shared: sharedList,
    shared_priority: priorityList,
    summary: {
      players_with_candidates: withCandidates,
      players_without_candidates: reads.length - withCandidates,
      candidates: perPlayer.reduce((a, p) => a + p.candidates.length, 0),
      distinct_candidate_kinds: sharedList.length,
      most_common: top ? { measure_id: top.measure_id, players: top.players, share_of_players: share(top.players, reads.length) } : null,
      rules_fired: fired,
      players_with_priority: perPlayer.filter((p) => p.priority).length,
      players_with_neither: perPlayer.filter((p) => !p.priority && p.candidates.length === 0).length,
      distinct_priority_kinds: priorityList.length,
      most_common_priority: topPriority ? { measure_id: topPriority.measure_id, players: topPriority.players, share_of_players: share(topPriority.players, reads.length) } : null,
      priority_certainty: certainty,
    },
    biggest_cost: { tested: costLog.length, passes_ranges: costLog.filter((t) => t.range_excludes_zero && t.also_holds).length, supported: costLog.filter((t) => t.supported).length },
    distinctness: distinctnessOf(
      reads.flatMap(({ sheet, notability }) => {
        const w = notability.priority?.where;
        return w ? [{ signature: w.signature, fingerprint: fingerprintOf(sheet), finding: w.finding, plain: w.band?.separated_without_widening === true, differs: w.lead_pattern?.differs_from_team === true }] : [];
      }),
    ),
    changed: changedDiagnosis(reads),
    putt_definitions: puttDefinitions,
  };
}

const RULE_LETTER: Record<Rule, string> = { changed: 'a changed', stands_out_in_team: 'b stands out', biggest_cost: 'c biggest cost' };
const short = (id: string): string => id.replace('strokes_gained_', '');
const p3 = (p: number): string => (p < 0.001 ? p.toExponential(1) : p.toFixed(3));

/** The short table: per player, the priority with its certainty and the signals with the rule that fired; then what the team shares. Plain text, ids only. */
export function reportTable(report: TeamReport): string {
  const lines: string[] = [];
  lines.push(`Team ${report.team_id}, as of ${report.as_of}: ${report.players} active players`);
  lines.push('');
  lines.push('player    rounds 10/prev/season  shots 10/season  tests a/b/c  priority: area certainty strokes a round lost (95% range, rounds) > band: counted pattern; against the team | signals');
  for (const p of report.per_player) {
    const rounds = `${p.rounds_last10}/${p.rounds_previous10 ?? '-'}/${p.rounds_season}`;
    const shots = `${p.rounds_with_shots_logged}/${p.measured_rounds_season}`;
    const tests = `${p.tests_by_rule.changed}/${p.tests_by_rule.stands_out_in_team}/${p.tests_by_rule.biggest_cost}`;
    const pr = p.priority;
    const gap = Math.abs(pr?.vs_team_difference ?? 0).toFixed(2);
    const againstTeam = !pr?.vs_team
      ? ''
      : `; ${pr.same_as_team ? "team's worst area too" : "not the team's worst area"}, ${pr.vs_team === 'same' ? `not told apart from the team median (${gap} ${(pr.vs_team_difference ?? 0) < 0 ? 'worse' : 'better'})` : `${pr.vs_team} than the team median by ${gap}`}`;
    const pat = pr?.pattern;
    const pattern = !pr ? '' : pat ? `${pat.id} ${pat.unit === 'percent' ? `${Math.round(pat.value)}% (${pat.count} of ${pat.of})` : `${pat.value.toFixed(1)} ft (${pat.count})`}${pat.team_median != null ? `, team ${pat.unit === 'percent' ? `${Math.round(pat.team_median)}%` : `${pat.team_median.toFixed(1)} ft`}${pat.differs_from_team ? ' DIFFERS' : ''}` : ''}` : 'pattern not traced';
    const where = !pr ? '' : pr.finding === 'band' ? `${pr.band} (${pr.band_shots} shots): ${pattern}` : pr.finding === 'spread_evenly' ? `spread evenly (largest so far ${pr.band}); whole area: ${pattern}` : 'band not traced';
    const priority = pr
      ? `${short(pr.measure_id)} ${pr.certainty} ${pr.strokes_per_round.toFixed(2)} (${pr.low.toFixed(2)} to ${pr.high.toFixed(2)}, ${pr.rounds} rounds) > ${where}${againstTeam}`
      : `none: ${p.priority_missing}`;
    const signals = p.candidates.length ? p.candidates.map((c) => `${c.measure_id} [${c.rules.map((r) => RULE_LETTER[r]).join(', ')}]`).join('; ') : 'none';
    lines.push(`${p.player_id.slice(0, 8).padEnd(8)}  ${rounds.padStart(21)}  ${shots.padStart(15)}  ${tests.padStart(11)}  ${priority} | ${signals}`);
  }
  lines.push('');
  lines.push('PRIORITY (where the strokes go this season; one per player with enough measured rounds)');
  if (report.shared_priority.length === 0) lines.push('No player has a priority.');
  for (const s of report.shared_priority) {
    lines.push(
      `${s.players} ${s.players === 1 ? 'player has' : 'players share'} priority ${s.measure_id}: ${s.certainty.clear} clear, ${s.certainty.likely} likely, ${s.certainty.leaning} leaning; against the team median ${s.vs_team.worse} worse, ${s.vs_team.same} same, ${s.vs_team.better} better`,
    );
  }
  const { summary } = report;
  lines.push(`Players with a priority: ${summary.players_with_priority} of ${report.players} (${summary.priority_certainty.clear} clear, ${summary.priority_certainty.likely} likely, ${summary.priority_certainty.leaning} leaning). With neither a priority nor a signal: ${summary.players_with_neither}.`);
  const dx = report.distinctness;
  lines.push(`One level down: a band is named for ${dx.named_band}, the loss is spread evenly for ${dx.spread_evenly}, not traced for ${dx.not_traced}. (On the plain 95% range, not widened for the bands compared, a band would be named for ${dx.named_without_widening}.)`);
  lines.push(`Lead pattern sits clear of the teammates' median for ${dx.lead_differs_from_team} of ${dx.players_with_priority}.`);
  lines.push(`Priority differs from every teammate's at band-plus-pattern level: ${dx.distinct_from_every_teammate} of ${dx.players_with_priority}. Counting players with identical rounds once: ${dx.deduplicated.distinct_from_every_teammate} of ${dx.deduplicated.players}.`);
  for (const sig of dx.signatures.filter((x) => x.players > 1)) lines.push(`  shared by ${sig.players}: ${sig.signature}`);
  lines.push('');
  lines.push('SIGNALS (something unusual about the player that cleared a test)');
  if (report.shared.length === 0) lines.push('No player has a candidate.');
  for (const s of report.shared) lines.push(`${s.players} ${s.players === 1 ? 'player has' : 'players share'} candidate ${s.measure_id}`);
  lines.push(`Players with a candidate: ${summary.players_with_candidates} of ${report.players}. Candidates in all: ${summary.candidates}.`);
  lines.push(`Distinct candidate kinds across the team: ${summary.distinct_candidate_kinds}.`);
  lines.push(
    summary.most_common
      ? `Most common: ${summary.most_common.measure_id}, ${summary.most_common.players} of ${report.players} players (${Math.round(summary.most_common.share_of_players * 100)}%).`
      : 'Most common: none.',
  );
  lines.push(`Rules fired: changed ${summary.rules_fired.changed}, stands out in the team ${summary.rules_fired.stands_out_in_team}, biggest cost ${summary.rules_fired.biggest_cost}.`);
  const good = report.per_player.filter((p) => p.good_news > 0);
  lines.push(`Good news (supported, in the player's favor, never a candidate): ${good.length ? good.map((p) => `${p.player_id.slice(0, 8)} ${p.good_news_measures.join(', ')}`).join('; ') : 'none'}.`);
  lines.push('');
  const cost = report.biggest_cost;
  lines.push(`RULE (c) BIGGEST COST, over the season: tested for ${cost.tested} players, both ranges pass for ${cost.passes_ranges}, supported after correction for ${cost.supported}.`);
  lines.push('');
  const ch = report.changed;
  lines.push('RULE (a) CHANGED, before correction');
  lines.push(`Players with a previous window: ${ch.players_with_previous_window} of ${report.players}. Rule (a) tests per player: ${ch.tests_per_player.min} to ${ch.tests_per_player.max}, median ${ch.tests_per_player.median}. All tests per player (the family corrected over): ${ch.family_per_player.min} to ${ch.family_per_player.max}, median ${ch.family_per_player.median}.`);
  const pv = ch.p_values;
  lines.push(`p-values of the ${pv.tests} rule (a) tests: under 0.001: ${pv.under_0_001}; 0.001 to 0.01: ${pv.under_0_01}; 0.01 to 0.05: ${pv.under_0_05}; 0.05 to 0.10: ${pv.under_0_10}; 0.10 to 0.50: ${pv.under_0_50}; 0.50 and over: ${pv.from_0_50}.`);
  lines.push(`Range excludes zero: ${ch.range_excludes_zero}. Supported after correction: ${ch.supported}.${ch.p_needed_alone ? ` A lone test needs p under ${p3(ch.p_needed_alone)} in a family of the median size.` : ''}`);
  for (const s of ch.smallest_p.slice(0, 5)) lines.push(`  smallest: ${s.player_id.slice(0, 8)} ${s.measure_id} p ${p3(s.p_value)}, after correction ${p3(s.q_value)} (${s.tests} tests)`);
  const fam = ch.proposed_family;
  const fires = (list: WouldFire[]) => (list.length ? list.map((w) => `${w.player_id.slice(0, 8)} ${short(w.measure_id)} ${w.rule} ${w.verdict} p ${p3(w.p_value)} q ${p3(w.q_value)}`).join('; ') : 'nothing');
  lines.push(`PROPOSED, NOT APPLIED: correct over ${fam.measures.map(short).join(', ')} only.`);
  lines.push(`  Rule (a) alone, ${fam.rule_a_alone.tests} tests: ${fam.rule_a_alone.would_fire.length} would be supported: ${fires(fam.rule_a_alone.would_fire)}`);
  lines.push(`  Rules (a), (b), (c) together, ${fam.all_rules.tests} tests: ${fam.all_rules.would_fire.length} would be supported: ${fires(fam.all_rules.would_fire)}`);
  if (report.putt_definitions) {
    const d = report.putt_definitions;
    lines.push('');
    lines.push('THE TWO MAKE-RATE DEFINITIONS (the one definition against the Clubhouse Stats loader)');
    lines.push(`${d.putts} putts read: ${d.agree} agree; ${d.different_band} in different bands; ${d.different_result} made under one and missed under the other; ${d.only_the_one_definition} counted only by the one definition; ${d.only_clubhouse} only by the Clubhouse loader.`);
    for (const b of d.bands) lines.push(`  ${b.band.padEnd(8)} one definition ${b.one_definition.made}/${b.one_definition.attempts}   Clubhouse ${b.clubhouse.made}/${b.clubhouse.attempts}`);
  }
  return lines.join('\n');
}

/** Builds every active player's fact sheet and candidates for one team, and the team's report. Reads only. */
export async function runAnalystDryRun(sources: AnalystSources, opts: { teamId: string; now: Date }): Promise<{ report: TeamReport; players: PlayerRead[] }> {
  const rows = await loadTeamRows(sources, opts);
  const players = assembleFactSheets(rows).map((sheet) => ({ sheet, notability: findNotable(sheet) }));
  return { report: teamReport(opts.teamId, players, comparePuttDefinitions(rows.shots)), players };
}
