'use client';

import { useRef, useState, type KeyboardEvent } from 'react';
import { Table2 } from 'lucide-react';
import type { ValidatedVisualArtifact } from '@/lib/coachhelm/v3/chat/visuals/schema';
import { sourceLine, type AskTable } from '../../../../data/coachhelm-chat-thread';
import { changeTone, formatFixed, formatSG } from '../../../../lib/format';
import { haptic } from '../../../../lib/haptics';
import { Icon } from '../../../../ui/Icon';
import { DataTable } from '../Evidence';

const ANNOTATION_WORD = { measured: 'Measured', association: 'Pattern', hypothesis: 'To test' } as const;

/** "loses 0.9 strokes a round", for a screen reader: the sign said in words, the minus sign never read as a hyphen. */
function spoken(value: number): string {
  const tone = changeTone(value, false, 1);
  const n = formatFixed(Math.abs(value), 1);
  return tone === 'is-gain' ? `gains ${n} strokes a round` : tone === 'is-loss' ? `loses ${n} strokes a round` : 'is even with the baseline';
}

/**
 * A validated visual from the chat (visuals/schema.ts), drawn from the figures stored in the message: nothing here
 * reads the network or the model. One component per scene kind; a kind this build cannot draw falls back to the
 * evidence it came from (the thread keeps those blocks only while an artifact is drawn).
 */
export function CoachVisualArtifact({ artifact }: { artifact: ValidatedVisualArtifact }) {
  switch (artifact.kind) {
    case 'sg_anatomy':
      return <SgAnatomy artifact={artifact} />;
    default:
      return null;
  }
}

function SgAnatomy({ artifact }: { artifact: ValidatedVisualArtifact }) {
  const [selected, setSelected] = useState<string | null>(artifact.highlightedMetricId);
  const [asTable, setAsTable] = useState(false);
  const rows = useRef<Array<HTMLButtonElement | null>>([]);
  const legs = artifact.legs;
  // A symmetric scale, never tighter than half a stroke, so a near-zero leg does not fill the chart.
  const max = Math.max(0.5, ...legs.map((l) => Math.abs(l.value)));
  const chosen = legs.find((l) => l.metricId === selected) ?? null;
  const notes = artifact.annotations.filter((a) => a.metricId === selected);
  const mostRounds = Math.max(...legs.map((l) => l.sampleSize));

  const table: AskTable = {
    caption: `${artifact.title}: strokes gained per round, by part of the game`,
    columns: ['Part of the game', 'Strokes gained a round', 'Sample'],
    rows: [
      ...legs.map((l) => [l.label, formatSG(l.value, 2), `${l.sampleSize} ${l.sampleUnit}`]),
      ...(artifact.total ? [['Total', formatSG(artifact.total.value, 2), `${artifact.total.sampleSize} rounds`]] : []),
    ],
  };

  const choose = (id: string) => {
    haptic('select');
    setSelected((cur) => (cur === id ? null : id));
  };
  const onKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    rows.current[(i + (e.key === 'ArrowDown' ? 1 : legs.length - 1)) % legs.length]?.focus();
  };

  return (
    <figure className="ch-th-va" data-kind={artifact.kind} data-artifact={artifact.artifactId} data-ch-code="CH-13853">
      <div className="ch-th-va__head">
        <div>
          <figcaption className="ch-th-va__title">{artifact.title}</figcaption>
          <p className="ch-th-va__sub">
            {artifact.entity.label} · strokes gained a round
            {artifact.coverage === 'partial' && <span className="ch-th-va__chip">Partial data</span>}
          </p>
        </div>
        <button type="button" className="ch-th-toggle" aria-pressed={asTable} onClick={() => setAsTable((v) => !v)} data-ch-code="CH-13852">
          <Icon icon={Table2} size={14} />
          View as table
        </button>
      </div>

      {asTable ? (
        <DataTable table={table} />
      ) : (
        <div className="ch-th-va__chart" role="group" aria-label={`${artifact.title}. Select a part of the game to see its sample.`}>
          <span className="ch-th-va__axis" aria-hidden="true" />
          {legs.map((l, i) => {
            const tone = changeTone(l.value, false, 1);
            const on = l.metricId === selected;
            return (
              <button
                key={l.metricId}
                ref={(el) => {
                  rows.current[i] = el;
                }}
                type="button"
                className={'ch-th-va__row' + (on ? ' is-on' : '') + (selected && !on ? ' is-quiet' : '')}
                data-sign={tone === 'is-gain' ? 'gain' : tone === 'is-loss' ? 'loss' : undefined}
                aria-pressed={on}
                aria-label={`${l.label}: ${spoken(l.value)}, over ${l.sampleSize} ${l.sampleUnit}`}
                onClick={() => choose(l.metricId)}
                onKeyDown={(e) => onKey(e, i)}
              >
                <span className="ch-th-va__label">{l.label}</span>
                <span className="ch-th-va__track" aria-hidden="true">
                  {tone && <span className="ch-th-va__bar" style={{ width: `${(Math.abs(l.value) / max) * 50}%` }} />}
                </span>
                <span className="ch-th-va__val ch-num">{formatSG(l.value, 1)}</span>
              </button>
            );
          })}
        </div>
      )}

      {chosen ? (
        <div className="ch-th-va__detail" role="status">
          <p>
            <b>{chosen.label}</b> {spoken(chosen.value)} over {chosen.sampleSize} {chosen.sampleUnit}
            {chosen.coverage !== 'complete' && chosen.coverageNote ? `. ${chosen.coverageNote}` : '.'}
          </p>
          {notes.map((n) => (
            <p key={n.label} className="ch-th-va__note" data-kind={n.kind}>
              <span className="ch-th-va__kind">{ANNOTATION_WORD[n.kind]}</span> {n.label}
            </p>
          ))}
        </div>
      ) : (
        <p className="ch-th-va__hint">Select a part of the game to see its sample.</p>
      )}

      {artifact.total && (
        <p className="ch-th-va__total">
          Total <b className="ch-num">{formatSG(artifact.total.value, 1)}</b> a round
          {artifact.total.reconciles === true && ' · the four parts add up to it'}
          {artifact.total.reconciles === false && ` · the parts differ from the total by more than rounding, so the window or the baseline may differ`}
        </p>
      )}
      <p className="ch-th-fig__src">
        {sourceLine({ sample_size: mostRounds, sample_unit: 'rounds', window_start: artifact.window.start, window_end: artifact.window.end, as_of: artifact.sourceAsOf })}
      </p>
    </figure>
  );
}
