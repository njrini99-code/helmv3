'use client';

import type { ComponentType } from 'react';
import { AnnouncementBody, AvailabilityBody, DrillBody, FocusBody, GenericBody, GoalBody, MessageBody, PublishDocBody, PublishPlanBody, RecruitBody, RoundNoteBody, TaskBody } from './bodies-people';
import { AttendanceBody, BlockedBody, BreakBody, EventBody, LineupBody, LockBody, QualifierBody, ReminderBody, SeriesBody, TermBody, TripBody, type BodyProps } from './bodies-schedule';
import { cardCopy } from './catalog';
import type { CardBodyProps } from './types';

export { CARD_TOOLS, cardCopy, type CardCopy } from './catalog';
export { CARD_PHASES, isOpen, isSaved, isWithdrawn, type CardBodyProps, type CardDensity, type CardPerson, type CardPhase, type Reach } from './types';

/** One body per capability (CAPABILITIES.md, section A). A tool with no body of its own draws the generic one: its reach and every fact. */
const BODIES: Record<string, ComponentType<BodyProps>> = {
  create_event: EventBody,
  create_recurring_practice: SeriesBody,
  add_blocked_time: BlockedBody,
  add_team_break: BreakBody,
  save_team_term: TermBody,
  create_trip: TripBody,
  create_qualifier: QualifierBody,
  create_goal: GoalBody,
  create_focus_area: FocusBody,
  create_task: TaskBody,
  create_team_announcement: AnnouncementBody,
  add_round_note: RoundNoteBody,
  set_availability_note: AvailabilityBody,
  create_recruit: RecruitBody,
  create_drill: DrillBody,
  publish_practice_plan: PublishPlanBody,
  publish_artifact: PublishDocBody,
  send_message: MessageBody,
  set_lineup: LineupBody,
  lock_lineup: LockBody,
  send_event_reminder: ReminderBody,
  record_attendance: AttendanceBody,
};

/** The tools with a body of their own. */
export const BODY_TOOLS: readonly string[] = Object.keys(BODIES);

/**
 * What a coach checks before Confirm, for one task, in one state. The shell draws everything around it (the head, the
 * buttons, the ring, the receipt). This draws no button of the shell's, starts no timer and makes no request.
 */
export function CardBody(props: CardBodyProps) {
  const Body = BODIES[props.tool] ?? GenericBody;
  return <Body {...props} copy={cardCopy(props.tool, props.proposal)} />;
}
