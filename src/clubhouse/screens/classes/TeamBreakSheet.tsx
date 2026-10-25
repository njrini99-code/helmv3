'use client';

import { Trash2 } from 'lucide-react';
import { useCallback, useEffect, useId, useState } from 'react';
import { addTeamBreak, removeTeamBreak } from '@/app/golf/actions/class-status';
import { createClient } from '@/lib/supabase/client';
import { refetchTeamClassDay } from '../../lib/use-class-day';
import { loadTeamBreaks, type ChTeamBreak } from '../../data/class-day';
import { Button, IconButton } from '../../ui/Button';
import { DateField } from '../../ui/DateField';
import { Modal } from '../../ui/Modal';
import { haptic } from '../../lib/haptics';
import { useAction } from '../../lib/use-action';
import { breakLine, validateBreak } from './term-form';
import '../../styles/class-awareness.css';

/**
 * P-10 class awareness: "Mark a day with no classes". A team-wide range (at most 21 days) with an optional name
 * ("Fall break"); one `golf_class_exceptions` row with no player. The ranges still ahead are listed here with a delete,
 * which asks first (D-70). A break releases waiting holds for the whole team on the next tick.
 */
export function TeamBreakSheet({ open, onClose, teamId, today }: { open: boolean; onClose: () => void; teamId: string; today: string }) {
  const id = useId();
  const [rows, setRows] = useState<ChTeamBreak[] | null>(null);
  const [startsOn, setStartsOn] = useState('');
  const [endsOn, setEndsOn] = useState('');
  const [label, setLabel] = useState('');
  const [shown, setShown] = useState(false);
  const [removing, setRemoving] = useState<ChTeamBreak | null>(null);

  const reload = useCallback(async () => {
    const next = await loadTeamBreaks(createClient(), teamId, today);
    if (next) setRows(next);
  }, [teamId, today]);
  useEffect(() => {
    if (!open) return;
    setStartsOn('');
    setEndsOn('');
    setLabel('');
    setShown(false);
    void reload();
  }, [open, reload]);

  const add = useAction('addTeamBreak', addTeamBreak, { done: '', failed: 'Couldn’t save the break', hint: 'Nothing was changed.', code: 'CH-2071' });
  const remove = useAction('removeTeamBreak', removeTeamBreak, { done: '', failed: 'Couldn’t remove the break', hint: 'It is still on the list.', code: 'CH-2072' });

  const issue = validateBreak(startsOn, endsOn || startsOn);
  const submit = async () => {
    setShown(true);
    if (!startsOn || issue || add.pending) return;
    const r = await add.run({ teamId, startsOn, endsOn: endsOn || startsOn, label: label.trim() || undefined });
    if (r.success) {
      haptic('success');
      setStartsOn('');
      setEndsOn('');
      setLabel('');
      setShown(false);
      await reload();
      void refetchTeamClassDay(teamId);
    }
  };
  const confirmRemove = async () => {
    if (!removing || remove.pending) return;
    const r = await remove.run({ id: removing.id, teamId });
    if (r.success) {
      haptic('success');
      setRemoving(null);
      await reload();
      void refetchTeamClassDay(teamId);
    }
  };
  const bad = shown && issue ? issue : null;

  return (
    <>
      <Modal
        open={open && !removing}
        onClose={add.pending ? () => {} : onClose}
        width={460}
        title="Mark a day with no classes"
        description="No one shows as in class on these days, and waiting pushes are delivered."
        footer={
          <>
            <Button variant="ghost" disabled={add.pending} onClick={onClose}>
              Close
            </Button>
            <Button variant="primary" busy={add.pending} disabled={!startsOn} onClick={() => void submit()}>
              {add.pending ? 'Saving…' : 'Mark no classes'}
            </Button>
          </>
        }
      >
        <form
          className="ch-ca-form"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <button type="submit" hidden />
          <div className="ch-field">
            <span className="ch-field__label">First day</span>
            <DateField value={startsOn} onChange={(d) => setStartsOn(d)} label="First day" min={today} today={today} />
          </div>
          <div className="ch-field">
            <span className="ch-field__label">
              Last day <span className="ch-field__opt">Optional</span>
            </span>
            <DateField value={endsOn} onChange={(d) => setEndsOn(d)} label="Last day" min={startsOn || today} anchor={startsOn || undefined} clearable today={today} aria-invalid={bad ? true : undefined} aria-describedby={bad ? `${id}-err` : undefined} />
          </div>
          <div className="ch-field">
            <label htmlFor={`${id}-label`} className="ch-field__label">
              Name <span className="ch-field__opt">Optional</span>
            </label>
            <input id={`${id}-label`} className="ch-input" value={label} maxLength={60} autoComplete="off" placeholder="e.g. Fall break" onChange={(e) => setLabel(e.target.value)} />
          </div>
          {bad && (
            <span id={`${id}-err`} className="ch-field__help is-error" role="alert" data-ch-code={bad.code}>
              {bad.message}
            </span>
          )}
        </form>
        {rows && rows.length > 0 && (
          <ul className="ch-ca-breaks" aria-label="Upcoming no-class days">
            {rows.map((b) => (
              <li key={b.id}>
                <span>{breakLine(b)}</span>
                <IconButton icon={Trash2} label={`Remove ${breakLine(b)}`} size="sm" onClick={() => setRemoving(b)} />
              </li>
            ))}
          </ul>
        )}
      </Modal>
      <Modal
        code="CH-2570"
        open={open && !!removing}
        onClose={remove.pending ? () => {} : () => setRemoving(null)}
        width={420}
        title="Remove this break?"
        description={removing ? `${breakLine(removing)}. Class status counts those days again.` : undefined}
        footer={
          <>
            <Button variant="ghost" disabled={remove.pending} onClick={() => setRemoving(null)}>
              Keep it
            </Button>
            <Button variant="danger" busy={remove.pending} onClick={() => void confirmRemove()}>
              {remove.pending ? 'Removing…' : 'Remove break'}
            </Button>
          </>
        }
      >
        <p className="ch-ca-note">Players’ own “No class today” marks are not touched.</p>
      </Modal>
    </>
  );
}
