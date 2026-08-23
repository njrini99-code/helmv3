/**
 * The only automatic qualifier lifecycle transition is the first submitted
 * round starting an `upcoming` qualifier. There is intentionally no automatic
 * transition to `completed`: scheduled dates and entrant progress never close
 * a qualifier. A coach must explicitly use the manual close action.
 */
export function getQualifierAutomaticTransition(
  status: string | null | undefined,
): 'in_progress' | null {
  return status === 'upcoming' ? 'in_progress' : null;
}
