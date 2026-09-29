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
    { id: 'preferences', label: 'Preferences', hint: 'Motion and haptics' },
  ],
  player: [
    { id: 'account', label: 'Account', hint: 'Profile, email, password' },
    { id: 'golf', label: 'Golf profile', hint: 'Handicap and team' },
    { id: 'notifications', label: 'Notifications', hint: 'Email, push, CoachHelm' },
    { id: 'preferences', label: 'Preferences', hint: 'Motion and haptics' },
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

// ── Validation ──

export function passwordProblem(current: string, next: string, confirm: string): string | null {
  if (!current) return 'Enter your current password.';
  if (next.length < 8) return 'Use at least 8 characters.';
  if (next !== confirm) return "The new passwords don't match.";
  return null;
}

export function emailProblem(next: string, current: string | null): string | null {
  const v = next.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return 'Enter a valid email address.';
  if (current && v.toLowerCase() === current.toLowerCase()) return 'That is already your email.';
  return null;
}

/** Numeric golf fields: blank is null, anything else must parse and sit in range. */
export function golfDetailsProblem(d: ChGolfDetails): string | null {
  const num = (s: string) => (s.trim() === '' ? null : Number(s));
  const h = num(d.handicap);
  const hi = num(d.handicapIndex);
  const y = num(d.graduationYear);
  if (h != null && (!Number.isFinite(h) || h < -10 || h > 54)) return 'Handicap must be between -10 and 54.';
  if (hi != null && (!Number.isFinite(hi) || hi < -10 || hi > 54)) return 'Handicap index must be between -10 and 54.';
  if (y != null && (!Number.isInteger(y) || y < 2000 || y > 2100)) return 'Graduation year looks wrong.';
  if (d.state.trim() && !/^[A-Za-z]{2}$/.test(d.state.trim())) return 'Use the two-letter state code.';
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
