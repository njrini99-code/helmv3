'use client';

import { Check } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { copyPlanBody, savePracticePlan } from '@/app/golf/actions/practice-plans';
import type { ChPracticeEvent } from '../../data/practice-home-shape';
import { FormSheet } from '../../ui/FormSheet';
import { Icon } from '../../ui/Icon';
import { useToast } from '../../ui/Toast';
import { copyBody, emptyBody } from './builder/builder-model';

type Start = 'blank' | 'copy' | 'ask';

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
export function NewPlanSheet({ open, onClose, events, copies, roster, askOn, initialEvent, preview = false }: { open: boolean; onClose: () => void; events: ChPracticeEvent[]; copies: Array<{ id: string; label: string }>; roster: string[]; askOn: boolean; initialEvent?: string | null; preview?: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const firstOpen = events.find((e) => !e.allDay)?.id ?? null;
  const [eventId, setEventId] = useState<string | null>(initialEvent ?? firstOpen);
  const [start, setStart] = useState<Start>(askOn ? 'ask' : 'blank');
  const [copyId, setCopyId] = useState<string | null>(copies[0]?.id ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const event = events.find((e) => e.id === (initialEvent ?? eventId)) ?? events.find((e) => e.id === eventId) ?? null;

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
      const body = copied?.success ? copyBody(copied.body, roster) : emptyBody(event.place, roster, start === 'blank' && !askOn);
      const res = await savePracticePlan({ eventId: event.id, expectedVersion: null, title: event.title, step: 'blocks', body });
      if (!res.success) {
        if (res.stale) {
          toast({ title: 'Another coach already started a plan for this practice', code: 'CH-17505' });
          router.refresh();
          onClose();
          return;
        }
        setError(res.unavailable ? 'Practice plans aren’t on for your team yet.' : res.error);
        return;
      }
      router.push(`/golf/dashboard/practice/plan/${res.planId}/edit${start === 'ask' ? '?fill=1' : ''}`);
    } catch {
      setError('That didn’t go through. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <FormSheet open={open} onClose={onClose} title="New plan" actionLabel={start === 'ask' ? 'Start with CoachHelm' : 'Create plan'} onAction={() => void create()} actionDisabled={!event || event.allDay || (start === 'copy' && !copyId)} busy={busy} code="CH-17300">
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
          <Option on={start === 'blank'} title="Blank" line="Add blocks yourself" onPick={() => setStart('blank')} />
          {copies.length > 0 && <Option on={start === 'copy'} title="Copy a past practice" line="Keeps blocks, drills and groups" onPick={() => setStart('copy')} />}
          {askOn && <Option on={start === 'ask'} title="Ask CoachHelm" line="It drafts from your team’s data. You keep what you like." onPick={() => setStart('ask')} />}
        </div>
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
