'use client';

// =============================================================================
// src/components/baseball/postgame/PostgameReviewClient.tsx
//
// Postgame Action Review — client surface (V10 §"Postgame Action Review").
//
// Renders a SAVED, source-cited review grouped into the V10 sections:
//   - Player timeline updates  (convertible to a player timeline note)
//   - Recommended practice focus (convertible to a real practice-planner block —
//     lands in the team's planner backlog, stamped with its source item)
//   - Workload updates          (observed counts — the one "high" path)
//   - Staff decisions           (open in Decision Room)
//   - Video evidence            (if any)
//
// HONESTY (binding):
//   * EVERY item shows the Foundations <SourceTrustBadge> tied to the stat/source
//     object it rests on — NO AI without source refs.
//   * Confidence renders as a real percent (or "—"); one-game items are tagged
//     "watch", never "trend". The page is an ACTION review, never a prose recap.
//   * No staff-only content leaks to players (the read model + RLS already gate
//     this; the surface only renders what it is given).
//
// DESIGN (binding palette): KEEPS the cream/green GolfHelm look. Reuses the
// GolfHelm UI primitives VERBATIM (Card / Button / EmptyState + cream/warm/green
// tokens, gap-6, editorial type). NO navy/amber/graphite. NO golf labels.
// =============================================================================

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { LazyMotion, domAnimation, m, useReducedMotion } from 'framer-motion';

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { toast } from '@/components/ui/sonner';
import {
  IconBrain,
  IconClock,
  IconNote,
  IconTarget,
  IconActivity,
  IconClipboardList,
  IconVideo,
  IconCheck,
  IconX,
  IconRefresh,
  IconDatabase,
  IconAlertCircle,
  IconLock,
} from '@/components/icons';

import { SourceTrustBadge } from '@/components/baseball/source-trust';
import type { PostgameReviewView, PostgameItemView } from '@/lib/baseball/read-models/postgame';
import {
  generatePostgameReview,
  convertPostgameItemToTimeline,
  convertPostgameItemToPractice,
  setPostgameItemDisposition,
} from '@/app/baseball/actions/postgame';

/** Which subsystem a section's items convert into when "convert" is allowed. */
type ConvertKind = 'timeline' | 'practice';

interface PostgameReviewClientProps {
  teamName: string;
  review: PostgameReviewView | null;
  recentGames: Array<{
    gameId: string;
    opponentName: string | null;
    gameDate: string | null;
    hasReview: boolean;
  }>;
  authorized: boolean;
  /**
   * Why the viewer is unauthorized (only meaningful when authorized === false):
   *   'setup'     — no team/program exists yet (offer setup guidance).
   *   'forbidden' — team exists but the staffer lacks can_manage_stats
   *                 (honest access-denied; do NOT show setup copy).
   */
  unauthorizedReason?: 'setup' | 'forbidden';
  error: string | null;
  selectedGameId: string | null;
}

function priorityTone(p: string): 'danger' | 'warning' | 'secondary' {
  if (p === 'high' || p === 'urgent') return 'danger';
  if (p === 'medium') return 'warning';
  return 'secondary';
}

function fmtDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function PostgameReviewClient({
  teamName,
  review,
  recentGames,
  authorized,
  unauthorizedReason = 'setup',
  error,
  selectedGameId,
}: PostgameReviewClientProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busyItemId, setBusyItemId] = useState<string | null>(null);

  // The game we'd generate a review for: explicit selection, else the most
  // recent completed game without a review.
  const targetGame =
    recentGames.find((g) => g.gameId === selectedGameId) ??
    recentGames.find((g) => !g.hasReview) ??
    recentGames[0] ??
    null;

  function handleGenerate(gameId: string) {
    startTransition(async () => {
      const res = await generatePostgameReview(gameId);
      if (res.success) {
        toast.success('Postgame review ready', `${res.itemsGenerated ?? 0} source-cited action items.`);
        router.replace(`/baseball/dashboard/postgame?game=${gameId}`);
        router.refresh();
      } else {
        toast.error('Could not generate review', res.error ?? 'Please try again.');
      }
    });
  }

  function handleConvert(item: PostgameItemView, kind: ConvertKind) {
    setBusyItemId(item.id);
    startTransition(async () => {
      const res =
        kind === 'practice'
          ? await convertPostgameItemToPractice(item.id)
          : await convertPostgameItemToTimeline(item.id);
      setBusyItemId(null);
      if (res.success) {
        toast.success(
          kind === 'practice' ? 'Added to your practice plan' : 'Logged to player timeline',
          kind === 'practice'
            ? 'Find it in the Practice planner backlog to schedule.'
            : undefined,
        );
        router.refresh();
      } else {
        toast.error(
          kind === 'practice' ? 'Could not add to practice' : 'Could not log it',
          res.error ?? 'Please try again.',
        );
      }
    });
  }

  function handleDispose(item: PostgameItemView, disposition: 'dismissed' | 'resolved') {
    setBusyItemId(item.id);
    startTransition(async () => {
      const res = await setPostgameItemDisposition(item.id, disposition);
      setBusyItemId(null);
      if (res.success) {
        toast.success(disposition === 'resolved' ? 'Marked resolved' : 'Dismissed');
        router.refresh();
      } else {
        toast.error('Could not update', res.error ?? 'Please try again.');
      }
    });
  }

  const reduceMotion = useReducedMotion();
  const fadeIn = reduceMotion ? {} : { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 } };

  return (
    <LazyMotion features={domAnimation}>
      <div className="min-h-dvh bg-cream-100">
        <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
          {/* Header */}
          <m.div
            {...fadeIn}
            transition={reduceMotion ? undefined : { duration: 0.3 }}
            className="mb-6 flex flex-wrap items-end justify-between gap-3"
          >
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-primary-600">
                CoachHelm
              </p>
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-50 text-primary-600 ring-1 ring-primary-100">
                  <IconBrain size={20} />
                </span>
                <h1 className="text-2xl font-semibold tracking-tight text-warm-900 sm:text-3xl">
                  Postgame Action Review
                </h1>
              </div>
              <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-warm-500">
                {teamName} — every recommendation cites the stat it rests on. Single-game
                signals are watch-level, not proven trends.
              </p>
            </div>
            {targetGame && (
              <Button
                variant={review ? 'secondary' : 'primary'}
                size="sm"
                isLoading={pending && busyItemId === null}
                leftIcon={<IconRefresh size={15} />}
                onClick={() => handleGenerate(targetGame.gameId)}
              >
                {review ? 'Regenerate' : 'Generate review'}
              </Button>
            )}
          </m.div>

          {/* Game picker */}
          {recentGames.length > 0 && (
            <div
              className="mb-6 flex flex-wrap gap-2"
              role="tablist"
              aria-label="Recent games"
            >
              {recentGames.slice(0, 12).map((g) => {
                const active = review?.gameId === g.gameId || selectedGameId === g.gameId;
                return (
                  <button
                    key={g.gameId}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => router.replace(`/baseball/dashboard/postgame?game=${g.gameId}`)}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 focus-visible:ring-offset-1 focus-visible:ring-offset-cream-100 ${
                      active
                        ? 'border-primary-600 bg-primary-600 text-white shadow-sm'
                        : 'border-warm-200 bg-cream-50 text-warm-600 hover:border-warm-300 hover:bg-warm-100'
                    }`}
                  >
                    <span>{g.opponentName ?? 'Game'}</span>
                    {g.gameDate && <span className="ml-1.5 opacity-70">{fmtDate(g.gameDate)}</span>}
                    {g.hasReview && (
                      <span
                        className={`ml-1.5 inline-block h-1.5 w-1.5 rounded-full ${
                          active ? 'bg-cream-50' : 'bg-primary-500'
                        }`}
                        aria-label="has review"
                      />
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* States */}
          {error ? (
            <Card variant="flat" padding="lg" className="text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-error/10 text-error">
                <IconAlertCircle size={22} />
              </div>
              <h3 className="text-base font-semibold tracking-tight text-warm-900">
                We couldn&rsquo;t load this review
              </h3>
              <p className="mx-auto mt-1.5 max-w-md text-sm leading-relaxed text-warm-500">{error}</p>
              <div className="mt-4 flex justify-center">
                <Button
                  variant="secondary"
                  size="sm"
                  leftIcon={<IconRefresh size={15} />}
                  onClick={() => router.refresh()}
                >
                  Try again
                </Button>
              </div>
            </Card>
          ) : !authorized ? (
            unauthorizedReason === 'forbidden' ? (
              <EmptyState
                type="generic"
                icon={<IconLock size={28} />}
                title="You don’t have access to postgame reviews"
                description="Postgame Action Reviews are staff coaching intelligence and require the “manage stats” permission. Ask your head coach to grant it on the staff roles page."
              />
            ) : (
              <EmptyState
                type="generic"
                title="Set up your program first"
                description="Create your team and record a game to start building postgame reviews."
              />
            )
          ) : recentGames.length === 0 ? (
            <EmptyState
              type="generic"
              icon={<IconClipboardList size={28} />}
              title="No completed games yet"
              description="Once you finalize a game's box score, generate a source-cited postgame action review here."
            />
          ) : !review ? (
            <EmptyState
              type="generic"
              icon={<IconClipboardList size={28} />}
              title={targetGame ? 'No review for this game yet' : 'Pick a game'}
              description={
                targetGame
                  ? 'Generate a postgame action review from this game’s official box score. Every item will cite the stat it came from.'
                  : 'Choose a completed game above to generate its postgame action review.'
              }
              action={
                targetGame
                  ? { label: 'Generate review', onClick: () => handleGenerate(targetGame.gameId) }
                  : undefined
              }
            />
          ) : (
            <ReviewBody
              review={review}
              onConvert={handleConvert}
              onDispose={handleDispose}
              busyItemId={busyItemId}
              fadeIn={fadeIn}
              reduceMotion={!!reduceMotion}
            />
          )}
        </div>
      </div>
    </LazyMotion>
  );
}

// -----------------------------------------------------------------------------

function ReviewBody({
  review,
  onConvert,
  onDispose,
  busyItemId,
  fadeIn,
  reduceMotion,
}: {
  review: PostgameReviewView;
  onConvert: (item: PostgameItemView, kind: ConvertKind) => void;
  onDispose: (item: PostgameItemView, d: 'dismissed' | 'resolved') => void;
  busyItemId: string | null;
  fadeIn: Record<string, unknown>;
  reduceMotion: boolean;
}) {
  const s = review.sections;
  const scoreTxt =
    review.ourScore != null && review.opponentScore != null
      ? `${review.ourScore}–${review.opponentScore}`
      : null;

  return (
    <div className="space-y-6">
      {/* Review header card — source status + confidence (NOT a recap) */}
      <m.div {...fadeIn} transition={reduceMotion ? undefined : { duration: 0.3 }}>
        <Card variant="raised" padding="lg" glow="subtle">
          <CardContent className="p-0">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-lg font-semibold tracking-tight text-warm-900">{review.title}</h2>
                {review.summary && (
                  <p className="mt-1 text-sm leading-relaxed text-warm-600">{review.summary}</p>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {scoreTxt && <Badge variant="secondary">{scoreTxt}</Badge>}
                <Badge variant={review.sourceStatus === 'official' ? 'success' : 'warning'}>
                  <IconDatabase size={12} className="mr-1" />
                  {review.sourceStatus} box score
                </Badge>
                <Badge variant="secondary">
                  {review.confidencePct == null ? '—' : `${review.confidencePct}%`} confidence
                </Badge>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-warm-100 pt-3 text-xs text-warm-400">
              <span className="tabular-nums">{review.battingLinesN} batting · {review.pitchingLinesN} pitching lines</span>
              <span className="flex items-center gap-1">
                <IconClock size={12} /> generated {fmtDate(review.generatedAt)}
              </span>
              {review.importWarnings.length > 0 && (
                <span className="flex items-center gap-1 text-amber-600">
                  <IconAlertCircle size={12} />
                  {review.importWarnings.length} import warning{review.importWarnings.length === 1 ? '' : 's'}
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      </m.div>

      {review.itemCount === 0 ? (
        <EmptyState
          type="generic"
          icon={<IconCheck size={28} />}
          title="Nothing crossed a one-game threshold"
          description="Box-score lines were recorded, but no single-game signal rose to an action candidate. That is an honest result, not an error."
        />
      ) : (
        <>
          <Section
            title="Workload updates"
            subtitle="Recorded counts — observed, not inferred."
            icon={<IconActivity size={16} />}
            items={s.workloadUpdates}
            {...{ onConvert, onDispose, busyItemId, fadeIn, reduceMotion }}
          />
          <Section
            title="Player timeline updates"
            subtitle="Log to a player's development timeline."
            icon={<IconNote size={16} />}
            items={s.timelineUpdates}
            allowConvert
            convertKind="timeline"
            {...{ onConvert, onDispose, busyItemId, fadeIn, reduceMotion }}
          />
          <Section
            title="Recommended practice focus"
            subtitle="Add a candidate to your practice planner backlog, then schedule it."
            icon={<IconTarget size={16} />}
            items={s.practiceFocus}
            allowConvert
            convertKind="practice"
            {...{ onConvert, onDispose, busyItemId, fadeIn, reduceMotion }}
          />
          <Section
            title="Staff decisions"
            subtitle="Bring to the Decision Room."
            icon={<IconClipboardList size={16} />}
            items={s.staffDecisions}
            {...{ onConvert, onDispose, busyItemId, fadeIn, reduceMotion }}
          />
          <Section
            title="Video evidence"
            subtitle="Clips to attach as proof."
            icon={<IconVideo size={16} />}
            items={s.videoEvidence}
            {...{ onConvert, onDispose, busyItemId, fadeIn, reduceMotion }}
          />
        </>
      )}
    </div>
  );
}

function Section({
  title,
  subtitle,
  icon,
  items,
  allowConvert,
  convertKind = 'timeline',
  onConvert,
  onDispose,
  busyItemId,
  fadeIn,
  reduceMotion,
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  items: PostgameItemView[];
  allowConvert?: boolean;
  convertKind?: ConvertKind;
  onConvert: (item: PostgameItemView, kind: ConvertKind) => void;
  onDispose: (item: PostgameItemView, d: 'dismissed' | 'resolved') => void;
  busyItemId: string | null;
  fadeIn: Record<string, unknown>;
  reduceMotion: boolean;
}) {
  if (items.length === 0) return null;
  return (
    <section>
      <div className="mb-3 flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-50 text-primary-600 ring-1 ring-primary-100">
          {icon}
        </span>
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-[13px] font-semibold uppercase tracking-[0.08em] text-warm-700">{title}</h3>
            <span className="rounded-full bg-warm-100 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-warm-500">
              {items.length}
            </span>
          </div>
          <p className="text-xs text-warm-400">{subtitle}</p>
        </div>
      </div>
      <div className="space-y-3">
        {items.map((item, idx) => (
          <m.div
            key={item.id}
            {...fadeIn}
            transition={reduceMotion ? undefined : { delay: Math.min(idx * 0.03, 0.2) }}
          >
            <ItemCard
              item={item}
              allowConvert={allowConvert}
              convertKind={convertKind}
              onConvert={onConvert}
              onDispose={onDispose}
              busy={busyItemId === item.id}
            />
          </m.div>
        ))}
      </div>
    </section>
  );
}

function ItemCard({
  item,
  allowConvert,
  convertKind = 'timeline',
  onConvert,
  onDispose,
  busy,
}: {
  item: PostgameItemView;
  allowConvert?: boolean;
  convertKind?: ConvertKind;
  onConvert: (item: PostgameItemView, kind: ConvertKind) => void;
  onDispose: (item: PostgameItemView, d: 'dismissed' | 'resolved') => void;
  busy: boolean;
}) {
  const convertedTimeline = item.disposition === 'converted_to_timeline';
  const convertedTask = item.disposition === 'converted_to_task';
  const converted = convertedTimeline || convertedTask;
  const resolved = item.disposition === 'resolved';
  const done = converted || resolved;

  // A timeline conversion needs a player to attach to; a practice conversion is
  // team-level (it lands in the team's planner backlog) so it has no such gate.
  const canConvert =
    !!allowConvert && (convertKind === 'practice' || !!item.playerId);
  // The practice action is the section's PRIMARY (filled) action; logging to a
  // timeline is a secondary affordance.
  const convertVariant = convertKind === 'practice' ? 'primary' : 'secondary';
  const convertIcon =
    convertKind === 'practice' ? <IconClipboardList size={14} /> : <IconNote size={14} />;
  const convertLabel =
    item.actionLabel ?? (convertKind === 'practice' ? 'Add to practice plan' : 'Log to timeline');

  return (
    <Card
      variant="raised"
      padding="md"
      className={done ? 'opacity-70 transition-opacity' : 'transition-shadow hover:shadow-card'}
    >
      <CardContent className="p-0">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <h4 className="font-semibold tracking-tight text-warm-900">{item.title}</h4>
              <Badge variant={priorityTone(item.priority)}>{item.priority}</Badge>
              {item.oneGame && <Badge variant="secondary">watch · 1 game</Badge>}
              {convertedTimeline && <Badge variant="success">Logged</Badge>}
              {convertedTask && <Badge variant="success">In practice plan</Badge>}
              {resolved && <Badge variant="success">Resolved</Badge>}
            </div>
            {item.detail && (
              <p className="text-sm leading-relaxed text-warm-600">{item.detail}</p>
            )}
            {/* Source citation — the binding "NO AI without source refs" rule. */}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <SourceTrustBadge trust={item.trust} provenance={item.provenance} size="sm" />
              {item.ownerRole && (
                <span className="text-xs text-warm-400">owner: {item.ownerRole}</span>
              )}
            </div>
          </div>
        </div>

        {/* Actions */}
        {!done && (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-warm-100 pt-3">
            {canConvert && (
              <Button
                variant={convertVariant}
                size="sm"
                isLoading={busy}
                leftIcon={convertIcon}
                onClick={() => onConvert(item, convertKind)}
              >
                {convertLabel}
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              leftIcon={<IconCheck size={14} />}
              disabled={busy}
              onClick={() => onDispose(item, 'resolved')}
            >
              Resolve
            </Button>
            <Button
              variant="ghost"
              size="sm"
              leftIcon={<IconX size={14} />}
              disabled={busy}
              onClick={() => onDispose(item, 'dismissed')}
            >
              Dismiss
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
