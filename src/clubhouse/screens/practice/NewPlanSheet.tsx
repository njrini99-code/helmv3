'use client';

import { Check } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { copyPlanBody, savePracticePlan } from '@/app/golf/actions/practice-plans';
import type { PlanBodyV2 } from '@/lib/coachhelm/v3/practice-plan/model';
import type { ChPracticeEvent } from '../../data/practice-home-shape';
import { FormSheet } from '../../ui/FormSheet';
import { Icon } from '../../ui/Icon';
import { useToast } from '../../ui/Toast';
import { TERMS } from '../../lib/glossary';
import { Segmented } from '../../ui/Segmented';
import { copyBody, emptyBody, fmtMinutes, leaveAskPicks, lengthChoices } from './builder/builder-model';

/** What to work on: the parts of the game a coach names. Nothing is picked for them; no pick leaves it to the team's numbers. */
const WORK_ON = ['Putting', TERMS.shortGame.long, 'Approach', 'Off the tee', 'On the course', 'Pressure'];

export type NewPlanStart = 'blank' | 'copy' | 'ask' | 'template';
type Start = NewPlanStart;

function Option({ on, title, line, disabled, onPick }: { on: boolean; title: string; line: string; disabled?: boolean; onPick: () => void }) {
  return (
    <button type="button" className={'ch-prc-opt' + (on ? ' is-on' : '')} role="radio" aria-checked={on} disabled={disabled} onClick={onPick}>
      <span className="ch-prc-opt__t">
        <b>{title}</b>
        <span>{line}</span>
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
 * `preview`: a press closes the sheet and reaches no server.
 */
export function NewPlanSheet({ open, onClose, events, copies, roster, initialEvent, initialStart, preview = false, template = null }: { /** First run's three starts open the sheet on the one picked. */ initialStart?: NewPlanStart; template?: { name: string; body: PlanBodyV2 } | null; open: boolean; onClose: () => void; events: ChPracticeEvent[]; copies: Array<{ id: string; label: string }>; roster: string[]; initialEvent?: string | null; preview?: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const firstOpen = events.find((e) => !e.allDay)?.id ?? null;
  const [eventId, setEventId] = useState<string | null>(initialEvent ?? firstOpen);
  const [start, setStart] = useState<Start>(template ? 'template' : initialStart && initialStart !== 'template' ? initialStart : 'ask');
  const [copyId, setCopyId] = useState<string | null>(copies[0]?.id ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const event = events.find((e) => e.id === (initialEvent ?? eventId)) ?? events.find((e) => e.id === eventId) ?? null;
  // Ask CoachHelm's two questions (S-BLD.new-sheet). The length starts on the calendar's window; what to work on starts empty.
  const lengths = lengthChoices(event?.minutes);
  const [minutes, setMinutes] = useState<number | null>(null);
  const [areas, setAreas] = useState<string[]>([]);
  const length = minutes != null && lengths.includes(minutes) ? minutes : event?.minutes ? lengths[lengths.length - 1]! : null;
  const asking = start === 'ask' && !!event && !event.allDay;
  const dayWord = event?.label.split(',')[0] ?? 'this practice';

  const create = async () => {
    if (!event) return;
    if (preview) return onClose();
    setBusy(true);
    setError(null);
    try {
      const copied = start === 'copy' && copyId ? await copyPlanBody({ planId: copyId }) : null;
      if (start === 'copy' && !copied?.success) {
        setError(copied?.error ?? 'That plan couldn’t be copied.');
        return;
      }
      const body = start === 'template' && template ? { ...template.body, place: event.place.slice(0, 80), players: [...roster] } : copied?.success ? copyBody(copied.body, roster) : emptyBody(event.place, roster, false);
      const res = await savePracticePlan({ eventId: event.id, expectedVersion: null, title: event.title, step: 'blocks', body });
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

  return (
    <FormSheet open={open} onClose={onClose} title="New plan" actionLabel={asking ? 'Build plan' : 'Create plan'} full onAction={() => void create()} actionDisabled={!event || event.allDay || (start === 'copy' && !copyId)} busy={busy} code="CH-13395">
      <div className="ch-prc-new">
        {error && (
          <p className="ch-prc-new__err" role="alert">
            {error}
          </p>
        )}
        <h3>Which practice</h3>
        {events.length === 0 ? (
          <p className="ch-prc-new__none">No practices without a plan in the next two weeks. Add one on the calendar, then plan it here.</p>
        ) : (
          <div className="ch-prc-grp" role="radiogroup" aria-label="Which practice">
            {events.map((e) => (
              <Option key={e.id} on={e.id === event?.id} title={e.label} line={e.allDay ? 'Give this practice a start and end time to plan it.' : `${e.detail} · no plan yet`} disabled={e.allDay} onPick={() => setEventId(e.id)} />
            ))}
          </div>
        )}
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
                <small className="ch-num">{event?.minutes ? `Your calendar has ${event.detail.split(' · ')[0]}.` : 'This practice has no end time on the calendar.'}</small>
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
    </FormSheet>
  );
}
