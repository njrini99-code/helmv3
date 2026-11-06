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
  /** An all-day practice can't be planned until it has times (CH-17110). */
  allDay: boolean;
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
  rows: Array<{ time: string; title: string; place: string }>;
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
  /** coachhelm_practice_plans_v1: the helper card, Fill the draft and the suggestions. */
  helperOn: boolean;
  /** What the helper's card leads with, from this request's reads; only what was read. */
  facts: Array<{ lead: string; text: string }>;
}
