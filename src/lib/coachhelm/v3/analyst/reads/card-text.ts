/**
 * CoachHelm reads: a card as plain text, for the owner's grading sheet (the dry run prints one per player). Ids only,
 * no names. Pure.
 */
import type { ReadPayload } from './types';

export function cardText(p: ReadPayload): string {
  const lines = [`PLAYER ${p.player_id}`, `  ${p.freshness.through_text}${p.freshness.stale_text ? `. ${p.freshness.stale_text}` : ''}`];
  const c = p.priority;
  if (!c) {
    lines.push(`  ${p.missing?.text ?? 'No read.'}`);
  } else {
    lines.push(`  [${c.certainty_word}] ${c.headline}`, `  ${c.where_text}`);
    if (c.team) lines.push(`  Team (coach only): ${c.team.value.text}`);
    lines.push('  How we found this:', ...c.how_we_found.map((s) => `    - ${s}`), `  What would change this: ${c.what_would_change}`);
    if (c.evidence.length) {
      lines.push('  The rounds behind it:');
      for (const e of c.evidence) {
        lines.push(`    ${e.date_text}${e.course ? `, ${e.course}` : ''}${e.score_text ? `, ${e.score_text}` : ''}: ${e.line}  (round ${e.round_id})`);
        for (const s of e.carry) lines.push(`      ${s.text}  (shot ${s.shot_id})`);
      }
    }
  }
  lines.push('  Grade: right / wrong / so what. Note: ____');
  return lines.join('\n');
}
