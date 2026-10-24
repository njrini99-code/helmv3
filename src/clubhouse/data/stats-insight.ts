import { formatSigned } from '../lib/format';
import { halvesTone } from '../lib/stats-signal';
import type { ChSgChange } from './stats-common';
import type { ChCompare } from './stats-figures';
import { previousWords } from './stats-filter';
import type { ChFigure } from './stats-team';

/**
 * Row 70, the card at the top of Stats (in the manner of Apple Health's Trends): the one or two changes that are real, said in words,
 * before any figure. Only a change the page itself tones counts: each comes from a figure the page already draws with its standard
 * error, through the one change rule (A1, row 93), so the card never claims more than the figure further down. With changes to
 * compare and none past its error the card says "No clear change"; with nothing to compare (no earlier window) it is not drawn.
 */
export interface ChInsightChange {
  /** What moved, as the page names it ("Scoring avg"). */
  subject: string;
  delta: number;
  /** The change's standard error; null or absent: unmeasured, never a change. */
  se: number | null | undefined;
  lowerIsBetter: boolean;
  digits: number;
  /** What the change is against, in the page's words ("vs previous 10"). */
  against: string;
}

export interface ChInsightLine {
  subject: string;
  /** The signed change as the page prints it ("−1.2"; a rate's change in points, "+3", as the page prints it). */
  figure: string;
  tone: 'is-gain' | 'is-loss';
  /** "Scoring avg, better vs previous 10". */
  words: string;
}

export type ChInsight = { state: 'changes'; lines: ChInsightLine[] } | { state: 'none'; against: string } | null;

/** The card's state from the page's changes (null entries are figures with nothing to compare), most `most` lines, largest first. */
export function statsInsight(changes: ReadonlyArray<ChInsightChange | null>, most = 2): ChInsight {
  const known = changes.filter((c): c is ChInsightChange => c != null && Number.isFinite(c.delta));
  if (!known.length) return null;
  const toned = known
    .map((c) => ({ c, tone: halvesTone({ delta: c.delta, se: c.se ?? null }, c.lowerIsBetter, c.digits) }))
    .filter((x): x is { c: ChInsightChange; tone: 'is-gain' | 'is-loss' } => x.tone !== '')
    // The clearest first: how many standard errors each change is. `se` is set here: halvesTone returns '' for a null
    // se, and those were filtered out above.
    .sort((a, b) => Math.abs(b.c.delta) / b.c.se! - Math.abs(a.c.delta) / a.c.se!);
  if (!toned.length) return { state: 'none', against: known[0]!.against };
  return {
    state: 'changes',
    lines: toned.slice(0, most).map(({ c, tone }) => ({
      subject: c.subject,
      figure: formatSigned(c.delta, c.digits),
      tone,
      words: `${c.subject}, ${tone === 'is-gain' ? 'better' : 'worse'} ${c.against}`,
    })),
  };
}

/**
 * Team stats: every figure the page draws with a change (the phone hero and figure rows, the desktop trend and tape). Each change is
 * against the previous window (`against`, "vs previous 10"); a figure's own context can name something else ("Tour averages 66%").
 */
export function teamInsight(figures: ReadonlyArray<Pick<ChFigure, 'label' | 'delta' | 'se' | 'lowerIsBetter' | 'digits'>>, against: string): ChInsight {
  return statsInsight(
    figures.map((f) => (f.delta == null ? null : { subject: f.label, delta: f.delta, se: f.se, lowerIsBetter: f.lowerIsBetter, digits: f.digits, against })),
  );
}

/**
 * A player's Stats: strokes gained a round against the previous window (the SG chip), and the window against the one before it
 * (Game detail's comparison: scoring, greens, fairways, putts).
 */
export function playerInsight(p: { sgChange: ChSgChange; extra: { compare: ChCompare | null }; filter: { last: number } }): ChInsight {
  const against = previousWords(p.filter.last);
  const sg = p.sgChange.delta == null ? null : { subject: 'Strokes gained a round', delta: p.sgChange.delta, se: p.sgChange.se, lowerIsBetter: false, digits: 1, against: p.sgChange.context || against };
  const rows = (p.extra.compare?.rows ?? []).map((r) =>
    r.last == null || r.previous == null ? null : { subject: r.label, delta: r.last - r.previous, se: r.se, lowerIsBetter: r.lowerIsBetter, digits: r.digits, against },
  );
  return statsInsight([sg, ...rows]);
}
