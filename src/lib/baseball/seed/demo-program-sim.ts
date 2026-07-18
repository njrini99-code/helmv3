/**
 * demo-program-sim.ts — pure, deterministic box-score simulation used by
 * scripts/seed-baseball-demo-program.ts (Fixes #912).
 *
 * WHY THIS LIVES UNDER src/lib (not inline in the script):
 *   scripts/*.ts files are never exercised by `npm test` (vitest's "unit"
 *   project only globs `src/**`, see vitest.config.ts) — the box-score math
 *   is the one part of that script worth real, running test coverage, so it
 *   lives here as a pure module the script imports, with a companion test at
 *   `__tests__/demo-program-sim.test.ts`.
 *
 * PURE: no Supabase, no Date.now(), no I/O. Every function is a deterministic
 * transform of its inputs — same inputs always produce the same output, so
 * re-running the seed script never regenerates different numbers for the
 * same game.
 *
 * INVARIANTS (enforced by construction, not asserted after the fact):
 *   - Team runs scored == sum of each batter's `r`.
 *   - Runs allowed == sum of each pitcher's `r`.
 *   - IP always sums to exactly 9 across the two pitchers (starter 6, the
 *     other pitcher 3) — no partial-inning "outs" notation needed.
 *   - `doubles + triples <= h - hr` (singles is never negative).
 */

// -----------------------------------------------------------------------------
// Seeded PRNG — mulberry32, seeded from a string via a small FNV-1a hash.
// Same algorithm shape used by scripts/seed-baseball-box-scores.mjs.
// -----------------------------------------------------------------------------

export function seedFromString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// -----------------------------------------------------------------------------
// Skill profiles — inputs, not outputs.
// -----------------------------------------------------------------------------

export interface HitterSkill {
  /** Target batting average, roughly. */
  avg: number;
  /** Chance a hit is a home run. */
  hrPct: number;
  /** Chance a non-HR hit goes for extra bases. */
  xbhPct: number;
  /** Walk tendency. */
  bbPct: number;
  /** Strikeout tendency (share of outs that are Ks). */
  kPct: number;
  /** 0 (no speed) .. 1 (burner) — drives SB attempts + triples. */
  speed: number;
}

export interface PitcherSkill {
  h9: number;
  k9: number;
  bb9: number;
  /** Target ERA — drives how many runs this arm tends to allow. */
  eraTarget: number;
}

export interface BattingLine {
  key: string;
  battingOrder: number;
  ab: number;
  r: number;
  h: number;
  doubles: number;
  triples: number;
  hr: number;
  rbi: number;
  bb: number;
  k: number;
  sb: number;
  cs: number;
  hbp: number;
  sac: number;
  sf: number;
}

export interface PitchingLine {
  key: string;
  ip: number;
  h: number;
  r: number;
  er: number;
  bb: number;
  k: number;
  hr: number;
  result: 'W' | 'L' | 'S' | null;
  isStarter: boolean;
}

export interface GameSim {
  ourScore: number;
  opponentScore: number;
  batting: BattingLine[];
  pitching: PitchingLine[];
}

export interface SimulateGameParams {
  /** Unique, stable per-game key (e.g. `${teamId}:${gameDate}`). */
  gameKey: string;
  hitters: { key: string; skill: HitterSkill }[];
  starter: { key: string; skill: PitcherSkill };
  reliever: { key: string; skill: PitcherSkill };
}

const STARTER_IP = 6;
const RELIEVER_IP = 3;

/**
 * Simulate one game's batting + pitching lines. Deterministic: calling this
 * twice with identical `params` always returns identical output.
 */
export function simulateGame(params: SimulateGameParams): GameSim {
  const { gameKey, hitters, starter, reliever } = params;
  const rng = mulberry32(seedFromString(gameKey));

  // ---- Batting: per-hitter AB/H/2B/3B/HR/BB/HBP/K/SF/SAC/SB/CS ----
  const lineup = hitters.map((entry, index) => {
    const skill = entry.skill;
    const ab = 3 + (rng() < 0.55 ? 1 : 0) + (rng() < 0.15 ? 1 : 0);
    let h = 0;
    for (let i = 0; i < ab; i++) {
      if (rng() < skill.avg + (rng() - 0.5) * 0.1) h++;
    }
    h = Math.min(h, ab);
    const hr = h > 0 && rng() < skill.hrPct ? 1 : 0;
    let doubles = 0;
    let triples = 0;
    for (let i = 0; i < h - hr; i++) {
      const x = rng();
      if (x < skill.xbhPct * 0.3) doubles++;
      else if (x < skill.xbhPct * 0.3 + skill.speed * 0.06) triples++;
    }
    const bb = rng() < skill.bbPct * 2.2 ? 1 : 0;
    const hbp = rng() < 0.04 ? 1 : 0;
    const outs = ab - h;
    let k = 0;
    for (let i = 0; i < outs; i++) {
      if (rng() < skill.kPct) k++;
    }
    const sf = h === 0 && outs > 0 && rng() < 0.05 ? 1 : 0;
    const sac = rng() < 0.04 ? 1 : 0;
    const sb = skill.speed > 0.3 && rng() < skill.speed * 0.35 ? 1 : 0;
    const cs = sb === 0 && skill.speed > 0.3 && rng() < 0.05 ? 1 : 0;
    const reached = h + bb + hbp;
    return {
      key: entry.key,
      battingOrder: index + 1,
      ab,
      h,
      doubles,
      triples,
      hr,
      bb,
      hbp,
      k,
      sf,
      sac,
      sb,
      cs,
      reached,
      r: hr > 0 ? 1 : 0, // every HR is an automatic run
      rbi: hr > 0 ? 1 : 0, // and an automatic RBI (solo minimum)
    };
  });

  // Distribute EXTRA runs (beyond the automatic HR run) among hitters who
  // reached base and still have "room" (r < reached this game) — this makes
  // `ourScore` a byproduct of the loop below, not an independently-picked
  // target, so batting R always sums to ourScore by construction.
  const nonHrReachedCapacity = lineup.reduce(
    (sum, b) => sum + Math.max(0, b.reached - b.r),
    0,
  );
  let extraRunsLeft = Math.min(
    nonHrReachedCapacity,
    Math.round(nonHrReachedCapacity * (0.4 + rng() * 0.24)),
  );
  let guard = 0;
  while (extraRunsLeft > 0 && guard++ < 200) {
    const candidates = lineup
      .filter((b) => b.r < b.reached)
      .sort((a, b) => b.reached - b.r - (a.reached - a.r) || rng() - 0.5);
    if (candidates.length === 0) break;
    const chosen = candidates[Math.floor(rng() * Math.min(candidates.length, 3))];
    if (!chosen) break;
    chosen.r += 1;
    extraRunsLeft -= 1;
  }
  // ---- Pitching: runs allowed derived from skill, IP fixed 6 + 3 = 9 ----
  function runsAllowed(skill: PitcherSkill, ip: number): number {
    const expected = (skill.eraTarget / 9) * ip;
    const perInningChance = Math.min(0.85, expected / Math.max(ip, 1));
    let runs = 0;
    for (let i = 0; i < ip; i++) {
      if (rng() < perInningChance) runs += rng() < 0.7 ? 1 : 2;
    }
    return runs;
  }
  function counts(skill: PitcherSkill, ip: number, r: number) {
    const h = Math.max(r > 0 ? 1 : 0, Math.round((skill.h9 / 9) * ip + (rng() - 0.5) * 1.2));
    const bb = Math.max(0, Math.round((skill.bb9 / 9) * ip + (rng() - 0.5)));
    const k = Math.max(0, Math.round((skill.k9 / 9) * ip + (rng() - 0.5) * 1.2));
    const hr = r > 0 && rng() < 0.3 ? 1 : 0;
    const er = Math.max(0, r - (rng() < 0.25 ? 1 : 0));
    return { h, bb, k, hr, er };
  }

  const starterR = runsAllowed(starter.skill, STARTER_IP);
  let relieverR = runsAllowed(reliever.skill, RELIEVER_IP);

  // Baseball games never end tied — when the two independently-derived
  // totals land equal, nudge exactly ONE underlying source up by a run
  // (deterministically, via the same rng stream) BEFORE any per-line/derived
  // total is read, so the "sum of parts == total" invariant never breaks:
  // bump a batter's `r` (recomputing ourScore from the lineup after) or bump
  // `relieverR` (which pitching.r is built from below) — never the summary
  // number in isolation.
  if (lineup.reduce((sum, b) => sum + b.r, 0) === starterR + relieverR) {
    if (rng() < 0.5) {
      const target =
        [...lineup].sort((a, b) => b.reached - a.reached)[0] ?? lineup[0];
      if (target) target.r += 1;
    } else {
      relieverR += 1;
    }
  }
  const ourScore = lineup.reduce((sum, b) => sum + b.r, 0);
  const opponentScore = starterR + relieverR;

  // RBI: usually tracks runs 1:1, occasionally one short (a run scored on an
  // error/wild pitch/etc. carries no RBI) — matches real box-score texture.
  const rbiTarget = Math.max(0, ourScore - (ourScore >= 5 && rng() < 0.5 ? 1 : 0));
  let rbiLeft = rbiTarget - lineup.reduce((sum, b) => sum + b.rbi, 0);
  guard = 0;
  const rbiCap = (b: (typeof lineup)[number]) => b.h * 2 + b.hr + (b.sf ? 1 : 0);
  while (rbiLeft > 0 && guard++ < 200) {
    const candidates = lineup
      .filter((b) => b.rbi < rbiCap(b) && (b.h > 0 || b.sf > 0))
      .sort((a, b) => b.h + b.hr * 2 - (a.h + a.hr * 2) || rng() - 0.5);
    if (candidates.length === 0) break;
    const chosen = candidates[Math.floor(rng() * Math.min(candidates.length, 3))];
    if (!chosen) break;
    chosen.rbi += 1;
    rbiLeft -= 1;
  }

  const batting: BattingLine[] = lineup.map((b) => ({
    key: b.key,
    battingOrder: b.battingOrder,
    ab: b.ab,
    r: b.r,
    h: b.h,
    doubles: b.doubles,
    triples: b.triples,
    hr: b.hr,
    rbi: b.rbi,
    bb: b.bb,
    k: b.k,
    sb: b.sb,
    cs: b.cs,
    hbp: b.hbp,
    sac: b.sac,
    sf: b.sf,
  }));

  const starterCounts = counts(starter.skill, STARTER_IP, starterR);
  const relieverCounts = counts(reliever.skill, RELIEVER_IP, relieverR);
  const won = ourScore > opponentScore;
  const margin = ourScore - opponentScore;

  const pitching: PitchingLine[] = [
    {
      key: starter.key,
      ip: STARTER_IP,
      h: starterCounts.h,
      r: starterR,
      er: starterCounts.er,
      bb: starterCounts.bb,
      k: starterCounts.k,
      hr: starterCounts.hr,
      result: won ? 'W' : 'L',
      isStarter: true,
    },
    {
      key: reliever.key,
      ip: RELIEVER_IP,
      h: relieverCounts.h,
      r: relieverR,
      er: relieverCounts.er,
      bb: relieverCounts.bb,
      k: relieverCounts.k,
      hr: relieverCounts.hr,
      result: won && margin > 0 && margin <= 3 ? 'S' : null,
      isStarter: false,
    },
  ];

  return {
    ourScore,
    opponentScore,
    batting,
    pitching,
  };
}
