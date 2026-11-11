'use client';

import { TERMS } from '../lib/glossary';
import type { PlanPartData } from '../screens/coachhelm/plan/PlanCard';
import { Builder } from '../screens/practice/builder/Builder';
import { emptyBody } from '../screens/practice/builder/builder-model';
import { PlayerPracticeHome } from '../screens/practice/PlayerPracticeHome';
import { PracticeHome } from '../screens/practice/PracticeHome';
import { DrillPage, DrillsPage, GroupsPage, TemplatesPage } from '../screens/practice/LibraryPages';
import { PLAN_STARTERS } from '../screens/practice/starters';
import type { ChDrillRow } from '../data/practice-library-shape';
import type { ChBuilderData, ChPlayerPracticeHome, ChPracticeHome, ChPracticeTile } from '../data/practice-home-shape';
import { PP_COACHES, PP_NAMES } from './fixtures-practice-plan';
import { PT_PLAN } from './fixtures-practice-thread';

const WEEK: ChPracticeTile[] = [
  { key: '2026-11-02', day: 'Mon', date: '2', today: false, items: [] },
  { key: '2026-11-03', day: 'Tue', date: '3', today: false, items: [{ time: '3:00 PM', state: 'Done', href: '/golf/dashboard/practice/plan/a', eventId: null }] },
  { key: '2026-11-04', day: 'Wed', date: '4', today: false, items: [] },
  { key: '2026-11-05', day: 'Thu', date: '5', today: true, items: [{ time: '2:00 PM', state: 'Draft', href: '/golf/dashboard/practice/plan/b/edit', eventId: null }] },
  { key: '2026-11-06', day: 'Fri', date: '6', today: false, items: [{ time: '2:00 PM', state: 'No plan', href: null, eventId: 'e-fri' }] },
  { key: '2026-11-07', day: 'Sat', date: '7', today: false, items: [] },
  { key: '2026-11-08', day: 'Sun', date: '8', today: false, items: [] },
];
const HOME: ChPracticeHome = {
  teamName: 'Demo University Golf',
  week: WEEK,
  weekLine: '8 h of practice this week',
  upNext: {
    title: 'Thursday practice',
    when: 'Thu, Nov 5 · 2:00 to 5:00 PM · Lakeside Golf Club',
    rows: [
      { time: '2:00', title: 'Warm-up', place: 'Range' },
      { time: '2:30', title: 'Putting rotation', place: '3 stations' },
      { time: '3:40', title: 'Holes 1 to 6', place: 'Holes 1 to 6' },
    ],
    planHref: null,
    editHref: '/golf/dashboard/practice/plan/b/edit',
    eventId: null,
  },
  drafts: [{ id: 'b', day: 'Thu, Nov 5', title: 'Thursday practice', time: '2:00 to 5:00 PM', line: '2:00 Warm-up · 2:30 Putting rotation', state: 'Draft', href: '/golf/dashboard/practice/plan/b/edit' }],
  published: [{ id: 'c', day: 'Tue, Nov 10', title: 'Hargrove week tune-up', time: '3:00 to 5:30 PM', line: '3:00 Warm-up · 3:20 Wedges', state: 'Updated', href: '/golf/dashboard/practice/plan/c', edits: true }],
  past: [{ id: 'a', day: 'Tue, Nov 3', title: 'Tuesday practice', time: '3:00 to 5:00 PM', line: '3:00 Warm-up · 3:15 Short game', state: 'Done', href: '/golf/dashboard/practice/plan/a' }],
  open: [
    { id: 'e-fri', label: 'Friday, Nov 6', detail: '2:00 to 4:30 PM · Lakeside', title: 'Friday practice', place: 'Lakeside', allDay: false },
    { id: 'e-mon', label: 'Monday, Nov 9', detail: 'All day · Lakeside', title: 'Monday practice', place: 'Lakeside', allDay: true },
  ],
  copies: [{ id: 'a', label: 'Tuesday practice · Tue, Nov 3' }],
  roster: [...PP_NAMES.keys()],
  firstRun: false,
};

const PLAYER: ChPlayerPracticeHome = {
  next: {
    planHref: '/golf/dashboard/practice/plan/c',
    title: 'Thursday practice',
    when: '2:00 to 5:00 PM · Lakeside Golf Club',
    context: 'Thursday · Group B',
    stops: [
      { time: '2:00', place: 'Range', line: 'Warm-up · everyone' },
      { time: '2:30', place: 'Green, back', line: 'Lag ladder, 20 to 40 ft', now: true },
      { time: '2:50', place: 'Chipping green', line: 'Up and down from 20 yards', next: true },
    ],
  },
  week: WEEK.map((t) => ({ ...t, items: t.items.filter((i) => i.state === 'Done').map((i) => ({ ...i, eventId: null })) })),
  upcoming: [],
  past: [{ id: 'a', day: 'Tue, Nov 3', title: 'Tuesday practice', time: '3:00 to 5:00 PM', line: '3:00 Warm-up · 3:15 Short game', state: 'Done', href: '/golf/dashboard/practice/plan/a' }],
};

/** `coachhelm-practice-home?state=`: Practice, with nothing reaching a server. */
export function PreviewPracticeHome({ state }: { state?: string }) {
  if (state === 'player') return <PlayerPracticeHome data={PLAYER} />;
  if (state === 'player-empty') return <PlayerPracticeHome data={{ next: null, week: WEEK.map((t) => ({ ...t, items: [] })), upcoming: [], past: [] }} />;
  if (state === 'empty') return <PracticeHome data={{ ...HOME, upNext: null, drafts: [], published: [], open: [], week: WEEK.map((t) => ({ ...t, items: [] })), weekLine: null }} previewSheet />;
  if (state === 'firstrun') return <PracticeHome data={{ ...HOME, firstRun: true, upNext: null, drafts: [], published: [], past: [], copies: [] }} previewSheet />;
  return <PracticeHome data={HOME} openNew={state === 'new'} previewSheet />;
}

const DRILLS: ChBuilderData['drills'] = [
  // The refs the design's plan names (fixtures-practice-thread), so a slot shows its drill and the mix bar has its kinds.
  { ref: 'team:clock', name: 'Clock drill, 3 to 5 ft', area: 'Putting', kind: 'skill', minutes: 20, source: 'Your bank' },
  { ref: 'team:lag', name: 'Lag ladder, 20 to 40 ft', area: 'Putting', kind: 'skill', minutes: 20, source: 'Your bank' },
  { ref: 'team:make7', name: 'Make 7 from 5 feet', area: 'Putting', kind: 'pressure', minutes: 25, source: 'Your bank' },
  { ref: 'team:updown', name: 'Up and down from 20 yards', area: TERMS.shortGame.long, kind: 'random', minutes: 20, source: 'Your bank' },
  { ref: 'lib:gate', name: 'Gate drill, 4 feet', area: 'Putting', kind: 'skill', minutes: 15, source: 'GolfHelm' },
];
const PLAN: PlanPartData = PT_PLAN;

/** `coachhelm-practice-builder?state=`: the builder, with its save, publish and helper seams closed. */
export function PreviewPracticeBuilder({ state }: { state?: string }) {
  const roster = [...PP_NAMES].map(([id, name]) => ({ id, name }));
  const empty = state === 'empty' || state === 'ghosts' || state === 'kept' || state === undefined;
  const body = empty && state !== 'kept' ? emptyBody('Lakeside Golf Club', roster.map((r) => r.id), false) : PLAN.draft.body;
  const data: ChBuilderData = {
    planId: 'preview',
    teamId: 'preview',
    eventId: null,
    version: 1,
    status: 'draft',
    edited: false,
    title: 'Thursday practice',
    meta: 'Thu, Nov 5 · 2:00 to 5:00 PM · Lakeside Golf Club',
    dayWord: 'Thursday',
    start: '2026-11-05T19:00:00Z',
    end: '2026-11-05T22:00:00Z',
    zone: 'America/New_York',
    team: 'Demo University Golf',
    coaches: PP_COACHES,
    roster,
    body,
    why: state === 'kept' ? PLAN.draft.why : {},
    step: state === 'groups' ? 'groups' : state === 'drills' ? 'drills' : state === 'review' || state === 'publish' ? 'review' : 'blocks',
    drills: DRILLS,
    helperOn: true,
    facts: [
      { lead: 'Putting', text: 'loses 0.9 a round, the most of any part of the game' },
      { lead: 'Hargrove Invitational', text: 'starts Monday' },
    ],
  };
  return <Builder data={data} preview={{ ghosts: state === 'ghosts' || state === 'kept' ? PLAN : undefined, kept: state === 'kept', publish: state === 'publish', sheet: state === 'sheet' ? 'block' : undefined, stale: state === 'stale' }} />;
}

const LIB_TEAM: ChDrillRow[] = [
  { id: 'd1', source: 'team', name: 'Clock drill, 3 to 5 ft', area: 'putting', areaLabel: 'Putting', kind: 'skill', minutes: 20, players: 'pairs', levels: 'Par 6 of 10 · Birdie 8 · Eagle 10' },
  { id: 'd2', source: 'team', name: 'Make 7 from 5 feet', area: 'putting', areaLabel: 'Putting', kind: 'pressure', minutes: 25, players: 'solo', levels: null },
  { id: 'd3', source: 'team', name: 'Up and down ladder', area: 'short_game', areaLabel: TERMS.shortGame.long, kind: 'random', minutes: 20, players: 'group', levels: null },
];
const LIB_GOLFHELM: ChDrillRow[] = [
  { id: 'l1', source: 'lib', name: 'Gate drill, 4 feet', area: 'putting', areaLabel: 'Putting', kind: 'skill', minutes: 15, players: null, levels: null },
  { id: 'l2', source: 'lib', name: 'Random nine', area: 'course', areaLabel: 'Course', kind: 'random', minutes: 45, players: null, levels: null },
];
const ROSTER = [...PP_NAMES].map(([id, name]) => ({ id, name }));

/** `coachhelm-practice-library?tab=&state=`: Drills, one drill, Groups and Templates, with every press closed. */
export function PreviewPracticeLibrary({ tab, state }: { tab?: string; state?: string }) {
  if (tab === 'drill') {
    const lib = state === 'library';
    const row = lib ? LIB_GOLFHELM[0]! : LIB_TEAM[0]!;
    return <DrillPage preview teamId="preview" drill={{ ...row, setup: 'Eight balls in a ring at 3 feet, then 5. Go round the clock.', goal: 'Make 8 of 10', equipment: lib ? [] : [{ item: 'Tees', qty: 8 }], scoring: [], tags: lib ? [] : ['Short putts'], mediaUrl: null, usedIn: lib ? null : 4, archived: false }} />;
  }
  if (tab === 'groups') {
    const ids = ROSTER.map((r) => r.id);
    return <GroupsPage preview teamId="preview" roster={ROSTER} groups={state === 'empty' ? [] : [{ id: 'g1', name: 'Travel squad', playerIds: ids.slice(0, 5), usedIn: 6 }, { id: 'g2', name: 'Freshmen', playerIds: ids.slice(4), usedIn: 2 }]} />;
  }
  if (tab === 'templates') return <TemplatesPage preview teamId="preview" templates={state === 'empty' ? [] : [{ id: 't1', name: 'Tuesday short game', kind: 'session', minutes: 150, body: PLAN_STARTERS[1]!.body }]} />;
  return <DrillsPage preview teamId="preview" team={state === 'empty' ? [] : LIB_TEAM} library={state === 'empty' ? [] : LIB_GOLFHELM} />;
}
