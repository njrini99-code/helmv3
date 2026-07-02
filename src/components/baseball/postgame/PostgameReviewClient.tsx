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
// PRESENTATION (Living Annual): composed entirely from the kit
// (`@/components/baseball/living-annual`) — PaperCard record-book rows, InkBadge
// status stamps (never red/yellow), a GradeStamp for confidence, and EditorsLetter
// for every empty/degraded state (never a yellow warning box). Three gate layers
// (middleware, read-model authorized flag, RLS) and the six empty branches this
// surface can land in (error / forbidden / setup / no-games / no-review /
// zero-items) are UNCHANGED — only how they render.
// =============================================================================

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

import { cn } from '@/lib/utils';
import { Button } from '@/components/fairway';
import { toast } from '@/components/ui/sonner';
import {
  IconClock,
  IconNote,
  IconTarget,
  IconActivity,
  IconClipboardList,
  IconVideo,
  IconCheck,
  IconX,
  IconRefresh,
} from '@/components/icons';

import {
  SectionMasthead,
  Eyebrow,
  PaperCard,
  HairlineRule,
  InkBadge,
  GradeStamp,
  StatReadout,
  EditorsLetter,
  Reveal,
  LiveDot,
  pressableClass,
} from '@/components/baseball/living-annual';

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

/** InkBadge tone/variant for an item's priority — never red/yellow (spec doctrine). */
function priorityTone(p: string): { tone: 'sodium' | 'neutral'; variant: 'soft' | 'solid' } {
  if (p === 'high' || p === 'urgent') return { tone: 'sodium', variant: 'solid' };
  if (p === 'medium') return { tone: 'sodium', variant: 'soft' };
  return { tone: 'neutral', variant: 'soft' };
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

  return (
    <div className="mx-auto w-full max-w-5xl space-y-8 px-4 py-8 sm:px-6 sm:py-10">
      {/* Masthead */}
      <Reveal>
        <SectionMasthead
          eyebrow="THE PRESSBOX · POSTGAME REVIEW"
          title="Postgame Action Review"
          ink="team"
          actions={
            targetGame ? (
              <Button
                variant={review ? 'secondary' : 'primary'}
                size="sm"
                busy={pending && busyItemId === null}
                leftIcon={<IconRefresh size={15} />}
                onClick={() => handleGenerate(targetGame.gameId)}
              >
                {review ? 'Regenerate' : 'Generate review'}
              </Button>
            ) : undefined
          }
        >
          <p className="max-w-2xl font-annual text-body-lg leading-relaxed text-text-secondary">
            {teamName} — every recommendation cites the stat it rests on. Single-game
            signals are watch-level, not proven trends.
          </p>
        </SectionMasthead>
      </Reveal>

      {/* Game picker */}
      {recentGames.length > 0 && (
        <Reveal staggerIndex={1}>
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Recent games">
            {recentGames.slice(0, 12).map((g) => {
              const active = review?.gameId === g.gameId || selectedGameId === g.gameId;
              return (
                // Tab-role pill (InkBadge + LiveDot content) — not a design-system
                // Button; press physics come from pressableClass per the kit's
                // interaction layer (spec §7.1, pressable.ts "NOT for <Button>").
                // eslint-disable-next-line helm/no-raw-button
                <button
                  key={g.gameId}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => router.replace(`/baseball/dashboard/postgame?game=${g.gameId}`)}
                  className={cn(
                    'flex items-center gap-1.5 rounded-full',
                    pressableClass({ ink: 'team' }),
                  )}
                >
                  <InkBadge
                    label={`${g.opponentName ?? 'Game'}${g.gameDate ? ` · ${fmtDate(g.gameDate)}` : ''}`}
                    tone={active ? 'team' : 'neutral'}
                    variant={active ? 'solid' : 'soft'}
                  />
                  {g.hasReview && <LiveDot ink="team" />}
                </button>
              );
            })}
          </div>
        </Reveal>
      )}

      {/* States — the three-layer gate (middleware / authorized flag / RLS)
          surfaces here as six honest branches: error, forbidden, setup,
          no-games, no-review, zero-items. Every one is an EditorsLetter, never
          a yellow/amber box. */}
      {error ? (
        <Reveal staggerIndex={2}>
          <EditorsLetter
            ink="team"
            title="We couldn’t load this review"
            body={error}
            action={
              <Button variant="secondary" size="sm" leftIcon={<IconRefresh size={15} />} onClick={() => router.refresh()}>
                Try again
              </Button>
            }
          />
        </Reveal>
      ) : !authorized ? (
        <Reveal staggerIndex={2}>
          {unauthorizedReason === 'forbidden' ? (
            <EditorsLetter
              ink="team"
              title="You don’t have access to postgame reviews"
              body="Postgame Action Reviews are staff coaching intelligence and require the “manage stats” permission. Ask your head coach to grant it on the staff roles page."
              action={<InkBadge label="Restricted" tone="neutral" variant="solid" />}
            />
          ) : (
            <EditorsLetter
              ink="team"
              title="Set up your program first"
              body="Create your team and record a game to start building postgame reviews."
              action={
                <Button asChild variant="primary" size="sm">
                  <Link href="/baseball/dashboard/program">Complete setup</Link>
                </Button>
              }
            />
          )}
        </Reveal>
      ) : recentGames.length === 0 ? (
        <Reveal staggerIndex={2}>
          <EditorsLetter
            ink="team"
            live
            title="No completed games yet"
            body="Once you finalize a game’s box score, generate a source-cited postgame action review here."
          />
        </Reveal>
      ) : !review ? (
        <Reveal staggerIndex={2}>
          <EditorsLetter
            ink="team"
            title={targetGame ? 'No review for this game yet' : 'Pick a game'}
            body={
              targetGame
                ? 'Generate a postgame action review from this game’s official box score. Every item will cite the stat it came from.'
                : 'Choose a completed game above to generate its postgame action review.'
            }
            action={
              targetGame ? (
                <Button
                  variant="primary"
                  size="sm"
                  busy={pending && busyItemId === null}
                  leftIcon={<IconRefresh size={15} />}
                  onClick={() => handleGenerate(targetGame.gameId)}
                >
                  Generate review
                </Button>
              ) : undefined
            }
          />
        </Reveal>
      ) : (
        <ReviewBody review={review} onConvert={handleConvert} onDispose={handleDispose} busyItemId={busyItemId} />
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------

function ReviewBody({
  review,
  onConvert,
  onDispose,
  busyItemId,
}: {
  review: PostgameReviewView;
  onConvert: (item: PostgameItemView, kind: ConvertKind) => void;
  onDispose: (item: PostgameItemView, d: 'dismissed' | 'resolved') => void;
  busyItemId: string | null;
}) {
  const s = review.sections;

  return (
    <div className="space-y-8">
      {/* Review header card — source status + confidence (NOT a recap) */}
      <Reveal staggerIndex={2}>
        <PaperCard registrationTick className="p-6 sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 className="font-annual text-h3 font-semibold leading-tight text-text-primary">{review.title}</h2>
              {review.summary && (
                <p className="mt-1.5 max-w-prose font-annual text-body-lg leading-relaxed text-text-secondary">
                  {review.summary}
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-4">
              {review.ourScore != null && review.opponentScore != null && (
                <div className="flex items-baseline gap-1.5 font-annual text-h3 text-text-primary">
                  <StatReadout value={review.ourScore} ariaLabel="our score" />
                  <span className="text-text-tertiary">–</span>
                  <StatReadout value={review.opponentScore} ariaLabel="opponent score" />
                </div>
              )}
              <InkBadge
                label={`${review.sourceStatus} box score`}
                tone={review.sourceStatus === 'official' ? 'team' : 'sodium'}
                variant="solid"
              />
              <GradeStamp
                value={review.confidencePct ?? 0}
                tool="CONF"
                present={review.confidencePct != null}
                size="sm"
              />
            </div>
          </div>

          <HairlineRule ink="hairline" className="my-4" />

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <span className="font-annual text-body-sm tabular-nums text-text-tertiary">
              {review.battingLinesN} batting · {review.pitchingLinesN} pitching lines
            </span>
            <span className="flex items-center gap-1.5 font-annual text-body-sm text-text-tertiary">
              <IconClock size={12} /> generated {fmtDate(review.generatedAt)}
            </span>
            {review.importWarnings.length > 0 && (
              <InkBadge
                label={`${review.importWarnings.length} import warning${review.importWarnings.length === 1 ? '' : 's'}`}
                tone="sodium"
              />
            )}
          </div>
        </PaperCard>
      </Reveal>

      {review.itemCount === 0 ? (
        <Reveal staggerIndex={3}>
          <EditorsLetter
            ink="team"
            title="Nothing crossed a one-game threshold"
            body="Box-score lines were recorded, but no single-game signal rose to an action candidate. That is an honest result, not an error."
          />
        </Reveal>
      ) : (
        <div className="space-y-8">
          <Section
            title="Workload updates"
            subtitle="Recorded counts — observed, not inferred."
            icon={<IconActivity size={16} />}
            items={s.workloadUpdates}
            onConvert={onConvert}
            onDispose={onDispose}
            busyItemId={busyItemId}
          />
          <Section
            title="Player timeline updates"
            subtitle="Log to a player's development timeline."
            icon={<IconNote size={16} />}
            items={s.timelineUpdates}
            allowConvert
            convertKind="timeline"
            onConvert={onConvert}
            onDispose={onDispose}
            busyItemId={busyItemId}
          />
          <Section
            title="Recommended practice focus"
            subtitle="Add a candidate to your practice planner backlog, then schedule it."
            icon={<IconTarget size={16} />}
            items={s.practiceFocus}
            allowConvert
            convertKind="practice"
            onConvert={onConvert}
            onDispose={onDispose}
            busyItemId={busyItemId}
          />
          <Section
            title="Staff decisions"
            subtitle="Bring to the Decision Room."
            icon={<IconClipboardList size={16} />}
            items={s.staffDecisions}
            onConvert={onConvert}
            onDispose={onDispose}
            busyItemId={busyItemId}
          />
          <Section
            title="Video evidence"
            subtitle="Clips to attach as proof."
            icon={<IconVideo size={16} />}
            items={s.videoEvidence}
            onConvert={onConvert}
            onDispose={onDispose}
            busyItemId={busyItemId}
          />
        </div>
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
}) {
  if (items.length === 0) return null;
  return (
    <section>
      <div className="mb-4 flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-fw-sm bg-grade-plus/[0.08] text-grade-plus">
          {icon}
        </span>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Eyebrow as="h3" ink="team">
              {title}
            </Eyebrow>
            <StatReadout value={items.length} className="text-body-sm text-text-tertiary" ariaLabel={`${title} count`} />
          </div>
          <p className="font-annual text-body-sm text-text-tertiary">{subtitle}</p>
        </div>
      </div>
      <HairlineRule ink="hairline" className="mb-4" />
      <div className="space-y-3">
        {items.map((item, idx) => (
          <Reveal key={item.id} staggerIndex={idx}>
            <ItemCard
              item={item}
              allowConvert={allowConvert}
              convertKind={convertKind}
              onConvert={onConvert}
              onDispose={onDispose}
              busy={busyItemId === item.id}
            />
          </Reveal>
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
  const priority = priorityTone(item.priority);

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
    <PaperCard className={cn('p-5', done && 'opacity-70')}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            <h4 className="font-annual text-body-lg font-semibold text-text-primary">{item.title}</h4>
            <InkBadge label={item.priority} tone={priority.tone} variant={priority.variant} />
            {item.oneGame && <InkBadge label="Watch · 1 game" tone="neutral" />}
            {convertedTimeline && <InkBadge label="Logged" tone="team" variant="solid" />}
            {convertedTask && <InkBadge label="In practice plan" tone="team" variant="solid" />}
            {resolved && <InkBadge label="Resolved" tone="team" variant="solid" />}
          </div>
          {item.detail && (
            <p className="font-annual text-body-sm leading-relaxed text-text-secondary">{item.detail}</p>
          )}
          {/* Source citation — the binding "NO AI without source refs" rule. */}
          <div className="mt-2.5 flex flex-wrap items-center gap-2.5">
            <SourceTrustBadge trust={item.trust} provenance={item.provenance} size="sm" />
            {item.ownerRole && (
              <span className="font-annual text-body-sm text-text-tertiary">owner: {item.ownerRole}</span>
            )}
          </div>
        </div>
      </div>

      {/* Actions */}
      {!done && (
        <>
          <HairlineRule ink="hairline" className="my-3.5" />
          <div className="flex flex-wrap items-center gap-2">
            {canConvert && (
              <Button
                variant={convertVariant}
                size="sm"
                busy={busy}
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
        </>
      )}
    </PaperCard>
  );
}
