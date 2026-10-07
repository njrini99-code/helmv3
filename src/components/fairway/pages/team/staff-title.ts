/**
 * Coaching-staff row copy (Team Info, coach view).
 *
 * The row names the coach's role once, in the pill ("Head coach" /
 * "Assistant coach"). The coach's stored title (`golf_coaches.title`) is often
 * the same words in different casing ("Head Coach"), which printed the role
 * twice on one row with two spellings. The title is shown only when it says
 * something the pill does not ("Director of Golf").
 */

export function staffRoleLabel(role: string): string {
  return role === 'head_coach' ? 'Head coach' : 'Assistant coach';
}

function comparable(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/** The stored title, or null when it is empty or only repeats the role. */
export function distinctStaffTitle(title: string | null | undefined, roleLabel: string): string | null {
  const trimmed = title?.trim();
  if (!trimmed) return null;
  return comparable(trimmed) === comparable(roleLabel) ? null : trimmed;
}
