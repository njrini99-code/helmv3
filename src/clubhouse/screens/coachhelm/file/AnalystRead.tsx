'use client';

import Link from 'next/link';
import { ChevronRight, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import type { ChAnalystRead, ChAnalystReadLoad } from '../../../data/coachhelm-analyst-read-shape';
import { normalise, useAction } from '../../../lib/use-action';
import { Badge } from '../../../ui/Badge';
import { Button } from '../../../ui/Button';
import { Icon } from '../../../ui/Icon';
import { Modal } from '../../../ui/Modal';
import { LIVE_ANALYST_READ_WRITES, type ChAnalystReadWrites } from '../writes';
import { CardHead } from './cards';

/** The longest reason a "Wrong" keeps (the table's check). */
export const WRONG_REASON_MAX = 500;

/** A fresh id for one tap. A Retry of the same tap sends it again, so the server writes the row once. */
export function newReadActionId(): string {
  const c = globalThis.crypto;
  if (typeof c.randomUUID === 'function') return c.randomUUID();
  const b = c.getRandomValues(new Uint8Array(16));
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/**
 * CoachHelm's read of one player (flag `coachhelm_reads_v1`, the listed team only): where the strokes go, how sure, one
 * level down, the rounds behind it, how it was found and what would change it. Drawn above today's cards; nothing is
 * drawn when the flag is off or no read is saved yet. The rounds open in a sheet, each opening its round.
 *
 * The coach acts on it here: Set as focus (the card then says, honestly, what happened since), Not useful, or Wrong with a
 * reason (the card steps down until the evidence changes). Each change shows at once and goes back, with an error toast
 * and Try again, when the server says no.
 */
export function AnalystReadCard({ load, first, writes = LIVE_ANALYST_READ_WRITES }: { load: ChAnalystReadLoad | null | undefined; first: string; writes?: ChAnalystReadWrites }) {
  if (!load || load.status === 'off' || load.status === 'none') return null;
  if (load.status === 'failed') {
    return (
      <section className="card ch-hf-an" data-ch-anchor="analyst" role="status">
        <CardHead title="CoachHelm’s read" />
        <p className="card__n ch-hf-an__fail">
          <Icon icon={TriangleAlert} size={16} />
          Couldn’t load {first}’s read
        </p>
      </section>
    );
  }
  return <ReadCard read={load.read} first={first} writes={writes} />;
}

/**
 * The player's own read on Your week (flag `coachhelm_reads_v1`, their team listed), spoken to them: where their strokes
 * go, how sure, how it was found, what would change it and the rounds behind it. No team figure, no coach's verdict, no
 * focus and no actions: the loader serves a payload already stripped (`forPlayer`, `toPlayerRead`). Nothing is drawn when
 * it is off or no read is saved yet.
 */
export function PlayerReadCard({ load }: { load: ChAnalystReadLoad | null | undefined }) {
  const [open, setOpen] = useState(false);
  if (!load || load.status === 'off' || load.status === 'none') return null;
  if (load.status === 'failed') {
    return (
      <section className="card ch-hf-an" data-ch-anchor="analyst" role="status" data-ch-code="CH-13216">
        <CardHead title="CoachHelm’s read of your game" />
        <p className="card__n ch-hf-an__fail">
          <Icon icon={TriangleAlert} size={16} />
          Couldn’t load your read. The rest of your week is below.
        </p>
      </section>
    );
  }
  const r = load.read;
  return (
    <section className="card ch-hf-an" aria-labelledby="ch-hf-an-me" data-ch-anchor="analyst" data-ch="analyst-read-player">
      <CardHead id="ch-hf-an-me" title="CoachHelm’s read of your game" meta={<span className="ch-num">{r.through}</span>} />
      <div className="ch-hf-an__body">
        {r.improvement && <p className="ch-hf-an__p ch-hf-an__team">{r.improvement}</p>}
        {r.changed && <p className="ch-hf-an__p">{r.changed}</p>}
        <p className="ch-hf-an__head">
          {r.certainty && <Badge tone={r.certainty === 'Clear' ? 'warning' : 'neutral'}>{r.certainty}</Badge>}
          <b>{r.headline}</b>
        </p>
        {r.stale && <p className="ch-hf-an__stale">{r.stale}</p>}
        {r.missing && <p className="ch-hf-an__p">{r.missing}</p>}
        {r.where && <p className="ch-hf-an__p">{r.where}</p>}
        {r.written && <WrittenBlock w={r.written} />}
        {r.how.length > 0 && (
          <div className="ch-hf-an__how">
            <h5>How we found this</h5>
            <ul>
              {r.how.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </div>
        )}
        {r.change && (
          <div className="ch-hf-an__how">
            <h5>What would change this</h5>
            <p>{r.change}</p>
          </div>
        )}
        {r.parts.length > 0 && (
          <div className="ch-hf-an__how" data-ch-an-parts="">
            <h5>Your four parts</h5>
            <ul>
              {r.parts.map((x) => (
                <li key={x.label}>
                  <b>{x.label}.</b> {x.text}
                  {x.where ? ` ${x.where}` : ''}
                </li>
              ))}
            </ul>
          </div>
        )}
        {r.rounds.length > 0 && (
          <div className="ch-hf-an__foot">
            <Button data-ctl="CTL-P013-134" variant="secondary" size="lg" data={{ 'data-ch-an-rounds': '' }} onClick={() => setOpen(true)}>
              The {r.rounds.length} rounds behind it
            </Button>
          </div>
        )}
      </div>
      <Modal open={open} onClose={() => setOpen(false)} title="The rounds behind it" className="ch-htb-sheet ch-htb ch-hf ch-hf-sheet" width={480}>
        <EvidenceRounds read={r} />
      </Modal>
    </section>
  );
}

type Mark = { id: string; playerId: string; cardKey: string; verdict: 'not_useful' | 'wrong'; reason?: string | null };

function ReadCard({ read: r, first, writes }: { read: ChAnalystRead; first: string; writes: ChAnalystReadWrites }) {
  const [open, setOpen] = useState(false);
  const [focus, setFocus] = useState(r.focus);
  const [suppressed, setSuppressed] = useState(r.suppressed);
  const [wrongOpen, setWrongOpen] = useState(false);
  const [reason, setReason] = useState('');

  const focusAct = useAction(
    'coachhelm.reads.focus',
    async (a: { id: string; playerId: string; cardKey: string }) => {
      // Shown at once; taken back if the server says no.
      setFocus({ setOn: '', since: r.focusDraft ?? '', word: 'Too early' });
      const res = await writes.focus(a);
      const ok = normalise(res);
      if (ok.success && ok.data) setFocus(ok.data);
      else setFocus(null);
      return res;
    },
    { done: `Focus set for ${first}`, failed: `Couldn’t set the focus for ${first}`, hint: 'Nothing was saved. Try again.', code: 'CH-13015' },
  );
  const markAct = useAction(
    'coachhelm.reads.mark',
    async (a: Mark) => {
      setSuppressed({ verdict: a.verdict === 'wrong' ? 'Wrong' : 'Not useful', reason: a.reason?.trim() || 'Not useful' });
      const res = await writes.mark(a);
      if (normalise(res).success) setReason('');
      else setSuppressed(null);
      return res;
    },
    (a: Mark) =>
      a.verdict === 'wrong'
        ? { done: '', failed: `Couldn’t mark ${first}’s read as wrong`, hint: 'The read is still up. Try again.', code: 'CH-13017' }
        : { done: '', failed: `Couldn’t mark ${first}’s read as not useful`, hint: 'The read is still up. Try again.', code: 'CH-13016' },
  );
  const busy = focusAct.pending || markAct.pending;
  const key = r.cardKey;

  if (suppressed) {
    return (
      <section className="card ch-hf-an" data-ch-anchor="analyst" data-ch="analyst-read">
        <CardHead title="CoachHelm’s read" meta={<span className="ch-num">{r.through}</span>} />
        <p className="card__n" data-ch-an-suppressed="">
          You marked this read of {first} {suppressed.verdict.toLowerCase()}
          {suppressed.reason && suppressed.reason !== 'Not useful' ? `: ${suppressed.reason}` : ''}. It stays down until the evidence changes.
        </p>
      </section>
    );
  }
  return (
    <section className="card ch-hf-an" aria-labelledby="ch-hf-an" data-ch-anchor="analyst" data-ch="analyst-read">
      <CardHead id="ch-hf-an" title="CoachHelm’s read" meta={<span className="ch-num">{r.through}</span>} />
      <div className="ch-hf-an__body">
        {r.improvement && <p className="ch-hf-an__p ch-hf-an__team">{r.improvement}</p>}
        {r.changed && <p className="ch-hf-an__p">{r.changed}</p>}
        <p className="ch-hf-an__head">
          {r.certainty && <Badge tone={r.certainty === 'Clear' ? 'warning' : 'neutral'}>{r.certainty}</Badge>}
          <b>{r.headline}</b>
        </p>
        {r.stale && <p className="ch-hf-an__stale">{r.stale}</p>}
        {r.missing && <p className="ch-hf-an__p">{r.missing}</p>}
        {r.where && <p className="ch-hf-an__p">{r.where}</p>}
        {r.team && <p className="ch-hf-an__p ch-hf-an__team">{r.team}</p>}
        {focus && (
          <div className="ch-hf-an__focus" data-ch-an-focus="" aria-live="polite">
            <p className="ch-hf-an__p">{focus.since}</p>
            <p className="ch-hf-an__stale">{focus.word}.</p>
          </div>
        )}
        {r.written && <WrittenBlock w={r.written} />}
        {r.how.length > 0 && (
          <div className="ch-hf-an__how">
            <h5>How we found this</h5>
            <ul>
              {r.how.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </div>
        )}
        {r.change && (
          <div className="ch-hf-an__how">
            <h5>What would change this</h5>
            <p>{r.change}</p>
          </div>
        )}
        {r.parts.length > 0 && (
          <div className="ch-hf-an__how" data-ch-an-parts="">
            <h5>The four parts</h5>
            <ul>
              {r.parts.map((x) => (
                <li key={x.label}>
                  <b>{x.label}.</b> {x.text}
                  {x.where ? ` ${x.where}` : ''}
                  {x.team ? ` ${x.team}` : ''}
                </li>
              ))}
            </ul>
          </div>
        )}
        {r.signals.length > 0 && (
          <div className="ch-hf-an__how" data-ch-an-signals="">
            <h5>Also unusual</h5>
            <ul>
              {r.signals.map((x) => (
                <li key={x.text}>
                  {x.text}
                  {x.team ? ` ${x.team}` : ''}
                </li>
              ))}
            </ul>
          </div>
        )}
        {(r.rounds.length > 0 || key) && (
          <div className="ch-hf-an__foot">
            {r.rounds.length > 0 && (
              <Button data-ctl="CTL-P013-135" variant="secondary" size="lg" data={{ 'data-ch-an-rounds': '' }} onClick={() => setOpen(true)}>
                The {r.rounds.length} rounds behind it
              </Button>
            )}
            {key && (
              <div className="ch-hf-an__acts" role="group" aria-label={`Act on ${first}’s read`}>
                {!focus && (
                  <Button data-ctl="CTL-P013-136" variant="secondary" data={{ 'data-ch-an-act': 'focus' }} busy={focusAct.pending} disabled={busy && !focusAct.pending} onClick={() => void focusAct.run({ id: newReadActionId(), playerId: r.playerId, cardKey: key })}>
                    Set as focus
                  </Button>
                )}
                <Button data-ctl="CTL-P013-137" variant="ghost" data={{ 'data-ch-an-act': 'not-useful' }} busy={markAct.pending} disabled={busy && !markAct.pending} onClick={() => void markAct.run({ id: newReadActionId(), playerId: r.playerId, cardKey: key, verdict: 'not_useful' })}>
                  Not useful
                </Button>
                <Button data-ctl="CTL-P013-138" variant="ghost" data={{ 'data-ch-an-act': 'wrong' }} disabled={busy} onClick={() => setWrongOpen(true)}>
                  Wrong
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
      <Modal open={open} onClose={() => setOpen(false)} title="The rounds behind it" className="ch-htb-sheet ch-htb ch-hf ch-hf-sheet" width={480}>
        <EvidenceRounds read={r} />
      </Modal>
      {key && (
        <Modal
          open={wrongOpen}
          onClose={() => setWrongOpen(false)}
          title={`What’s wrong with this read of ${first}?`}
          description="The read steps down until the evidence changes. Only coaches see what you write."
          className="ch-htb-sheet ch-htb ch-hf ch-hf-sheet"
          width={480}
          initialFocus="textarea"
        >
          <form
            className="ch-hf-an__wrong"
            onSubmit={(e) => {
              e.preventDefault();
              const text = reason.trim();
              if (!text) return;
              setWrongOpen(false);
              void markAct.run({ id: newReadActionId(), playerId: r.playerId, cardKey: key, verdict: 'wrong', reason: text });
            }}
          >
            <label className="ch-field">
              Reason
              <textarea className="ch-textarea" rows={4} maxLength={WRONG_REASON_MAX} value={reason} onChange={(e) => setReason(e.target.value)} data-ch-an-reason="" />
            </label>
            <div className="ch-hf-an__wrong-foot">
              <Button data-ctl="CTL-P013-139" variant="secondary" onClick={() => setWrongOpen(false)}>
                Cancel
              </Button>
              <Button data-ctl="CTL-P013-140" variant="primary" type="submit" disabled={!reason.trim()} data={{ 'data-ch-an-wrong-send': '' }}>
                Mark as wrong
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  );
}

function WrittenBlock({ w }: { w: NonNullable<ChAnalystRead['written']> }) {
  return (
    <div className="ch-hf-an__how" data-ch-an-written="">
      <p className="ch-hf-an__p">{w.what}</p>
      <p className="ch-hf-an__p">{w.rulesInOut}</p>
      <h5>This week</h5>
      <p>{w.thisWeek}</p>
      <h5>Watch</h5>
      <p>{w.watch}</p>
    </div>
  );
}

/** Worst first. Each round opens the round. */
export function EvidenceRounds({ read }: { read: ChAnalystRead }) {
  return (
    <ol className="ch-hf-an__rounds">
      {read.rounds.map((x) => (
        <li key={x.id}>
          <Link data-ctl="CTL-P013-141" href={x.href} prefetch={false} className="ch-hf-an__round" data-ch-an-round={x.id}>
            <span className="ch-hf-an__rt">
              <b className="ch-num">
                {x.date}
                {x.course ? `, ${x.course}` : ''}
                {x.score ? `, ${x.score}` : ''}
              </b>
              <small className="ch-num">{x.line}</small>
            </span>
            <Icon icon={ChevronRight} size={16} />
          </Link>
          {x.shots.length > 0 && (
            <ul className="ch-hf-an__shots">
              {x.shots.map((s) => (
                <li key={s.id} className="ch-num">
                  {s.text}
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ol>
  );
}
