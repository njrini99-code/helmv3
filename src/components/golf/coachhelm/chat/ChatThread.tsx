'use client';

/**
 * ============================================================================
 * CoachHelm · chat · thread — the message renderer
 * ----------------------------------------------------------------------------
 * One renderer. The full page and the drawer both mount it; only the column
 * width differs, and that is a prop.
 *
 * The visual argument it makes: the ANALYSIS is the page, and the coach's own
 * question is a caption on it. So an assistant turn is flat editorial text on
 * the canvas — no bubble, no avatar, no card around prose — measured to about
 * 68 characters, with charts allowed to break wider than the text. The coach's
 * message is a small right-aligned line above it. Two chat bubbles facing each
 * other would give a question and a piece of statistical work equal visual
 * weight, which is exactly backwards.
 *
 * Tool activity renders as one quiet progress line in the coach's language
 * ("Reading 28 recorded rounds"), replaced by the evidence when it arrives. Raw
 * tool names, ids, arguments and JSON never appear.
 * ========================================================================== */

import * as React from 'react';
import type { UIMessage } from 'ai';
import { cn } from '@/lib/utils';
import type { ToolEnvelope } from '@/lib/coachhelm/v3/chat/provenance';
import type { ActionProposal, ActionReceipt } from '@/lib/coachhelm/v3/chat/action-types';
import { EvidenceRenderer } from './EvidenceVisuals';
import { ActionProposalCard, ActionReceiptCard } from './ActionCards';
import { AssistantProse } from './AssistantProse';

/** The readable measure for analytical prose. Charts are allowed past it. */
const PROSE_WIDTH = 'max-w-[68ch]';

type Part = { type: string; [key: string]: unknown };

export interface ChatThreadProps {
  messages: UIMessage[];
  busy: boolean;
  /** Receives the APPROVAL id (`part.approval.id`), not the tool-call id. */
  onApprove: (approvalId: string) => void;
  onDeny: (approvalId: string) => void;
  onSuggestion?: (text: string) => void;
  /** Roster, so @-mentions in prose can link to the right player. */
  playersByName?: Record<string, string>;
  className?: string;
}

export function ChatThread({
  messages,
  busy,
  onApprove,
  onDeny,
  onSuggestion,
  playersByName,
  className,
}: ChatThreadProps) {
  return (
    <div className={cn('flex flex-col gap-8', className)}>
      {messages.map((message) => (
        <MessageTurn
          key={message.id}
          message={message}
          onApprove={onApprove}
          onDeny={onDeny}
          onSuggestion={onSuggestion}
          playersByName={playersByName}
        />
      ))}
      {busy && <ThinkingLine />}
    </div>
  );
}

function MessageTurn({
  message,
  onApprove,
  onDeny,
  onSuggestion,
  playersByName,
}: {
  message: UIMessage;
  onApprove: (id: string) => void;
  onDeny: (id: string) => void;
  onSuggestion?: (text: string) => void;
  playersByName?: Record<string, string>;
}) {
  const parts = (message.parts ?? []) as Part[];

  if (message.role === 'user') {
    const text = parts
      .filter((p) => p.type === 'text')
      .map((p) => String(p.text ?? ''))
      .join('')
      // The visible context prefix is shown as a chip on the composer; echoing
      // the bracketed form back into the transcript is noise.
      .replace(/^\[Context:[^\]]*\]\n?/, '')
      .trim();
    if (!text) return null;
    return (
      <div className="flex justify-end">
        <p
          className={cn(
            'max-w-[85%] rounded-fw-lg bg-surface-sunken px-3.5 py-2',
            'font-fw-sans text-body-sm text-text-secondary',
          )}
        >
          {text}
        </p>
      </div>
    );
  }

  // ── Assistant ──────────────────────────────────────────────────────────
  // Progress lines are transient scaffolding: once the evidence they were
  // narrating has arrived, showing them too would double the height of every
  // answer with information that is no longer true.
  const evidence = parts.filter((p) => p.type === 'data-evidence');
  const proposals = parts.filter((p) => p.type === 'data-action-proposal');
  const receipts = parts.filter((p) => p.type === 'data-action-receipt');
  const progress = parts.filter((p) => p.type === 'data-progress');
  const showProgress = evidence.length === 0 && proposals.length === 0 && receipts.length === 0;

  return (
    <article className="flex flex-col gap-4">
      {showProgress &&
        progress.slice(-1).map((p, i) => {
          const data = p.data as { label?: string } | undefined;
          return <ProgressLine key={i} label={data?.label ?? 'Working'} />;
        })}

      {parts.map((part, index) => {
        if (part.type === 'text') {
          const text = String(part.text ?? '');
          if (!text.trim()) return null;
          return (
            <div key={index} className={PROSE_WIDTH}>
              <AssistantProse text={text} playersByName={playersByName} />
            </div>
          );
        }

        if (part.type === 'data-evidence') {
          const data = part.data as { envelope?: ToolEnvelope } | undefined;
          if (!data?.envelope) return null;
          // Wider than the prose measure on purpose — a chart reads better with
          // room, and it is not something anyone scans line by line.
          return (
            <div key={index} className="max-w-[52rem]">
              <EvidenceRenderer envelope={data.envelope} />
            </div>
          );
        }

        if (part.type === 'data-action-proposal') {
          const proposal = part.data as ActionProposal & { tool: string };
          // The matching tool part carries the approval state; find it so the
          // card can show "Confirmed" instead of live buttons after a decision.
          const approvalPart = parts.find(
            (p) => p.type.startsWith('tool-') && String(p.type).includes(proposal.tool),
          ) as
            | { toolCallId?: string; state?: string; approval?: { id?: string; approved?: boolean } }
            | undefined;

          // The SDK answers an approval by its OWN id, not the tool-call id.
          // Passing `toolCallId` here matched nothing and made Confirm inert.
          const approvalId = approvalPart?.approval?.id;

          const decision =
            approvalPart?.approval?.approved === true
              ? ('approved' as const)
              : approvalPart?.approval?.approved === false
                ? ('denied' as const)
                : null;

          return (
            <div key={index} className="max-w-[42rem]">
              <ActionProposalCard
                proposal={proposal}
                decision={decision}
                onApprove={approvalId ? () => onApprove(approvalId) : undefined}
                onDeny={approvalId ? () => onDeny(approvalId) : undefined}
              />
            </div>
          );
        }

        if (part.type === 'data-action-receipt') {
          return (
            <div key={index} className="max-w-[42rem]">
              <ActionReceiptCard receipt={part.data as ActionReceipt} />
            </div>
          );
        }

        return null;
      })}

      {onSuggestion && <FollowUps parts={parts} onSuggestion={onSuggestion} />}
    </article>
  );
}

/**
 * Contextual next actions, derived from what the turn actually found.
 *
 * These are real controls built from typed evidence — not markdown the coach
 * has to retype. The mapping is deliberately conservative: a suggestion only
 * appears when the evidence genuinely supports it, because a row of
 * always-present generic buttons trains people to stop reading them.
 */
function FollowUps({
  parts,
  onSuggestion,
}: {
  parts: Part[];
  onSuggestion: (text: string) => void;
}) {
  const suggestions = React.useMemo(() => {
    const out: string[] = [];
    for (const part of parts) {
      if (part.type !== 'data-evidence') continue;
      const envelope = (part.data as { envelope?: ToolEnvelope })?.envelope;
      if (!envelope || envelope.coverage === 'unavailable') continue;

      const player = envelope.measurements[0]?.entity;
      const isPutting = envelope.measurements.some((m) => /putt/i.test(m.metric_id));

      if (player?.kind === 'player' && isPutting) {
        out.push(`Create a focus area for ${player.label} on putting`);
        out.push(`Build a putting practice for ${player.label}`);
      } else if (player?.kind === 'player') {
        out.push(`Compare ${player.label} with the rest of the team`);
      }

      const detail = envelope.detail as { events?: { rsvp_pending_count?: number }[] } | undefined;
      if (detail?.events?.some((e) => (e.rsvp_pending_count ?? 0) > 0)) {
        out.push('Send an RSVP reminder');
      }
    }
    return [...new Set(out)].slice(0, 3);
  }, [parts]);

  if (suggestions.length === 0) return null;

  return (
    <ul className="flex flex-wrap gap-2">
      {suggestions.map((s) => (
        <li key={s}>
          {/* eslint-disable-next-line helm/no-raw-button -- follow-up suggestion chip — a rounded-full pill of its own scale */}
          <button
            type="button"
            onClick={() => onSuggestion(s)}
            className={cn(
              'inline-flex min-h-[36px] items-center rounded-full border border-border-subtle bg-surface px-3.5',
              'font-fw-sans text-caption text-text-secondary transition-colors',
              'hover:border-accent-300 hover:text-text-primary',
              'outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
            )}
          >
            {s}
          </button>
        </li>
      ))}
    </ul>
  );
}

/**
 * The one quiet line that stands in for tool machinery.
 *
 * A pulsing dot said "something is happening" and nothing else — the same
 * affordance a disconnected websocket uses. What is actually happening is
 * READING: rounds, signals, a schedule. So the indicator is a segment
 * travelling along a short track, and the label states the work in the coach's
 * own terms ("Reading 28 recorded rounds").
 *
 * The label sits at `text-text-secondary`, not tertiary. It is the only thing
 * on screen during a wait and the coach is reading it deliberately; pushing
 * live status toward the background to signal "this is temporary" is the
 * de-emphasis-by-dimming move, and it costs legibility for nothing.
 *
 * Under reduced motion the track holds a static segment. The information — that
 * work is in progress, and which work — is entirely in the label and the
 * `aria-live` announcement, so nothing is lost when the movement goes.
 */
export function ProgressLine({ label }: { label: string }) {
  return (
    <p
      className="flex items-center gap-2.5 font-fw-sans text-caption text-text-secondary"
      aria-live="polite"
    >
      <span
        aria-hidden
        className="relative h-[2px] w-7 shrink-0 overflow-hidden rounded-full bg-border-subtle"
      >
        <span className="absolute inset-y-0 left-0 w-1/4 rounded-full bg-accent-600 motion-safe:animate-scan" />
      </span>
      {label}
    </p>
  );
}

function ThinkingLine() {
  return <ProgressLine label="Reading your program" />;
}
