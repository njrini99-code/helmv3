'use client';

/**
 * ============================================================================
 * Fairway · player-game · FairwayPlayerGameFingerprint: where the strokes go
 * ----------------------------------------------------------------------------
 * One component for both readers of the Game Fingerprint:
 *   - coach, at /golf/dashboard/players/[playerId]/game (default mode)
 *   - player, as the Game profile tab inside ProfileDrill (mode="player")
 * Only the actions differ: a coach assigns a focus area, a player adds to
 * their plan. The data is the `PlayerFingerprint` the server already
 * resolved; this component fetches nothing.
 *
 * ANATOMY (375pt first; desktop reflows to two columns at lg)
 *   1. Masthead: the player's name (coach only; the player drill titles
 *      itself), one sentence verdict built from real SG, and one Form line
 *      whose formula opens on tap.
 *   2. Signature instrument: the strokes-gained waterfall, tee to putting to
 *      net. Each row opens that area's evidence sheet.
 *   3. Ledger: one hairline section per area, each with one bespoke
 *      mini-instrument and its CoachHelm claims inline. Areas with nothing to
 *      show collapse into one line.
 *
 * HONESTY: see ./fingerprint/fingerprint-model.ts. No frosted panels, no
 * nested cards, no chip charts, no raw n=/conf %, no count-up.
 *
 * PRESERVED LOGIC (verbatim): `handleAction` and the immutable section-state
 * helpers below drive acknowledgeInsight / dismissInsight /
 * createFocusAreaFromInsight (coach) and rateInsightAsPlayer /
 * createPlayerFocusArea (player) with the same payloads, optimistic state and
 * revert-on-failure as before.
 * ========================================================================== */

import { useCallback, useMemo, useState, useTransition, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { fairwayToast } from '@/components/fairway';
import { Sheet } from '@/components/fairway/overlays/Sheet';
import { PopoverPanel } from '@/components/fairway/overlays/PopoverPanel';
import { IconMoreHorizontal } from '@/components/icons';

import type { PlayerFingerprint } from '@/app/golf/actions/player-fingerprint';
import {
  FINGERPRINT_SECTION_ORDER,
  type FingerprintSectionKey,

} from '@/app/golf/actions/player-fingerprint-types';
// PRESERVED WRITE ACTIONS — imported UNCHANGED.
import { acknowledgeInsight, dismissInsight } from '@/app/golf/actions/insights';
import { createFocusAreaFromInsight, createPlayerFocusArea } from '@/app/golf/actions/development';
import { rateInsightAsPlayer } from '@/app/golf/actions/player-feedback';
import { useGolfUser } from '@/contexts/golf-user-context';
import { DEFAULT_TIMEZONE } from '@/lib/calendar/timezone';
import { cn } from '@/lib/utils';

import {
  FORM_FORMULA,
  buildAreas,
  buildClaim,
  buildVerdict,
  buildWaterfall,
  formatSignedValue,
  joinNames,
  presentForm,
  type AreaView,
  type SgAreaKey,
} from './fingerprint/fingerprint-model';
import { StrokesWaterfall } from './fingerprint/StrokesWaterfall';
import { ClaimRow, type ClaimAction } from './fingerprint/ClaimRow';
import {
  FairwayStrip,
  MissCompass,
  ParDeltas,
  PressureSplit,
  PuttingMakeCurve,
  RateMeters,
  StatLine,
  statItems,
} from './fingerprint/instruments';

/* ───────────────────────────────────────────────────────────────────────────
 * Props
 * ────────────────────────────────────────────────────────────────────────── */

export type FingerprintMode = 'coach' | 'player';

export interface FairwayPlayerGameFingerprintProps {
  fingerprint: PlayerFingerprint;
  /** @default 'coach' */
  mode?: FingerprintMode;
  /**
   * Extra, server-built content rendered at the end of a given area's ledger
   * section (addendum §13 A7), e.g. `approach` (A2 distance profile) or
   * `scoring` (A3). Omitted keys render nothing extra.
   */
  sectionAddenda?: Partial<Record<FingerprintSectionKey, ReactNode>>;
  /**
   * Coach-only, streamed: the approach distance ladder (shot-level SG,
   * approach shots only). Rendered as the Approach area's instrument; absent
   * in player mode, where the miss compass stands alone.
   */
  approachLadder?: ReactNode;
}

/* ───────────────────────────────────────────────────────────────────────────
 * Helpers
 * ────────────────────────────────────────────────────────────────────────── */

/** The 5-round floor the aggregator uses to mark a section sparse. */
const SECTION_SAMPLE_FLOOR = 5;

/** Player-mode "Add to my plan": fingerprint section → `area_type`. */
const AREA_TYPE_BY_SECTION: Record<FingerprintSectionKey, string> = {
  tee: 'driving',
  approach: 'iron_play',
  short_game: 'short_game',
  putting: 'putting',
  scoring: 'course_management',
  pressure: 'mental_game',
};

/**
 * Format the aggregator's `generated_at` ISO timestamp deterministically, in
 * a fixed zone, so SSR and the first client render agree (prod React #418).
 */
export function formatGeneratedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: DEFAULT_TIMEZONE,
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

/* ───────────────────────────────────────────────────────────────────────────
 * Component
 * ────────────────────────────────────────────────────────────────────────── */

export function FairwayPlayerGameFingerprint({
  fingerprint,
  mode = 'coach',
  sectionAddenda,
  approachLadder,
}: FairwayPlayerGameFingerprintProps) {
  const router = useRouter();
  const golfUser = useGolfUser();
  const coachId = golfUser.coachId ?? null;
  const isCoachMode = mode === 'coach';
  const [, startActionTransition] = useTransition();

  // Mirror insight lists per section into local state so actions (ack / dismiss
  // / focus area) can update the UI optimistically — IDENTICAL to legacy.
  const [sections, setSections] = useState(() => fingerprint.sections);
  const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(new Set());

  const handleAction = useCallback(
    (action: 'acknowledged' | 'dismissed' | 'create_focus_area', insightId: string) => {
      if (pendingIds.has(insightId)) return;
      const prev = sections;
      setPendingIds((current) => new Set(current).add(insightId));
      startActionTransition(async () => {
        try {
          if (action === 'acknowledged') {
            setSections((current) =>
              mapInsights(current, insightId, (i) => ({
                ...i,
                acknowledged_at: new Date().toISOString(),
                status: 'acknowledged' as const,
              })),
            );
            if (isCoachMode) {
              const res = await acknowledgeInsight(insightId);
              if (!res.success) {
                setSections(prev);
                fairwayToast.error(res.error ?? 'Could not acknowledge this insight.');
              } else {
                fairwayToast.success('Insight acknowledged.');
              }
            } else {
              // Player-self path — writes `golf_insight_player_feedback`, the
              // SAME round-trip the Insights sub-tab's `onRate` uses. Throws
              // on failure (no `.success` flag), caught by the shared catch
              // below, which already reverts + toasts identically.
              await rateInsightAsPlayer({ insightId, rating: 'acknowledged' });
              fairwayToast.success('Insight acknowledged.');
            }
          } else if (action === 'dismissed') {
            setSections((current) => removeInsight(current, insightId));
            if (isCoachMode) {
              const res = await dismissInsight(insightId);
              if (!res.success) {
                setSections(prev);
                fairwayToast.error(res.error ?? 'Could not dismiss this insight.');
              } else {
                fairwayToast.success('Insight dismissed.');
              }
            } else {
              await rateInsightAsPlayer({ insightId, rating: 'dismissed' });
              fairwayToast.success('Insight dismissed.');
            }
          } else if (action === 'create_focus_area') {
            const target = findInsight(sections, insightId);
            if (!target) {
              fairwayToast.error('That insight is no longer available.');
              return;
            }
            if (isCoachMode) {
              if (!coachId) {
                fairwayToast.error('A coach profile is required to create a focus area.');
                return;
              }
              const res = await createFocusAreaFromInsight({
                insight_id: target.id,
                player_id: target.player_id,
                coach_id: coachId,
                title: target.title,
                description: target.content ?? '',
                insight_type: (target.category as string | undefined) ?? 'general',
              });
              if (res.success) {
                fairwayToast.success('Focus area created.');
                router.push(
                  `/golf/dashboard/intelligence?view=players&player=${target.player_id}&playersTab=areas`,
                );
              } else {
                fairwayToast.error(res.error ?? 'Could not create the focus area.');
              }
            } else {
              // Player-self path — no coach attribution (`createPlayerFocusArea`
              // resolves + verifies ownership from auth, ignoring any caller-
              // supplied player_id that doesn't match). `area_type` has no
              // per-insight derivation on the player-create path the way the
              // coach's `createFocusAreaFromInsight` has (mapInsightTypeToAreaType
              // + metadata refinement) — the fingerprint SECTION the insight
              // lives under is itself an honest, always-available substitute.
              const sectionKey = findInsightSection(sections, insightId);
              const res = await createPlayerFocusArea({
                player_id: target.player_id,
                area_type: sectionKey ? AREA_TYPE_BY_SECTION[sectionKey] : 'other',
                title: target.title,
                description: target.content ?? null,
                target_metric: target.evidence?.metric ?? null,
                current_value: null,
                target_value: null,
                from_insight_id: target.id,
              });
              if (res.success) {
                fairwayToast.success('Added to your development plan.');
                router.push('/golf/dashboard/coachhelm?view=development');
              } else {
                fairwayToast.error(res.error ?? 'Could not create the focus area.');
              }
            }
          }
        } catch {
          setSections(prev);
          fairwayToast.error('That action did not complete. Try again.');
        } finally {
          setPendingIds((current) => {
            const next = new Set(current);
            next.delete(insightId);
            return next;
          });
        }
      });
    },
    [coachId, isCoachMode, pendingIds, router, sections],
  );

  const orderedSections = useMemo(
    () => FINGERPRINT_SECTION_ORDER.map((key) => sections[key]),
    [sections],
  );

  const { player, composite, generated_at: generatedAt } = fingerprint;
  const fullName = `${player.first_name ?? ''} ${player.last_name ?? ''}`.trim() || 'Player';
  const metricsSample = fingerprint.metrics_rounds;

  const waterfall = useMemo(() => buildWaterfall(fingerprint.sections), [fingerprint.sections]);
  const verdict = buildVerdict(waterfall);
  const form = presentForm(composite);
  const areas = useMemo(
    () => buildAreas(orderedSections, waterfall, (key) => Boolean(sectionAddenda?.[key]) || (key === 'approach' && Boolean(approachLadder))),
    [orderedSections, waterfall, sectionAddenda, approachLadder],
  );
  const shownAreas = areas.filter((a) => !a.empty);
  const emptyAreas = areas.filter((a) => a.empty);
  const earlyRead = metricsSample > 0 && metricsSample < SECTION_SAMPLE_FLOOR;

  const [sheetKey, setSheetKey] = useState<SgAreaKey | null>(null);
  const sheetArea = sheetKey ? areas.find((a) => a.key === sheetKey) ?? null : null;

  const onClaimAction = useCallback(
    (action: ClaimAction, insightId: string) => handleAction(action, insightId),
    [handleAction],
  );

  const roundsLabel = `${metricsSample} tracked ${metricsSample === 1 ? 'round' : 'rounds'}`;

  return (
    <article className="mx-auto w-full max-w-[1160px] overflow-x-clip" data-slot="game-fingerprint" data-mode={mode}>
      <div className="flex flex-col gap-8 lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start lg:gap-12">
        {/* ════════════ Left column (sticky on desktop): masthead + stage ═══════════ */}
        <div className="flex flex-col gap-8 lg:sticky lg:top-6">
          <header className="flex flex-col gap-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                {isCoachMode ? (
                  <h1 className="font-fw-display text-h1 text-text-primary md:text-display">{fullName}</h1>
                ) : null}
                <p className={cn('font-fw-sans text-caption text-text-tertiary', isCoachMode && 'mt-1')}>
                  Game Fingerprint
                  {player.team_name ? ` · ${player.team_name}` : ''}
                  {metricsSample > 0 ? ` · ${roundsLabel}` : ''}
                </p>
              </div>
              {isCoachMode ? <CoachMoreMenu playerId={player.id} /> : null}
            </div>

            <p className="max-w-[40ch] font-fw-sans text-body-lg text-text-primary" data-slot="fingerprint-verdict">
              {verdict ??
                (metricsSample > 0
                  ? `Strokes gained has not been measured yet across ${roundsLabel}.`
                  : 'No rounds logged yet. The fingerprint fills in after the first tracked round.')}
            </p>

            <FormLine form={form} />
          </header>

          {/* ── Signature instrument ── */}
          <section aria-labelledby="fp-strokes-heading" data-slot="fingerprint-stage">
            <div className="flex items-baseline justify-between gap-3 border-b border-border-subtle pb-2">
              <h2 id="fp-strokes-heading" className="font-fw-display text-h3 text-text-primary">
                Where the strokes go
              </h2>
              <span className="font-fw-sans text-caption text-text-tertiary">per round</span>
            </div>
            {waterfall.measuredCount > 0 ? (
              <div className={cn('pt-3', earlyRead && 'opacity-60')}>
                <StrokesWaterfall waterfall={waterfall} onSelect={setSheetKey} />
              </div>
            ) : (
              <p className="py-6 font-fw-sans text-body-sm text-text-secondary">
                Strokes gained needs shot-tracked rounds. Nothing to draw yet.
              </p>
            )}
            <p className="mt-2 font-fw-sans text-caption text-text-tertiary">
              {earlyRead ? `Early read · ${roundsLabel}. ` : ''}
              Strokes gained per round across all {roundsLabel}
              {waterfall.measuredCount > 0 && waterfall.measuredCount < 4
                ? `; net covers the ${waterfall.measuredCount} measured areas`
                : ''}
              . Tap a row for the evidence.
            </p>
          </section>
        </div>

        {/* ════════════ Right column: the ledger ═══════════ */}
        <div className="flex flex-col gap-10" data-slot="fingerprint-ledger">
          {shownAreas.map((area) => (
            <AreaSection
              key={area.key}
              area={area}
              mode={mode}
              pendingIds={pendingIds}
              onAction={onClaimAction}
              addendum={sectionAddenda?.[area.key]}
              approachLadder={area.key === 'approach' ? approachLadder : undefined}
            />
          ))}

          {emptyAreas.length > 0 ? (
            <p className="border-t border-border-subtle pt-4 font-fw-sans text-body-sm text-text-secondary" data-slot="fingerprint-empty-areas">
              <span className="text-text-primary">Waiting on more rounds:</span> {joinNames(emptyAreas.map((a) => a.title))}.
            </p>
          ) : null}

          <p className="font-fw-sans text-caption text-text-tertiary">Updated {formatGeneratedAt(generatedAt)}</p>
        </div>
      </div>

      <Sheet
        open={sheetArea != null}
        onOpenChange={(open) => {
          if (!open) setSheetKey(null);
        }}
        title={sheetArea?.title ?? 'Evidence'}
        description={
          sheetArea?.sg != null
            ? `${formatSignedValue(sheetArea.sg)} strokes per round · all ${roundsLabel}`
            : `Not measured · all ${roundsLabel}`
        }
      >
        {sheetArea ? (
          <Sheet.Body className="flex flex-col gap-6 pb-8">
            <AreaInstruments area={sheetArea} />
            {sheetArea.section.insights.length > 0 ? (
              <ul className="flex flex-col">
                {sheetArea.section.insights.map((insight) => (
                  <ClaimRow key={insight.id} claim={buildClaim(insight)} mode={mode} readOnly />
                ))}
              </ul>
            ) : (
              <p className="font-fw-sans text-body-sm text-text-secondary">CoachHelm has no claims in this area yet.</p>
            )}
            <a
              href={`#fingerprint-${sheetArea.key}`}
              onClick={() => setSheetKey(null)}
              className="inline-flex min-h-[44px] items-center font-fw-sans text-body font-medium text-accent-700 outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
            >
              Go to {sheetArea.title} in the ledger
            </a>
          </Sheet.Body>
        ) : null}
      </Sheet>
    </article>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
 * Form: one number, formula on tap. Never a confident 0 or 100.
 * ══════════════════════════════════════════════════════════════════════════ */

function FormLine({ form }: { form: ReturnType<typeof presentForm> }) {
  const [open, setOpen] = useState(false);
  if (form.kind === 'none') {
    return (
      <p className="font-fw-sans text-body-sm text-text-secondary">
        Form appears after {SECTION_SAMPLE_FLOOR} rounds{form.rounds > 0 ? ` · ${form.rounds} so far` : ''}.
      </p>
    );
  }
  const trendInk =
    form.trendWord === 'improving' ? 'text-fw-success-ink' : form.trendWord === 'slipping' ? 'text-fw-warning-ink' : 'text-text-secondary';
  const muted = form.early || form.capped != null;
  return (
    <div data-slot="fingerprint-form">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="fp-form-formula"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          '-ml-2 inline-flex min-h-[44px] flex-wrap items-baseline gap-x-2 rounded-fw-sm px-2 text-left font-fw-sans text-body outline-none',
          'transition-colors [transition-duration:150ms] active:bg-surface-sunken focus-visible:ring-2 focus-visible:ring-border-focus',
          '[@media(hover:hover)]:hover:bg-surface-sunken',
        )}
      >
        <span className="text-text-secondary">Form</span>
        <span className={cn('font-semibold tabular-nums', muted ? 'text-text-secondary' : 'text-text-primary')}>
          {form.value}
        </span>
        {form.capped ? (
          <span className="text-body-sm text-text-secondary">at the {form.capped === 'top' ? '100' : '0'} cap</span>
        ) : null}
        {form.early ? <span className="text-body-sm text-text-secondary">Early read</span> : null}
        <span className={cn('text-body-sm', trendInk)}>{form.trendWord}</span>
        <span className="text-body-sm text-text-tertiary">
          · {form.rounds} {form.rounds === 1 ? 'round' : 'rounds'} · {open ? 'hide formula' : 'how it’s figured'}
        </span>
      </button>
      {open ? (
        <p id="fp-form-formula" className="mt-1 max-w-[56ch] font-fw-sans text-body-sm text-text-secondary">
          {FORM_FORMULA}
          {form.capped
            ? ` This one sits on the ${form.capped === 'top' ? 'top' : 'bottom'} of the scale, so the real reading is past it. Check the recent rounds before quoting it.`
            : ''}
        </p>
      ) : (
        <span id="fp-form-formula" hidden />
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
 * Coach masthead overflow: print, genome, player page. No filled primary.
 * ══════════════════════════════════════════════════════════════════════════ */

function CoachMoreMenu({ playerId }: { playerId: string }) {
  const [open, setOpen] = useState(false);
  const links = [
    { href: `/golf/dashboard/players/${playerId}/game/print`, label: 'Print report' },
    { href: `/golf/dashboard/players/${playerId}/genome`, label: 'Genome' },
    { href: `/golf/dashboard/roster/${playerId}`, label: 'Player page' },
  ];
  return (
    <PopoverPanel
      open={open}
      onOpenChange={setOpen}
      surface="matte"
      align="end"
      ariaLabel="More for this player"
      trigger={
        <button
          type="button"
          aria-label="More for this player"
          className={cn(
            '-mr-2 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-text-secondary outline-none',
            'transition-colors [transition-duration:150ms] active:bg-surface-sunken focus-visible:ring-2 focus-visible:ring-border-focus',
            '[@media(hover:hover)]:hover:bg-surface-sunken',
          )}
        >
          <IconMoreHorizontal size={20} aria-hidden="true" />
        </button>
      }
    >
      <ul className="flex min-w-[200px] flex-col py-1">
        {links.map((l) => (
          <li key={l.href}>
            <Link
              href={l.href}
              onClick={() => setOpen(false)}
              className="flex min-h-[44px] items-center px-4 font-fw-sans text-body text-text-primary outline-none active:bg-surface-sunken focus-visible:bg-surface-sunken [@media(hover:hover)]:hover:bg-surface-sunken"
            >
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </PopoverPanel>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
 * One ledger section per area: header, one instrument, claims inline.
 * ══════════════════════════════════════════════════════════════════════════ */

function AreaInstruments({ area, approachLadder }: { area: AreaView; approachLadder?: ReactNode }) {
  const s = area.section;
  if (s.sparse) {
    return (
      <p className="font-fw-sans text-body-sm text-text-secondary">
        Not enough rounds to chart this yet. It needs {SECTION_SAMPLE_FLOOR}.
      </p>
    );
  }
  switch (area.key) {
    case 'tee':
      return <FairwayStrip section={s} />;
    case 'approach':
      return (
        <div className="flex flex-col gap-6">
          <StatLine items={statItems(s, ['GIR', 'Proximity'])} />
          {approachLadder}
          <MissCompass section={s} />
        </div>
      );
    case 'short_game':
      return <RateMeters section={s} labels={['Up-and-down', 'Scrambling', 'Sand saves']} />;
    case 'putting':
      return (
        <div className="flex flex-col gap-4">
          <PuttingMakeCurve section={s} />
          <StatLine items={statItems(s, ['Putts / round', '1-putt %', '3-putt %'])} />
        </div>
      );
    case 'scoring':
      return (
        <div className="flex flex-col gap-4">
          <StatLine items={statItems(s, [['Scoring avg', 'Scoring average']])} />
          <ParDeltas section={s} />
        </div>
      );
    case 'pressure':
      return <PressureSplit section={s} />;
    default:
      return null;
  }
}

function AreaSection({
  area,
  mode,
  pendingIds,
  onAction,
  addendum,
  approachLadder,
}: {
  area: AreaView;
  mode: FingerprintMode;
  pendingIds: ReadonlySet<string>;
  onAction: (action: ClaimAction, insightId: string) => void;
  addendum?: ReactNode;
  approachLadder?: ReactNode;
}) {
  const insights = area.section.insights;
  const sg = area.sg;
  return (
    <section
      id={`fingerprint-${area.key}`}
      aria-labelledby={`fingerprint-${area.key}-title`}
      className="scroll-mt-24"
      data-slot="fingerprint-area"
    >
      <header className="flex items-baseline justify-between gap-3 border-b border-border-strong pb-2">
        <h2 id={`fingerprint-${area.key}-title`} className="font-fw-display text-h3 text-text-primary">
          {area.title}
        </h2>
        {sg != null ? (
          <span className="font-fw-sans text-caption text-text-tertiary">
            <span
              className={cn(
                'text-body font-semibold tabular-nums',
                sg > 0.05 ? 'text-fw-success-ink' : sg < -0.05 ? 'text-fw-warning-ink' : 'text-text-secondary',
              )}
            >
              {formatSignedValue(sg)}
            </span>{' '}
            strokes/rd
          </span>
        ) : null}
      </header>

      <div className="pt-4">
        <AreaInstruments area={area} approachLadder={approachLadder} />
      </div>

      {insights.length > 0 ? (
        <ul className="mt-4 flex flex-col" aria-label={`CoachHelm on ${area.title.toLowerCase()}`}>
          {insights.map((insight) => (
            <ClaimRow
              key={insight.id}
              claim={buildClaim(insight)}
              mode={mode}
              pending={pendingIds.has(insight.id)}
              onAction={onAction}
            />
          ))}
        </ul>
      ) : null}

      {addendum ? <div className="mt-6">{addendum}</div> : null}
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
 * Immutable section-state helpers — IDENTICAL to the legacy client (verbatim
 * optimistic-update logic; presentation only differs).
 * ══════════════════════════════════════════════════════════════════════════ */

function mapInsights(
  sections: PlayerFingerprint['sections'],
  insightId: string,
  transform: (
    insight: PlayerFingerprint['sections'][keyof PlayerFingerprint['sections']]['insights'][number],
  ) => PlayerFingerprint['sections'][keyof PlayerFingerprint['sections']]['insights'][number],
): PlayerFingerprint['sections'] {
  const next = { ...sections };
  for (const key of FINGERPRINT_SECTION_ORDER) {
    const section = next[key];
    const idx = section.insights.findIndex((i) => i.id === insightId);
    if (idx >= 0) {
      const nextInsights = [...section.insights];
      nextInsights[idx] = transform(nextInsights[idx]!);
      next[key] = { ...section, insights: nextInsights };
    }
  }
  return next;
}

function removeInsight(
  sections: PlayerFingerprint['sections'],
  insightId: string,
): PlayerFingerprint['sections'] {
  const next = { ...sections };
  for (const key of FINGERPRINT_SECTION_ORDER) {
    const section = next[key];
    if (section.insights.some((i) => i.id === insightId)) {
      next[key] = {
        ...section,
        insights: section.insights.filter((i) => i.id !== insightId),
      };
    }
  }
  return next;
}

function findInsight(
  sections: PlayerFingerprint['sections'],
  insightId: string,
): PlayerFingerprint['sections'][keyof PlayerFingerprint['sections']]['insights'][number] | null {
  for (const key of FINGERPRINT_SECTION_ORDER) {
    const match = sections[key].insights.find((i) => i.id === insightId);
    if (match) return match;
  }
  return null;
}

/** Player-mode only — which fingerprint section an insight lives under, used
 *  to resolve `AREA_TYPE_BY_SECTION` for `createPlayerFocusArea`. */
function findInsightSection(
  sections: PlayerFingerprint['sections'],
  insightId: string,
): FingerprintSectionKey | null {
  for (const key of FINGERPRINT_SECTION_ORDER) {
    if (sections[key].insights.some((i) => i.id === insightId)) return key;
  }
  return null;
}
