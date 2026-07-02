/**
 * seed-baseball-box-scores.mjs — env-gated, dry-run-by-default box-score seeder.
 *
 * Seeds the CANONICAL Stats-Center source tables from the team's REAL completed
 * games so the Stats Center grid, player passports, and KPI tiles light up with
 * internally-consistent, believable data:
 *
 *   - baseball_box_score_batting   (one row per batter per game)
 *   - baseball_box_score_pitching  (one row per pitcher per game)
 *   - baseball_player_season_stats (one aggregate row per player)
 *
 * HONESTY / RECONCILE CONTRACT (src/lib/baseball/read-models/stats-center.ts):
 *   Stats Center DERIVES batting/pitching splits from the per-game box scores and
 *   RECONCILES the box-derived OFFICIAL totals (ab/h/hr/rbi) against the stored
 *   season row. To keep `reconciled:true`, the season row here is computed FROM
 *   the same generated box lines — never authored independently.
 *
 *   IP is stored as WHOLE innings (6, 3) summing to innings_played per game, so
 *   ipToInnings()/ERA math is unambiguous. Per-game batting runs sum to our_score
 *   and pitching runs allowed sum to opponent_score, so a game box score never
 *   contradicts the scoreboard.
 *
 * SAFE BY DEFAULT: no flags → dry run (prints plan, writes nothing). --confirm to
 * write; production project ref blocked unless --allow-prod.
 *
 * Requires env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * Target: --team <uuid> (SEED_TEAM_ID). Coach is not needed (box scores are
 * team+player scoped), but --coach is accepted for symmetry with the sibling seeder.
 *
 *   DOTENV_CONFIG_PATH=.env.local node -r dotenv/config scripts/seed-baseball-box-scores.mjs --team <uuid>
 *   DOTENV_CONFIG_PATH=.env.local node -r dotenv/config scripts/seed-baseball-box-scores.mjs --team <uuid> --confirm --allow-prod
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const KNOWN_PROD_PROJECT_REF = 'qmnssrrolpinvwjjnufo';

function getArg(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

// Deterministic PRNG (mulberry32) so re-runs produce identical numbers and the
// seed is idempotent (deterministic natural keys + upsert on the box unique key).
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function seedFromString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
const round3 = (n) => parseFloat(n.toFixed(3));
const round2 = (n) => parseFloat(n.toFixed(2));

function parseConfig() {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim();
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
  const teamId = getArg('--team') ?? (process.env.SEED_TEAM_ID ?? '').trim();
  const confirm = process.argv.includes('--confirm');
  const allowProd = process.argv.includes('--allow-prod');
  const dryRun = !confirm;

  if (!url || !serviceKey) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }
  if (!teamId) {
    console.error('Missing target team. Set SEED_TEAM_ID or pass --team <uuid>');
    process.exit(1);
  }
  let projectRef = '';
  try {
    projectRef = new URL(url).hostname.split('.')[0] ?? '';
  } catch {
    console.error('Invalid NEXT_PUBLIC_SUPABASE_URL');
    process.exit(1);
  }
  if (projectRef === KNOWN_PROD_PROJECT_REF && !allowProd) {
    console.error(
      `Refusing to seed against production project ${projectRef}. Re-run with --allow-prod if intentional.`,
    );
    process.exit(1);
  }
  return { url, serviceKey, teamId, dryRun, projectRef };
}

// Per-hitter skill weight → drives hits, power, discipline. Keyed by jersey so
// the star (SS Rodriguez #7) and role players read believably distinct.
function hitterProfile(jersey) {
  // avg target, hr-per-game chance, xbh tendency, bb rate, k rate, speed
  const table = {
    7: { avg: 0.351, hrPct: 0.18, xbh: 0.42, bb: 0.12, k: 0.16, speed: 0.35 }, // Rodriguez SS — star
    33: { avg: 0.318, hrPct: 0.28, xbh: 0.5, bb: 0.14, k: 0.24, speed: 0.05 }, // Bennett 1B — power
    24: { avg: 0.335, hrPct: 0.06, xbh: 0.3, bb: 0.11, k: 0.14, speed: 0.55 }, // Williams CF — table-setter
    22: { avg: 0.301, hrPct: 0.14, xbh: 0.4, bb: 0.1, k: 0.2, speed: 0.2 }, // Davis RF
    5: { avg: 0.289, hrPct: 0.16, xbh: 0.42, bb: 0.09, k: 0.22, speed: 0.1 }, // Mitchell 3B
    2: { avg: 0.276, hrPct: 0.1, xbh: 0.34, bb: 0.12, k: 0.19, speed: 0.05 }, // Sanders C
    9: { avg: 0.283, hrPct: 0.04, xbh: 0.26, bb: 0.13, k: 0.15, speed: 0.4 }, // Harrison 2B — switch
    14: { avg: 0.262, hrPct: 0.12, xbh: 0.38, bb: 0.08, k: 0.26, speed: 0.15 }, // Reed LF
    44: { avg: 0.294, hrPct: 0.2, xbh: 0.46, bb: 0.11, k: 0.23, speed: 0.02 }, // Foster DH
    12: { avg: 0.24, hrPct: 0.05, xbh: 0.3, bb: 0.1, k: 0.2, speed: 0.05 }, // Thompson C — backup
  };
  return table[jersey] ?? { avg: 0.265, hrPct: 0.08, xbh: 0.32, bb: 0.1, k: 0.2, speed: 0.15 };
}

function pitcherProfile(jersey) {
  const table = {
    18: { h9: 7.8, k9: 9.6, bb9: 2.6, role: 'SP' }, // Clark
    27: { h9: 8.4, k9: 8.2, bb9: 3.0, role: 'SP' }, // Hayes
    31: { h9: 8.0, k9: 9.0, bb9: 2.8, role: 'SP' }, // Brooks
    20: { h9: 6.9, k9: 11.2, bb9: 2.2, role: 'RP' }, // Price — closer
  };
  return table[jersey] ?? { h9: 8.5, k9: 8.0, bb9: 3.2, role: 'RP' };
}

async function run() {
  const { url, serviceKey, teamId, dryRun, projectRef } = parseConfig();
  const client = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log(
    dryRun
      ? `[DRY RUN] No writes. Target host ${projectRef} | team ${teamId}\n`
      : `📊 Seeding box scores for team ${teamId} on ${projectRef}...\n`,
  );

  // ---- Completed games (chronological) ----
  const { data: games, error: gErr } = await client
    .from('baseball_games')
    .select('id, game_date, opponent_name, home_away, our_score, opponent_score, innings_played, status')
    .eq('team_id', teamId)
    .eq('status', 'completed')
    .order('game_date', { ascending: true });
  if (gErr || !games?.length) {
    console.error('Failed to load completed games:', gErr?.message ?? 'none found');
    process.exit(1);
  }

  // ---- Roster ----
  const { data: members, error: mErr } = await client
    .from('baseball_team_members')
    .select('player_id, jersey_number, position, baseball_players!inner(id, first_name, last_name, primary_position)')
    .eq('team_id', teamId);
  if (mErr || !members?.length) {
    console.error('Failed to load roster:', mErr?.message ?? 'none found');
    process.exit(1);
  }

  const roster = members.map((m) => ({
    id: m.player_id,
    jersey: m.jersey_number ?? 0,
    pos: m.position || m.baseball_players?.primary_position || 'OF',
    first: m.baseball_players?.first_name ?? '',
    last: m.baseball_players?.last_name ?? '',
  }));
  const pitchers = roster.filter((p) => p.pos === 'P').sort((a, b) => a.jersey - b.jersey);
  const positionPlayers = roster.filter((p) => p.pos !== 'P').sort((a, b) => a.jersey - b.jersey);

  // Everyday 9 = one player per lineup slot (C,1B,2B,3B,SS,LF,CF,RF,DH), lowest
  // jersey wins a contested slot; leftovers (e.g. the second catcher) are backups
  // who pinch-hit. This keeps the DH an everyday bat and a real backup on the bench
  // instead of letting a raw jersey sort bench the DH.
  const SLOTS = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH'];
  const taken = new Set();
  const everyday = [];
  for (const slot of SLOTS) {
    const pick = positionPlayers.find((p) => !taken.has(p.id) && p.pos === slot);
    if (pick) { everyday.push(pick); taken.add(pick.id); }
  }
  // Fill any unfilled slot (roster missing a position) with the next unused bat.
  for (const p of positionPlayers) {
    if (everyday.length >= 9) break;
    if (!taken.has(p.id)) { everyday.push(p); taken.add(p.id); }
  }
  const backup = positionPlayers.filter((p) => !taken.has(p.id));
  // Starters rotate across the 3 SP; #20 (Price) is the closer/finisher every game.
  const starters = pitchers.filter((p) => pitcherProfile(p.jersey).role === 'SP');
  const closer = pitchers.find((p) => pitcherProfile(p.jersey).role === 'RP') ?? pitchers[pitchers.length - 1];

  console.log(
    `Games: ${games.length} completed | Everyday hitters: ${everyday.length} | Backup: ${backup.length} | SP: ${starters.length} | Closer: #${closer?.jersey}\n`,
  );

  const batRows = [];
  const pitchRows = [];
  const season_year = new Date(games[0].game_date).getFullYear();

  games.forEach((game, gi) => {
    const our = game.our_score ?? 0;
    const opp = game.opponent_score ?? 0;
    const innings = game.innings_played ?? 9;
    const won = our > opp;
    const rng = mulberry32(seedFromString(`${game.id}`));

    // ---------- BATTING ----------
    const lineup = everyday.map((p, order) => {
      const prof = hitterProfile(p.jersey);
      const r = mulberry32(seedFromString(`${game.id}:${p.id}`));
      const ab = 3 + (r() < 0.55 ? 1 : 0) + (r() < 0.2 ? 1 : 0); // 3–5
      // hits from AB weighted by skill (small per-game variance)
      let h = 0;
      for (let i = 0; i < ab; i++) if (r() < prof.avg + (r() - 0.5) * 0.12) h++;
      h = Math.min(h, ab);
      const hr = h > 0 && r() < prof.hrPct ? 1 : 0;
      let doubles = 0, triples = 0;
      for (let i = 0; i < h - hr; i++) {
        const x = r();
        if (x < prof.xbh * 0.28) doubles++;
        else if (x < prof.xbh * 0.28 + prof.speed * 0.05) triples++;
      }
      const bb = r() < prof.bb * 2.4 ? (r() < 0.25 ? 2 : 1) : 0;
      const hbp = r() < 0.05 ? 1 : 0;
      const outs = ab - h;
      let k = 0;
      for (let i = 0; i < outs; i++) if (r() < prof.k) k++;
      const sf = h === 0 && outs > 0 && r() < 0.06 ? 1 : 0;
      const sac = p.pos === '2B' || p.pos === 'SS' ? (r() < 0.05 ? 1 : 0) : 0;
      const sb = prof.speed > 0.3 && r() < prof.speed * 0.4 ? 1 : 0;
      const cs = sb === 0 && prof.speed > 0.3 && r() < 0.06 ? 1 : 0;
      const reached = h + bb + hbp;
      return {
        p, order, ab, h, hr, doubles, triples, bb, hbp, k, sf, sac, sb, cs,
        reached, r: 0, rbi: 0,
      };
    });

    // Distribute team RUNS (== our_score) across players who reached base.
    // A player scores at most once per time on base; HR guarantees a run.
    lineup.forEach((b) => { if (b.hr) b.r = 1; });
    let runsLeft = our - lineup.reduce((s, b) => s + b.r, 0);
    const runCandidates = () =>
      lineup
        .filter((b) => b.r < b.reached)
        .sort((a, b) => b.reached - a.reached || (rng() - 0.5));
    let guard = 0;
    while (runsLeft > 0 && guard++ < 200) {
      const cands = runCandidates();
      if (!cands.length) break;
      // weight leadoff/speed slightly toward scoring
      const pickList = cands.filter((c) => c.p);
      const chosen = pickList[Math.floor(rng() * pickList.length)];
      chosen.r += 1;
      runsLeft -= 1;
    }

    // Distribute team RBI (target = our_score, minus 1 on a ≥5-run game for an
    // unearned/error run). RBI ≤ team runs; weighted to hits & power.
    const rbiTarget = Math.max(0, our - (our >= 5 ? 1 : 0));
    lineup.forEach((b) => { if (b.hr) b.rbi = 1; }); // solo HR minimum
    let rbiLeft = rbiTarget - lineup.reduce((s, b) => s + b.rbi, 0);
    const rbiCap = (b) => b.h * 2 + b.hr + (b.sf ? 1 : 0); // rough plausibility cap
    guard = 0;
    while (rbiLeft > 0 && guard++ < 300) {
      const cands = lineup
        .filter((b) => b.rbi < rbiCap(b) && (b.h > 0 || b.sf > 0))
        .sort((a, b) => (b.h + b.hr * 2) - (a.h + a.hr * 2) || (rng() - 0.5));
      if (!cands.length) break;
      const chosen = cands[Math.floor(rng() * Math.min(cands.length, 5))];
      chosen.rbi += 1;
      rbiLeft -= 1;
    }

    // two-out RBI & LOB flavor (bounded, honest-ish)
    lineup.forEach((b) => {
      const lob = Math.max(0, b.reached - b.r + (b.ab - b.h > 0 && rng() < 0.4 ? 1 : 0));
      batRows.push({
        game_id: game.id,
        player_id: b.p.id,
        team_id: teamId,
        batting_order: b.order + 1,
        ab: b.ab, r: b.r, h: b.h, doubles: b.doubles, triples: b.triples, hr: b.hr,
        rbi: b.rbi, bb: b.bb, k: b.k, sb: b.sb, cs: b.cs, hbp: b.hbp, sac: b.sac,
        sf: b.sf, lob, ibb: 0, gidp: b.ab - b.h > 1 && rng() < 0.12 ? 1 : 0, roe: 0, ci: 0,
        pickoffs: 0, two_out_rbi: b.rbi > 0 && rng() < 0.4 ? Math.min(b.rbi, 1) : 0,
        productive_outs: b.ab - b.h > 0 && rng() < 0.15 ? 1 : 0,
        runners_advanced: 0, ph_ab: 0, ph_h: 0, pr_app: 0,
        def_position: b.p.pos,
      });
    });

    // Backup catcher pinch-hits in games 3 & 5 (1 AB).
    if (backup[0] && (gi === 2 || gi === 4)) {
      const bp = backup[0];
      const r = mulberry32(seedFromString(`${game.id}:ph:${bp.id}`));
      const h = r() < 0.27 ? 1 : 0;
      batRows.push({
        game_id: game.id, player_id: bp.id, team_id: teamId, batting_order: 10,
        ab: 1, r: 0, h, doubles: 0, triples: 0, hr: 0, rbi: h && rng() < 0.4 ? 1 : 0,
        bb: 0, k: h ? 0 : (r() < 0.3 ? 1 : 0), sb: 0, cs: 0, hbp: 0, sac: 0, sf: 0,
        lob: h ? 1 : 0, ibb: 0, gidp: 0, roe: 0, ci: 0, pickoffs: 0, two_out_rbi: 0,
        productive_outs: 0, runners_advanced: 0, ph_ab: 1, ph_h: h, pr_app: 0,
        def_position: bp.pos,
      });
    }

    // ---------- PITCHING ----------
    // Starter throws ~6 (7 in a couple blowouts), closer covers the rest to `innings`.
    const starter = starters[gi % starters.length];
    const starterIp = opp <= 3 && won && rng() < 0.5 ? 7 : 6;
    const closerIp = Math.max(1, innings - starterIp);
    // runs allowed split: starter carries most; er == r except one unearned when opp≥4.
    const starterR = Math.min(opp, Math.round(opp * (starterIp / innings) + (rng() < 0.5 ? 0 : 1)));
    const closerR = opp - starterR;
    const unearned = opp >= 4 && rng() < 0.5 ? 1 : 0;
    const starterEr = Math.max(0, starterR - unearned);
    const closerEr = closerR;

    const decisionFor = () => {
      // starter W if team won & threw ≥5; closer SV in 1–3 run wins; ties → ND.
      let starterRes = null, closerRes = null;
      if (won) {
        starterRes = 'W';
        if (our - opp <= 3) closerRes = 'S';
      }
      return { starterRes, closerRes };
    };
    const { starterRes, closerRes } = decisionFor();

    const mkPitch = (pl, ip, rAll, erAll, res, isStart, isFinish) => {
      const prof = pitcherProfile(pl.jersey);
      const r = mulberry32(seedFromString(`${game.id}:p:${pl.id}`));
      const outs = ip * 3;
      const h = Math.max(rAll, Math.round((prof.h9 / 9) * ip + (r() - 0.5) * 1.5));
      const bb = Math.max(0, Math.round((prof.bb9 / 9) * ip + (r() - 0.5)));
      const k = Math.max(0, Math.round((prof.k9 / 9) * ip + (r() - 0.5) * 1.2));
      const hr = erAll > 0 && r() < 0.4 ? 1 : 0;
      const hbp = r() < 0.15 ? 1 : 0;
      const bf = outs + h + bb + hbp;
      const pitch_count = Math.round(bf * (3.6 + r() * 0.6));
      const strikes = Math.round(pitch_count * (0.6 + r() * 0.07));
      const first_pitch_strikes = Math.round(bf * (0.55 + r() * 0.12));
      pitchRows.push({
        game_id: game.id, player_id: pl.id, team_id: teamId,
        ip, h, r: rAll, er: erAll, bb, k, hr,
        pitch_count, strikes, result: res, gs: isStart ? 1 : 0, gf: isFinish ? 1 : 0,
        holds: 0, blown_saves: 0, complete_game: 0, shutout: 0, bf,
        hbp, ibb: 0, wp: r() < 0.2 ? 1 : 0, balk: 0,
        doubles_allowed: h > 2 && r() < 0.4 ? 1 : 0, triples_allowed: 0,
        first_pitch_strikes,
        inherited_runners: 0, inherited_runners_scored: 0,
      });
    };
    mkPitch(starter, starterIp, starterR, starterEr, starterRes, true, false);
    mkPitch(closer, closerIp, closerR, closerEr, closerRes, false, true);
  });

  // ---------- SEASON AGGREGATION (from generated box lines → reconcile-safe) ----------
  const seasonByPlayer = new Map();
  const ensureSeason = (pid) => {
    let s = seasonByPlayer.get(pid);
    if (!s) {
      s = {
        player_id: pid, team_id: teamId, season_year,
        g: 0, ab: 0, r: 0, h: 0, doubles: 0, triples: 0, hr: 0, rbi: 0, bb: 0, k: 0,
        sb: 0, cs: 0, hbp: 0, sac: 0, sf: 0, ibb: 0, gidp: 0, roe: 0, two_out_rbi: 0, lob: 0,
        g_p: 0, gs: 0, w: 0, l: 0, sv: 0, ip: 0, h_allowed: 0, r_allowed: 0, er: 0,
        bb_allowed: 0, k_thrown: 0, hr_allowed: 0, gf: 0, holds: 0, blown_saves: 0, bf: 0, p_hbp: 0, wp: 0,
        _batGames: new Set(), _pitchGames: new Set(),
      };
      seasonByPlayer.set(pid, s);
    }
    return s;
  };
  for (const b of batRows) {
    const s = ensureSeason(b.player_id);
    s._batGames.add(b.game_id);
    s.ab += b.ab; s.r += b.r; s.h += b.h; s.doubles += b.doubles; s.triples += b.triples;
    s.hr += b.hr; s.rbi += b.rbi; s.bb += b.bb; s.k += b.k; s.sb += b.sb; s.cs += b.cs;
    s.hbp += b.hbp; s.sac += b.sac; s.sf += b.sf; s.ibb += b.ibb; s.gidp += b.gidp;
    s.roe += b.roe; s.two_out_rbi += b.two_out_rbi; s.lob += b.lob;
  }
  for (const p of pitchRows) {
    const s = ensureSeason(p.player_id);
    s._pitchGames.add(p.game_id);
    s.gs += p.gs; s.ip += p.ip; s.h_allowed += p.h; s.r_allowed += p.r; s.er += p.er;
    s.bb_allowed += p.bb; s.k_thrown += p.k; s.hr_allowed += p.hr; s.gf += p.gf;
    s.bf += p.bf; s.p_hbp += p.hbp; s.wp += p.wp;
    if (p.result === 'W') s.w += 1;
    else if (p.result === 'L') s.l += 1;
    else if (p.result === 'S') s.sv += 1;
    else if (p.result === 'H') s.holds += 1;
    else if (p.result === 'BS') s.blown_saves += 1;
  }

  const seasonRows = [];
  for (const s of seasonByPlayer.values()) {
    s.g = s._batGames.size;
    s.g_p = s._pitchGames.size;
    // batting rates
    const obpDen = s.ab + s.bb + s.hbp + s.sf;
    const singles = Math.max(0, s.h - s.doubles - s.triples - s.hr);
    const tb = singles + 2 * s.doubles + 3 * s.triples + 4 * s.hr;
    s.avg = s.ab > 0 ? round3(s.h / s.ab) : null;
    s.obp = obpDen > 0 ? round3((s.h + s.bb + s.hbp) / obpDen) : null;
    s.slg = s.ab > 0 ? round3(tb / s.ab) : null;
    s.ops = s.obp != null && s.slg != null ? round3(s.obp + s.slg) : null;
    // pitching rates (whole innings → unambiguous)
    s.era = s.ip > 0 ? round2((s.er * 9) / s.ip) : null;
    s.whip = s.ip > 0 ? round2((s.bb_allowed + s.h_allowed) / s.ip) : null;
    s.k9 = s.ip > 0 ? round2((s.k_thrown * 9) / s.ip) : null;
    s.bb9 = s.ip > 0 ? round2((s.bb_allowed * 9) / s.ip) : null;
    const { _batGames, _pitchGames, ...clean } = s;
    seasonRows.push(clean);
  }

  // ---------- Sanity print ----------
  console.log('Per-game integrity (team runs = batting R sum, opp runs = pitching R sum):');
  for (const g of games) {
    const br = batRows.filter((b) => b.game_id === g.id).reduce((a, b) => a + b.r, 0);
    const pr = pitchRows.filter((p) => p.game_id === g.id).reduce((a, p) => a + p.r, 0);
    const pip = pitchRows.filter((p) => p.game_id === g.id).reduce((a, p) => a + p.ip, 0);
    const okB = br === g.our_score ? '✓' : `✗(box ${br})`;
    const okP = pr === g.opponent_score ? '✓' : `✗(box ${pr})`;
    const okI = pip === (g.innings_played ?? 9) ? '✓' : `✗(box ${pip})`;
    console.log(
      `  ${g.game_date} vs ${g.opponent_name}: us ${g.our_score}-${g.opponent_score} | R ${okB} | RA ${okP} | IP ${okI}`,
    );
  }
  console.log(`\nRows: batting ${batRows.length} | pitching ${pitchRows.length} | season ${seasonRows.length}\n`);

  // Season leaderboard preview
  const hitters = seasonRows.filter((s) => s.ab > 0).sort((a, b) => (b.avg ?? 0) - (a.avg ?? 0));
  console.log('Top hitters:');
  for (const s of hitters.slice(0, 5)) {
    console.log(
      `  ${s.player_id.slice(0, 8)} | .${((s.avg ?? 0) * 1000).toFixed(0).padStart(3, '0')}/.${((s.obp ?? 0) * 1000).toFixed(0).padStart(3, '0')}/.${((s.slg ?? 0) * 1000).toFixed(0).padStart(3, '0')} | ${s.h}-for-${s.ab}, ${s.hr} HR, ${s.rbi} RBI (${s.g} G)`,
    );
  }
  const arms = seasonRows.filter((s) => s.ip > 0).sort((a, b) => (a.era ?? 99) - (b.era ?? 99));
  console.log('Pitching:');
  for (const s of arms) {
    console.log(
      `  ${s.player_id.slice(0, 8)} | ${s.w}-${s.l}${s.sv ? `, ${s.sv} SV` : ''} | ${s.era} ERA | ${s.ip} IP, ${s.k_thrown} K, ${s.bb_allowed} BB (${s.g_p} G)`,
    );
  }

  if (dryRun) {
    console.log('\n[DRY RUN] Complete — re-run with --confirm to write.');
    return;
  }

  // ---------- WRITE ----------
  console.log('\nWriting box scores + season stats...');
  const chunk = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

  let ok = 0, fail = 0;
  for (const part of chunk(batRows, 100)) {
    const { error } = await client
      .from('baseball_box_score_batting')
      .upsert(part, { onConflict: 'game_id,player_id' });
    if (error) { console.error('  ✗ batting:', error.message); fail += part.length; } else ok += part.length;
  }
  for (const part of chunk(pitchRows, 100)) {
    const { error } = await client
      .from('baseball_box_score_pitching')
      .upsert(part, { onConflict: 'game_id,player_id' });
    if (error) { console.error('  ✗ pitching:', error.message); fail += part.length; } else ok += part.length;
  }
  for (const part of chunk(seasonRows, 100)) {
    const { error } = await client
      .from('baseball_player_season_stats')
      .upsert(part, { onConflict: 'player_id,team_id,season_year' });
    if (error) { console.error('  ✗ season:', error.message); fail += part.length; } else ok += part.length;
  }
  console.log(`\n✅ Wrote ${ok} rows${fail ? ` (${fail} failed)` : ''}.`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
