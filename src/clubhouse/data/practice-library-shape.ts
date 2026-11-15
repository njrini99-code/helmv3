import type { DrillKind, PlanArea, PlanBodyV2 } from '@/lib/coachhelm/v3/practice-plan/model';

/** Practice's drills, groups and templates: plain data, so a preview can hand it over without a read. */
export interface ChDrillRow {
  id: string;
  source: 'team' | 'lib';
  name: string;
  /** A library drill's category when it isn't one of the bank's areas. */
  area: PlanArea | null;
  areaLabel: string;
  kind: DrillKind | null;
  minutes: number | null;
  players: string | null;
  /** "Par 6 of 10 · Birdie 8 · Eagle 10", or null with no levels. */
  levels: string | null;
}
export interface ChDrillDetail extends ChDrillRow {
  setup: string;
  goal: string;
  equipment: Array<{ item: string; qty: number }>;
  scoring: Array<{ label: string; points: number }>;
  tags: string[];
  mediaUrl: string | null;
  /** Plans that use it. Null: unknown (a failed read), not zero. */
  usedIn: number | null;
  archived: boolean;
}
export interface ChPracticeGroup {
  id: string;
  name: string;
  playerIds: string[];
  usedIn: number | null;
}
export interface ChPracticeTemplate {
  id: string;
  name: string;
  kind: 'session' | 'block' | 'week';
  minutes: number | null;
  body: PlanBodyV2;
}
export interface ChRosterRow {
  id: string;
  name: string;
}

export type ChLibraryLoad<T> = { status: 'ready'; data: T } | { status: 'unavailable' } | { status: 'failed' };
