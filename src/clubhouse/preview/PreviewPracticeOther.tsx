'use client';

import { CoachPlanBar, type ChPlanStatus } from '../screens/practice/CoachPlanBar';
import { PlanRun } from '../screens/practice/PlanRun';
import { PlayerPracticePlanSkeleton, PracticePlanSkeleton } from '../screens/practice/PracticeSkeletons';
import { PlanPageActions } from '../screens/coachhelm/plan/PlanPageActions';
import { PrintStudio, type PrintDrill } from '../screens/practice/PrintStudio';
import { Button } from '../ui/Button';

import { PracticePlanSheet } from '../screens/coachhelm/plan/sheet/PracticePlanSheet';
import { toSheetModel } from '../screens/coachhelm/plan/sheet/plan-sheet-model';
import { PlanFormat, type FormatView } from '../screens/coachhelm/plan/format/PlanFormat';
import { PlayerPractice } from '../screens/coachhelm/plan/player/PlayerPractice';
import { PP_COACHES, PP_NAMES, PP_PLAN_PART } from './fixtures-practice-plan';

const SECTIONS = [
  { key: 'header', name: 'Header' },
  { key: 'groups', name: 'Groups' },
  { key: 'schedule', name: 'Schedule' },
  { key: 'bring', name: 'Bring' },
  { key: 'notes', name: 'Notes' },
] as const;
const FILE = 'Fall practice sheet.pdf';
const VIEWS: Record<string, FormatView> = {
  reading: { k: 'reading', file: FILE, meta: 'PDF · 1 page' },
  found: { k: 'found', file: FILE, documentId: 'preview', sections: [...SECTIONS] },
  set: { k: 'set', file: FILE, id: 'preview', until: '2099-01-01T00:00:00Z' },
  failed: { k: 'failed', message: 'That file couldn’t be read.' },
};

/** `coachhelm-practice-format?state=empty|upload|picked|reading|found|set|undone|failed|see`. */
export function PreviewPracticeFormat({ state }: { state?: string }) {
  if (state === 'see') {
    return (
      <main className="ch-page">
        <PracticePlanSheet plan={toSheetModel({ body: PP_PLAN_PART.draft.body, title: 'Thursday practice', team: 'Demo University Golf', start: new Date('2026-11-05T19:00:00Z'), end: new Date('2026-11-05T22:00:00Z'), zone: 'America/New_York', coaches: [...PP_COACHES], names: new Map(PP_NAMES), state: 'Published' }, 'coach')} />
        <div className="ch-cpv">
          <div className="acts is-pad">
            <Button variant="secondary" className="is-fill">Share PDF</Button>
            <Button variant="primary" className="is-fill">Print</Button>
          </div>
        </div>
      </main>
    );
  }
  return <PlanFormat preview published={6} see={{ label: 'See Thursday in it', href: '/clubhouse-preview/coachhelm-practice-format?state=see' }} initial={VIEWS[state ?? ''] ?? { k: 'empty' }} sheet={state === 'upload' || state === 'upload-sheet' || state === 'picked'} picked={state === 'picked' ? { name: FILE, meta: '1 page · 240 KB' } : null} current={state === 'set' ? 'Fall practice sheet' : 'GolfHelm standard'} />;
}

const STOPS = [
  ['2:00', 'Range', 'Warm-up · everyone'],
  ['2:30', 'Green, back', 'Lag ladder, 20 to 40 ft · Coach Rivera', 'now'],
  ['2:50', 'Chipping green', 'Up and down from 20 yards', 'next'],
  ['3:10', 'Green, front', 'Clock drill, 3 to 5 ft · Coach Lin'],
  ['3:30', 'To the course', 'Water at the cart barn'],
  ['3:40', '3rd tee', 'Holes 3 to 6, then 1 and 2, with Eli and Owen'],
  ['4:40', 'Putting green', '25 in a row from 3 feet · everyone'],
  ['4:55', 'Clubhouse patio', 'Wrap'],
];

/** `coachhelm-practice-player?state=notify|practice|plan|docs|loading`: a push can only be drawn; the rest are the player's screens. `loading` is the route's loading state. */
export function PreviewPracticePlayer({ state }: { state?: string }) {
  if (state === 'loading') return <PlayerPracticePlanSkeleton />;
  const sheet = (
    <PracticePlanSheet plan={toSheetModel({ body: PP_PLAN_PART.draft.body, title: 'Thursday practice', team: 'Demo University Golf', start: new Date('2026-11-05T19:00:00Z'), end: new Date('2026-11-05T22:00:00Z'), zone: 'America/New_York', coaches: PP_COACHES, names: PP_NAMES, state: 'Published' }, 'player', PP_PLAN_PART.draft.body.groups[1]?.players[0])} />
  );
  if (state === 'plan') return <main className="ch-page">{sheet}</main>;
  return (
    <>
      {state === 'notify' && (
        <div className="ch-cpv-banner" role="img" aria-label="Practice plan for Thursday. 2:00 PM. You start on the putting green with Group B.">
          <span className="app" />
          <div>
            <div className="top">
              GolfHelm<span>now</span>
            </div>
            <b>Practice plan for Thursday</b>
            2:00 PM · You start on the putting green with Group B
          </div>
        </div>
      )}
      <PlayerPractice
        everyone={sheet}
        data={{
          context: 'Thursday',
          title: 'Thursday practice',
          when: '2:00 to 5:00 PM · Lakeside Golf Club',
          focus: 'Putts inside 6 feet and speed from long range. Finish under pressure.',
          group: { name: 'B', me: 'Jonah', mates: ['Eli', 'Owen'] },
          stops: STOPS.map(([time, place, line, mark]) => ({ time: time!, place: place!, line: line!, now: mark === 'now', next: mark === 'next' })),
          documents: { label: 'Team Hub › Documents › Practice plans', href: '/clubhouse-preview/hub' },
          planHref: null,
        }}
      />
    </>
  );
}

const PRINT_START = new Date('2026-11-05T19:00:00Z');
const PRINT_DRILLS: PrintDrill[] = [
  { name: 'Lag ladder, 20 to 40 ft', line: 'Putting · 20 min', area: 'putting', setup: 'Tees at 20, 30 and 40 feet, three balls from each.', goal: 'Leave every putt inside 3 feet.', scoring: [{ label: 'Inside the circle', points: 1 }, { label: 'Holed', points: 2 }], levels: 'Par 6 of 10  Birdie 8  Eagle 10' },
  { name: 'Make 7 from 5 feet', line: 'Putting · 25 min', area: 'putting', diagram: 'gate', setup: 'Seven balls around the hole at 5 feet.', goal: 'Make all seven; a miss starts it over.' },
];

const LONG_DRILLS: PrintDrill[] = Array.from({ length: 14 }, (_, i) => ({ ...PRINT_DRILLS[i % 2]!, name: `${PRINT_DRILLS[i % 2]!.name}, set ${i + 1}` }));

/** `coachhelm-practice-print?state=norotation|nodrills|draft|unread|long|cards|tall`: the print studio on the design's plan. `unread`: the drills read failed. `long`: a 14-drill appendix, switched on. */
export function PreviewPracticePrint({ state }: { state?: string }) {
  // `tall`: the same plan four times over (24 blocks, four rotations), so the coach copy's schedule runs past one sheet and the page breaks can be seen.
  if (state === 'tall') {
    const blocks = [0, 1, 2, 3].flatMap((n) => PP_PLAN_PART.draft.body.variants.main.blocks.map((b) => ({ ...b, id: `${b.id}-${n}`, title: n ? `${b.title} ${n + 1}` : b.title, ...(b.kind === 'stations' ? { stations: b.stations.map((st) => ({ ...st, id: `${st.id}-${n}` })) } : {}) })));
    const tall = { ...PP_PLAN_PART.draft.body, variants: { ...PP_PLAN_PART.draft.body.variants, main: { blocks } } };
    const why = Object.fromEntries([0, 1, 2, 3].flatMap((n) => Object.entries(PP_PLAN_PART.draft.why).map(([k, v]) => [`${k}-${n}`, v])));
    return <PrintStudio plan={toSheetModel({ body: tall, why, title: PP_PLAN_PART.title, team: 'Demo University Golf', start: PRINT_START, end: new Date('2026-11-06T07:00:00Z'), zone: 'America/New_York', coaches: PP_COACHES, names: PP_NAMES, state: 'Published' }, 'coach')} drills={PRINT_DRILLS} startWith={{ board: false }} planHref="/clubhouse-preview/coachhelm-practice-plan" />;
  }
  const body = state === 'norotation' ? { ...PP_PLAN_PART.draft.body, variants: { ...PP_PLAN_PART.draft.body.variants, main: { blocks: PP_PLAN_PART.draft.body.variants.main.blocks.filter((b) => b.kind !== 'stations') } } } : PP_PLAN_PART.draft.body;
  const plan = toSheetModel({ body, why: PP_PLAN_PART.draft.why, title: PP_PLAN_PART.title, team: 'Demo University Golf', start: PRINT_START, end: new Date('2026-11-05T22:00:00Z'), zone: 'America/New_York', coaches: PP_COACHES, names: PP_NAMES, state: 'Published' }, 'coach');
  return (
    <PrintStudio
      plan={plan}
      drills={state === 'nodrills' || state === 'unread' ? [] : state === 'long' ? LONG_DRILLS : PRINT_DRILLS}
      drillsUnread={state === 'unread'}
      draft={state === 'draft'}
      startWith={state === 'long' ? { drills: true } : state === 'cards' ? { cards: true, drills: true } : undefined}
      planHref="/clubhouse-preview/coachhelm-practice-plan"
    />
  );
}

/** `coachhelm-practice-run?state=draft|edited|down|later|loading`: the coach's bar and, in its window, the Run card. `later`: a published plan for tomorrow, so no Run card. `loading`: the route's loading state. */
export function PreviewPracticeRun({ state }: { state?: string }) {
  if (state === 'loading') return <PracticePlanSkeleton />;
  const status: ChPlanStatus = { planId: 'preview', title: PP_PLAN_PART.title, version: 3, status: state === 'draft' ? 'draft' : 'published', edited: state === 'edited', seen: state === 'draft' ? null : { names: ['Sofia', 'Maya', 'Lena', 'Eli', 'Jonah', 'Owen'], of: 9 } };
  // Twenty minutes in, so the first rotation is under way however long the preview has been open.
  const now = Date.now();
  // The plan page as its route draws it: the head, the status line, Run in its window, then the sheet.
  const start = new Date(state === 'later' ? now + 24 * 60 * 60_000 : now - 20 * 60_000);
  const plan = toSheetModel({ body: PP_PLAN_PART.draft.body, why: PP_PLAN_PART.draft.why, title: PP_PLAN_PART.title, team: 'Demo University Golf', start, end: new Date(start.getTime() + 180 * 60_000), zone: 'America/New_York', coaches: PP_COACHES, names: PP_NAMES, state: state === 'draft' ? 'Draft · Only coaches' : 'Published' }, 'coach');
  return (
    <main className="ch-page ch-prc-planpage" data-ch="practice-plan" aria-labelledby="ch-prc-plan-title">
      <PlanPageActions
        plan={plan}
        playerPlanId={null}
        printHref="/clubhouse-preview/coachhelm-practice-print"
        coachBar={<CoachPlanBar status={status} after={state !== 'draft' ? <PlanRun planId="preview" title={status.title} version={status.version} body={PP_PLAN_PART.draft.body} start={start} zone="America/New_York" serverNow={now} /> : null} />}
      />
      <PracticePlanSheet plan={plan} />
    </main>
  );
}
