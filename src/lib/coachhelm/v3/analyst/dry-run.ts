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
import { buildTeamFactSheets } from './fact-sheet';
import { findNotable, type Notability, type Rule } from './notability';
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

export interface TeamReport {
  team_id: string;
  as_of: string;
  players: number;
  per_player: Array<{
    player_id: string;
    rounds_last10: number;
    rounds_with_shots_logged: number;
    tests_run: number;
    candidates: Array<{ measure_id: string; rules: Rule[]; strokes_per_round: number | null }>;
    good_news: number;
    unremarkable: number;
    not_checked: number;
  }>;
  /** "N players share candidate X", most shared first: the future team read. */
  shared: Array<{ measure_id: string; players: number; player_ids: string[]; rules: Record<Rule, number> }>;
  summary: {
    players_with_candidates: number;
    players_without_candidates: number;
    candidates: number;
    /** How many different measures are a candidate for at least one player. */
    distinct_candidate_kinds: number;
    most_common: { measure_id: string; players: number; share_of_players: number } | null;
    rules_fired: Record<Rule, number>;
  };
}

const noRules = (): Record<Rule, number> => ({ changed: 0, stands_out_in_team: 0, biggest_cost: 0 });

/** The team-level read of the players' candidates. Pure. */
export function teamReport(teamId: string, reads: readonly PlayerRead[]): TeamReport {
  const shared = new Map<string, { player_ids: string[]; rules: Record<Rule, number> }>();
  const fired = noRules();
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
    return {
      player_id: sheet.player_id,
      rounds_last10: sheet.windows.last10.rounds,
      rounds_with_shots_logged: sheet.strokes_gained_by_round.filter((r) => r.measured).length,
      tests_run: notability.tests.run,
      candidates,
      good_news: notability.good_news.length,
      unremarkable: notability.unremarkable.length,
      not_checked: notability.not_checked.length,
    };
  });
  const sharedList = [...shared]
    .map(([measure_id, v]) => ({ measure_id, players: v.player_ids.length, player_ids: [...v.player_ids].sort(), rules: v.rules }))
    .sort((a, b) => b.players - a.players || a.measure_id.localeCompare(b.measure_id));
  const top = sharedList[0];
  const withCandidates = perPlayer.filter((p) => p.candidates.length > 0).length;
  return {
    team_id: teamId,
    as_of: reads[0]?.sheet.as_of ?? '',
    players: reads.length,
    per_player: perPlayer,
    shared: sharedList,
    summary: {
      players_with_candidates: withCandidates,
      players_without_candidates: reads.length - withCandidates,
      candidates: perPlayer.reduce((a, p) => a + p.candidates.length, 0),
      distinct_candidate_kinds: sharedList.length,
      most_common: top ? { measure_id: top.measure_id, players: top.players, share_of_players: reads.length ? Math.round((top.players / reads.length) * 1000) / 1000 : 0 } : null,
      rules_fired: fired,
    },
  };
}

const RULE_LETTER: Record<Rule, string> = { changed: 'a changed', stands_out_in_team: 'b stands out', biggest_cost: 'c biggest cost' };

/** The short table: per player, how many candidates and which rule fired; then what the team shares. Plain text, ids only. */
export function reportTable(report: TeamReport): string {
  const lines: string[] = [];
  lines.push(`Team ${report.team_id}, as of ${report.as_of}: ${report.players} active players`);
  lines.push('');
  lines.push('player    rounds  with shots  tests  candidates');
  for (const p of report.per_player) {
    const what = p.candidates.length ? p.candidates.map((c) => `${c.measure_id} [${c.rules.map((r) => RULE_LETTER[r]).join(', ')}]`).join('; ') : 'none';
    lines.push(`${p.player_id.slice(0, 8)}  ${String(p.rounds_last10).padStart(6)}  ${String(p.rounds_with_shots_logged).padStart(10)}  ${String(p.tests_run).padStart(5)}  ${p.candidates.length}: ${what}`);
  }
  lines.push('');
  if (report.shared.length === 0) lines.push('No player has a candidate.');
  for (const s of report.shared) lines.push(`${s.players} ${s.players === 1 ? 'player has' : 'players share'} candidate ${s.measure_id}`);
  lines.push('');
  const { summary } = report;
  lines.push(`Players with a candidate: ${summary.players_with_candidates} of ${report.players}. Candidates in all: ${summary.candidates}.`);
  lines.push(`Distinct candidate kinds across the team: ${summary.distinct_candidate_kinds}.`);
  lines.push(
    summary.most_common
      ? `Most common: ${summary.most_common.measure_id}, ${summary.most_common.players} of ${report.players} players (${Math.round(summary.most_common.share_of_players * 100)}%).`
      : 'Most common: none.',
  );
  lines.push(`Rules fired: changed ${summary.rules_fired.changed}, stands out in the team ${summary.rules_fired.stands_out_in_team}, biggest cost ${summary.rules_fired.biggest_cost}.`);
  return lines.join('\n');
}

/** Builds every active player's fact sheet and candidates for one team, and the team's report. Reads only. */
export async function runAnalystDryRun(sources: AnalystSources, opts: { teamId: string; now: Date }): Promise<{ report: TeamReport; players: PlayerRead[] }> {
  const sheets = await buildTeamFactSheets(sources, opts);
  const players = sheets.map((sheet) => ({ sheet, notability: findNotable(sheet) }));
  return { report: teamReport(opts.teamId, players), players };
}
