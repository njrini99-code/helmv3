'use client';

import { useState } from 'react';
import { m } from 'framer-motion';
import { useReducedMotionGuard } from '@/lib/coachhelm/v3/motion';
import type { ChatMessage, GoalProposal } from '@/lib/coachhelm/v3/chat/types';
import { isGoalProposal } from '@/lib/coachhelm/v3/chat/types';
import { createGoal } from '@/app/golf/actions/v3/goals';
import type { MetricId } from '@/lib/coachhelm/v3/metrics/registry';
import { Button } from '@/components/ui/button';
import { ChatMarkdown } from './ChatMarkdown';
import {
  enterVariants,
  enterTransition,
  stagger,
  EASE_TAP,
  DURATION,
} from '@/lib/coachhelm/v3/motion';

interface Props {
  messages: ChatMessage[];
  pending: boolean;
  /**
   * #948 follow-up — when the thread ends on an orphaned user turn (no
   * assistant reply persisted), this fires the SAME text as a fresh send so
   * the coach can recover with one tap instead of retyping the question.
   * Omit to hide the retry affordance entirely (falls back to a plain
   * notice with no action).
   */
  onRetryMissingReply?: (text: string) => void;
}

/**
 * W32-pt3 / v3 polish — message-bubble list.
 *
 * Polish vs. the original W32 implementation:
 *   - Per-bubble entrance stagger via `stagger(i)` so a fresh
 *     conversation loads like a wave, not a block. Audit feature #8
 *     called this out as the remaining "attention is sacred" gap.
 *   - Respects `useReducedMotionGuard()` — collapses delays + travel to 0
 *     so accessibility users see the same content without the wave.
 *   - Uses canonical enterVariants / enterTransition (no inline
 *     cubic-bezier or hand-rolled durations).
 */
export function ChatMessageList({ messages, pending, onRetryMissingReply }: Props) {
  const prefersReducedMotion = useReducedMotionGuard() ?? false;

  // Stagger the last N bubbles only. When a coach scrolls back through
  // a long thread, we don't want a 50-message thread to take 3 seconds
  // to play in — it should still feel like a wave for fresh messages,
  // but settled content shouldn't animate on every re-render.
  const STAGGER_WINDOW = 8;
  const staggerOffset = Math.max(0, messages.length - STAGGER_WINDOW);

  // #948 — a stored thread can genuinely end on a user turn with no
  // assistant row after it (an orphaned turn from before the send route's
  // P1-11 idempotency/grounding fixes always persisted a reply — success,
  // failure, or ungrounded — for every turn). Rendering nothing here left a
  // silent ~500px void under the last question, reading as a broken page
  // rather than a fact about the data. `pending` excludes an ACTIVE send —
  // that case already shows the thinking-dots row below, and the send route
  // always appends a reply (real or a visible failure) once it settles, so
  // this only ever fires for genuinely orphaned history.
  const lastMessage = messages[messages.length - 1];
  const showMissingReplyNotice = !pending && lastMessage?.role === 'user';

  return (
    <ul role="log" aria-live="polite" className="flex flex-col gap-3">
      {messages.map((message, i) => {
        const staggerIndex = Math.max(0, i - staggerOffset);
        const delay = prefersReducedMotion ? 0 : stagger(staggerIndex);
        return (
          <m.li
            key={message.id}
            variants={enterVariants}
            initial={prefersReducedMotion ? false : 'hidden'}
            animate="visible"
            transition={{ ...enterTransition, delay }}
            className={message.role === 'user' ? 'flex justify-end' : ''}
          >
            <Bubble message={message} prefersReducedMotion={prefersReducedMotion} />
          </m.li>
        );
      })}
      {showMissingReplyNotice && (
        <li role="status">
          {/* #948 follow-up — a dashed border + italic copy reads as an
              unfinished placeholder ("todo: wire this up"), not a fact about
              the data. A solid quiet card with a plain-language explanation
              + a one-tap recovery action reads as intentional instead. */}
          <div className="flex max-w-[85%] flex-col items-start gap-2 rounded-2xl border border-warm-200 bg-cream-50 px-4 py-3 text-sm text-warm-700">
            <span>This conversation didn&rsquo;t get an answer.</span>
            {onRetryMissingReply && lastMessage ? (
              <Button
                variant="ghost"
                size="sm"
                className="-ml-3"
                onClick={() => onRetryMissingReply(lastMessage.content ?? '')}
                rightIcon={
                  <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden>
                    <path
                      d="M3 8h9 M9 4 l4 4 l-4 4"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      fill="none"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                }
              >
                Ask again
              </Button>
            ) : null}
          </div>
        </li>
      )}
      {pending && (
        <m.li
          variants={enterVariants}
          initial={prefersReducedMotion ? false : 'hidden'}
          animate="visible"
          transition={enterTransition}
          className="flex items-center gap-2 text-warm-500 text-sm"
        >
          <span className="inline-flex gap-1" aria-hidden>
            <ThinkingDot delay={0} prefersReducedMotion={prefersReducedMotion} />
            <ThinkingDot delay={0.18} prefersReducedMotion={prefersReducedMotion} />
            <ThinkingDot delay={0.36} prefersReducedMotion={prefersReducedMotion} />
          </span>
          <span>Reading the numbers…</span>
        </m.li>
      )}
    </ul>
  );
}

function ThinkingDot({ delay, prefersReducedMotion }: { delay: number; prefersReducedMotion: boolean }) {
  if (prefersReducedMotion) {
    return <span className="inline-block h-1.5 w-1.5 rounded-full bg-warm-400 opacity-70" />;
  }
  return (
    <m.span
      className="inline-block h-1.5 w-1.5 rounded-full bg-warm-400"
      animate={{ opacity: [0.3, 1, 0.3] }}
      transition={{ duration: 1.1, repeat: Infinity, ease: 'easeInOut', delay }}
    />
  );
}

function Bubble({ message, prefersReducedMotion }: { message: ChatMessage; prefersReducedMotion: boolean }) {
  if (message.role === 'user') {
    return (
      <div className="max-w-[80%] rounded-2xl bg-primary-600 text-white px-4 py-2 text-sm shadow-[0_8px_18px_-12px_rgba(22,163,74,0.55)]">
        {message.content}
      </div>
    );
  }
  if (message.role === 'assistant') {
    // P1-11 — a failed turn renders a visible, distinct failure bubble (not an
    // orphaned user turn). role="alert" so assistive tech announces it.
    if (message.status === 'failed') {
      return (
        <m.div
          role="alert"
          initial={prefersReducedMotion ? false : { opacity: 0.6 }}
          animate={{ opacity: 1 }}
          transition={{ duration: DURATION.short, ease: EASE_TAP }}
          className="max-w-[85%] rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 leading-relaxed"
        >
          <ChatMarkdown text={message.content ?? ''} />
        </m.div>
      );
    }
    return (
      <m.div
        initial={prefersReducedMotion ? false : { opacity: 0.6 }}
        animate={{ opacity: 1 }}
        transition={{ duration: DURATION.short, ease: EASE_TAP }}
        className="max-w-[85%] rounded-2xl bg-cream-50 surface-hairline border px-4 py-3 text-sm text-warm-900 leading-relaxed"
      >
        <ChatMarkdown text={message.content ?? ''} />
      </m.div>
    );
  }
  // role === 'tool' — show a compact "looked up X" summary inline, plus any
  // goal PROPOSAL the agent returned (rendered as a Confirm/Cancel card —
  // the actual goal is never created until the coach clicks Confirm).
  const calls = message.tool_calls ?? [];
  const proposals: GoalProposal[] = (message.tool_results ?? [])
    .map((r) => r.result)
    .filter(isGoalProposal);
  if (calls.length === 0 && proposals.length === 0) return null;
  return (
    <div className="flex max-w-[85%] flex-col gap-2">
      {calls.length > 0 && (
        <m.div
          initial={prefersReducedMotion ? false : { opacity: 0, y: 2 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: DURATION.short, ease: EASE_TAP }}
          className="inline-flex flex-wrap items-center gap-1.5 self-start rounded-full bg-warm-100/80 backdrop-blur-sm px-3 py-1.5 text-eyebrow text-warm-700"
        >
          <span aria-hidden className="text-eyebrow text-warm-500 uppercase tracking-[0.12em]">
            Looked up
          </span>
          {calls.map((c, i) => (
            <span key={c.tool_call_id} className="font-mono text-warm-800">
              {c.name}
              {i < calls.length - 1 && <span className="text-warm-400">,</span>}
            </span>
          ))}
        </m.div>
      )}
      {proposals.map((proposal, i) => (
        <GoalProposalCard
          key={`${message.id}-proposal-${i}`}
          proposal={proposal}
          prefersReducedMotion={prefersReducedMotion}
        />
      ))}
    </div>
  );
}

/**
 * Confirm/Cancel card for a goal the agent has PROPOSED. The agent's tool
 * never writes — this card is the explicit, load-bearing confirmation step.
 * Only the coach's "Confirm" click runs the auth-checked + RLS-gated
 * `createGoal` server action. Cancel dismisses the card with no side effects.
 */
function GoalProposalCard({
  proposal,
  prefersReducedMotion,
}: {
  proposal: GoalProposal;
  prefersReducedMotion: boolean;
}) {
  const [status, setStatus] = useState<'idle' | 'creating' | 'created' | 'cancelled'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setStatus('creating');
    setError(null);
    try {
      const endsAt = new Date(
        Date.now() + proposal.window_days * 86400_000,
      ).toISOString();
      const res = await createGoal({
        metric_id: proposal.metric_id as MetricId,
        title: proposal.title,
        category: 'general',
        ends_at: endsAt,
        target_value: proposal.target_value,
        target_source: 'manual',
        baseline_value: null,
        team_id: proposal.team_id,
        player_id_if_coach_creating: proposal.player_id,
        coach_assignment_mode: proposal.coach_assignment_mode,
        shared_with_coach: true,
      });
      if (!res.ok) {
        setStatus('idle');
        setError(res.error ?? 'Could not create the goal.');
        return;
      }
      setStatus('created');
    } catch (e) {
      setStatus('idle');
      setError(e instanceof Error ? e.message : 'Could not create the goal.');
    }
  }

  const who = proposal.player_name ?? 'this player';
  const windowLabel =
    proposal.window_days % 7 === 0
      ? `${proposal.window_days / 7} week${proposal.window_days / 7 === 1 ? '' : 's'}`
      : `${proposal.window_days} days`;

  return (
    <m.div
      initial={prefersReducedMotion ? false : { opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DURATION.short, ease: EASE_TAP }}
      className="self-start rounded-2xl border border-primary-200 bg-primary-50/60 px-4 py-3 text-sm text-warm-900 shadow-[0_8px_18px_-14px_rgba(22,163,74,0.45)]"
    >
      <p className="text-eyebrow uppercase tracking-[0.12em] text-primary-700">
        {proposal.coach_assignment_mode === 'mandatory' ? 'Proposed goal · mandatory' : 'Proposed goal'}
      </p>
      <p className="mt-1 font-medium text-warm-900">{proposal.title}</p>
      <p className="mt-0.5 text-warm-700">
        For {who} — target {proposal.target_value} on{' '}
        <span className="font-mono text-warm-800">{proposal.metric_id}</span> over {windowLabel}.
      </p>

      {status === 'created' ? (
        <p className="mt-3 inline-flex items-center gap-1.5 text-primary-700">
          <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden>
            <path
              d="M3 8.5 6.5 12 13 4.5"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </svg>
          Goal created.
        </p>
      ) : status === 'cancelled' ? (
        <p className="mt-3 text-warm-500">Dismissed — nothing was saved.</p>
      ) : (
        <div className="mt-3 flex items-center gap-2">
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={() => void confirm()}
            isLoading={status === 'creating'}
            disabled={status === 'creating'}
          >
            {status === 'creating' ? 'Creating…' : 'Confirm'}
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setStatus('cancelled')}
            disabled={status === 'creating'}
          >
            Cancel
          </Button>
        </div>
      )}

      {error && (
        <p className="mt-2 text-xs text-red-700" role="alert">
          {error}
        </p>
      )}
    </m.div>
  );
}
