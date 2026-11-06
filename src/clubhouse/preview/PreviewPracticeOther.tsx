'use client';

import { CoachPlanBar, type ChPlanStatus } from '../screens/practice/CoachPlanBar';
import { PlanRun } from '../screens/practice/PlanRun';
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

/** `coachhelm-practice-player?state=notify|practice|plan|docs`: a push can only be drawn; the rest are the player's screens. */
export function PreviewPracticePlayer({ state }: { state?: string }) {
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
          context: 'Thursday · Group B',
          title: 'Thursday practice',
          when: '2:00 to 5:00 PM · Lakeside Golf Club',
          focus: 'Putts inside 6 feet and speed from long range. Finish under pressure.',
          group: { name: 'B', mates: ['Eli', 'Owen'] },
          stops: STOPS.map(([time, place, line, mark]) => ({ time: time!, place: place!, line: line!, now: mark === 'now', next: mark === 'next' })),
          documents: 'Team Hub › Practice plans',
          planHref: null,
        }}
      />
    </>
  );
}

const PRINT_START = new Date('2026-11-05T19:00:00Z');
const PRINT_DRILLS: PrintDrill[] = [
  { name: 'Lag ladder, 20 to 40 ft', line: 'Putting · 20 min', setup: 'Tees at 20, 30 and 40 feet, three balls from each.', goal: 'Leave every putt inside 3 feet.' },
  { name: 'Make 7 from 5 feet', line: 'Putting · 25 min', setup: 'Seven balls around the hole at 5 feet.', goal: 'Make all seven; a miss starts it over.' },
];

/** `coachhelm-practice-print?state=norotation|nodrills`: the print studio on the design's plan. */
export function PreviewPracticePrint({ state }: { state?: string }) {
  const body = state === 'norotation' ? { ...PP_PLAN_PART.draft.body, variants: { ...PP_PLAN_PART.draft.body.variants, main: { blocks: PP_PLAN_PART.draft.body.variants.main.blocks.filter((b) => b.kind !== 'stations') } } } : PP_PLAN_PART.draft.body;
  const plan = toSheetModel({ body, why: PP_PLAN_PART.draft.why, title: PP_PLAN_PART.title, team: 'Demo University Golf', start: PRINT_START, end: new Date('2026-11-05T22:00:00Z'), zone: 'America/New_York', coaches: PP_COACHES, names: PP_NAMES, state: 'Published' }, 'coach');
  return <PrintStudio plan={plan} drills={state === 'nodrills' ? [] : PRINT_DRILLS} planHref="/clubhouse-preview/coachhelm-practice-plan" />;
}

/** `coachhelm-practice-run?state=draft|edited|down`: the coach's bar and, in its window, the Run card. */
export function PreviewPracticeRun({ state }: { state?: string }) {
  const status: ChPlanStatus = { planId: 'preview', title: PP_PLAN_PART.title, version: 3, status: state === 'draft' ? 'draft' : 'published', edited: state === 'edited', seen: state === 'draft' ? null : { names: ['Sofia', 'Maya', 'Lena', 'Eli', 'Jonah', 'Owen'], of: 9 } };
  // Twenty minutes in, so the first rotation is under way however long the preview has been open.
  const now = Date.now();
  return (
    <main className="ch-page ch-prc" data-ch="practice">
      <CoachPlanBar status={status} />
      {state !== 'draft' && <PlanRun planId="preview" title={status.title} version={status.version} body={PP_PLAN_PART.draft.body} start={new Date(now - 20 * 60_000)} zone="America/New_York" serverNow={now} />}
    </main>
  );
}
