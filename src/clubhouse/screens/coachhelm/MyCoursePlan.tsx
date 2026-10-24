'use client';

import { useState } from 'react';
import { MapPinned } from 'lucide-react';
import type { MyCoursePlan as Plan } from '@/app/golf/actions/coachhelm-course-plan';
import type { CoursePlanCourse } from '@/lib/coachhelm/course-plan/build-plan';
import { haptic } from '../../lib/haptics';
import { Button } from '../../ui/Button';
import { LIVE_MY_COURSE_PLAN_READS, type ChMyCoursePlanReads } from './writes';
import { pluralWord } from '../../lib/plural';

type Step =
  | { at: 'idle' }
  | { at: 'courses'; courses: CoursePlanCourse[] }
  | { at: 'plan'; course: CoursePlanCourse; courses: CoursePlanCourse[]; plan: Plan }
  | { at: 'failed'; retry: () => void };

/**
 * The player's own Course plan (chs-21 / par-14; supercharge 04 Example 10, behind `coachhelm_course_plan_v1`), a flush
 * section at the foot of their Board, under what is working: the coach's plan in the player's voice. On request, not on a
 * schedule (no event carries a course yet): the player picks one of their courses with three or more rounds and reads at
 * most three lines from their own history there, with the thin-history line below six rounds. Targets, sides and practice
 * only, never a club. Nothing is written, and the reads take no player id: the server answers for the signed-in player only.
 */
export function MyCoursePlan({ reads = LIVE_MY_COURSE_PLAN_READS }: { reads?: ChMyCoursePlanReads }) {
  const [step, setStep] = useState<Step>({ at: 'idle' });
  const [busy, setBusy] = useState<string | null>(null);

  const loadCourses = async () => {
    setBusy('courses');
    const res = await reads.courses().catch(() => ({ status: 'failed' as const }));
    setBusy(null);
    if (res.status === 'ok') setStep({ at: 'courses', courses: res.courses });
    else setStep({ at: 'failed', retry: () => void loadCourses() });
  };
  const loadPlan = async (course: CoursePlanCourse, courses: CoursePlanCourse[]) => {
    haptic('select');
    setBusy(course.courseId);
    const res = await reads.plan(course.courseId).catch(() => ({ status: 'failed' as const }));
    setBusy(null);
    if (res.status === 'ok') setStep({ at: 'plan', course, courses, plan: res.plan });
    else setStep({ at: 'failed', retry: () => void loadPlan(course, courses) });
  };

  return (
    <section className="ch-hl-sec ch-hl-plan" aria-labelledby="ch-hl-myplan-h" data-ch-code="CH-13916">
      <h2 id="ch-hl-myplan-h">Course plan</h2>
      {step.at === 'idle' && (
        <div className="ch-hl-plan__start">
          <p className="ch-hl-note">A plan from your own rounds on a course you’ve played three times or more.</p>
          <Button size="sm" leftIcon={MapPinned} busy={busy === 'courses'} disabled={busy != null} onClick={() => void loadCourses()}>
            {busy === 'courses' ? 'Finding your courses…' : 'Pick a course'}
          </Button>
        </div>
      )}
      {step.at === 'failed' && (
        <div className="ch-hl-plan__start" role="status" data-ch-code="CH-13233">
          <p className="ch-hl-note">Your course plan didn’t load. Nothing was changed.</p>
          <Button size="sm" variant="ghost" onClick={step.retry}>
            Try again
          </Button>
        </div>
      )}
      {(step.at === 'courses' || step.at === 'plan') &&
        (step.courses.length === 0 ? (
          <p className="ch-hl-note" role="status" data-ch-code="CH-13333">
            No course has three of your rounds on it yet. A plan needs three rounds on one course, with the course picked when you start the round.
          </p>
        ) : (
          <div className="ch-hl-plan__courses" role="group" aria-label="Your courses">
            {step.courses.map((c) => {
              const on = step.at === 'plan' && step.course.courseId === c.courseId;
              return (
                <button key={c.courseId} type="button" className={'ch-hl-plan__c' + (on ? ' is-on' : '')} aria-pressed={on} disabled={busy != null} onClick={() => void loadPlan(c, step.courses)}>
                  <b>{c.name}</b>
                  <em className="ch-num">{busy === c.courseId ? 'Reading…' : `${c.rounds} rounds`}</em>
                </button>
              );
            })}
          </div>
        ))}
      {step.at === 'plan' && <PlanLines plan={step.plan} />}
    </section>
  );
}

/** CH-13917: the plan in the player's voice: the title, up to three lines (or the line that says nothing stands out) and the thin-history line. */
function PlanLines({ plan }: { plan: Plan }) {
  if (plan.status === 'too_few') {
    return (
      <p className="ch-hl-note" role="status" data-ch-code="CH-13333">
        You have {plan.rounds} countable {pluralWord(plan.rounds, 'round')} at {plan.courseName}. A plan needs three.
      </p>
    );
  }
  return (
    <div aria-live="polite" data-ch-code="CH-13917">
      <p className="ch-hl-plan__pt">{plan.title}</p>
      {plan.lines.length > 0 ? (
        <ul className="ch-hl-plan__lines">
          {plan.lines.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      ) : (
        plan.emptyLine && <p className="ch-hl-note">{plan.emptyLine}</p>
      )}
      {plan.thinLine && <p className="ch-hl-plan__thin">{plan.thinLine}</p>}
    </div>
  );
}
