/**
 * TEMP redesign direction B (removed before ship) · the section model.
 *
 * One settings route, one section at a time, chosen by `?section=<id>`.
 *
 * ORDER IS JOB RANK, NOT CODE ORDER (docs/redesign/settings/brief.md, "Ranked
 * tasks" and top problem #2). The old page led with account chores and buried
 * the coach's team and CoachHelm controls 60-90% of the way down. On a 390px
 * phone the switcher shows about three segments before it scrolls, so the
 * first three here are the ones each role came for. Help & legal is always
 * last. Reordering is a one-line change to the two arrays below.
 */

import type { SettingsProfile } from '@/components/fairway/pages/settings/use-settings-profile';

export type SectionId =
  | 'team'
  | 'coachhelm'
  | 'notifications'
  | 'preferences'
  | 'account'
  | 'golf'
  | 'help';

export interface SectionDef {
  id: SectionId;
  label: string;
}

const LABELS: Record<SectionId, string> = {
  team: 'Team',
  coachhelm: 'CoachHelm',
  notifications: 'Notifications',
  preferences: 'Preferences',
  account: 'Account',
  golf: 'Golf',
  help: 'Help & legal',
};

/** Coach: (1) team, reminders, scoring, invite (2) CoachHelm (3) notifications. */
const COACH_ORDER: readonly SectionId[] = [
  'team',
  'coachhelm',
  'notifications',
  'preferences',
  'account',
  'help',
];

/** Player: (1) notifications (2) golf details + team membership. */
const PLAYER_ORDER: readonly SectionId[] = [
  'notifications',
  'golf',
  'preferences',
  'account',
  'help',
];

/**
 * A section only exists when the data behind its panels does: a coach without
 * a team has no Team section (its panels would render an empty form and a
 * dash for the invite code), a coach record without an id has no CoachHelm.
 */
function isAvailable(id: SectionId, profile: SettingsProfile): boolean {
  switch (id) {
    case 'team':
      return profile.role === 'coach' && Boolean(profile.teamId);
    case 'coachhelm':
      return profile.role === 'coach' && Boolean(profile.coachId);
    case 'golf':
      return profile.role === 'player' && Boolean(profile.playerId);
    default:
      return true;
  }
}

export function sectionsFor(profile: SettingsProfile): SectionDef[] {
  const order = profile.role === 'coach' ? COACH_ORDER : PLAYER_ORDER;
  return order
    .filter((id) => isAvailable(id, profile))
    .map((id) => ({ id, label: LABELS[id] }));
}

/**
 * The section to show for a raw `?section=` value. An unknown id, or one this
 * role does not have (a coach deep-linked to `golf`), falls back to the first
 * section rather than rendering an empty pane.
 */
export function resolveSection(raw: string | null, sections: readonly SectionDef[]): SectionId {
  const match = sections.find((s) => s.id === raw) ?? sections[0];
  // Never empty in practice: every role has Notifications, Preferences,
  // Account and Help & legal.
  return match ? match.id : 'account';
}
