/**
 * ============================================================================
 * Who may see a team meeting
 * ----------------------------------------------------------------------------
 * A meeting (`golf_events.event_type = 'meeting'`) is often for a few people: a
 * 1:1, a captains' meeting, a parent call. Its title says who and why. Every
 * other event type is the team's and stays visible to the whole roster, invite
 * list or not.
 *
 * The rule (the same one Clubhouse applies, `playerSeesMeeting` in
 * src/clubhouse/screens/calendar/model.ts): a player sees a meeting only when
 * they have their own `golf_event_attendance` row on it, i.e. the coach invited
 * them. A meeting nobody is invited to is the coach's own. A coach sees every
 * meeting on their team.
 *
 * Fail closed: when the player's own rows cannot be read, no meeting is shown.
 * (Clubhouse falls back to "any meeting with an invitee" in that case; Fairway
 * does not, so a failed read never shows a player a meeting they are not on.)
 *
 * The database enforces the same rule once migration
 * 20261018120000_golf_events_meetings_invitees_only.sql is applied
 * (supabase/migrations/HELD.md). Until then the readers below are the only
 * thing keeping the title off a teammate's screen.
 *
 * Pure module: safe in client components. The server loader that reads the
 * invites and logs a failed read is `meeting-invites.ts`.
 * ========================================================================== */

/** `golf_events.event_type` value of an invite-only team meeting. */
export const MEETING_EVENT_TYPE = 'meeting';

export function isMeetingEvent(event: { event_type?: string | null }): boolean {
  return event.event_type === MEETING_EVENT_TYPE;
}

/**
 * Drop the meetings a player is not invited to. `invitedMeetingIds` is the set
 * of meeting ids the player has their own attendance row on; `null` means that
 * read failed, and then every meeting is dropped. Every other event passes.
 */
export function hideUninvitedMeetings<T extends { id: string; event_type?: string | null }>(
  events: readonly T[],
  invitedMeetingIds: ReadonlySet<string> | null,
): T[] {
  return events.filter((event) => !isMeetingEvent(event) || (invitedMeetingIds?.has(event.id) ?? false));
}
