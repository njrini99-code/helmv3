'use client';

import type { ValidatedVisualArtifact } from '@/lib/coachhelm/v3/chat/visuals/schema';
import { sourceLine } from '../../../../data/coachhelm-chat-thread';
import { formatSG } from '../../../../lib/format';
import { useChPhone } from '../../../../lib/use-phone';
import { Studio, fillComposer, type StudioLeg } from '../studio';
import { useLightPlace } from '../../../../shell/light';

const ANNOTATION_WORD = { measured: 'Measured', association: 'Pattern', hypothesis: 'To test' } as const;

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

/**
 * Strokes gained by part of the game, as the studio draws it (chat/studio, `strokes_gained`): the hole in plan with each
 * part sounded off it. The finding is the figure's name, shown only where no lead stands over it (as a composition's
 * is); under the drawing sit what was noticed about a part, the total, and one source line. A part asks about itself, and
 * says its own sample to a screen reader, so nothing has to be selected to read it.
 */
function SgAnatomy({ artifact }: { artifact: ValidatedVisualArtifact }) {
  const phone = useChPhone();
  const zone = useLightPlace().timeZone;
  const legs: StudioLeg[] = artifact.legs.map((l) => ({ key: l.metricId, label: l.label, value: l.value, display: formatSG(l.value, 1), sample: `over ${l.sampleSize} ${l.sampleSize === 1 ? l.sampleUnit.replace(/s$/, '') : l.sampleUnit}` }));
  const mostRounds = Math.max(...artifact.legs.map((l) => l.sampleSize));
  const partial = artifact.legs.filter((l) => l.coverage !== 'complete' && l.coverageNote);
  return (
    <figure className="ch-aks-cv ch-aks-va" data-kind={artifact.kind} data-artifact={artifact.artifactId} data-ch-code="CH-13853">
      <figcaption className="ch-aks-cv__head">
        <span className="ch-aks-cv__title">{artifact.title}</span>
        <span className="ch-aks-cv__lede">{artifact.entity.label}, strokes gained a round</span>
      </figcaption>
      <div className="ch-aks-sec">
        <Studio part={{ kind: 'strokes_gained', data: { title: null, legs, takeaway: null, highlight: artifact.highlightedMetricId } }} size={phone ? 'compact' : 'full'} read={artifact.artifactId} onAsk={fillComposer} />
      </div>
      {(artifact.annotations.length > 0 || artifact.total || artifact.coverage === 'partial') && (
        <div className="ch-aks-va__notes">
          {artifact.annotations.map((n) => (
            <p key={`${n.metricId}-${n.label}`} className="ch-aks ch-aks-note" data-claim={n.kind}>
              <b>{ANNOTATION_WORD[n.kind]}</b> {n.label}
            </p>
          ))}
          {artifact.total && (
            <p className="ch-aks-va__total">
              Total <b className="ch-num">{formatSG(artifact.total.value, 1)}</b> a round
              {artifact.total.reconciles === true && ' · the four parts add up to it'}
              {artifact.total.reconciles === false && ' · the parts differ from the total by more than rounding, so the window or the baseline may differ'}
            </p>
          )}
          {artifact.coverage === 'partial' && (
            <p className="ch-aks-cv__cover">
              <b>Partial data</b> {partial.length > 0 ? partial.map((l) => `${l.label}: ${l.coverageNote}`).join(' ') : 'Some rounds are missing a part of the game.'}
            </p>
          )}
        </div>
      )}
      <p className="ch-aks-src ch-num">{sourceLine({ sample_size: mostRounds, sample_unit: 'rounds', window_start: artifact.window.start, window_end: artifact.window.end, as_of: artifact.sourceAsOf }, zone)}</p>
    </figure>
  );
}
