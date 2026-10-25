'use client';

import { Plus, Trash2 } from 'lucide-react';
import { shortDay, timeRange } from '../../data/classes-shape';
import { useChClock } from '../../lib/use-clock';
import { IconButton } from '../../ui/Button';
import { Switch } from '../../ui/Switch';
import type { ChExam } from './class-status-writes';
import '../../styles/class-awareness.css';

/**
 * P-10 class awareness: the class detail's two additions. "Use for class status" (default on; a flexible or online class
 * you don't attend at a set time should be off) and the exams added for this class, with an Add an exam row. The sheets
 * themselves (Add an exam, Remove an exam) belong to ClassDetail, which steps aside while one is open.
 */
export function ClassStatusDetail({
  enabled,
  busy,
  exams,
  onToggle,
  onAddExam,
  onRemoveExam,
}: {
  enabled: boolean;
  busy: boolean;
  exams: readonly ChExam[];
  onToggle: (next: boolean) => void;
  onAddExam: () => void;
  onRemoveExam: (e: ChExam) => void;
}) {
  const clock = useChClock();
  return (
    <section className="ch-ca-detail" aria-label="Class status">
      <div className="ch-ca-panel__row">
        <div>
          <p>Use for class status</p>
          <span>Turn off for online or flexible classes you don’t attend at a set time.</span>
        </div>
        <Switch checked={enabled} onChange={onToggle} label="Use for class status" hideLabel busy={busy} />
      </div>
      <button type="button" className="ch-ca-panel__link" onClick={onAddExam}>
        <span>Add an exam</span>
        <Plus size={14} aria-hidden="true" />
      </button>
      {exams.length > 0 && (
        <ul className="ch-ca-breaks" aria-label="Exams">
          {exams.map((e) => (
            <li key={e.id}>
              <span>
                {e.label || 'Exam'} · {shortDay(e.on)} <span className="ch-num">{timeRange(e.start, e.end, clock)}</span>
              </span>
              <IconButton icon={Trash2} label={`Remove ${e.label || 'exam'} on ${shortDay(e.on)}`} size="sm" onClick={() => onRemoveExam(e)} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
