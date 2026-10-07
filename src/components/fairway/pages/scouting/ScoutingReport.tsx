'use client';

/**
 * ============================================================================
 * Fairway · Scouting Report — the coach's one-page memo on a player
 * ----------------------------------------------------------------------------
 * Coach `/golf/dashboard/players/[playerId]/game?tab=scouting`.
 *
 * Reads top to bottom like a memo written by a good coach:
 *   1. Masthead   the player's name and a one-sentence verdict (Title 2)
 *   2. What matters  exactly three claims in the engine's rank order (rank is
 *                 weight). Each has a takeaway, one micro-visual, an evidence
 *                 line, a read-quality word, and an evidence-changed badge.
 *   3. Plan       the active focus areas as a ledger (baseline → now → target)
 *                 with the screen's ONE primary action, "Assign focus"
 *   4. Watch list thin or value-less signals, ghosted ("Early read · n=4")
 *   5. Go deeper  contextual links to Game Fingerprint and Genome. Their
 *                 charts are deliberately not duplicated here.
 *
 * Secondary actions (message, plan board, print, refresh) live in one
 * context menu. No cards, no tiles, no eyebrows, no confidence percentages.
 * Print: controls hide, claims never split across pages.
 * ========================================================================== */

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronRight, MoreHorizontal } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/fairway/controls/button';
import { EmptyState } from '@/components/fairway/feedback/EmptyState';
import { Skeleton } from '@/components/fairway/feedback/Skeleton';
import { PopoverPanel } from '@/components/fairway/overlays/PopoverPanel';
import { fairwayToast } from '@/components/fairway/feedback/ToastStack';
import { formatTargetMetricLabel, getProgressPercent } from '@/components/fairway/pages/coachhelm/areaTypes';
import { useGolfUserOptional } from '@/contexts/golf-user-context';
import { computeTargetValue } from '@/lib/coachhelm/v3/goals/suggestion-writer';
import type { ThemeNode } from '@/lib/coachhelm/v3/themes/types';

import { getInsightsForCoachWithMeta, type EvidenceInsight } from '@/app/golf/actions/insight-delivery';
import { refreshPlayerAnalysisAsCoach } from '@/app/golf/actions/insights';
import { createFocusAreaFromInsight } from '@/app/golf/actions/development';

import { ClaimVisual } from './ClaimVisual';
import {
  SEEN_STORAGE_KEY,
  activePlanAreas,
  buildVerdict,
  changedSinceSeen,
  evidenceSignature,
  formatCalendarDate,
  formatHandicap,
  formatPlanValue,
  isFullRound,
  splitClaims,
  type ScoutingClaim,
  type ScoutingFocusArea,
  type ScoutingPlayer,
  type ScoutingRound,
} from './scouting-model';

/* ---------------------------------------------------------------------------
 * Props — a structural subset of what the /game route already builds for
 * FairwayPlayerInsight, so the host can swap with `<ScoutingReport {...insight} />`.
 * Extra keys (compositeRating, categoryBreakdown, …) are ignored on purpose.
 * ------------------------------------------------------------------------- */

export interface ScoutingReportProps {
  player: ScoutingPlayer;
  /** Most recent first (the route sends the last 10). */
  rounds: ScoutingRound[];
  focusAreas: ScoutingFocusArea[];
  themes: ThemeNode[];
  /**
   * Optional pre-fetched CoachHelm insights (ranked best-first, as
   * `getInsightsForCoachWithMeta` returns them). When provided, the component
   * does not fetch on mount. When omitted, it fetches client-side.
   */
  evidenceInsights?: EvidenceInsight[] | null;
}

/** Insights requested. Every one fetched is rendered (exposure contract). */
const FETCH_LIMIT = 6;

type LoadState = 'loading' | 'ready' | 'error';

const planBoardHref = (playerId: string) => `/golf/dashboard/intelligence?view=players&player=${playerId}`;

/* ---------------------------------------------------------------------------
 * Small atoms
 * ------------------------------------------------------------------------- */

function SectionHeading({ id, children, action }: { id: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-4">
      <h2 id={id} className="font-fw-display text-h3 text-text-primary">
        {children}
      </h2>
      {action}
    </div>
  );
}

function EvidenceChangedBadge() {
  return (
    <span
      data-slot="evidence-changed"
      className="inline-flex items-center gap-1.5 font-fw-sans text-caption text-fw-warning-ink"
    >
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-fw-warning" />
      Evidence changed
    </span>
  );
}

function EvidenceLine({ claim }: { claim: ScoutingClaim }) {
  const parts: React.ReactNode[] = [];
  if (claim.comparison) parts.push(`${claim.comparison.name} ${claim.comparison.valueText}`);
  if (claim.secondary && claim.secondary.name !== claim.comparison?.name) {
    parts.push(`${claim.secondary.name} ${claim.secondary.valueText}`);
  }
  parts.push(claim.windowText, claim.sampleText);
  return (
    <p className="font-fw-sans text-body-sm tabular-nums text-text-secondary">
      {claim.valueText ? <span className="font-semibold text-text-primary">{claim.valueText}</span> : null}
      {parts.map((p, i) => (
        <span key={`${claim.id}-ev-${i}`}>
          {i === 0 && !claim.valueText ? '' : ' · '}
          {p}
        </span>
      ))}
    </p>
  );
}

/* ---------------------------------------------------------------------------
 * ScoutingReport
 * ------------------------------------------------------------------------- */

export function ScoutingReport({ player, rounds, focusAreas, themes, evidenceInsights }: ScoutingReportProps) {
  const router = useRouter();
  const golfUser = useGolfUserOptional();
  const coachId = golfUser?.coachId ?? null;

  const firstName = player.first_name?.trim() || 'this player';
  const playerName = `${player.first_name ?? ''} ${player.last_name ?? ''}`.trim() || 'Player';
  const hasRounds = rounds.length > 0;
  const prefetched = evidenceInsights !== undefined && evidenceInsights !== null;

  const [insights, setInsights] = useState<EvidenceInsight[]>(evidenceInsights ?? []);
  const [loadState, setLoadState] = useState<LoadState>(prefetched || !hasRounds ? 'ready' : 'loading');
  const [changedIds, setChangedIds] = useState<Set<string>>(() => new Set());
  const [menuOpen, setMenuOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [, startAssign] = useTransition();

  useEffect(() => {
    if (prefetched) setInsights(evidenceInsights ?? []);
  }, [prefetched, evidenceInsights]);

  const loadInsights = useCallback(async () => {
    if (prefetched || !hasRounds) return;
    if (!coachId) {
      setLoadState('error');
      return;
    }
    setLoadState('loading');
    try {
      const res = await getInsightsForCoachWithMeta(coachId, { player_id: player.id, limit: FETCH_LIMIT });
      if (res.ok) {
        setInsights(res.data);
        setLoadState('ready');
      } else {
        setLoadState('error');
      }
    } catch {
      setLoadState('error');
    }
  }, [prefetched, hasRounds, coachId, player.id]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!cancelled) await loadInsights();
    })();
    return () => {
      cancelled = true;
    };
  }, [loadInsights]);

  // "Evidence changed since you last looked": compare against what this
  // device saw last time, then remember what it sees now. Post-mount only,
  // so the server render never depends on storage.
  useEffect(() => {
    if (loadState !== 'ready' || insights.length === 0) return;
    try {
      const raw = window.localStorage.getItem(SEEN_STORAGE_KEY);
      const seen = (raw ? JSON.parse(raw) : {}) as Record<string, string>;
      setChangedIds(changedSinceSeen(insights, seen));
      const next: Record<string, string> = { ...seen };
      for (const i of insights) next[i.id] = evidenceSignature(i);
      const keys = Object.keys(next);
      if (keys.length > 300) for (const k of keys.slice(0, keys.length - 300)) delete next[k];
      window.localStorage.setItem(SEEN_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Storage blocked (private mode, WKWebView quirk): no badge, no error.
    }
  }, [loadState, insights]);

  const verdict = useMemo(() => buildVerdict(rounds, themes), [rounds, themes]);
  const split = useMemo(() => splitClaims(insights, rounds, focusAreas), [insights, rounds, focusAreas]);
  const planAreas = useMemo(() => activePlanAreas(focusAreas), [focusAreas]);
  const unassigned = split.matters.filter((c) => c.planAreaId === null);

  const latestFull = rounds.find(isFullRound) ?? null;
  const throughDate = formatCalendarDate(latestFull?.round_date ?? rounds[0]?.round_date ?? null);
  const handicap = formatHandicap(player.handicap);
  const metaLine = [
    player.graduation_year ? `Class of ${player.graduation_year}` : null,
    handicap ? `${handicap} handicap` : null,
    hasRounds ? `${verdict.fullRounds} full round${verdict.fullRounds === 1 ? '' : 's'}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  /* ── actions ──────────────────────────────────────────────────────────── */

  const handleRefresh = useCallback(async () => {
    setMenuOpen(false);
    if (refreshing) return;
    setRefreshing(true);
    try {
      const res = await refreshPlayerAnalysisAsCoach(player.id);
      if (res.success) {
        fairwayToast.success(
          typeof res.insightsCreated === 'number' && res.insightsCreated > 0
            ? `Analysis refreshed: ${res.insightsCreated} new finding${res.insightsCreated === 1 ? '' : 's'}`
            : 'Analysis refreshed. Nothing new since the last run.',
        );
        await loadInsights();
        router.refresh();
      } else {
        fairwayToast.danger(res.error ?? 'Refresh failed');
      }
    } catch (err) {
      fairwayToast.danger(err instanceof Error ? err.message : 'Refresh failed');
    } finally {
      setRefreshing(false);
    }
  }, [refreshing, player.id, loadInsights, router]);

  const handlePrint = useCallback(() => {
    setMenuOpen(false);
    // Let the popover unmount before the print snapshot is taken.
    window.setTimeout(() => window.print(), 50);
  }, []);

  const handleAssign = useCallback(
    (claim: ScoutingClaim) => {
      setAssignOpen(false);
      if (!coachId) return;
      const e = claim.insight.evidence;
      const pga =
        e.comparison_source === 'pga_baseline'
          ? e.comparison_value
          : e.secondary_source === 'pga_baseline'
            ? (e.secondary_value ?? null)
            : null;
      const target =
        Number.isFinite(e.your_value) && pga !== null && Number.isFinite(pga)
          ? computeTargetValue({ playerValue: e.your_value, pgaValue: pga })
          : null;
      setAssigningId(claim.id);
      startAssign(async () => {
        try {
          const res = await createFocusAreaFromInsight({
            insight_id: claim.insight.id,
            player_id: player.id,
            coach_id: coachId,
            title: claim.insight.title,
            description: claim.insight.content ?? '',
            insight_type: (claim.insight.category as string | null) ?? 'general',
            target_metric: e.metric,
            current_value: Number.isFinite(e.your_value) ? e.your_value : null,
            target_value: target,
          });
          if (res.success) {
            fairwayToast.success(`Focus assigned: ${claim.insight.title}`);
            router.refresh();
          } else if (res.duplicateFocusAreaId) {
            fairwayToast.danger(res.error ?? 'An active focus on this metric already exists.');
          } else {
            fairwayToast.danger(res.error ?? 'Could not assign the focus');
          }
        } catch (err) {
          fairwayToast.danger(err instanceof Error ? err.message : 'Could not assign the focus');
        } finally {
          setAssigningId(null);
        }
      });
    },
    [coachId, player.id, router],
  );

  /* ── masthead ─────────────────────────────────────────────────────────── */

  const menu = (
    <div className="print:hidden">
      <PopoverPanel
        open={menuOpen}
        onOpenChange={setMenuOpen}
        surface="matte"
        align="end"
        width="sm"
        ariaLabel="Report actions"
        trigger={
          <Button variant="ghost" aria-label="More actions" className="h-11 w-11 px-0">
            <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
          </Button>
        }
      >
        <PopoverPanel.Item onClick={() => { setMenuOpen(false); router.push(`/golf/dashboard/messages?player=${player.id}`); }}>
          Message {firstName}
        </PopoverPanel.Item>
        <PopoverPanel.Item onClick={() => { setMenuOpen(false); router.push(planBoardHref(player.id)); }}>
          Open plan board
        </PopoverPanel.Item>
        <PopoverPanel.Item onClick={handlePrint}>Print or save PDF</PopoverPanel.Item>
        {hasRounds ? (
          <>
            <PopoverPanel.Separator />
            <PopoverPanel.Item onClick={handleRefresh} disabled={refreshing} data-testid="scouting-refresh">
              {refreshing ? 'Refreshing analysis…' : 'Refresh analysis'}
            </PopoverPanel.Item>
          </>
        ) : null}
      </PopoverPanel>
    </div>
  );

  const masthead = (
    <header className="flex flex-col gap-2" data-slot="scouting-masthead">
      <div className="flex items-center justify-between gap-4">
        <p className="font-fw-sans text-body-sm text-text-tertiary">
          Scouting report{throughDate ? ` · through ${throughDate}` : ''}
        </p>
        {menu}
      </div>
      <h1 className="font-fw-display text-h3 text-text-primary">{playerName}</h1>
      <p
        data-slot="scouting-verdict"
        data-tone={verdict.tone}
        className="max-w-[36ch] font-fw-display text-h2 text-text-primary md:text-h1"
      >
        {verdict.sentence}
      </p>
      {metaLine ? <p className="font-fw-sans text-body-sm tabular-nums text-text-tertiary">{metaLine}</p> : null}
    </header>
  );

  /* ── zero-round empty state ───────────────────────────────────────────── */

  if (!hasRounds) {
    return (
      <article data-slot="scouting-report" className="mx-auto flex w-full max-w-[720px] flex-col gap-10 print:max-w-none">
        {masthead}
        <EmptyState
          variant="subtle"
          icon={null}
          title="Nothing to scout yet"
          description={`This report writes itself once ${firstName} logs a full round: a verdict, the three things that matter with their evidence, and a plan.`}
          action={
            <Button asChild variant="primary">
              <Link href={`/golf/dashboard/messages?player=${player.id}`}>Message {firstName}</Link>
            </Button>
          }
        />
      </article>
    );
  }

  /* ── What matters ─────────────────────────────────────────────────────── */

  let mattersBody: React.ReactNode;
  if (loadState === 'loading') {
    mattersBody = (
      <div role="status" aria-busy="true" className="flex flex-col">
        <span className="sr-only">Loading the evidence…</span>
        {[0, 1, 2].map((k) => (
          <div key={`sk-${k}`} className="grid grid-cols-[28px_1fr] gap-x-3 border-t border-border-subtle py-6">
            <Skeleton className="h-6 w-4" />
            <div className="flex flex-col gap-3">
              <Skeleton className="h-5 w-4/5" />
              <Skeleton className="h-10 w-full max-w-[320px]" />
              <Skeleton className="h-4 w-3/5" />
            </div>
          </div>
        ))}
      </div>
    );
  } else if (loadState === 'error') {
    mattersBody = (
      <div className="flex flex-col items-start gap-2 border-t border-border-subtle py-6" data-slot="scouting-load-error">
        <p className="font-fw-sans text-body text-text-primary">Couldn&rsquo;t load the evidence.</p>
        <p className="font-fw-sans text-body-sm text-text-secondary">
          The verdict above comes from {firstName}&rsquo;s rounds. The claims need CoachHelm&rsquo;s findings, which didn&rsquo;t load.
        </p>
        <Button variant="ghost" size="sm" onClick={() => void loadInsights()} className="print:hidden -ml-3 min-h-11">
          Try again
        </Button>
      </div>
    );
  } else if (split.matters.length === 0) {
    mattersBody = (
      <div className="border-t border-border-subtle py-6">
        <p className="font-fw-sans text-body text-text-primary">No finding is strong enough to lead with yet.</p>
        <p className="mt-1 font-fw-sans text-body-sm text-text-secondary">
          {split.watch.length > 0
            ? 'The early signals are on the watch list below. They firm up as more tracked shots come in.'
            : `CoachHelm needs more tracked shots from ${firstName}. Refresh the analysis from the menu after the next round.`}
        </p>
      </div>
    );
  } else {
    mattersBody = (
      <ol className="flex flex-col" data-slot="scouting-claims">
        {split.matters.map((claim, idx) => {
          const changed = claim.evidenceChangedInPlan || changedIds.has(claim.id);
          return (
            <li
              key={claim.id}
              id={`insight-${claim.id}`}
              data-slot="scouting-claim"
              className="grid grid-cols-[28px_1fr] gap-x-3 border-t border-border-subtle py-6 break-inside-avoid"
            >
              <span
                aria-hidden="true"
                className={cn(
                  'font-fw-display text-h3 tabular-nums',
                  idx === 0 ? 'text-text-primary' : 'text-text-tertiary',
                )}
              >
                {idx + 1}
              </span>
              <div className="flex min-w-0 flex-col gap-3">
                <div className="flex flex-col gap-1">
                  {claim.planAreaId || changed || claim.inferred ? (
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      {claim.planAreaId ? (
                        <span className="font-fw-sans text-caption text-accent-700">In plan</span>
                      ) : null}
                      {changed ? <EvidenceChangedBadge /> : null}
                      {claim.inferred ? (
                        <span className="font-fw-sans text-caption text-text-tertiary">Inferred</span>
                      ) : null}
                    </div>
                  ) : null}
                  <h3 className="font-fw-display text-body-lg font-semibold text-text-primary">{claim.title}</h3>
                </div>
                {claim.visual ? <ClaimVisual visual={claim.visual} summary={claim.summary} /> : null}
                <div className="flex flex-col gap-1">
                  <EvidenceLine claim={claim} />
                  <p className="font-fw-sans text-caption tabular-nums text-text-tertiary" data-slot="claim-read">
                    {[claim.qualityLabel, claim.weightText, claim.movementText].filter(Boolean).join(' · ')}
                  </p>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    );
  }

  /* ── Plan ─────────────────────────────────────────────────────────────── */

  const assignControl =
    coachId && unassigned.length > 0 ? (
      <div className="print:hidden">
        <PopoverPanel
          open={assignOpen}
          onOpenChange={setAssignOpen}
          surface="matte"
          align="end"
          width="lg"
          ariaLabel="Assign a focus"
          trigger={
            <Button variant="primary" busy={assigningId !== null} data-slot="scouting-primary">
              Assign focus
            </Button>
          }
        >
          {unassigned.map((c) => (
            <PopoverPanel.Item key={`assign-${c.id}`} onClick={() => handleAssign(c)} className="flex-col items-start gap-0.5">
              <span className="font-fw-sans text-body text-text-primary">{c.title}</span>
              {c.valueText && c.comparison ? (
                <span className="font-fw-sans text-caption tabular-nums text-text-tertiary">
                  {c.valueText} · {c.comparison.name} {c.comparison.valueText}
                </span>
              ) : null}
            </PopoverPanel.Item>
          ))}
          <PopoverPanel.Separator />
          <PopoverPanel.Item onClick={() => { setAssignOpen(false); router.push(planBoardHref(player.id)); }}>
            Set one up on the plan board
          </PopoverPanel.Item>
        </PopoverPanel>
      </div>
    ) : (
      <div className="print:hidden">
        <Button asChild variant="primary" data-slot="scouting-primary">
          <Link href={planBoardHref(player.id)}>Assign focus</Link>
        </Button>
      </div>
    );

  const planBody =
    planAreas.length === 0 ? (
      <p className="border-t border-border-subtle py-6 font-fw-sans text-body-sm text-text-secondary">
        No focus assigned yet. Pick one of the three findings above to start the plan.
      </p>
    ) : (
      <ul className="flex flex-col" data-slot="scouting-plan">
        {planAreas.map((fa) => {
          const metricLabel = formatTargetMetricLabel(fa.target_metric);
          const progress = getProgressPercent(fa.current_value, fa.target_value, fa.target_metric, fa.baseline_value);
          const fmt = (v: number | null) => (v === null ? null : formatPlanValue(v, fa.target_metric));
          const baseline = fmt(fa.baseline_value);
          const current = fmt(fa.current_value);
          const target = fmt(fa.target_value);
          const path = [baseline, current].filter(Boolean).join(' → ');
          return (
            <li key={fa.id} className="flex flex-col gap-2 border-t border-border-subtle py-4 break-inside-avoid">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-fw-sans text-body font-semibold text-text-primary">{fa.title ?? 'Focus area'}</p>
                  {metricLabel || fa.status === 'proposed' ? (
                    <p className="font-fw-sans text-caption text-text-tertiary">
                      {[fa.status === 'proposed' ? 'Proposed' : null, metricLabel].filter(Boolean).join(' · ')}
                    </p>
                  ) : null}
                </div>
                {path ? (
                  <p className="shrink-0 font-fw-sans text-body tabular-nums text-text-primary">{path}</p>
                ) : null}
              </div>
              {progress !== null ? (
                <div className="relative h-1 w-full rounded-full bg-surface-sunken" aria-hidden="true">
                  <div className="absolute inset-y-0 left-0 rounded-full bg-accent-500" style={{ width: `${progress}%` }} />
                  <div className="absolute -top-1 right-0 h-3 w-px bg-text-primary" />
                </div>
              ) : null}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <p className="font-fw-sans text-caption tabular-nums text-text-tertiary">
                  {[
                    target ? `Target ${target}` : 'No target set',
                    progress !== null ? `${progress === 100 ? 'reached' : `${progress}% of the way`}` : baseline ? null : 'baseline not captured',
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
                {fa.evidence_revision_status === 'changed' ? <EvidenceChangedBadge /> : null}
              </div>
            </li>
          );
        })}
      </ul>
    );

  /* ── Watch list + also noted ──────────────────────────────────────────── */

  const watch = loadState === 'ready' ? split.watch : [];
  const alsoNoted = loadState === 'ready' ? split.alsoNoted : [];

  return (
    <article
      data-slot="scouting-report"
      aria-label={`Scouting report for ${playerName}`}
      className="mx-auto flex w-full max-w-[720px] flex-col gap-10 print:max-w-none print:gap-6"
    >
      {masthead}

      <section aria-labelledby="scouting-matters" className="flex flex-col gap-2">
        <SectionHeading id="scouting-matters">What matters</SectionHeading>
        {mattersBody}
        {alsoNoted.length > 0 ? (
          <div className="border-t border-border-subtle pt-4" data-slot="scouting-also-noted">
            <p className="font-fw-sans text-body-sm text-text-tertiary">Also noted</p>
            <ul className="mt-2 flex flex-col gap-2">
              {alsoNoted.map((c) => (
                <li key={`also-${c.id}`} id={`insight-${c.id}`} className="flex flex-col">
                  <span className="font-fw-sans text-body text-text-primary">{c.title}</span>
                  <span className="font-fw-sans text-caption tabular-nums text-text-tertiary">
                    {[c.valueText, c.comparison ? `${c.comparison.name} ${c.comparison.valueText}` : null, c.qualityLabel]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      <section aria-labelledby="scouting-plan" className="flex flex-col gap-2 break-inside-avoid">
        <SectionHeading id="scouting-plan" action={assignControl}>
          Plan
        </SectionHeading>
        {planBody}
      </section>

      {watch.length > 0 ? (
        <section aria-labelledby="scouting-watch" className="flex flex-col gap-2">
          <SectionHeading id="scouting-watch">Watch list</SectionHeading>
          <ul className="flex flex-col" data-slot="scouting-watch">
            {watch.map((c) => (
              <li
                key={`watch-${c.id}`}
                id={`insight-${c.id}`}
                data-ghosted="true"
                className="flex flex-col gap-1 border-t border-dashed border-border-subtle py-4 opacity-70 break-inside-avoid"
              >
                <span className="font-fw-sans text-body text-text-secondary">{c.title}</span>
                <span className="font-fw-sans text-caption tabular-nums text-text-tertiary">
                  {[
                    c.quality === 'thin'
                      ? `Early read · n=${c.insight.evidence.sample_n}`
                      : `No measurable gap · n=${c.insight.evidence.sample_n}`,
                    c.windowText,
                  ].join(' · ')}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <nav aria-label="Go deeper" className="flex flex-col print:hidden">
        {[
          { href: `/golf/dashboard/players/${player.id}/game`, title: 'Game Fingerprint', sub: 'Where the strokes go, by category' },
          { href: `/golf/dashboard/players/${player.id}/genome`, title: 'Genome', sub: 'Skill profile against the team and Tour' },
        ].map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="flex min-h-11 items-center justify-between gap-4 border-t border-border-subtle py-3 transition-colors duration-fast active:bg-surface-sunken"
          >
            <span className="flex flex-col">
              <span className="font-fw-sans text-body text-text-primary">{l.title}</span>
              <span className="font-fw-sans text-caption text-text-tertiary">{l.sub}</span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-text-tertiary" aria-hidden="true" />
          </Link>
        ))}
      </nav>
    </article>
  );
}

export default ScoutingReport;
