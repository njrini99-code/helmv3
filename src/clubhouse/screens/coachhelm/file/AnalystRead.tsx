'use client';

import Link from 'next/link';
import { ChevronRight, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import type { ChAnalystRead, ChAnalystReadLoad } from '../../../data/coachhelm-analyst-read-shape';
import { Badge } from '../../../ui/Badge';
import { Button } from '../../../ui/Button';
import { Icon } from '../../../ui/Icon';
import { Modal } from '../../../ui/Modal';
import { CardHead } from './cards';

/**
 * CoachHelm's read of one player (flag `coachhelm_reads_v1`, the listed team only): where the strokes go, how sure, one
 * level down, the rounds behind it, how it was found and what would change it. Drawn above today's cards; nothing is
 * drawn when the flag is off or no read is saved yet. The rounds open in a sheet, each opening its round.
 */
export function AnalystReadCard({ load, first }: { load: ChAnalystReadLoad | null | undefined; first: string }) {
  const [open, setOpen] = useState(false);
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
  const r = load.read;
  return (
    <section className="card ch-hf-an" aria-labelledby="ch-hf-an" data-ch-anchor="analyst" data-ch="analyst-read">
      <CardHead id="ch-hf-an" title="CoachHelm’s read" meta={<span className="ch-num">{r.through}</span>} />
      <div className="ch-hf-an__body">
        <p className="ch-hf-an__head">
          {r.certainty && <Badge tone={r.certainty === 'Clear' ? 'warning' : 'neutral'}>{r.certainty}</Badge>}
          <b>{r.headline}</b>
        </p>
        {r.stale && <p className="ch-hf-an__stale">{r.stale}</p>}
        {r.missing && <p className="ch-hf-an__p">{r.missing}</p>}
        {r.where && <p className="ch-hf-an__p">{r.where}</p>}
        {r.team && <p className="ch-hf-an__p ch-hf-an__team">{r.team}</p>}
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
        {r.rounds.length > 0 && (
          <div className="ch-hf-an__foot">
            <Button variant="secondary" size="lg" data={{ 'data-ch-an-rounds': '' }} onClick={() => setOpen(true)}>
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
          <Link href={x.href} prefetch={false} className="ch-hf-an__round" data-ch-an-round={x.id}>
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
