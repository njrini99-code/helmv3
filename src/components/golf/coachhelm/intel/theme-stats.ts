/**
 * Per-theme reads for the player list and the spotlight: one headline stat
 * per player, two short chips, and six player-vs-team tiles. Pure; every
 * figure is a count over the slice's tracked shots.
 */
import {
  approachSummary,
  approachInBand,
  chipSummary,
  chipsIn,
  inRounds,
  puttSummary,
  puttsIn,
  teeSummary,
} from '@/lib/golf/team-intelligence/aggregate';
import type { IntelTheme, TeamIntelligenceData } from '@/lib/golf/team-intelligence/types';
import { MISS_LABEL, formatDecimal, formatFeet, formatPct } from './shared';

/** Below this many shots a tile says "low sample" instead of judging. */
export const LOW_SAMPLE = 5;

export interface StatTile {
  label: string;
  player: number | null;
  team: number | null;
  format: (v: number) => string;
  lowerBetter: boolean;
  /** Shots behind the player's figure. */
  n: number;
}

export interface ContributorRead {
  stat: string;
  statLabel: string;
  chips: string[];
}

const yards = (v: number) => `${Math.round(v)} yd`;
const pct = (v: number) => formatPct(v);
const feet = (v: number) => formatFeet(v, v < 10 ? 1 : 0);

function share(part: number, whole: number): number | null {
  return whole > 0 ? (part / whole) * 100 : null;
}

function slices(data: TeamIntelligenceData, allowed: ReadonlySet<number>, playerId: string | null) {
  return {
    tee: inRounds(data.tee, allowed, data.rounds, playerId),
    approach: inRounds(data.approach, allowed, data.rounds, playerId),
    chips: inRounds(data.chips, allowed, data.rounds, playerId),
    putts: inRounds(data.putts, allowed, data.rounds, playerId),
  };
}

export const STAT_LABEL: Record<IntelTheme, string> = {
  tee: 'Drive',
  app: 'Proximity',
  atg: 'Up & down',
  putt: '3-putt',
};

/** The one figure the player list shows beside SG, plus two short chips. */
export function contributorRead(
  data: TeamIntelligenceData,
  allowed: ReadonlySet<number>,
  theme: IntelTheme,
  playerId: string | null,
): ContributorRead {
  const s = slices(data, allowed, playerId);
  const statLabel = STAT_LABEL[theme];
  switch (theme) {
    case 'tee': {
      const t = teeSummary(s.tee);
      if (t.n === 0) return { stat: '—', statLabel, chips: ['No drives tracked'] };
      return {
        stat: t.avgYards == null ? '—' : String(Math.round(t.avgYards)),
        statLabel,
        chips: [`${formatPct(t.fairwayPct)} fairways`, t.missSide ? `Misses ${t.missSide}` : `${t.n} drives`],
      };
    }
    case 'app': {
      const a = approachSummary(approachInBand(s.approach, 'all'));
      if (a.n === 0) return { stat: '—', statLabel, chips: ['No approaches tracked'] };
      return {
        stat: a.proximity == null ? '—' : `${Math.round(a.proximity)}`,
        statLabel,
        chips: [`${formatPct(a.girPct)} greens`, a.mainMiss ? `Misses ${MISS_LABEL[a.mainMiss]}` : `${a.n} shots`],
      };
    }
    case 'atg': {
      const c = chipSummary(s.chips);
      if (c.n === 0) return { stat: '—', statLabel, chips: ['No chips tracked'] };
      return {
        stat: formatPct(c.upAndDownPct),
        statLabel,
        chips: [`${c.n} chips`, `${formatPct(c.inside4Pct)} inside 4 ft`],
      };
    }
    case 'putt': {
      const p = puttSummary(s.putts);
      if (p.n === 0) return { stat: '—', statLabel, chips: ['No putts tracked'] };
      const side = p.lowPct == null ? null : p.lowPct >= 50 ? `Misses low ${formatPct(p.lowPct)}` : `Misses high ${formatPct(p.highPct)}`;
      return {
        stat: formatPct(p.threePuttPct),
        statLabel,
        chips: [`${formatPct(puttSummary(puttsIn(s.putts, '5')).makePct)} from 5–10 ft`, side ?? `${p.n} putts`],
      };
    }
  }
}

/** Six player-vs-team tiles for the spotlight. */
export function spotlightTiles(
  data: TeamIntelligenceData,
  allowed: ReadonlySet<number>,
  theme: IntelTheme,
  playerId: string,
): StatTile[] {
  const p = slices(data, allowed, playerId);
  const t = slices(data, allowed, null);

  switch (theme) {
    case 'tee': {
      const ps = teeSummary(p.tee);
      const ts = teeSummary(t.tee);
      const rounds = (shots: typeof p.tee) => new Set(shots.map((s) => s.ri)).size;
      const perRound = (zones: number, shots: typeof p.tee) => (rounds(shots) ? zones / rounds(shots) : null);
      return [
        { label: 'Avg drive', player: ps.avgYards, team: ts.avgYards, format: yards, lowerBetter: false, n: ps.n },
        { label: 'Fairways hit', player: ps.fairwayPct, team: ts.fairwayPct, format: pct, lowerBetter: false, n: ps.n },
        { label: 'Missed right', player: share(ps.zones.right, ps.n), team: share(ts.zones.right, ts.n), format: pct, lowerBetter: true, n: ps.n },
        { label: 'Missed left', player: share(ps.zones.left, ps.n), team: share(ts.zones.left, ts.n), format: pct, lowerBetter: true, n: ps.n },
        { label: 'Penalty rate', player: share(ps.zones.penalty, ps.n), team: share(ts.zones.penalty, ts.n), format: pct, lowerBetter: true, n: ps.n },
        {
          label: 'Penalties / round',
          player: perRound(ps.zones.penalty, p.tee),
          team: perRound(ts.zones.penalty, t.tee),
          format: (v) => formatDecimal(v, 1),
          lowerBetter: true,
          n: ps.n,
        },
      ];
    }
    case 'app': {
      const ps = approachSummary(approachInBand(p.approach, 'all'));
      const ts = approachSummary(approachInBand(t.approach, 'all'));
      const miss = (k: 'short' | 'long' | 'left' | 'right', label: string): StatTile => ({
        label,
        player: share(ps.misses[k], ps.n),
        team: share(ts.misses[k], ts.n),
        format: pct,
        lowerBetter: true,
        n: ps.n,
      });
      return [
        { label: 'Proximity', player: ps.proximity, team: ts.proximity, format: feet, lowerBetter: true, n: ps.n },
        { label: 'Greens hit', player: ps.girPct, team: ts.girPct, format: pct, lowerBetter: false, n: ps.n },
        miss('short', 'Missed short'),
        miss('long', 'Missed long'),
        miss('left', 'Missed left'),
        miss('right', 'Missed right'),
      ];
    }
    case 'atg': {
      const ps = chipSummary(p.chips);
      const ts = chipSummary(t.chips);
      const lie = (id: 'fairway' | 'rough' | 'sand', label: string): StatTile => {
        const pl = chipsIn(p.chips, 'all', id);
        return {
          label,
          player: chipSummary(pl).upAndDownPct,
          team: chipSummary(chipsIn(t.chips, 'all', id)).upAndDownPct,
          format: pct,
          lowerBetter: false,
          n: pl.length,
        };
      };
      return [
        { label: 'Up & down', player: ps.upAndDownPct, team: ts.upAndDownPct, format: pct, lowerBetter: false, n: ps.n },
        { label: 'Inside 4 ft', player: ps.inside4Pct, team: ts.inside4Pct, format: pct, lowerBetter: false, n: ps.leaves.length },
        { label: 'Median leave', player: ps.medianLeave, team: ts.medianLeave, format: feet, lowerBetter: true, n: ps.leaves.length },
        lie('fairway', 'From fairway'),
        lie('rough', 'From rough'),
        lie('sand', 'From sand'),
      ];
    }
    case 'putt': {
      const ps = puttSummary(p.putts);
      const ts = puttSummary(t.putts);
      const band = (id: '3' | '5', label: string): StatTile => {
        const pl = puttsIn(p.putts, id);
        return {
          label,
          player: puttSummary(pl).makePct,
          team: puttSummary(puttsIn(t.putts, id)).makePct,
          format: pct,
          lowerBetter: false,
          n: pl.length,
        };
      };
      const down = puttsIn(p.putts, 'all', 'all', 'down');
      return [
        band('3', 'Make 3–5 ft'),
        band('5', 'Make 5–10 ft'),
        {
          label: '3-putt rate',
          player: ps.threePuttPct,
          team: ts.threePuttPct,
          format: pct,
          lowerBetter: true,
          n: p.putts.filter((x) => x.first).length,
        },
        { label: 'Misses low side', player: ps.lowPct, team: ts.lowPct, format: pct, lowerBetter: true, n: ps.misses },
        { label: 'Misses short', player: ps.shortPct, team: ts.shortPct, format: pct, lowerBetter: true, n: ps.misses },
        {
          label: 'Downhill make',
          player: puttSummary(down).makePct,
          team: puttSummary(puttsIn(t.putts, 'all', 'all', 'down')).makePct,
          format: pct,
          lowerBetter: false,
          n: down.length,
        },
      ];
    }
  }
}

/** Worse / better than the team by more than 5% of the team figure. */
export function tileVerdict(tile: StatTile): 'worse' | 'better' | 'even' | 'thin' {
  if (tile.player == null || tile.n < LOW_SAMPLE) return 'thin';
  if (tile.team == null) return 'even';
  const margin = Math.max(Math.abs(tile.team) * 0.05, 0.5);
  const diff = tile.player - tile.team;
  if (Math.abs(diff) <= margin) return 'even';
  const higherIsWorse = tile.lowerBetter;
  return diff > 0 === higherIsWorse ? 'worse' : 'better';
}
