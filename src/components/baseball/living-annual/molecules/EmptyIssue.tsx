/**
 * EmptyIssue — per-surface empty-state presets over `<EditorsLetter>` (spec §7
 * empty-state doctrine: "no yellow warning boxes anywhere").
 *
 * Every zero/empty surface renders a composed editorial letter — a title + a
 * reading-voice body in the lane ink, with a `STANDING BY` breathing dot on the
 * surfaces genuinely awaiting live data. Day-one always reads like an unreleased
 * first issue, never a broken CRM. The preset table is exported so a surface can
 * reference / extend the canonical copy.
 *
 * No hooks / handlers — safe in a server component.
 */
import type { ReactNode } from 'react';
import { EditorsLetter } from '..';

export type EmptyIssueVariant =
  | 'stats'
  | 'pipeline'
  | 'roster'
  | 'signals'
  | 'today'
  | 'messages'
  | 'documents'
  | 'calendar'
  | 'tasks'
  | 'announcements'
  | 'travel'
  | 'discover'
  | 'dev-plan'
  | 'generic';

export interface EmptyIssuePreset {
  title: string;
  body: string;
  /** Surface is awaiting live data — show the `STANDING BY` breathing dot. */
  live?: boolean;
}

/** Canonical empty-state copy, one composed letter per surface. */
export const EMPTY_ISSUE_PRESETS: Record<EmptyIssueVariant, EmptyIssuePreset> = {
  stats: {
    title: 'Standing by — awaiting first pitch.',
    body: 'Box scores light up here after your first game.',
    live: true,
  },
  pipeline: {
    title: 'The board is open.',
    body: 'Add a recruit to start the file — watchlists, grades, and aging bars fill these columns.',
  },
  roster: {
    title: 'An unreleased first issue.',
    body: 'Your roster spread prints here the moment players join the program.',
  },
  signals: {
    title: 'The wire is quiet.',
    body: 'Commits, offers, and milestones ticker across this desk as they happen.',
    live: true,
  },
  today: {
    title: 'Today’s assignment is being set.',
    body: 'Your daily contract appears here once your coach posts the plan.',
    live: true,
  },
  messages: {
    title: 'Quiet in the pressbox.',
    body: 'Conversations with your staff and teammates collect here.',
  },
  documents: {
    title: 'The file drawer is empty.',
    body: 'Uploaded packets, forms, and clips are filed here.',
  },
  calendar: {
    title: 'No dates on the card.',
    body: 'Games, practices, and travel land on the schedule here.',
    live: true,
  },
  tasks: {
    title: 'Nothing due — yet.',
    body: 'Assignments and to-dos stack up here as they come in.',
  },
  announcements: {
    title: 'No announcements yet.',
    body: 'Team-wide notes and updates post here — the whole roster sees them the moment they land.',
  },
  travel: {
    title: 'No trips on the itinerary.',
    body: 'Lodging, transportation, and expenses collect here once a trip is scheduled.',
  },
  // War Room (recruiting) surface — the default `laneInk` below only special-cases
  // `pipeline`, so a `discover` caller should pass `ink="pursuit"` explicitly
  // (kept additive/preset-only per this task's scope, not folded into the default).
  discover: {
    title: 'No recruits surfaced yet.',
    body: 'Widen a filter or search a new region — prospects load into this view as the board returns results.',
  },
  'dev-plan': {
    title: 'The plan is being drafted.',
    body: 'Skill targets, coach notes, and PR milestones collect here once a development plan is set.',
    live: true,
  },
  generic: {
    title: 'Standing by.',
    body: 'This section fills in as your season gets underway.',
    live: true,
  },
};

export interface EmptyIssueProps {
  variant: EmptyIssueVariant;
  /** Lane ink (defaults to clay for `pipeline`, team green otherwise). */
  ink?: 'team' | 'pursuit';
  /** Optional call-to-action row. */
  action?: ReactNode;
  className?: string;
}

export function EmptyIssue({ variant, ink, action, className }: EmptyIssueProps) {
  const preset = EMPTY_ISSUE_PRESETS[variant] ?? EMPTY_ISSUE_PRESETS.generic;
  const laneInk = ink ?? (variant === 'pipeline' ? 'pursuit' : 'team');

  return (
    <EditorsLetter
      title={preset.title}
      body={preset.body}
      ink={laneInk}
      live={preset.live}
      action={action}
      className={className}
    />
  );
}
