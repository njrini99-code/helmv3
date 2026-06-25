'use client';

// =============================================================================
// src/components/baseball/daily-contract/DailyContract.tsx
//
// V5 Player Daily Contract — the daily commitment LOOP (a mechanic, not a card).
//
// Lifecycle the player drives:
//   draft  → compose up to 5 concrete intentions
//   commit → lock them in (starts streak eligibility)
//   honor  → toggle each item done / skipped through the day
//   complete → close the day with an optional reflection; this compounds into
//              the Passport development story (a player_only timeline event).
//
// HONESTY (binding):
//   - A draft earns NO streak credit. The streak is committed-AND-completed days.
//   - Per-item done/skipped is explicit: a skipped item is never shown as done;
//     a partial day reports honored/total truthfully.
//   - You cannot "complete" a day you never committed to.
//
// Mounted in Player Today (primary) and surfaced read-only on Player Profile.
// Cream/green GolfHelm look — Card/Button/EmptyState primitives + design icons.
// No golf labels. Optimistic UI with honest rollback on server failure.
// =============================================================================

import { useState, useTransition, useCallback } from 'react';
import { LazyMotion, domAnimation, m, useReducedMotion } from 'framer-motion';

import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { EmptyState } from '@/components/ui/empty-state';
import {
  IconTarget,
  IconCheck,
  IconX,
  IconPlus,
  IconTrash,
  IconFlame,
  IconCheckCircle2,
  IconClock,
  IconSparkles,
  IconAlertCircle,
  IconLock,
  IconUsers,
  IconShield,
  IconHeart,
} from '@/components/icons';
import type {
  DailyContractReadModel,
  DailyContractView,
} from '@/lib/baseball/read-models/player-daily-contract';
import type {
  DailyContractItem,
  DailyContractVisibility,
} from '@/lib/types/baseball-passport';
import {
  saveDraftAndCommit,
  toggleContractItem,
  completeContract,
  setContractVisibility,
} from '@/app/baseball/actions/daily-contract';

// -----------------------------------------------------------------------------
// Props
// -----------------------------------------------------------------------------

interface DailyContractProps {
  model: DailyContractReadModel;
  /** Read-only render (e.g. on Player Profile) — no actions, just the day. */
  readOnly?: boolean;
}

// A few honest starter prompts (a player can write their own). These are
// neutral baseball-development buckets — never generic "practice summary" prose.
const STARTER_PROMPTS: Array<{ label: string; category: string }> = [
  { label: 'Take 50 quality swings off the tee', category: 'hitting' },
  { label: 'Complete arm-care band routine', category: 'arm_care' },
  { label: 'Field 25 clean ground balls', category: 'defense' },
  { label: '20 min of focused study hall', category: 'academics' },
  { label: 'Mobility + recovery before bed', category: 'recovery' },
];

// -----------------------------------------------------------------------------
// Streak header
// -----------------------------------------------------------------------------

function StreakHeader({ streak }: { streak: number }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary-50 text-primary-600">
        <IconTarget size={16} />
      </span>
      <h2 className="text-xl font-semibold tracking-tight text-warm-900">Daily Contract</h2>
      {streak > 0 && (
        <span className="ml-0.5 flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-eyebrow font-semibold text-amber-700">
          <IconFlame size={12} />
          {streak}-day streak
        </span>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Item row (commit/honor states)
// -----------------------------------------------------------------------------

function ContractItemRow({
  item,
  phase,
  pending,
  onToggle,
  onRemove,
}: {
  item: DailyContractItem;
  phase: 'draft' | 'committed' | 'completed' | 'missed';
  pending: boolean;
  onToggle: (state: 'done' | 'skipped' | 'reset') => void;
  onRemove?: () => void;
}) {
  const interactive = phase === 'committed';
  return (
    <div
      className={`flex items-center gap-3 rounded-xl border px-3.5 py-3 transition-colors ${
        item.done
          ? 'border-primary-200 bg-primary-50/60'
          : item.skipped
            ? 'border-warm-200 bg-warm-50'
            : 'border-warm-200 bg-cream-50'
      }`}
    >
      {interactive ? (
        // Dense 24px inline checkbox inside a compact item row — the <Button>
        // primitive's mandatory 44px tap box would break the row height. This is
        // the accepted raw-control exception (see codebase precedent).
        // eslint-disable-next-line helm/no-raw-button
        <button
          type="button"
          disabled={pending}
          onClick={() => onToggle(item.done ? 'reset' : 'done')}
          aria-label={item.done ? 'Mark not done' : 'Mark honored'}
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border transition-colors ${
            item.done
              ? 'border-primary-500 bg-primary-500 text-white'
              : 'border-warm-300 bg-cream-50 text-transparent hover:border-primary-400'
          } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40`}
        >
          <IconCheck size={14} />
        </button>
      ) : (
        <span
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg ${
            item.done ? 'bg-primary-500 text-white' : 'bg-warm-100 text-warm-400'
          }`}
        >
          {item.done ? <IconCheck size={14} /> : <IconClock size={13} />}
        </span>
      )}

      <div className="min-w-0 flex-1">
        <p
          className={`truncate text-sm font-medium ${
            item.skipped ? 'text-warm-400 line-through' : 'text-warm-900'
          }`}
        >
          {item.label}
        </p>
        <p className="text-eyebrow uppercase tracking-wide text-warm-400">{item.category}</p>
      </div>

      {interactive && (
        // Dense inline skip control — same compact-row exception as the checkbox.
        // eslint-disable-next-line helm/no-raw-button
        <button
          type="button"
          disabled={pending}
          onClick={() => onToggle(item.skipped ? 'reset' : 'skipped')}
          aria-label={item.skipped ? 'Un-skip' : 'Skip'}
          className="shrink-0 rounded-lg p-1.5 text-warm-400 transition-colors hover:bg-warm-100 hover:text-warm-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-warm-300"
        >
          <IconX size={14} />
        </button>
      )}

      {phase === 'draft' && onRemove && (
        // Dense inline remove control — same compact-row exception.
        // eslint-disable-next-line helm/no-raw-button
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove intention"
          className="shrink-0 rounded-lg p-1.5 text-warm-400 transition-colors hover:bg-red-50 hover:text-red-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-200"
        >
          <IconTrash size={14} />
        </button>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Draft composer
// -----------------------------------------------------------------------------

function DraftComposer({
  initialItems,
  pending,
  onSaveAndCommit,
}: {
  initialItems: DailyContractItem[];
  pending: boolean;
  onSaveAndCommit: (items: Array<{ id: string; label: string; category: string }>) => void;
}) {
  const [drafts, setDrafts] = useState<DailyContractItem[]>(initialItems);
  const [input, setInput] = useState('');

  const addItem = (label: string, category = 'general') => {
    const clean = label.trim();
    if (!clean || drafts.length >= 5) return;
    setDrafts((d) => [
      ...d,
      { id: crypto.randomUUID(), label: clean, category, done: false, skipped: false },
    ]);
    setInput('');
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-warm-500">
        Commit to up to five concrete things today. Draft now — your streak counts only days you
        commit to and finish.
      </p>

      {drafts.length > 0 && (
        <div className="space-y-2">
          {drafts.map((it) => (
            <ContractItemRow
              key={it.id}
              item={it}
              phase="draft"
              pending={pending}
              onToggle={() => {}}
              onRemove={() => setDrafts((d) => d.filter((x) => x.id !== it.id))}
            />
          ))}
        </div>
      )}

      {drafts.length < 5 && (
        <div className="flex items-center gap-2">
          <Input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addItem(input);
              }
            }}
            placeholder="Add an intention…"
            maxLength={120}
            aria-label="Add an intention"
            className="flex-1"
          />
          <Button
            variant="secondary"
            size="sm"
            onClick={() => addItem(input)}
            disabled={!input.trim() || pending}
            aria-label="Add intention"
          >
            <IconPlus size={15} />
          </Button>
        </div>
      )}

      {drafts.length === 0 && (
        <div className="flex flex-wrap gap-2">
          {STARTER_PROMPTS.map((p) => (
            // Compact suggestion chip — pill control, not a standard CTA button.
            // eslint-disable-next-line helm/no-raw-button
            <button
              key={p.label}
              type="button"
              onClick={() => addItem(p.label, p.category)}
              className="rounded-full border border-warm-200 bg-cream-50 px-3 py-1.5 text-eyebrow font-medium text-warm-600 transition-colors hover:border-primary-300 hover:text-primary-700"
            >
              + {p.label}
            </button>
          ))}
        </div>
      )}

      <Button
        variant="primary"
        size="md"
        className="w-full"
        disabled={drafts.length === 0 || pending}
        onClick={() =>
          onSaveAndCommit(
            drafts.map((d) => ({ id: d.id, label: d.label, category: d.category })),
          )
        }
      >
        {pending ? 'Committing…' : `Commit to ${drafts.length || 'today'}`}
      </Button>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Share control — the player→coach bridge (default private)
// -----------------------------------------------------------------------------

const SHARE_OPTIONS: Array<{
  value: DailyContractVisibility;
  label: string;
  hint: string;
  icon: React.ReactNode;
}> = [
  {
    value: 'player_only',
    label: 'Private',
    hint: 'Only you',
    icon: <IconLock size={13} />,
  },
  {
    value: 'staff_only',
    label: 'Coaches',
    hint: 'Your staff',
    icon: <IconShield size={13} />,
  },
  {
    value: 'team',
    label: 'Team',
    hint: 'Staff + team',
    icon: <IconUsers size={13} />,
  },
];

function ShareControl({
  visibility,
  coachAcknowledgedAt,
  pending,
  onChange,
}: {
  visibility: DailyContractVisibility;
  coachAcknowledgedAt: string | null;
  pending: boolean;
  onChange: (next: DailyContractVisibility) => void;
}) {
  const shared = visibility !== 'player_only';
  return (
    <div className="rounded-xl border border-warm-200 bg-warm-50/70 px-3.5 py-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-eyebrow uppercase tracking-wide text-warm-500">
          Share with coach
        </p>
        {shared && coachAcknowledgedAt && (
          <span className="flex items-center gap-1 rounded-full bg-primary-50 px-2 py-0.5 text-eyebrow font-semibold text-primary-700">
            <IconHeart size={11} />
            Coach saw this
          </span>
        )}
      </div>
      <div
        role="radiogroup"
        aria-label="Share this contract with coaches"
        className="mt-2 grid grid-cols-3 gap-1.5"
      >
        {SHARE_OPTIONS.map((opt) => {
          const active = visibility === opt.value;
          return (
            // Compact segmented control — pill control, not a standard CTA.
            // eslint-disable-next-line helm/no-raw-button
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={pending}
              onClick={() => !active && onChange(opt.value)}
              className={`flex flex-col items-center gap-0.5 rounded-lg border px-2 py-1.5 text-center transition-colors disabled:opacity-60 ${
                active
                  ? 'border-primary-400 bg-primary-50 text-primary-700'
                  : 'border-warm-200 bg-cream-50 text-warm-600 hover:border-primary-300'
              } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40`}
            >
              <span className="flex items-center gap-1 text-xs font-semibold">
                {opt.icon}
                {opt.label}
              </span>
              <span className="text-eyebrow text-warm-400">{opt.hint}</span>
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-eyebrow leading-snug text-warm-400">
        {shared
          ? 'Your coach can see your intentions and honored count — your reflection stays private.'
          : 'Private by default. Share to let your coach see and recognize your daily work.'}
      </p>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Completed summary
// -----------------------------------------------------------------------------

function CompletedSummary({ contract }: { contract: DailyContractView }) {
  // Gap 3 honesty: a 0-honored completion closes the day but does NOT extend the
  // streak. Render it in a NEUTRAL (warm) tone with an explicit line so the player
  // sees the rule at the moment of completion; a >=1-honored day stays celebratory
  // green with a "counts toward your streak" affirmation.
  const credited = contract.honoredCount >= 1;
  return (
    <div className="space-y-3">
      <div
        className={`flex items-start gap-2.5 rounded-xl border px-4 py-3 ${
          credited
            ? 'border-primary-200 bg-primary-50/60'
            : 'border-warm-200 bg-warm-50'
        }`}
      >
        {credited ? (
          <IconCheckCircle2 size={18} className="mt-0.5 shrink-0 text-primary-600" />
        ) : (
          <IconCheck size={18} className="mt-0.5 shrink-0 text-warm-500" />
        )}
        <div className="min-w-0">
          <p
            className={`text-sm font-medium ${
              credited ? 'text-primary-800' : 'text-warm-700'
            }`}
          >
            Day complete — {contract.honoredCount}/{contract.totalCount} honored.
          </p>
          {credited ? (
            <p className="mt-0.5 flex items-center gap-1 text-eyebrow font-semibold text-primary-700">
              <IconFlame size={11} />
              Counts toward your streak.
            </p>
          ) : (
            <p className="mt-0.5 text-eyebrow leading-snug text-warm-500">
              Day closed — no items honored, so it doesn’t extend your streak.
            </p>
          )}
        </div>
      </div>
      <div className="space-y-2">
        {contract.items.map((it) => (
          <ContractItemRow
            key={it.id}
            item={it}
            phase="completed"
            pending={false}
            onToggle={() => {}}
          />
        ))}
      </div>
      {contract.reflection && (
        <div className="rounded-xl border border-warm-200 bg-warm-50 px-4 py-3">
          <p className="text-eyebrow uppercase tracking-wide text-warm-400">Reflection</p>
          <p className="mt-1 text-sm text-warm-700">{contract.reflection}</p>
        </div>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Missed summary — a committed day that rolled over without completion.
//
// This is the honesty surface the spec's commitment loop requires: an abandoned
// commitment is shown plainly (never frozen as "in progress" forever, never
// hidden). It reports the partial progress truthfully and reframes forward rather
// than shaming. The roll-over to 'missed' is set by the daily app-layer sweep.
// -----------------------------------------------------------------------------

function MissedSummary({ contract }: { contract: DailyContractView }) {
  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
        <IconAlertCircle size={18} className="mt-0.5 shrink-0 text-amber-600" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-amber-800">
            Commitment missed — {contract.honoredCount}/{contract.totalCount} honored
          </p>
          <p className="mt-0.5 text-eyebrow leading-snug text-amber-700">
            You committed to this day but didn’t close it out. It’s shown honestly
            so your streak and story stay true — pick it back up today.
          </p>
        </div>
      </div>
      <div className="space-y-2">
        {contract.items.map((it) => (
          <ContractItemRow
            key={it.id}
            item={it}
            phase="missed"
            pending={false}
            onToggle={() => {}}
          />
        ))}
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Missed nudge — surfaced on Today when a RECENT past day lapsed. Honest, quiet
// accountability: it never blocks today's loop, it just refuses to let an
// abandoned commitment vanish silently.
// -----------------------------------------------------------------------------

function MissedNudge({
  lastMissed,
  missedCount,
}: {
  lastMissed: DailyContractView;
  missedCount: number;
}) {
  return (
    <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50/70 px-3.5 py-2.5">
      <IconAlertCircle size={16} className="mt-0.5 shrink-0 text-amber-600" />
      <p className="text-sm text-amber-800">
        {missedCount > 1
          ? `${missedCount} recent commitments lapsed`
          : 'A recent commitment lapsed'}
        {' — '}
        <span className="font-medium">
          {lastMissed.contractDate}
        </span>{' '}
        closed at {lastMissed.honoredCount}/{lastMissed.totalCount} honored. Today
        is a fresh start.
      </p>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Main
// -----------------------------------------------------------------------------

export function DailyContract({ model, readOnly = false }: DailyContractProps) {
  const reduceMotion = useReducedMotion();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(model.error);
  // Local optimistic mirror of today's contract so toggles feel instant.
  const [today, setToday] = useState<DailyContractView | null>(model.today);
  const [reflection, setReflection] = useState('');
  const [showComplete, setShowComplete] = useState(false);

  const runAction = useCallback(
    (fn: () => Promise<{ success: boolean; error?: string }>, onOk?: () => void) => {
      setError(null);
      startTransition(async () => {
        try {
          const res = await fn();
          if (!res.success) {
            setError(res.error ?? 'Something went wrong. Please try again.');
            return;
          }
          onOk?.();
        } catch {
          setError('Something went wrong. Please try again.');
        }
      });
    },
    [],
  );

  const handleCommit = (
    items: Array<{ id: string; label: string; category: string }>,
  ) => {
    runAction(
      // Use the atomic saveDraftAndCommit action (single round-trip). The old
      // two-step sequential path (saveDraftContract → commitContract) had a
      // phase-mismatch bug: if saveDraftContract succeeded but commitContract
      // failed, the row stayed in status='draft' while the optimistic UI showed
      // 'committed'. saveDraftAndCommit collapses both into one upsert so a
      // single error signal can be cleanly reverted.
      async () => saveDraftAndCommit({ items }),
      () => {
        setToday({
          id: today?.id ?? 'pending',
          contractDate: model.todayIso,
          status: 'committed',
          items: items.map((i) => ({ ...i, done: false, skipped: false })),
          reflection: null,
          committedAt: new Date().toISOString(),
          completedAt: null,
          missedAt: null,
          honoredCount: 0,
          totalCount: items.length,
          visibility: today?.visibility ?? 'player_only',
          coachAcknowledgedAt: today?.coachAcknowledgedAt ?? null,
        });
      },
    );
  };

  const handleToggle = (itemId: string, state: 'done' | 'skipped' | 'reset') => {
    // Optimistic local update.
    setToday((prev) =>
      prev
        ? {
            ...prev,
            items: prev.items.map((i) =>
              i.id === itemId
                ? { ...i, done: state === 'done', skipped: state === 'skipped' }
                : i,
            ),
            honoredCount: prev.items.filter((i) =>
              i.id === itemId ? state === 'done' : i.done,
            ).length,
          }
        : prev,
    );
    runAction(() => toggleContractItem({ itemId, state }));
  };

  const handleComplete = () => {
    runAction(
      () => completeContract({ reflection }),
      () => {
        setToday((prev) =>
          prev
            ? {
                ...prev,
                status: 'completed',
                completedAt: new Date().toISOString(),
                reflection: reflection.trim() || null,
              }
            : prev,
        );
        setShowComplete(false);
      },
    );
  };

  const handleShare = (next: DailyContractVisibility) => {
    // Optimistic local update so the segmented control snaps instantly.
    setToday((prev) =>
      prev
        ? {
            ...prev,
            visibility: next,
            // Re-privatizing locally clears the "coach saw this" chip immediately.
            coachAcknowledgedAt:
              next === 'player_only' ? null : prev.coachAcknowledgedAt,
          }
        : prev,
    );
    runAction(() => setContractVisibility({ visibility: next }));
  };

  // Map status -> phase. 'missed' is its own render path: collapsing it into
  // 'draft' (the old behavior) would wrongly re-open the composer over a day that
  // already closed. The roll-over sweep only ever marks PAST days 'missed', so on
  // Today this guards the defensive case where today's row arrives as 'missed'.
  const phase: 'draft' | 'committed' | 'completed' | 'missed' =
    today?.status === 'completed'
      ? 'completed'
      : today?.status === 'missed'
        ? 'missed'
        : today?.status === 'committed'
          ? 'committed'
          : 'draft';

  const fade = reduceMotion
    ? {}
    : {
        initial: { opacity: 0, y: 6 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.25, ease: [0.22, 1, 0.36, 1] as const },
      };

  // ---- Unauthorized envelope ----
  if (!model.authorized) {
    return (
      <Card variant="overlay" hover={false}>
        <EmptyState
          variant="minimal"
          icon={<IconTarget size={36} />}
          title="Daily Contract is for roster players"
          description="When you're on a team roster, you can set and honor a daily contract here."
        />
      </Card>
    );
  }

  // ---- Read-only (profile) ----
  if (readOnly) {
    return (
      <section>
        <StreakHeader streak={model.streak} />
        <div className="mt-3">
          {today && today.status !== 'draft' ? (
            today.status === 'completed' ? (
              <CompletedSummary contract={today} />
            ) : today.status === 'missed' ? (
              <MissedSummary contract={today} />
            ) : (
              <Card variant="raised" padding="md">
                <p className="text-sm text-warm-600">
                  Committed today — {today.honoredCount}/{today.totalCount} honored so far.
                </p>
              </Card>
            )
          ) : (
            <EmptyState
              variant="card"
              glass
              icon={<IconTarget size={36} />}
              title="No contract committed today"
              description="The player hasn't committed to a daily contract for today."
            />
          )}
        </div>
      </section>
    );
  }

  return (
    <LazyMotion features={domAnimation} strict>
      <section>
        <StreakHeader streak={model.streak} />

        {/* Honest accountability: a recently-lapsed commitment is surfaced, never
            silently dropped. Driven by the read-model's missed history (set by the
            daily roll-over sweep), independent of today's own phase. */}
        {model.lastMissed && (
          <MissedNudge
            lastMissed={model.lastMissed}
            missedCount={model.missedCount}
          />
        )}

        {error && (
          <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5">
            <IconAlertCircle size={16} className="mt-0.5 shrink-0 text-amber-600" />
            <p className="text-sm text-amber-800">{error}</p>
          </div>
        )}

        <m.div {...fade} className="mt-3">
          <Card variant="raised" padding="md">
            {phase === 'draft' && (
              <DraftComposer
                initialItems={today?.items ?? []}
                pending={isPending}
                onSaveAndCommit={handleCommit}
              />
            )}

            {phase === 'committed' && today && (
              <div className="space-y-3">
                <p className="text-sm text-warm-500">
                  Honor each one through the day. Skipped is honest — only honored counts.
                </p>
                <div className="space-y-2">
                  {today.items.map((it) => (
                    <ContractItemRow
                      key={it.id}
                      item={it}
                      phase="committed"
                      pending={isPending}
                      onToggle={(state) => handleToggle(it.id, state)}
                    />
                  ))}
                </div>

                {/* Inline progress bar — premium parity with coach view which also
                    shows a completion count. Cream/green tokens, no raw hex. */}
                {today.items.length > 0 && (
                  <div>
                    <div
                      className="h-1.5 w-full overflow-hidden rounded-full bg-warm-100"
                      role="progressbar"
                      aria-valuenow={today.items.filter((i) => i.done).length}
                      aria-valuemax={today.items.length}
                      aria-label="Daily contract progress"
                    >
                      <div
                        className="h-full rounded-full bg-primary-500 transition-all duration-500"
                        style={{
                          width: `${Math.round(
                            (today.items.filter((i) => i.done).length / today.items.length) * 100,
                          )}%`,
                        }}
                      />
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between pt-1">
                  <span className="flex items-center gap-1.5 text-sm font-medium text-warm-600">
                    <IconSparkles size={14} className="text-primary-500" />
                    {today.items.filter((i) => i.done).length}/{today.items.length} honored
                  </span>
                  {!showComplete ? (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => setShowComplete(true)}
                      disabled={isPending}
                    >
                      Complete day
                    </Button>
                  ) : null}
                </div>

                {showComplete && (
                  <div className="space-y-2 rounded-xl border border-warm-200 bg-warm-50 p-3">
                    <label
                      htmlFor="daily-contract-reflection"
                      className="text-eyebrow uppercase tracking-wide text-warm-500"
                    >
                      Reflection (optional, private)
                    </label>
                    <Textarea
                      id="daily-contract-reflection"
                      value={reflection}
                      onChange={(e) => setReflection(e.target.value)}
                      rows={2}
                      maxLength={600}
                      placeholder="One line on how today went…"
                      className="w-full resize-none"
                    />
                    <div className="flex gap-2">
                      <Button
                        variant="primary"
                        size="sm"
                        className="flex-1"
                        onClick={handleComplete}
                        disabled={isPending}
                      >
                        {isPending ? 'Saving…' : 'Mark complete'}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowComplete(false)}
                        disabled={isPending}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}

                <ShareControl
                  visibility={today.visibility}
                  coachAcknowledgedAt={today.coachAcknowledgedAt}
                  pending={isPending}
                  onChange={handleShare}
                />
              </div>
            )}

            {phase === 'completed' && today && (
              <div className="space-y-3">
                <CompletedSummary contract={today} />
                <ShareControl
                  visibility={today.visibility}
                  coachAcknowledgedAt={today.coachAcknowledgedAt}
                  pending={isPending}
                  onChange={handleShare}
                />
              </div>
            )}

            {phase === 'missed' && today && (
              <div className="space-y-3">
                <MissedSummary contract={today} />
                {/* A missed day stays shareable: the share control persists so a
                    player can still let staff see an honest lapse (or re-privatize
                    it). Honesty cuts both ways — sharing isn't only for wins. */}
                <ShareControl
                  visibility={today.visibility}
                  coachAcknowledgedAt={today.coachAcknowledgedAt}
                  pending={isPending}
                  onChange={handleShare}
                />
              </div>
            )}
          </Card>
        </m.div>

        {/* Recent history heatmap — surface the 14-day history the read-model
            already includes. Each pip is a clickable cell with a title tooltip
            (date, honored/total, status). This is the parity feature: the coach
            sees a sparkline of shared days; the player deserves to see their OWN
            full history (not just a streak number). Honest: missed days amber,
            credited days green, in-progress/partial warm. */}
        {model.history.length > 0 && (
          <div className="mt-3">
            <p className="mb-2 text-eyebrow uppercase tracking-wide text-warm-400">
              Recent days
            </p>
            <div className="flex flex-wrap gap-1.5" role="list" aria-label="Recent contract history">
              {[...model.history].reverse().map((d) => {
                const credited = d.status === 'completed' && d.honoredCount >= 1;
                const missed = d.status === 'missed';
                return (
                  <span
                    key={d.id}
                    role="listitem"
                    title={`${d.contractDate} · ${d.honoredCount}/${d.totalCount} honored · ${d.status}`}
                    className={`flex h-7 items-center gap-1 rounded-lg border px-2 text-eyebrow font-medium ${
                      credited
                        ? 'border-primary-200 bg-primary-50 text-primary-700'
                        : missed
                          ? 'border-amber-200 bg-amber-50 text-amber-700'
                          : d.status === 'completed'
                            ? 'border-warm-200 bg-warm-50 text-warm-500'
                            : 'border-warm-200 bg-warm-50 text-warm-400'
                    }`}
                  >
                    {credited ? (
                      <IconCheckCircle2 size={10} />
                    ) : missed ? (
                      <IconAlertCircle size={10} />
                    ) : (
                      <IconClock size={10} />
                    )}
                    {d.honoredCount}/{d.totalCount}
                  </span>
                );
              })}
            </div>
          </div>
        )}
      </section>
    </LazyMotion>
  );
}
