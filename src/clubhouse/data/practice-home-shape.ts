import type { PlanBodyV2, PlanWhy } from '@/lib/coachhelm/v3/practice-plan/model';
import type { PlayerStop } from '../screens/coachhelm/plan/player/PlayerPractice';

/** What Practice draws: plain data, so a preview can hand it over without a read. */
export type ChPracticeState = 'No plan' | 'Draft' | 'Published' | 'Updated' | 'Done';

export interface ChPracticeRow {
  id: string;
  day: string;
  title: string;
  time: string;
  /** The first two blocks in words, "2:00 Warm-up · 2:15 Short game". */
  line: string;
  state: ChPracticeState;
  href: string;
  /** A published plan with edits not published yet. */
  edits?: boolean;
}

export interface ChPracticeEvent {
  id: string;
  /** "Thursday, Nov 5". */
  label: string;
  /** "2:00 to 5:00 PM · Lakeside". */
  detail: string;
  title: string;
  place: string;
  /** An all-day practice can't be planned until it has times (CH-13181). */
  allDay: boolean;
  /** The calendar's window in minutes, when the practice has an end: what "How long" offers when CoachHelm drafts it. */
  minutes?: number | null;
}

export interface ChPracticeTile {
  key: string;
  day: string;
  date: string;
  today: boolean;
  items: Array<{ time: string; state: ChPracticeState; href: string | null; eventId: string | null }>;
}

export interface ChPracticeUpNext {
  title: string;
  when: string;
  /** `min`: the block's length, so the card can draw the day to scale. */
  rows: Array<{ time: string; title: string; place: string; min?: number }>;
  /** Draft, Published or Updated; left out when the practice has no plan. */
  state?: ChPracticeState;
  planHref: string | null;
  editHref: string | null;
  eventId: string | null;
}

export interface ChPracticeHome {
  /** "Thursday, Nov 5": what a phone's context line says under the title. */
  teamName: string;
  week: ChPracticeTile[];
  /** "9 h 30 of practice this week"; null with none. */
  weekLine: string | null;
  upNext: ChPracticeUpNext | null;
  drafts: ChPracticeRow[];
  published: ChPracticeRow[];
  past: ChPracticeRow[];
  /** This and next week's practices without a plan, for New plan. */
  open: ChPracticeEvent[];
  /** Plans to copy, newest first: their bodies stay on the server until picked. */
  copies: Array<{ id: string; label: string }>;
  /** The active roster, a new plan's players. */
  roster: string[];
  firstRun: boolean;
}

export interface ChPlayerPracticeNext {
  planHref: string;
  title: string;
  when: string;
  context: string;
  /** The plan's focus line, and the player's own group: the same two lines their plan page leads with. */
  focus?: string;
  group?: { name: string; mates: string[]; me?: string } | null;
  stops: PlayerStop[];
}
export interface ChPlayerPracticeHome {
  next: ChPlayerPracticeNext | null;
  week: ChPracticeTile[];
  upcoming: ChPracticeRow[];
  past: ChPracticeRow[];
}

export type ChPracticeLoad<T> = { status: 'ready'; data: T } | { status: 'failed' } | { status: 'unavailable' };

export interface ChBankDrill {
  /** `team:<id>` or `lib:<id>`, as a plan's drill slot stores it. */
  ref: string;
  name: string;
  area: string;
  kind: 'skill' | 'random' | 'pressure';
  minutes: number;
  source: 'Your bank' | 'GolfHelm';
}

export interface ChBuilderData {
  planId: string;
  teamId: string;
  eventId: string | null;
  version: number;
  status: 'draft' | 'published';
  /** Published with edits the players haven't got. */
  edited: boolean;
  /** The version players have, for What changed on Republish. Null: not published, or it wouldn't read. */
  liveBody?: PlanBodyV2 | null;
  /** This practice is one of a series: moving it says only this one moves. */
  inSeries?: boolean;
  title: string;
  /** "Thu, Nov 5 · 2:00 to 5:00 PM · Lakeside". */
  meta: string;
  /** The day word for the helper's lines: "Thursday". */
  dayWord: string;
  start: string;
  end: string | null;
  zone: string;
  team: string;
  coaches: string[];
  roster: Array<{ id: string; name: string }>;
  body: PlanBodyV2;
  why: Record<string, PlanWhy>;
  step: 'blocks' | 'groups' | 'drills' | 'review';
  drills: ChBankDrill[];
  /** The Documents folder the draft is filed in, so a kept suggestion's save doesn't move it; null when not filed yet. */
  folder?: string | null;
  /** The helper card, Fill the draft and the suggestions. */
  helperOn: boolean;
  /** What the helper's card leads with, from this request's reads; only what was read. */
  facts: Array<{ lead: string; text: string }>;
}
