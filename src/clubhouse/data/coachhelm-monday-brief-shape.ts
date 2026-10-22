import { briefCountsLine, briefTeamLine, type MondayBrief } from '@/lib/coachhelm/v3/monday-brief/brief';
import { LADDER_RUNG_WORD } from '@/lib/coachhelm/v3/monday-brief/words';

/**
 * The coach Monday brief as the Clubhouse view draws it (P013 `?view=monday-brief`, flag `coachhelm_monday_brief_v1`; CoachHelm
 * task chs-28, supercharge 04 §4 and Layout 1). Pure: the engine's brief in, the view's words out. Words and raw strokes, never a
 * percent or a priority word.
 */

export const COACH_MONDAY_BRIEF_HREF = '/golf/dashboard/coachhelm?view=monday-brief';

export interface ChBriefRow {
  id: string;
  kind: 'team_pattern' | 'read';
  /** The player's name, or "Team pattern". */
  who: string;
  title: string;
  /** The ladder word on a read; the members line on the team pattern. */
  tag: string;
  /** "0.8 strokes a round"; null when the pattern's sum is under 0.1. */
  strokes: string | null;
  /** The practice block the pattern's members share; reads have none. */
  next: string | null;
  /** "1 round behind" when the read has not seen the newest round yet. */
  behind: string | null;
  href: string;
}

export interface ChMondayBrief {
  /** "9 players · 6 with enough rounds · 14 countable rounds last week". */
  team: string;
  /** "Week of Oct 12". */
  week: string;
  rows: ChBriefRow[];
  /** "2 new · 1 cleared · 0 contradicted · 1 out of date". */
  counts: string;
  /** "Cleared this week": "Priya Shah · Three-putts". */
  cleared: string[];
  /** The out-of-date line under the fold; null when none is behind. */
  outOfDate: string | null;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function shortDay(day: string): string {
  const t = Date.parse(`${day}T00:00:00Z`);
  if (!Number.isFinite(t)) return day;
  const d = new Date(t);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

const strokesWords = (n: number) => `${n.toFixed(1)} ${n === 1 ? 'stroke' : 'strokes'} a round`;

const BOARD = '/golf/dashboard/coachhelm';

export function toChMondayBrief(b: MondayBrief): ChMondayBrief {
  const rows: ChBriefRow[] = b.items.map((it) =>
    it.kind === 'team_pattern'
      ? {
          id: `tp:${it.id}`,
          kind: 'team_pattern',
          who: 'Team pattern',
          title: it.title,
          tag: it.members,
          strokes: it.strokes !== null ? `about ${strokesWords(it.strokes)} across the team` : null,
          next: it.next,
          behind: null,
          href: BOARD,
        }
      : {
          id: it.insight_id,
          kind: 'read',
          who: it.player_name,
          title: it.title,
          tag: LADDER_RUNG_WORD[it.ladder],
          strokes: strokesWords(it.strokes),
          next: null,
          behind: it.rounds_behind === 1 ? 'Its newest round is not in it yet' : null,
          href: `${BOARD}?player=${encodeURIComponent(it.player_id)}`,
        },
  );
  const n = b.counts.out_of_date;
  return {
    team: briefTeamLine(b),
    week: `Week of ${shortDay(b.week_start)}`,
    rows,
    counts: briefCountsLine(b.counts),
    cleared: b.cleared.map((c) => `${c.player_name} · ${c.title}`),
    outOfDate: n > 0 ? `Out of date (${n}): ${n === 1 ? 'a newer round is' : 'newer rounds are'} not in ${n === 1 ? 'this read' : 'these reads'} yet. Reads two or more rounds behind are left out of the brief.` : null,
  };
}
