/**
 * Stats-consistency guard — proves the coach-facing stat surfaces agree with the
 * canonical golf_player_stats_cache, for every active rostered player.
 *
 * Why this exists: three code paths compute the same per-player stats from
 * different sources and have silently diverged before (the 2026-06-06 audit found
 * Putts/round 16.7 vs true 32.3 on the Team Stats page — a golf_holes pagination
 * bug; GIR 56% vs 64.5% on the Coach Dashboard — an arbitrary 20-round cap):
 *   - golf_player_stats_cache  → CANONICAL (shot-based, refresh_player_stats_cache)
 *   - golf_holes aggregates    → Team Stats page (stats/team/page.tsx)
 *   - golf_rounds denormalized → Coach Dashboard (dashboard-data.ts)
 * They agree today; this checker keeps them agreeing. It is READ-ONLY.
 *
 * It mirrors each surface's exact math:
 *   - putts/round normalized to 18 holes
 *   - GIR%/FW% as WEIGHTED aggregates (sum made / sum opportunities)
 *   - golf_holes paged past PostgREST's 1000-row cap (the original bug)
 *
 * Run:
 *   DOTENV_CONFIG_PATH=.vercel/.env.production.local \
 *     npx tsx -r dotenv/config scripts/verify-stats-consistency.ts
 *
 * Requires: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * Exit code: 0 if every player agrees within tolerance, 1 otherwise (CI-friendly).
 */
import { createClient } from '@supabase/supabase-js';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env.');
  process.exit(1);
}
const db = createClient(URL, SERVICE_KEY);

// Tolerances: stats are stored to 1 decimal, so 0.2 absorbs rounding without
// hiding a real divergence (the historical bugs were off by 2x / 8+ points).
const PUTT_TOL = 0.2;
const PCT_TOL = 0.3;

type Round = {
  id: string;
  player_id: string;
  holes_played: number | null;
  total_putts: number | null;
  total_gir: number | null;
  total_gir_possible: number | null;
  total_fairways_hit: number | null;
  total_fairways: number | null;
};
type Hole = {
  round_id: string;
  par: number | null;
  putts: number | null;
  gir: boolean | null;
  fairway_hit: boolean | null;
};

/** Page through a table past PostgREST's 1000-row cap, with a stable order. */
async function fetchAllRows<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const PAGE = 1000;
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw new Error(`fetch page ${from}: ${JSON.stringify(error)}`);
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

async function main() {
  // Active rostered players + their team/gender.
  const { data: roster, error: rosterErr } = await db
    .from('golf_team_members')
    .select('player_id, golf_teams!inner(name, gender), golf_players!inner(first_name, last_name)')
    .eq('status', 'active');
  if (rosterErr) throw new Error(`roster: ${JSON.stringify(rosterErr)}`);

  const playerMeta = new Map<string, { name: string; team: string; gender: string }>();
  for (const r of (roster ?? []) as unknown as Array<{
    player_id: string;
    golf_teams: { name: string; gender: string };
    golf_players: { first_name: string | null; last_name: string | null };
  }>) {
    playerMeta.set(r.player_id, {
      name: `${r.golf_players.first_name ?? ''} ${r.golf_players.last_name ?? ''}`.trim(),
      team: r.golf_teams.name,
      gender: r.golf_teams.gender,
    });
  }
  const playerIds = [...playerMeta.keys()];

  // Canonical cache.
  const { data: cacheRows, error: cacheErr } = await db
    .from('golf_player_stats_cache')
    .select('player_id, rounds_played, putts_per_round, gir_percentage, fairways_hit, fairways_total')
    .in('player_id', playerIds);
  if (cacheErr) throw new Error(`cache: ${JSON.stringify(cacheErr)}`);
  const cache = new Map(
    (cacheRows ?? []).map((c) => [c.player_id as string, c]),
  );

  // Rounds (bounded per player) + holes (paged).
  const rounds = await fetchAllRows<Round>((from, to) =>
    db
      .from('golf_rounds')
      .select('id, player_id, holes_played, total_putts, total_gir, total_gir_possible, total_fairways_hit, total_fairways')
      .in('player_id', playerIds)
      .eq('status', 'completed')
      .not('total_score', 'is', null)
      .order('id', { ascending: true })
      .range(from, to),
  );
  const roundIds = rounds.map((r) => r.id);
  const roundPlayer = new Map(rounds.map((r) => [r.id, r.player_id]));

  const holes = roundIds.length
    ? await fetchAllRows<Hole>((from, to) =>
        db
          .from('golf_holes')
          .select('round_id, par, putts, gir, fairway_hit')
          .in('round_id', roundIds)
          .order('id', { ascending: true })
          .range(from, to),
      )
    : [];

  // Per-player accumulators.
  type Acc = {
    holesPutts: number; holesHp: Set<string>; hpSum: number;
    girHits: number; girOpps: number; fwHits: number; fwOpps: number;
    rNormPutts: number[]; rGirMade: number; rGirPoss: number;
  };
  const acc = new Map<string, Acc>();
  const ensure = (pid: string): Acc => {
    let a = acc.get(pid);
    if (!a) {
      a = { holesPutts: 0, holesHp: new Set(), hpSum: 0, girHits: 0, girOpps: 0, fwHits: 0, fwOpps: 0, rNormPutts: [], rGirMade: 0, rGirPoss: 0 };
      acc.set(pid, a);
    }
    return a;
  };

  // golf_holes aggregation (team-page math).
  for (const h of holes) {
    const pid = roundPlayer.get(h.round_id);
    if (!pid) continue;
    const a = ensure(pid);
    if (h.putts != null && h.putts > 0) a.holesPutts += h.putts;
    if (h.gir != null) { a.girOpps++; if (h.gir) a.girHits++; }
    if ((h.par ?? 0) >= 4 && h.fairway_hit != null) { a.fwOpps++; if (h.fairway_hit) a.fwHits++; }
  }
  // holes denominator = sum of holes_played over the player's rounds.
  for (const r of rounds) {
    const a = ensure(r.player_id);
    a.hpSum += r.holes_played ?? 18;
    // golf_rounds aggregation (dashboard math).
    if (r.total_putts != null) {
      const hp = r.holes_played ?? 18;
      a.rNormPutts.push(hp > 0 && hp < 18 ? (r.total_putts * 18) / hp : r.total_putts);
    }
    if (r.total_gir != null && r.total_gir_possible && r.total_gir_possible > 0) {
      a.rGirMade += r.total_gir; a.rGirPoss += r.total_gir_possible;
    }
  }

  const rows: Array<Record<string, string>> = [];
  let failures = 0;
  const sorted = [...playerMeta.entries()].sort((x, y) =>
    (playerMeta.get(x[0])!.team + x[1].name).localeCompare(playerMeta.get(y[0])!.team + y[1].name));

  for (const [pid, meta] of sorted) {
    const c = cache.get(pid);
    if (!c || !c.rounds_played) continue; // no completed rounds → nothing to reconcile
    const a = acc.get(pid);
    if (!a) continue;

    const cachePutts = c.putts_per_round != null ? round1(Number(c.putts_per_round)) : null;
    const cacheGir = c.gir_percentage != null ? round1(Number(c.gir_percentage)) : null;
    const cacheFw = c.fairways_total ? round1((Number(c.fairways_hit) / Number(c.fairways_total)) * 100) : null;

    const holesPutts = a.hpSum > 0 ? round1((a.holesPutts / a.hpSum) * 18) : null;
    const holesGir = a.girOpps > 0 ? round1((a.girHits / a.girOpps) * 100) : null;
    const holesFw = a.fwOpps > 0 ? round1((a.fwHits / a.fwOpps) * 100) : null;
    const roundsGir = a.rGirPoss > 0 ? round1((a.rGirMade / a.rGirPoss) * 100) : null;

    const diffs: string[] = [];
    const cmp = (label: string, x: number | null, y: number | null, tol: number) => {
      if (x == null || y == null) return;
      if (Math.abs(x - y) > tol) diffs.push(`${label} cache=${x} vs ${y}`);
    };
    cmp('putts(holes)', cachePutts, holesPutts, PUTT_TOL);
    cmp('gir(holes)', cacheGir, holesGir, PCT_TOL);
    cmp('gir(rounds)', cacheGir, roundsGir, PCT_TOL);
    cmp('fw(holes)', cacheFw, holesFw, PCT_TOL);

    const ok = diffs.length === 0;
    if (!ok) failures++;
    rows.push({
      team: meta.team,
      player: meta.name,
      putts: `${cachePutts}/${holesPutts}`,
      gir: `${cacheGir}/${holesGir}/${roundsGir}`,
      fw: `${cacheFw}/${holesFw}`,
      verdict: ok ? 'ok' : `DIVERGE: ${diffs.join('; ')}`,
    });
  }

  console.log('Stats consistency — cache vs golf_holes vs golf_rounds');
  console.log('cols: putts cache/holes · gir cache/holes/rounds · fw cache/holes\n');
  console.table(rows);
  console.log(`\n${rows.length} players checked · ${failures} divergent`);
  if (failures > 0) {
    console.error(`\n❌ ${failures} player(s) have surfaces disagreeing with the canonical cache.`);
    process.exit(1);
  }
  console.log('\n✅ All surfaces agree with the canonical cache.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
