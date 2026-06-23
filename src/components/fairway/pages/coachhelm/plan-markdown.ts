/**
 * ============================================================================
 * planToMarkdown — pure serializer: PracticePlan → a clean markdown document.
 * ----------------------------------------------------------------------------
 * Used by the team-CoachHelm drill-down to (a) render a readable plan preview
 * and (b) produce the exact body saved to Documents (saveTextDocument) and
 * attached to a scheduled practice. No React, no I/O — trivially unit-testable.
 *
 * The composer returns drill IDS per day; this resolves them to titles +
 * durations via the candidate-drill list the action returned alongside the
 * plan, so the saved document reads in plain English, not opaque UUIDs.
 * ========================================================================== */

import type { PracticePlan } from '@/lib/coachhelm/v3/practice-rx/composer';

export interface PlanMarkdownDrill {
  id: string;
  title: string;
  duration_min: number;
}

export interface PlanToMarkdownInput {
  areaLabel: string;
  kind: 'strength' | 'weakness';
  plan: PracticePlan;
  drills: PlanMarkdownDrill[];
}

/** Serialize a practice plan to a markdown document body. */
export function planToMarkdown({ areaLabel, kind, plan, drills }: PlanToMarkdownInput): string {
  const byId = new Map<string, PlanMarkdownDrill>();
  for (const d of drills) byId.set(d.id, d);

  const intro =
    kind === 'weakness'
      ? `A focused 7-day block to lift the team's **${areaLabel.toLowerCase()}** — the area rating below the mid-line.`
      : `A 7-day block to sustain and sharpen the team's **${areaLabel.toLowerCase()}** strength.`;

  const lines: string[] = [
    `# Team practice — ${areaLabel}`,
    '',
    intro,
    '',
    `_Drafted by CoachHelm${plan.used_llm ? '' : ' (template fallback)'} · 7-day block_`,
    '',
  ];

  const days = [...plan.days].sort((a, b) => a.day - b.day);
  if (days.length === 0) {
    // With the composer's structured template fallback, an empty plan only
    // remains possible when the area has NO drills tagged at all — so name that
    // cause honestly rather than implying the AI failed.
    lines.push('_No drills are tagged to this area yet. Add drills in the content library, then regenerate._');
  }

  for (const day of days) {
    lines.push(`## Day ${day.day}`);
    if (day.prose) lines.push(day.prose);
    const dayDrills = day.drill_ids
      .map((id) => byId.get(id))
      .filter((d): d is PlanMarkdownDrill => Boolean(d));
    if (dayDrills.length > 0) {
      lines.push('');
      for (const d of dayDrills) {
        lines.push(`- ${d.title} (${d.duration_min} min)`);
      }
    }
    lines.push('');
  }

  return lines.join('\n').trimEnd() + '\n';
}
