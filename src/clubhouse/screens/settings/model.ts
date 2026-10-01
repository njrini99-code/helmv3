import type { CoachPhilosophy } from '@/lib/coachhelm/types';
import type { ChannelPref, NotificationCategory, PrefsByCategory } from '@/lib/coachhelm/v3/notifications/router';

/**
 * Settings (Clubhouse): one page with a section rail. Every section carries
 * its own `error`: a failed read renders a notice in that section, and its
 * Save stays disabled so a blank form can never be written back over real
 * data (the old page's hazard).
 */

export type ChSettingsSection = 'account' | 'notifications' | 'preferences' | 'team' | 'golf' | 'coachhelm';

export const SECTIONS: Record<'coach' | 'player', ReadonlyArray<{ id: ChSettingsSection; label: string; hint: string }>> = {
  coach: [
    { id: 'account', label: 'Account', hint: 'Profile, email, password' },
    { id: 'notifications', label: 'Notifications', hint: 'Email and push' },
    { id: 'team', label: 'Team', hint: 'Scoring, reminders, invites' },
    { id: 'coachhelm', label: 'CoachHelm', hint: 'Priorities and alerts' },
    { id: 'preferences', label: 'Preferences', hint: 'Motion, haptics and units' },
  ],
  player: [
    { id: 'account', label: 'Account', hint: 'Profile, email, password' },
    { id: 'golf', label: 'Golf profile', hint: 'Handicap and team' },
    { id: 'notifications', label: 'Notifications', hint: 'Email, push, CoachHelm' },
    { id: 'preferences', label: 'Preferences', hint: 'Motion, haptics and units' },
  ],
};

export function parseSection(v: string | undefined | null, role: 'coach' | 'player'): ChSettingsSection {
  const list = SECTIONS[role];
  return list.find((s) => s.id === v)?.id ?? 'account';
}

export type ChDeliveryPrefs = Record<string, boolean>;

export interface ChScoring {
  scoringFormat: 'stroke_play' | 'match_play';
  handicapSystem: 'usga' | 'world' | 'none';
  defaultTees: 'black' | 'blue' | 'white' | 'gold';
  timezone: string;
}

export interface ChReminders {
  enabled: boolean;
  earlyHours: number;
  lateMinutes: number;
}

export interface ChTeamInfo {
  id: string;
  name: string;
  season: string;
  org: { id: string; name: string; city: string; state: string; division: string; conference: string } | null;
}

export interface ChGolfDetails {
  handicap: string;
  handicapIndex: string;
  graduationYear: string;
  hometown: string;
  state: string;
  phone: string;
}

export interface ChJoinRequest {
  id: string;
  teamName: string;
  createdAt: string;
}

export interface ChCoachHelmSettings {
  /** golf_coachhelm_settings: this coach's own dashboards. */
  coach: { enabled: boolean; showInsights: boolean; showPredictions: boolean; showPatterns: boolean };
  /** golf_team_coachhelm_settings: the team master switch (head coach only). */
  team: { enabled: boolean; disabledAt: string | null; isHeadCoach: boolean } | null;
  /** golf_coach_philosophy; null id means no row yet (the first save creates it). */
  philosophy: CoachPhilosophy & { id: string | null };
}

type Section<T> = { value: T; error: false } | { value: null; error: true };

export interface ChSettingsData {
  role: 'coach' | 'player';
  userId: string;
  email: string | null;
  coachId: string | null;
  playerId: string | null;
  teamId: string | null;
  teamName: string | null;
  profile: Section<{ firstName: string; lastName: string; fullName: string; avatarUrl: string | null }>;
  delivery: Section<ChDeliveryPrefs>;
  /** Players only: the CoachHelm updates matrix (golf_player_notification_state). */
  playerRouting: Section<{ prefs: PrefsByCategory; quiet: boolean }> | null;
  /** Coaches only: the weekly team email. */
  digest: Section<boolean> | null;
  scoring: Section<ChScoring> | null;
  reminders: Section<ChReminders> | null;
  team: Section<ChTeamInfo> | null;
  joinCode: Section<string> | null;
  golf: Section<ChGolfDetails> | null;
  membership: Section<{ team: { id: string; name: string; orgName: string | null } | null; requests: ChJoinRequest[] }> | null;
  coachhelm: Section<ChCoachHelmSettings> | null;
}

/** A player's team and pending join requests (a read that worked). */
export type ChMembership = Extract<NonNullable<ChSettingsData['membership']>, { error: false }>['value'];

// ── Notification labels (the current app's, verbatim) ──

export const ROUTING_LABEL: Record<NotificationCategory, string> = {
  round_review_ready: 'Round review ready',
  coach_assigned_goal: 'Your coach assigned a goal',
  goal_achieved: 'Goal achieved',
  goal_missed: 'Goal missed',
  new_insight: 'New insight',
  composite_insight: 'Pattern across several rounds',
  weekly_digest: 'Weekly digest',
  coach_commented: 'Your coach commented',
  engine_suggested_goal: 'Suggested goal',
  standing_percentile_changed: 'Team standing changed',
};

export const ROUTING_GROUPS: ReadonlyArray<{ label: string; categories: NotificationCategory[] }> = [
  { label: 'Rounds and reviews', categories: ['round_review_ready', 'standing_percentile_changed'] },
  { label: 'Goals', categories: ['coach_assigned_goal', 'goal_achieved', 'goal_missed', 'engine_suggested_goal'] },
  { label: 'Insights', categories: ['new_insight', 'composite_insight', 'coach_commented'] },
];

export const ROUTING_QUIET_EXEMPT: ReadonlySet<NotificationCategory> = new Set(['round_review_ready', 'coach_assigned_goal']);

export const DEFAULT_CHANNELS: ChannelPref = { push: false, email: false, in_app: true };

export function channelsFor(prefs: PrefsByCategory, c: NotificationCategory): ChannelPref {
  return { ...DEFAULT_CHANNELS, ...(prefs[c] ?? {}) };
}

// ── Team settings choices ──

export const HANDICAP_OPTIONS = [
  { value: 'usga', label: 'USGA Handicap' },
  { value: 'world', label: 'World Handicap System' },
  { value: 'none', label: 'No handicap' },
] as const;

/** The distance a shot or a hole shows in. Display only: shots are stored in yards and feet either way. */
export const DISTANCE_OPTIONS = [
  { value: 'yards', label: 'Yards' },
  { value: 'meters', label: 'Meters' },
] as const;

export const TIMEZONE_OPTIONS = [
  { value: 'America/New_York', label: 'Eastern (ET)' },
  { value: 'America/Chicago', label: 'Central (CT)' },
  { value: 'America/Denver', label: 'Mountain (MT)' },
  { value: 'America/Los_Angeles', label: 'Pacific (PT)' },
  { value: 'America/Anchorage', label: 'Alaska (AKT)' },
  { value: 'Pacific/Honolulu', label: 'Hawaii (HT)' },
] as const;

/** Reminder ranges mirror the DB CHECKs (migration 20260725150000). */
export const REMINDER_RANGES = { earlyHours: { min: 2, max: 168, step: 1 }, lateMinutes: { min: 60, max: 720, step: 15 } };

export function remindersValid(r: ChReminders): boolean {
  return !r.enabled || r.earlyHours * 60 > r.lateMinutes;
}

export function hoursLabel(h: number): string {
  if (h % 24 === 0) return `${h / 24} ${h === 24 ? 'day' : 'days'} before`;
  return `${h} ${h === 1 ? 'hour' : 'hours'} before`;
}

export function minutesLabel(m: number): string {
  if (m % 60 === 0) return `${m / 60} ${m === 60 ? 'hour' : 'hours'} before`;
  return `${Math.floor(m / 60)} h ${m % 60} min before`;
}

// ── Validation (each message has its catalog number: docs/clubhouse/catalog/settings.md) ──

export interface ChProblem {
  code: string;
  text: string;
}
const problem = (code: string, text: string): ChProblem => ({ code, text });

export function profileProblem(role: 'coach' | 'player', p: { fullName: string; firstName: string; lastName: string }): ChProblem | null {
  if (role === 'coach') return p.fullName.trim() ? null : problem('CH-8101', 'Add your name.');
  return p.firstName.trim() && p.lastName.trim() ? null : problem('CH-8102', 'Add your first and last name.');
}

export function passwordProblem(current: string, next: string, confirm: string): ChProblem | null {
  if (!current) return problem('CH-8105', 'Enter your current password.');
  if (next.length < 8) return problem('CH-8106', 'Use at least 8 characters.');
  if (next !== confirm) return problem('CH-8107', "The new passwords don't match.");
  return null;
}

export function emailProblem(next: string, current: string | null): ChProblem | null {
  const v = next.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return problem('CH-8103', 'Enter a valid email address.');
  if (current && v.toLowerCase() === current.toLowerCase()) return problem('CH-8104', 'That is already your email.');
  return null;
}

export function teamProblem(t: ChTeamInfo): ChProblem | null {
  if (!t.name.trim()) return problem('CH-8108', 'The team needs a name.');
  if (t.org && !t.org.name.trim()) return problem('CH-8109', 'The school needs a name.');
  if (t.org && t.org.state.trim() && !/^[A-Za-z]{2}$/.test(t.org.state.trim())) return problem('CH-8110', 'Use the two-letter state code.');
  return null;
}

export function remindersProblem(r: ChReminders): ChProblem | null {
  return remindersValid(r) ? null : problem('CH-8111', 'The first reminder has to come before the final one.');
}

/** Numeric golf fields: blank is null, anything else must parse and sit in range. */
export function golfDetailsProblem(d: ChGolfDetails): ChProblem | null {
  const num = (s: string) => (s.trim() === '' ? null : Number(s));
  const h = num(d.handicap);
  const hi = num(d.handicapIndex);
  const y = num(d.graduationYear);
  if (h != null && (!Number.isFinite(h) || h < -10 || h > 54)) return problem('CH-8112', 'Handicap must be between −10 and 54.');
  if (hi != null && (!Number.isFinite(hi) || hi < -10 || hi > 54)) return problem('CH-8113', 'Handicap index must be between −10 and 54.');
  if (y != null && (!Number.isInteger(y) || y < 2000 || y > 2100)) return problem('CH-8114', 'Graduation year looks wrong.');
  if (d.state.trim() && !/^[A-Za-z]{2}$/.test(d.state.trim())) return problem('CH-8115', 'Use the two-letter state code.');
  return null;
}

export const PRIORITY_KEYS = ['priorityBallStriking', 'priorityShortGame', 'priorityPutting', 'priorityCourseManagement', 'priorityMentalGame'] as const;
export type PriorityKey = (typeof PRIORITY_KEYS)[number];

export const PRIORITY_LABEL: Record<PriorityKey, { label: string; hint: string }> = {
  priorityBallStriking: { label: 'Ball striking', hint: 'Driving and approach play' },
  priorityShortGame: { label: 'Short game', hint: 'Chipping, pitching and bunkers' },
  priorityPutting: { label: 'Putting', hint: 'Make rates and lag putting' },
  priorityCourseManagement: { label: 'Course management', hint: 'Strategy and decisions' },
  priorityMentalGame: { label: 'Mental game', hint: 'Pressure and consistency' },
};

/** The five priorities as an ordered list, most important first. */
export function priorityOrder(p: Pick<CoachPhilosophy, PriorityKey>): PriorityKey[] {
  return [...PRIORITY_KEYS].sort((a, b) => p[a] - p[b]);
}

/** Moving one priority re-ranks all five as a 1..5 permutation. */
export function moveOrder(order: PriorityKey[], key: PriorityKey, dir: -1 | 1): PriorityKey[] {
  const i = order.indexOf(key);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= order.length) return order;
  const next = [...order];
  [next[i], next[j]] = [next[j]!, next[i]!];
  return next;
}

export function orderToPriorities(order: PriorityKey[]): Record<PriorityKey, number> {
  return Object.fromEntries(order.map((k, i) => [k, i + 1])) as Record<PriorityKey, number>;
}

// ── Writes: the live container and the preview each supply these ──

export type ChResult<T = unknown> = { success?: boolean; ok?: boolean; data?: T; error?: string };
export type ChProfileInput = { firstName: string; lastName: string; fullName: string; avatarUrl: string | null };

// ── Coaching staff (Team, coach) ──

export interface ChStaffMember {
  coachId: string;
  fullName: string | null;
  title: string | null;
  /** `head_coach` or `assistant_coach`. */
  role: string;
}

/** Someone who signed up with the program and is waiting for a head coach to approve them. */
export interface ChPendingCoach {
  coachId: string;
  fullName: string | null;
  email: string | null;
}

/** What an invite grants: coaching access to this team, or head-coach access across the program. */
export type ChStaffRole = 'coach' | 'admin';

export interface ChStaffInvite {
  token: string;
  /** The short code to type at sign-up; null when it could not be stored (the link still works). */
  code: string | null;
  role: ChStaffRole;
  /** Hours the invite lasts, from the server's own expiry. */
  hours: number | null;
}

/**
 * The coaching staff of the team: the same reads and writes Fairway's Team page uses. The server decides who may do
 * what (a head coach lists requests, approves and invites; an assistant only reads the staff), so a refusal comes back
 * as an error and is shown, never assumed from the role.
 */
export interface ChStaffWrites {
  list: () => Promise<ChResult<ChStaffMember[]>>;
  /** Head coach only: an assistant gets an error back. */
  pending: () => Promise<ChResult<ChPendingCoach[]>>;
  invite: (role: ChStaffRole) => Promise<ChResult<ChStaffInvite>>;
  approve: (coachId: string) => Promise<ChResult>;
  decline: (coachId: string) => Promise<ChResult>;
}

export const STAFF_ROLE_OPTIONS = [
  { value: 'coach', label: 'Assistant coach' },
  { value: 'admin', label: 'Program admin' },
] as const;

/** What each invite grants, under the role picker (the same words as Fairway's Team page). */
export const STAFF_ROLE_HELP: Record<ChStaffRole, string> = {
  coach: 'Coaching access to this team only.',
  admin: 'Head-coach access across every team in the program.',
};

/** What a made invite says about itself: its role, and how long it works. */
export function staffInviteNote(i: ChStaffInvite): string {
  const role = STAFF_ROLE_OPTIONS.find((o) => o.value === i.role)?.label ?? 'Staff';
  return `${role} invite${i.hours ? ` · works for ${i.hours} hours` : ''}. It already carries the role, so there is nothing for them to pick.`;
}

export function staffRoleLabel(role: string): string {
  return role === 'head_coach' ? 'Head coach' : 'Assistant coach';
}

const sameWords = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** The coach's own title, or null when it is empty or only repeats the role pill ("Head Coach" beside "Head coach"). */
export function distinctStaffTitle(title: string | null | undefined, roleLabel: string): string | null {
  const t = title?.trim();
  return t && sameWords(t) !== sameWords(roleLabel) ? t : null;
}

export function pendingCoachName(c: ChPendingCoach): string {
  return c.fullName?.trim() || c.email || 'Unnamed coach';
}

export interface ChSettingsWrites {
  saveProfile: (p: ChProfileInput) => Promise<ChResult>;
  uploadAvatar: (file: File) => Promise<ChResult<{ url: string }>>;
  changeEmail: (email: string) => Promise<ChResult>;
  changePassword: (current: string, next: string) => Promise<ChResult>;
  setDelivery: (key: string, value: boolean) => Promise<ChResult>;
  setDigest: (on: boolean) => Promise<ChResult>;
  setRoutingCell: (c: NotificationCategory, channel: keyof ChannelPref, on: boolean) => Promise<ChResult>;
  setRoutingAll: (prefs: PrefsByCategory) => Promise<ChResult>;
  setRoutingQuiet: (on: boolean) => Promise<ChResult>;
  saveScoring: (s: ChScoring) => Promise<ChResult>;
  saveReminders: (r: ChReminders) => Promise<ChResult>;
  saveTeam: (t: ChTeamInfo) => Promise<ChResult>;
  regenerateCode: () => Promise<ChResult<{ joinCode: string }>>;
  saveGolf: (d: ChGolfDetails) => Promise<ChResult>;
  leaveTeam: () => Promise<ChResult>;
  requestJoin: (code: string, message: string) => Promise<ChResult>;
  cancelRequest: (id: string) => Promise<ChResult>;
  setCoachHelmCoach: (patch: Partial<ChCoachHelmSettings['coach']>) => Promise<ChResult>;
  setCoachHelmTeam: (enabled: boolean) => Promise<ChResult>;
  /** Creates the philosophy row on first save; returns its id. */
  savePhilosophy: (id: string | null, patch: Partial<CoachPhilosophy>) => Promise<ChResult<{ id: string }>>;
  deleteAccount: () => Promise<ChResult>;
  signOut: () => Promise<void>;
  /** After a successful delete: clear this device's session and caches, then leave. */
  cleanupAfterDelete: () => Promise<void>;
  /** After a save that changes what the server renders (names, team). */
  refresh: () => void;
  /** The coaching staff of the team (Team, coach). */
  staff: ChStaffWrites;
}

export interface ChDevice {
  /** Native app: shows the haptics switch. */
  native: boolean;
  push: {
    status: 'checking' | 'unsupported' | 'denied' | 'subscribed' | 'unsubscribed';
    pending: boolean;
    subscribe: () => Promise<{ ok: boolean; error?: string }>;
    unsubscribe: () => Promise<{ ok: boolean; error?: string }>;
  };
}
