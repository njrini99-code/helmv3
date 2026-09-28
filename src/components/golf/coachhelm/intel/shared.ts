/**
 * Shared contract + formatting for the CoachHelm Home (Team intelligence).
 * Plain module: no hooks, no 'use client', so a server `loading.tsx` may use
 * the formatters too.
 */
import type { ApproachMiss, IntelRound, IntelTheme, TeamIntelligenceData } from '@/lib/golf/team-intelligence/types';

/** What every "cause" visual (tee / approach / around the green / putting)
 *  receives. Each owns its own drill state (band, lie, break …). */
export interface CauseProps {
  data: TeamIntelligenceData;
  /** Round indices (into `data.rounds`) inside the current round-type + window slice. */
  allowed: ReadonlySet<number>;
  /** The player the coach picked in "Who's contributing"; null = whole team. */
  playerId: string | null;
  /** That player's display name, for the overline. */
  playerName: string | null;
  className?: string;
}

export const THEME_LABEL: Record<IntelTheme, string> = {
  tee: 'Off the tee',
  app: 'Approach',
  atg: 'Around the green',
  putt: 'Putting',
};

/** Short form for tight places (theme cards at phone width). */
export const THEME_SHORT: Record<IntelTheme, string> = {
  tee: 'Tee',
  app: 'Approach',
  atg: 'Around green',
  putt: 'Putting',
};

/** Lower-case phrase for sentences: "SG approach / rd". */
export const THEME_PHRASE: Record<IntelTheme, string> = {
  tee: 'off the tee',
  app: 'approach',
  atg: 'around the green',
  putt: 'putting',
};

const ONE_DECIMAL = new Intl.NumberFormat('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const DECIMALS = [0, 1, 2].map(
  (d) => new Intl.NumberFormat('en-US', { minimumFractionDigits: d, maximumFractionDigits: d, useGrouping: false }),
);

/** Signed, one decimal, true minus: +0.4 / −1.2 / 0.0. */
export function formatSg(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  const rounded = Math.round(value * 10) / 10;
  if (rounded === 0) return '0.0';
  return `${rounded > 0 ? '+' : '−'}${ONE_DECIMAL.format(Math.abs(rounded))}`;
}

/** Whole percent, or an em dash for no data. */
export function formatPct(value: number | null | undefined): string {
  return value == null || !Number.isFinite(value) ? '—' : `${Math.round(value)}%`;
}

export function formatFeet(value: number | null | undefined, digits = 0): string {
  return value == null || !Number.isFinite(value) ? '—' : `${DECIMALS[Math.max(0, Math.min(2, digits))]!.format(value)} ft`;
}

/** Plain fixed decimals (no sign), e.g. 0.8. */
export function formatDecimal(value: number, digits: 0 | 1 | 2): string {
  return DECIMALS[digits]!.format(value);
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('');
}

/** Round indices of a filtered round list, for `CauseProps.allowed`. */
export function roundIndexSet(all: readonly IntelRound[], kept: readonly IntelRound[]): Set<number> {
  const keep = new Set(kept.map((r) => r.id));
  const out = new Set<number>();
  all.forEach((r, i) => {
    if (keep.has(r.id)) out.add(i);
  });
  return out;
}

/** Tone of an SG figure: amber when losing strokes, green when gaining. */
export function sgTone(value: number | null | undefined): 'loss' | 'gain' | 'flat' {
  if (value == null || !Number.isFinite(value) || Math.abs(value) < 0.05) return 'flat';
  return value < 0 ? 'loss' : 'gain';
}

/** Text class per tone. Loss ink is the warning text token (AA on the card). */
export const SG_TONE_TEXT: Record<'loss' | 'gain' | 'flat', string> = {
  loss: 'text-fw-warning-text',
  gain: 'text-accent-ink',
  flat: 'text-text-primary',
};

/** Readable miss direction: "short_left" → "short left". */
export const MISS_LABEL: Record<ApproachMiss, string> = {
  short: 'short',
  long: 'long',
  left: 'left',
  right: 'right',
  short_left: 'short left',
  short_right: 'short right',
  long_left: 'long left',
  long_right: 'long right',
};
