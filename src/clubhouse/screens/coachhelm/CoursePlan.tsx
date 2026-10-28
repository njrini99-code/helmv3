'use client';

import { useState } from 'react';
import { Copy, MapPinned, MessageSquare } from 'lucide-react';
import type { CoursePlan as Plan, CoursePlanCourse } from '@/lib/coachhelm/course-plan/build-plan';
import { haptic } from '../../lib/haptics';
import { Button } from '../../ui/Button';
import { Surface } from '../../ui/Surface';
import { useToast } from '../../ui/Toast';
import type { ChCoursePlanReads } from './writes';
import { pluralWord } from '../../lib/plural';
import { rebuiltHref } from '../../shell/nav';
import { messagesPrefillHref } from '../messages/prefill';

type Step =
  | { at: 'idle' }
  | { at: 'courses'; courses: CoursePlanCourse[] }
  | { at: 'plan'; course: CoursePlanCourse; courses: CoursePlanCourse[]; plan: Plan }
  | { at: 'failed'; retry: () => void };

/**
 * The coach's "Course plan" for the chosen player (Slice 7c; supercharge 04 Example 10, behind `coachhelm_course_plan_v1`).
 * On request, not on a schedule: no event carries a course yet. The coach picks one of the player's courses with three or
 * more rounds and reads at most three plan lines from the player's own history there, then the player's version, which the
 * coach can send to the player's thread (Messages opens with it written, never sent: D2-7) or copy. Targets, sides and practice only, never a club (players do not record clubs).
 * Nothing is written. Keyed by player by its owner, so another player starts from the button again.
 */
export function CoursePlan({ playerId, who, reads }: { playerId: string; who: string; reads: ChCoursePlanReads }) {
  const [step, setStep] = useState<Step>({ at: 'idle' });
  const [busy, setBusy] = useState<string | null>(null);
  const toast = useToast();
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      haptic('success');
      toast({ title: 'Plan copied' });
    } catch {
      haptic('error');
      toast({ tone: 'error', title: 'Couldn’t copy the plan', body: 'Select it and copy it by hand.' });
    }
  };

  const loadCourses = async () => {
    setBusy('courses');
    const res = await reads.courses(playerId).catch(() => ({ status: 'failed' as const }));
    setBusy(null);
    if (res.status === 'ok') setStep({ at: 'courses', courses: res.courses });
    else setStep({ at: 'failed', retry: () => void loadCourses() });
  };
  const loadPlan = async (course: CoursePlanCourse, courses: CoursePlanCourse[]) => {
    haptic('select');
    setBusy(course.courseId);
    const res = await reads.plan(playerId, course.courseId).catch(() => ({ status: 'failed' as const }));
    setBusy(null);
    if (res.status === 'ok') setStep({ at: 'plan', course, courses, plan: res.plan });
    else setStep({ at: 'failed', retry: () => void loadPlan(course, courses) });
  };

  return (
    <section className="ch-hl-plan" aria-labelledby="ch-hl-plan-h">
      <h2 id="ch-hl-plan-h" className="ch-hl-plan__h">
        Course plan
      </h2>
      {step.at === 'idle' && (
        <div className="ch-hl-plan__start">
          <p className="ch-hl-note">From {who}’s own rounds on a course they have played three times or more.</p>
          <Button size="sm" leftIcon={MapPinned} busy={busy === 'courses'} disabled={busy != null} onClick={() => void loadCourses()}>
            {busy === 'courses' ? 'Finding courses…' : 'Course plan'}
          </Button>
        </div>
      )}
      {step.at === 'failed' && (
        <div className="ch-hl-plan__start" role="status">
          <p className="ch-hl-note">The course plan didn’t load. Nothing was changed.</p>
          <Button size="sm" onClick={step.retry}>
            Try again
          </Button>
        </div>
      )}
      {(step.at === 'courses' || step.at === 'plan') &&
        (step.courses.length === 0 ? (
          <p className="ch-hl-note">
            {who} has no course with three rounds on it yet. A plan needs three rounds on the course, with the course picked when the round was entered.
          </p>
        ) : (
          <div className="ch-hl-plan__courses" role="group" aria-label={`${who}’s courses`}>
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
      {step.at === 'plan' && <PlanCard plan={step.plan} who={who} playerId={playerId} onCopy={(text) => void copy(text)} />}
    </section>
  );
}

function PlanCard({ plan, who, playerId, onCopy }: { plan: Plan; who: string; playerId: string; onCopy: (text: string) => void }) {
  if (plan.status === 'too_few') {
    return (
      <p className="ch-hl-note" role="status">
        {who} has {plan.rounds} countable {pluralWord(plan.rounds, 'round')} at {plan.courseName}. A plan needs three.
      </p>
    );
  }
  const playerText = [plan.player.title, ...plan.player.lines].join('\n');
  // Messages opens on the player's thread with the plan in its composer; the coach reads it and presses Send (prefill.ts).
  const send = plan.player.lines.length ? rebuiltHref(messagesPrefillHref({ players: [playerId], draft: playerText }) ?? '', 'coach') : null;
  return (
    <div aria-live="polite">
      <Surface id="ch-hl-plan-card" title={plan.coach.title} rule>
        <ul className="ch-hl-plan__lines">
          {plan.coach.lines.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
        {plan.coach.thinLine && (
          <p className="ch-hl-plan__thin">
            {plan.coach.thinLine}
          </p>
        )}
        {plan.player.lines.length > 0 && (
          <div className="ch-hl-plan__player">
            <h4>What {who} reads</h4>
            <p className="ch-hl-plan__pt">{plan.player.title}</p>
            <ul className="ch-hl-plan__lines">
              {plan.player.lines.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
            <div className="ch-hl-plan__send">
              {send && (
                // It opens Messages with the plan written in; the coach presses Send there (D2-7), so it says Message, not Send (H1).
                <Button size="sm" variant="ghost" leftIcon={MessageSquare} href={send}>
                  Message {who}
                </Button>
              )}
              <Button size="sm" variant="ghost" leftIcon={Copy} onClick={() => onCopy(playerText)}>
                Copy for {who}
              </Button>
            </div>
          </div>
        )}
      </Surface>
    </div>
  );
}
