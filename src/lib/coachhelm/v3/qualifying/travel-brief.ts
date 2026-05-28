/**
 * v3 Qualifying travel-brief composer (W32).
 *
 * Deterministic markdown builder — no LLM. Produces a short summary of
 * the selection result suitable for pushing into coach chat as a
 * system-generated assistant message.
 */

import type { QualifyingWorkspace, SelectionCandidate } from './types';

function formatScore(c: SelectionCandidate): string {
  if (c.total_to_par === null) return 'N/A';
  const sign = c.total_to_par > 0 ? '+' : '';
  return `${sign}${c.total_to_par} (${c.total_score ?? '–'})`;
}

export function composeTravelBrief(workspace: QualifyingWorkspace): string {
  const lines: string[] = [];

  lines.push(`## ✈️ Qualifying Selection — ${workspace.name}`);
  lines.push('');
  lines.push(
    `**Date:** ${workspace.start_date}${workspace.end_date ? ` – ${workspace.end_date}` : ''}`,
  );
  lines.push(`**Slots:** ${workspace.selection_slots_total} total`);
  lines.push('');

  const topScore = workspace.candidates.filter(
    (c) => c.selection?.selection_type === 'top_score',
  );
  const coachPicks = workspace.candidates.filter(
    (c) => c.selection?.selection_type === 'coach_pick',
  );

  if (topScore.length > 0) {
    lines.push('### Auto-Qualified (Top Score)');
    lines.push('');
    for (const c of topScore) {
      lines.push(
        `- **${c.player_first_name} ${c.player_last_name}** — #${c.leaderboard_rank} — ${formatScore(c)}`,
      );
    }
    lines.push('');
  }

  if (coachPicks.length > 0) {
    lines.push("### Coach's Picks");
    lines.push('');
    for (const c of coachPicks) {
      const reasoning = c.selection?.coach_reasoning ?? '';
      lines.push(
        `- **${c.player_first_name} ${c.player_last_name}** — ${formatScore(c)}`,
      );
      if (reasoning) {
        lines.push(`  > ${reasoning}`);
      }
    }
    lines.push('');
  }

  lines.push('---');
  lines.push('*This brief was auto-generated when the selection was confirmed.*');

  return lines.join('\n');
}
