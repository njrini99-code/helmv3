/**
 * Direction A · the settings sections that drill in from the index.
 *
 * Pure module (no 'use client'). The server route validates slugs and roles
 * against it, and the client shell and the route's loading boundary read
 * titles and skeleton shapes from it, so all three agree on what a section is.
 *
 * `notifications` and `coaching-intelligence` are NOT here: they are static
 * sibling routes, and a static segment always wins over `[section]`. The
 * NotificationsPanel host is therefore `delivery`, and the coach's
 * "CoachHelm on your dashboards" switch lives at `coachhelm`.
 */

export type SettingsRole = 'coach' | 'player';

export const SETTINGS_INDEX_HREF = '/golf/dashboard/settings';

export const SETTINGS_SECTION_SLUGS = [
  'account',
  'device',
  'delivery',
  'team',
  'golf',
  'coachhelm',
  'help',
] as const;

export type SettingsSectionSlug = (typeof SETTINGS_SECTION_SLUGS)[number];

/**
 * One placeholder card on first paint: its minimum height, whether a panel
 * title sits above it, and what fills it (`bar` mirrors the single h-8 loading
 * bar G's team panels show; `lines` a heading-and-caption pair).
 */
export interface SkeletonCard {
  minHeight: string;
  titled: boolean;
  fill: 'bar' | 'lines';
}

export interface SettingsSectionConfig {
  slug: SettingsSectionSlug;
  title: string;
  /** Static ViewHeader description. Only where it says something the panels don't. */
  description?: string;
  /** The team page names the team it edits; the skeleton holds a line for it. */
  dynamicDescription?: boolean;
  roles: readonly SettingsRole[];
  /** What a visitor without the role is told, and where they are sent instead. */
  unavailable: { message: string; href: string; label: string };
  /** First-paint cards, approximating each panel at 390px (loading.tsx + shell share it). */
  skeleton: readonly SkeletonCard[];
}

const BACK_TO_SETTINGS = { href: SETTINGS_INDEX_HREF, label: 'Back to Settings' } as const;

export const SETTINGS_SECTIONS: Record<SettingsSectionSlug, SettingsSectionConfig> = {
  account: {
    slug: 'account',
    title: 'Account',
    roles: ['coach', 'player'],
    unavailable: { message: 'Account settings need a coach or player profile.', ...BACK_TO_SETTINGS },
    skeleton: [
      { minHeight: 'min-h-80', titled: true, fill: 'lines' },
      { minHeight: 'min-h-72', titled: true, fill: 'lines' },
      { minHeight: 'min-h-96', titled: true, fill: 'lines' },
    ],
  },
  device: {
    slug: 'device',
    title: 'This device',
    roles: ['coach', 'player'],
    unavailable: { message: 'Device settings need a coach or player profile.', ...BACK_TO_SETTINGS },
    skeleton: [
      { minHeight: 'min-h-[600px]', titled: true, fill: 'lines' },
      { minHeight: 'min-h-32', titled: true, fill: 'lines' },
    ],
  },
  delivery: {
    slug: 'delivery',
    title: 'Email & push',
    roles: ['coach', 'player'],
    unavailable: { message: 'Notification settings need a coach or player profile.', ...BACK_TO_SETTINGS },
    skeleton: [{ minHeight: 'min-h-48', titled: true, fill: 'lines' }],
  },
  team: {
    slug: 'team',
    title: 'Team',
    dynamicDescription: true,
    roles: ['coach'],
    unavailable: {
      message: 'Team settings are edited by coaches. Your handicap and team membership are under Golf profile.',
      href: `${SETTINGS_INDEX_HREF}/golf`,
      label: 'Open Golf profile',
    },
    skeleton: [
      { minHeight: 'min-h-20', titled: true, fill: 'bar' },
      { minHeight: 'min-h-60', titled: true, fill: 'lines' },
      { minHeight: 'min-h-20', titled: true, fill: 'bar' },
      { minHeight: 'min-h-20', titled: true, fill: 'bar' },
    ],
  },
  golf: {
    slug: 'golf',
    title: 'Golf profile',
    roles: ['player'],
    unavailable: {
      message: 'Golf profile holds a player’s handicap and team membership. Coach accounts edit their team under Team.',
      href: `${SETTINGS_INDEX_HREF}/team`,
      label: 'Open Team settings',
    },
    skeleton: [
      { minHeight: 'min-h-[420px]', titled: true, fill: 'lines' },
      { minHeight: 'min-h-80', titled: false, fill: 'lines' },
    ],
  },
  coachhelm: {
    slug: 'coachhelm',
    title: 'CoachHelm on your dashboards',
    description: 'Only changes your own dashboards. The team-wide switch is in Coaching Intelligence.',
    roles: ['coach'],
    unavailable: { message: 'This switch controls CoachHelm on coach dashboards.', ...BACK_TO_SETTINGS },
    skeleton: [{ minHeight: 'min-h-24', titled: false, fill: 'lines' }],
  },
  help: {
    slug: 'help',
    title: 'Help & legal',
    roles: ['coach', 'player'],
    unavailable: { message: 'Help needs a coach or player profile.', ...BACK_TO_SETTINGS },
    skeleton: [
      { minHeight: 'min-h-40', titled: true, fill: 'lines' },
      { minHeight: 'min-h-28', titled: true, fill: 'lines' },
    ],
  },
};

export function isSettingsSectionSlug(value: string): value is SettingsSectionSlug {
  return (SETTINGS_SECTION_SLUGS as readonly string[]).includes(value);
}

export function getSettingsSection(value: string | null | undefined): SettingsSectionConfig | null {
  if (!value || !isSettingsSectionSlug(value)) return null;
  return SETTINGS_SECTIONS[value];
}

/** Drill-in href, with an optional in-page anchor for multi-panel sections. */
export function sectionHref(slug: SettingsSectionSlug, anchor?: string): string {
  return `${SETTINGS_INDEX_HREF}/${slug}${anchor ? `#${anchor}` : ''}`;
}

/** Anchors inside multi-panel sections, shared by the index rows and the section page. */
export const SECTION_ANCHORS = {
  scoring: 'scoring',
  reminders: 'reminders',
  organization: 'organization',
  invite: 'invite',
  details: 'details',
  membership: 'membership',
} as const;
