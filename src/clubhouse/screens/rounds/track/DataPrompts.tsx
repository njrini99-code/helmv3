'use client';

import { useId, type ReactNode } from 'react';
import { formatFeet, type DistancePreference } from '@/lib/golf/distance-units';
import { PUTT_MISS_OPTIONS } from '@/lib/coachhelm/data-gap/asks';
import { haptic } from '../../../lib/haptics';
import { PUTT_TAGS } from './labels';
import type { ChPuttPromptView, ChRecoveryPromptView } from './use-data-prompts';

const PUTT_LABEL = Object.fromEntries(PUTT_TAGS) as Record<(typeof PUTT_TAGS)[number][0], string>;

/**
 * One data prompt at the top of the entry card (and, for the course nudge, in the Round complete sheet): a question, chips,
 * one line under them, and Skip. Never a modal and never in the way: Next shot stays the screen's one primary action, the
 * chips are secondary, and the row goes once it is answered and its receipt has been read. A chip is a selection tick; Skip
 * is silent (D-70).
 */
export function AskRow({ code, label, onSkip, skipLabel, line, sheet = false, children }: { code: string; label: string; onSkip?: () => void; skipLabel: string; line: ReactNode; sheet?: boolean; children: ReactNode }) {
  const id = useId();
  return (
    <section className={'ch-rt-sec ch-rt-ask' + (sheet ? ' ch-rt-ask--sheet' : '')} aria-labelledby={id} data-ch-code={code}>
      <div className="ch-rt-sec__h">
        <span id={id}>{label}</span>
        {onSkip && (
          <button type="button" className="ch-btn ch-btn--ghost ch-btn--sm" aria-label={skipLabel} onClick={onSkip}>
            <span>Skip</span>
          </button>
        )}
      </div>
      {children}
      <p className="ch-rt-ask__s" role="status" aria-live="polite">
        {line}
      </p>
    </section>
  );
}

/**
 * CH-11960: after a missed first putt from a distance band one of the player's reads is waiting on, "Which side did it
 * miss?" with Short, Long, High side and Low side, and the counter ("4 of 10 for your 5–10 ft putt read"). One tap puts the
 * tag on that putt (the same field the optional miss chips write); the row stays as the receipt until the read has its tags.
 */
export function PuttMissPrompt({ prompt, pref }: { prompt: ChPuttPromptView; pref: DistancePreference }) {
  const { ask, saved, counter, distanceFeet } = prompt;
  const from = distanceFeet === null ? 'First putt' : `First putt, ${formatFeet(distanceFeet, pref)}`;
  return (
    <AskRow
      code="CH-11960"
      label="Which side did it miss?"
      onSkip={saved ? undefined : prompt.onSkip}
      skipLabel="Skip tagging this putt"
      line={saved ? `Tagged ${PUTT_LABEL[saved].toLowerCase()} · ${counter}` : `${from} · ${counter}`}
    >
      <div className="ch-rt-tags" role="group" aria-label={`Which side the first putt missed, for your read “${ask.readTitle || ask.bandLabel}”`}>
        {PUTT_MISS_OPTIONS.map((tag) => (
          <button
            key={tag}
            type="button"
            aria-pressed={saved === tag}
            onClick={() => {
              haptic('select');
              prompt.onPick(tag);
            }}
          >
            {PUTT_LABEL[tag]}
          </button>
        ))}
      </div>
    </AskRow>
  );
}

const RECOVERY_CHOICES: ReadonlyArray<{ value: boolean; label: string }> = [
  { value: false, label: 'Clear shot' },
  { value: true, label: 'Blocked or punch out' },
];

/**
 * CH-11961: after a tee shot into the rough or an 'other' lie, "Next shot from there?" with Clear shot and Blocked or punch
 * out. The answer sits on the tee shot (`lie_after_recovery`), beside its lie; the row stays as the receipt until the next
 * shot is recorded.
 */
export function RecoveryPrompt({ prompt }: { prompt: ChRecoveryPromptView }) {
  const { saved, result } = prompt;
  return (
    <AskRow
      code="CH-11961"
      label="Next shot from there?"
      onSkip={saved === null ? prompt.onSkip : undefined}
      skipLabel="Skip the recovery question"
      line={saved === null ? (result === 'other' ? 'Tee shot, other lie' : 'Tee shot, rough') : saved ? 'Saved: a recovery shot' : 'Saved: a clear shot'}
    >
      <div className="ch-rt-tags" role="group" aria-label="Next shot from where the tee shot finished">
        {RECOVERY_CHOICES.map(({ value, label }) => (
          <button
            key={label}
            type="button"
            aria-pressed={saved === value}
            onClick={() => {
              haptic('select');
              prompt.onPick(value);
            }}
          >
            {label}
          </button>
        ))}
      </div>
    </AskRow>
  );
}
