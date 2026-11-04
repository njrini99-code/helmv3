'use client';

import { Lock } from 'lucide-react';
import { useState } from 'react';
import { setIntent, type ActionResult, type SetIntentInput } from '@/app/golf/actions/v3/intent';
import { FILE_AIMS, FILE_ALERTS, FILE_AREAS, type ChFileIntent } from '../../../data/coachhelm-file-shape';
import { useAction } from '../../../lib/use-action';
import { Icon } from '../../../ui/Icon';
import { Modal } from '../../../ui/Modal';

const NOTE_MAX = 2000;
export const DEFAULT_INTENT: ChFileIntent = { aim: 'develop', alerts: 'balanced', watching: [], note: null };
export const LIVE_SAVE_INTENT = (i: SetIntentInput): Promise<ActionResult> => setIntent(i);

/** Your plan for {first}: coach only, same write the Roster peek uses. Nothing saves until Save plan; unsaved picks ask before a scrim, swipe or Esc drops them (CP-LNS-9). */
export function IntentSheet({ open, playerId, first, value, save = LIVE_SAVE_INTENT, onSaved, onClose }: { open: boolean; playerId: string; first: string; value: ChFileIntent | null; save?: (i: SetIntentInput) => Promise<ActionResult>; onSaved: (i: ChFileIntent) => void; onClose: () => void }) {
  const start = value ?? DEFAULT_INTENT;
  const [aim, setAim] = useState(start.aim);
  const [alerts, setAlerts] = useState(start.alerts);
  const [watching, setWatching] = useState<string[]>(start.watching);
  const [note, setNote] = useState(start.note ?? '');
  const [asking, setAsking] = useState(false);
  const dirty = aim !== start.aim || alerts !== start.alerts || note !== (start.note ?? '') || watching.join() !== start.watching.join();
  const run = useAction(
    'coachhelm.file.saveIntent',
    async () => {
      const res = await save({ player_id: playerId, narrative_goal: aim, alert_posture: alerts, highlight_categories: watching, notes: note.trim() || null });
      if (res.ok) onSaved({ aim, alerts, watching, note: note.trim() || null });
      return { success: res.ok, error: res.error };
    },
    { done: '', failed: `Couldn’t save your plan for ${first}`, hint: 'Nothing was saved. Try again.', code: 'CH-13760' },
  );
  const softClose = () => {
    if (run.pending) return;
    if (dirty) setAsking(true);
    else onClose();
  };
  const footer = asking ? (
    <div className="sheet__f is-discard">
      <p>Discard changes?</p>
      <button type="button" className="ch-btn ch-btn--secondary" onClick={onClose}>
        Discard
      </button>
      <button type="button" className="ch-btn ch-btn--primary" onClick={() => setAsking(false)}>
        Keep editing
      </button>
    </div>
  ) : (
    <div className="sheet__f">
      <button type="button" className="ch-btn ch-btn--secondary" data-ch-sheet-close="" disabled={run.pending} onClick={onClose}>
        Cancel
      </button>
      <button type="button" className="ch-btn ch-btn--primary" data-ch-hf-intent-save="" disabled={run.pending} aria-busy={run.pending || undefined} onClick={() => void run.run()}>
        {run.pending ? 'Saving' : 'Save plan'}
      </button>
    </div>
  );
  return (
    <Modal open={open} onClose={softClose} title={`Your plan for ${first}`} className="ch-hf ch-hf-sheet" width={480} footer={footer} description={
      <span className="vis">
        <Icon icon={Lock} size={14} />
        Only you
      </span>
    }>
      <div className="sheet__b">
        <section className="well">
          <h5>Aim this season</h5>
          <div className="picks">
            {FILE_AIMS.map((a) => (
              <button key={a.id} type="button" data-ch-hf-pick="" data-ch-press="" aria-pressed={aim === a.id} onClick={() => setAim(a.id)}>
                {a.label}
              </button>
            ))}
          </div>
        </section>
        <section className="well">
          <h5>How often CoachHelm flags {first}</h5>
          <div className="picks">
            {FILE_ALERTS.map((a) => (
              <button key={a.id} type="button" data-ch-hf-pick="" data-ch-press="" aria-pressed={alerts === a.id} onClick={() => setAlerts(a.id)}>
                {a.label}
              </button>
            ))}
          </div>
          <p className="well__m">Aggressive shows more reads, Silent shows none.</p>
        </section>
        <section className="well">
          <h5>Watching</h5>
          <div className="picks">
            {FILE_AREAS.map((a) => {
              const on = watching.includes(a.id);
              return (
                <button key={a.id} type="button" data-ch-hf-pick="" data-ch-press="" aria-pressed={on} onClick={() => setWatching((w) => (on ? w.filter((x) => x !== a.id) : [...w, a.id]))}>
                  {a.label}
                </button>
              );
            })}
          </div>
        </section>
        <section className="well">
          <h5>Note</h5>
          <textarea className="note" aria-label="Note" maxLength={NOTE_MAX} placeholder="Only you see this" value={note} onChange={(e) => setNote(e.target.value)} />
        </section>
      </div>
    </Modal>
  );
}
