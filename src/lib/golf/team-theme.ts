/**
 * Team theming for the men's/women's program toggle.
 *
 * A program (organization) can run a men's AND a women's team. When a dual-team
 * head/director-of-golf switches the active team, the UI gives a clear, premium
 * cue of which team they're viewing: the toggle's active segment, a faint top
 * wash, and a 2px top-bar underline all adopt the active team's accent.
 *
 * Men's = the locked helm green; Women's = a refined violet (tokens in
 * design-tokens.css). The accent is intentionally scoped to these few
 * affordances — the rest of the UI stays green-forward.
 */

export type TeamGender = 'mens' | 'womens';

/** Normalise golf_teams.gender, tolerating legacy spellings. */
export function normalizeTeamGender(gender: string | null | undefined): TeamGender | null {
  const g = (gender ?? '').toLowerCase();
  if (g === 'mens' || g === 'men' || g === 'male') return 'mens';
  if (g === 'womens' || g === 'women' || g === 'female') return 'womens';
  return null;
}

/** Short label for a normalised gender ("Men's" / "Women's"). */
export function teamGenderLabel(gender: TeamGender): string {
  return gender === 'mens' ? "Men's" : "Women's";
}

/**
 * The CSS accent for a team gender, as a `var(...)` reference so it tracks the
 * design tokens (and light/dark/forced-colors overrides). Returns `undefined`
 * when there is no gender to theme (single-team coaches / players / unknown) so
 * callers can treat "no accent" as "leave the UI unchanged".
 */
export function teamAccentVar(gender: TeamGender | null | undefined): string | undefined {
  if (gender === 'mens') return 'var(--fw-color-team-mens)';
  if (gender === 'womens') return 'var(--fw-color-team-womens)';
  return undefined;
}
