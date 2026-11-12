'use client';

import { Check } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useId, useRef, useState } from 'react';
import { createGolfEvent } from '@/app/golf/actions/calendar-events';
import { copyPlanBody, savePracticePlan } from '@/app/golf/actions/practice-plans';
import type { PlanBodyV2 } from '@/lib/coachhelm/v3/practice-plan/model';
import type { ChPracticeEvent } from '../../data/practice-home-shape';
import { PracticeSheet } from './PracticeSheet';
import { wholeFacts } from './facts';
import { Icon } from '../../ui/Icon';
import { useToast } from '../../ui/Toast';
import { TERMS } from '../../lib/glossary';
import { Segmented } from '../../ui/Segmented';
import { copyBody, emptyBody, fmtMinutes, leaveAskPicks, lengthChoices } from './builder/builder-model';
import { newRequestId } from '../../data/recruiting-shape';
import { isoDay } from '../../lib/dates';
import { DateField } from '../../ui/DateField';
import { TimeField } from '../../ui/TimeField';
import { defaultNewPractice, NEW_PRACTICE_TITLE, newPracticeEvent, newPracticeMinutes, newPracticeProblem, newPracticeWords, withStart, type NewPractice } from './new-practice';

/** What to work on: the parts of the game a coach names. Nothing is picked for them; no pick leaves it to the team's numbers. */
const WORK_ON = ['Putting', TERMS.shortGame.long, 'Approach', 'Off the tee', 'On the course', 'Pressure'];

export type NewPlanStart = 'blank' | 'copy' | 'ask' | 'template';
type Start = NewPlanStart;
/** "Which practice" set to one the sheet makes. */
const NEW = 'new';

function Option({ on, title, line, disabled, onPick }: { on: boolean; title: string; line: string; disabled?: boolean; onPick: () => void }) {
  return (
    <button type="button" className={'ch-prc-opt' + (on ? ' is-on' : '')} role="radio" aria-checked={on} disabled={disabled} onClick={onPick}>
      <span className="ch-prc-opt__t">
        <b className="ch-num">{title}</b>
        <span className="ch-num">{wholeFacts(line)}</span>
      </span>
      <span className="ch-prc-opt__r" aria-hidden="true">
        {on && <Icon icon={Check} size={14} />}
      </span>
    </button>
  );
}

/**
 * New plan (S-PRC.new-pick and S-BLD.new-sheet): which practice, then where it starts. Create saves the first draft and opens the builder.
 * Ask CoachHelm saves an empty plan and opens the builder filling: its suggestions wait there, and nothing joins the plan until kept.
 * With no practice to plan, or on "A new practice", the sheet asks the day, start, end and place (Q7, owner, 12 Nov: New plan creates
 * the practice itself): Create puts it on the calendar through the Calendar's own create, then plans it.
 * `preview`: a press closes the sheet and reaches no server.
 */
export function NewPlanSheet({ open, onClose, events, copies, roster, zone, now, initialEvent, initialStart, preview = false, template = null }: { /** First run's three starts open the sheet on the one picked. */ initialStart?: NewPlanStart; template?: { name: string; body: PlanBodyV2 } | null; open: boolean; onClose: () => void; events: ChPracticeEvent[]; copies: Array<{ id: string; label: string }>; roster: string[]; /** The team's zone: a new practice's day and times are its wall clock. */ zone: string; /** Today, for the new practice's default day; the clock's when omitted. */ now?: Date; initialEvent?: string | null; preview?: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const ids = useId();
  const firstOpen = events.find((e) => !e.allDay)?.id ?? null;
  const [eventId, setEventId] = useState<string>(initialEvent ?? firstOpen ?? NEW);
  const [start, setStart] = useState<Start>(template ? 'template' : initialStart && initialStart !== 'template' ? initialStart : 'ask');
  const [copyId, setCopyId] = useState<string | null>(copies[0]?.id ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [today] = useState(() => isoDay(now ?? new Date(), zone));
  const [draft, setDraft] = useState<NewPractice>(() => defaultNewPractice(now ?? new Date(), zone));
  // The practice this sheet put on the calendar. A plan that then fails keeps it: Create again plans it and makes no second one.
  const [made, setMade] = useState<{ id: string; practice: NewPractice } | null>(null);
  // One request id per set of contents, as the Calendar's editor keeps: a reply lost after the server stored the practice
  // sends the same id again, and the server makes it once.
  const attempt = useRef<{ sig: string; id: string } | null>(null);
  const requestIdFor = (payload: unknown) => {
    const sig = JSON.stringify(payload);
    if (attempt.current?.sig === sig) return attempt.current.id;
    attempt.current = { sig, id: newRequestId() };
    return attempt.current.id;
  };
  const isNew = eventId === NEW;
  const event = isNew ? null : (events.find((e) => e.id === eventId) ?? null);
  const practice = made?.practice ?? draft;
  const words = newPracticeWords(practice);
  const problem = isNew && !made ? newPracticeProblem(draft) : null;
  // Ask CoachHelm's two questions (S-BLD.new-sheet). The length starts on the practice's window; what to work on starts empty.
  const practiceMin = isNew ? newPracticeMinutes(practice) : event?.minutes;
  const lengths = lengthChoices(practiceMin);
  const [minutes, setMinutes] = useState<number | null>(null);
  const [areas, setAreas] = useState<string[]>([]);
  const length = minutes != null && lengths.includes(minutes) ? minutes : practiceMin ? lengths[lengths.length - 1]! : null;
  const asking = start === 'ask' && (isNew || (!!event && !event.allDay));
  const dayWord = isNew ? words.day.split(',')[0]! : (event?.label.split(',')[0] ?? 'this practice');
  const set = (patch: Partial<NewPractice>) => setDraft((d) => ({ ...d, ...patch }));

  /** The practice the plan goes on: the picked one, or the new one, put on the calendar first unless it already is. */
  const target = async (): Promise<{ id: string; title: string; place: string } | null> => {
    if (!isNew) return event ? { id: event.id, title: event.title, place: event.place } : null;
    if (made) return { id: made.id, title: NEW_PRACTICE_TITLE, place: made.practice.place.trim() };
    const single = newPracticeEvent(draft, zone);
    const res = await createGolfEvent({ ...single, requestId: requestIdFor(single) });
    if (!res.success) {
      setError(res.error);
      return null;
    }
    setMade({ id: res.data.eventId, practice: draft });
    return { id: res.data.eventId, title: NEW_PRACTICE_TITLE, place: draft.place.trim() };
  };

  const create = async () => {
    if (!isNew && !event) return;
    if (preview) return onClose();
    if (problem) return setError(problem);
    setBusy(true);
    setError(null);
    try {
      // The copy is read before anything is written: a plan that can't be copied puts no practice on the calendar.
      const copied = start === 'copy' && copyId ? await copyPlanBody({ planId: copyId }) : null;
      if (start === 'copy' && !copied?.success) {
        setError(copied?.error ?? 'That plan couldn’t be copied.');
        return;
      }
      const on = await target();
      if (!on) return;
      const body = start === 'template' && template ? { ...template.body, place: on.place.slice(0, 80), players: [...roster] } : copied?.success ? copyBody(copied.body, roster) : emptyBody(on.place, roster, false);
      const res = await savePracticePlan({ eventId: on.id, expectedVersion: null, title: on.title, step: 'blocks', body });
      if (!res.success) {
        if (res.stale) {
          toast({ title: 'Another coach already started a plan for this practice', code: 'CH-13580' });
          router.refresh();
          onClose();
          return;
        }
        setError(res.unavailable ? 'Practice plans aren’t on for your team yet.' : res.error);
        return;
      }
      if (start === 'ask') leaveAskPicks(res.planId, { minutes: length, areas });
      router.push(`/golf/dashboard/practice/plan/${res.planId}/edit${start === 'ask' ? '?fill=1' : ''}`);
    } catch {
      setError('That didn’t go through. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const when = `${ids}-when`;
  const help = `${ids}-help`;
  return (
    <PracticeSheet open={open} onClose={onClose} title="New plan" actionLabel={asking ? 'Build plan' : 'Create plan'} full onAction={() => void create()} actionDisabled={(isNew ? !!problem : !event || event.allDay) || (start === 'copy' && !copyId)} busy={busy} code="CH-13395">
      <div className="ch-prc-new">
        {error && (
          <p className="ch-prc-new__err" role="alert">
            {error}
          </p>
        )}
        {events.length > 0 && (
          <>
            <h3>Which practice</h3>
            <div className="ch-prc-grp" role="radiogroup" aria-label="Which practice">
              {events.map((e) => (
                <Option key={e.id} on={e.id === eventId} title={e.label} line={e.allDay ? 'Give this practice a start and end time to plan it.' : `${e.detail} · no plan yet`} disabled={e.allDay || !!made} onPick={() => setEventId(e.id)} />
              ))}
              <Option on={isNew} title="A new practice" line="Pick the day and time. It goes on the calendar." onPick={() => setEventId(NEW)} />
            </div>
          </>
        )}
        {isNew &&
          (made ? (
            <p className="ch-prc-new__made ch-num">
              On the calendar: {words.day} · {words.time}
            </p>
          ) : (
            <>
              <h3 id={when}>When</h3>
              <div className="ch-prc-when" role="group" aria-labelledby={when}>
                <div className="ch-field ch-prc-when__day">
                  <span className="ch-field__label">Day</span>
                  <DateField label="Day" row value={draft.date} min={today} today={today} onChange={(v) => v && set({ date: v })} />
                </div>
                <div className="ch-field">
                  <span className="ch-field__label">Starts</span>
                  <TimeField label="Starts" value={draft.start} onChange={(v) => v && setDraft((d) => withStart(d, v))} />
                </div>
                <div className="ch-field">
                  <span className="ch-field__label">Ends</span>
                  <TimeField label="Ends" value={draft.end} aria-invalid={problem ? true : undefined} aria-describedby={help} onChange={(v) => v && set({ end: v })} />
                </div>
                <p id={help} className={'ch-field__help ch-prc-when__wide ch-num' + (problem ? ' is-error' : '')}>
                  {problem ?? `${fmtMinutes(practiceMin ?? 0)}. It goes on the calendar with the plan.`}
                </p>
                <div className="ch-field ch-prc-when__wide">
                  <label htmlFor={`${ids}-place`} className="ch-field__label">
                    Place <span className="ch-field__opt">Optional</span>
                  </label>
                  <input id={`${ids}-place`} className="ch-input" value={draft.place} maxLength={200} autoComplete="off" placeholder="e.g. Lakeside range" onChange={(e) => set({ place: e.target.value })} />
                </div>
              </div>
            </>
          ))}
        <h3>Start from</h3>
        <div className="ch-prc-grp" role="radiogroup" aria-label="Start from">
          {template && <Option on={start === 'template'} title={template.name} line="Template. Groups stay empty until you fill them" onPick={() => setStart('template')} />}
          <Option on={start === 'blank'} title="Blank" line="Add blocks yourself" onPick={() => setStart('blank')} />
          {copies.length > 0 && <Option on={start === 'copy'} title="Copy a past practice" line="Keeps blocks, drills and groups" onPick={() => setStart('copy')} />}
          <Option on={start === 'ask'} title="Ask CoachHelm" line="It drafts from your team’s data. You keep what you like." onPick={() => setStart('ask')} />
        </div>
        {asking && (
          <>
            <h3 id="ch-prc-ask-h">What should {dayWord} cover?</h3>
            <div className="ch-prc-ask" role="group" aria-labelledby="ch-prc-ask-h">
              <div className="ch-prc-ask__q">
                <span id="ch-prc-ask-len">How long</span>
                <Segmented label="How long" block value={length != null ? String(length) : ''} options={lengths.map((m) => ({ value: String(m), label: fmtMinutes(m) }))} onChange={(v) => setMinutes(Number(v))} />
                <small className="ch-num">{isNew ? `The practice runs ${words.time}.` : event?.minutes ? `Your calendar has ${event.detail.split(' · ')[0]}.` : 'This practice has no end time on the calendar.'}</small>
              </div>
              <div className="ch-prc-ask__q">
                <span>Work on · pick any</span>
                <div className="ch-pills" role="group" aria-label="Work on">
                  {WORK_ON.map((a) => {
                    const on = areas.includes(a);
                    return (
                      <button key={a} type="button" className="ch-pill" aria-pressed={on} onClick={() => setAreas((list) => (on ? list.filter((x) => x !== a) : [...list, a]))}>
                        {a}
                      </button>
                    );
                  })}
                </div>
                <small>{areas.length ? 'CoachHelm builds around these and says why for each block.' : 'Pick none and CoachHelm goes by your team’s numbers.'}</small>
              </div>
            </div>
          </>
        )}
        {start === 'copy' && (
          <>
            <h3>Which plan</h3>
            <div className="ch-prc-grp" role="radiogroup" aria-label="Which plan">
              {copies.map((c) => (
                <Option key={c.id} on={c.id === copyId} title={c.label} line="Own work lines and pairings stay behind" onPick={() => setCopyId(c.id)} />
              ))}
            </div>
          </>
        )}
      </div>
    </PracticeSheet>
  );
}
