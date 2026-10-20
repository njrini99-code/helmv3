import type { ComparisonLine, InsightEvidence } from '@/lib/coachhelm/v2/insights/types';

/**
 * The team line a read prints when its evidence carries a team pool as the
 * primary comparison (CoachHelm Slice 7a, written only with
 * `coachhelm_team_pool_v1` on): "Team pool 72% (240 putts)",
 * "Team pool 4.31 (1,080 holes)", "Team pool 0.6 a round (212 rounds)".
 *
 * Anonymised by construction: the line is one pooled number and its count,
 * never a teammate's name, number or rank (`03` §5.2). Null when the read has
 * no team line, so every surface keeps its own wording.
 *
 * Pure; shared by the Clubhouse Deep dive Read and the Fairway evidence panel.
 */
export function teamPoolLine(ev: Pick<InsightEvidence, 'comparison'> | null | undefined): string | null {
  const p = ev?.comparison?.primary;
  if (!p || p.source !== 'team_pool') return null;
  if (typeof p.value !== 'number' || !Number.isFinite(p.value)) return null;
  if (typeof p.n !== 'number' || !Number.isFinite(p.n) || p.n <= 0) return null;
  const noun = p.n_noun ?? p.n_unit ?? '';
  const count = `${Math.round(p.n).toLocaleString('en-US')}${noun ? ` ${noun}` : ''}`;
  return `${p.label || 'Team pool'} ${formatValue(p)} (${count})`;
}

function formatValue(p: ComparisonLine): string {
  if (p.unit === 'percent') {
    const v = Math.abs(p.value) < 10 ? Math.round(p.value * 10) / 10 : Math.round(p.value);
    return `${v}%`;
  }
  if (p.unit === 'strokes') return p.value.toFixed(2);
  if (p.n_unit === 'rounds') return `${p.value.toFixed(1)} a round`;
  return String(Math.round(p.value * 10) / 10);
}
