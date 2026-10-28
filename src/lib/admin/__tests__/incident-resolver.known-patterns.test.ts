import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }));

import { KNOWN_NON_ACTIONABLE_INCIDENTS } from '../incident-resolver';

/** Postgres ILIKE semantics for the subset these patterns use: `%` = any run, `_` = one char. */
function ilikeMatches(pattern: string, value: string): boolean {
  const source = pattern
    .split('')
    .map((ch) => {
      if (ch === '%') return '.*';
      if (ch === '_') return '.';
      return ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('');
  return new RegExp(`^${source}$`, 'is').test(value);
}

function patternFor(label: string): string {
  const entry = KNOWN_NON_ACTIONABLE_INCIDENTS.find((c) => c.label === label);
  if (!entry?.messageMatch) throw new Error(`no messageMatch for ${label}`);
  return entry.messageMatch;
}

describe('KNOWN_NON_ACTIONABLE_INCIDENTS message patterns', () => {
  it('matches the philosophy-gate message the app emits today (insights-coachhelm.ts)', () => {
    // Exact message production writes to admin_events (fingerprint c55b9c6f,
    // 2026-10-27). The old pattern required a literal "insight(s)" and never
    // matched it, so the hygiene sweep skipped it and it reopened 4 times.
    const live =
      '[insights.triggerPlayerInsightsAfterRound] philosophy gate filtered tier-1 insights';
    expect(ilikeMatches(patternFor('coachhelm_philosophy_gate_counts'), live)).toBe(true);
  });

  it('still matches the older count-bearing form of the message', () => {
    const legacy = 'philosophy gate filtered 3 of 5 tier-1 insight(s)';
    expect(ilikeMatches(patternFor('coachhelm_philosophy_gate_counts'), legacy)).toBe(true);
  });

  it('does not sweep unrelated CoachHelm failures', () => {
    const unrelated = '[insights.triggerPlayerInsightsAfterRound] tier-1 insight save failed';
    expect(ilikeMatches(patternFor('coachhelm_philosophy_gate_counts'), unrelated)).toBe(false);
  });
});
