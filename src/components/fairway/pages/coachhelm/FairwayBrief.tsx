'use client';

/**
 * ============================================================================
 * Fairway · CoachHelm · FairwayBrief  (ADDITIVE · FLAG-GATED · PRESENTATION ONLY)
 * ----------------------------------------------------------------------------
 * The TEAM BRIEF — the "Work on this first" front door of the unified CoachHelm
 * shell, mounted over /golf/dashboard/intelligence. It is organised around the
 * coach's real question on a field day — "what do we drill this week?" — not a
 * grid of equal KPI cards.
 *
 * ── THE READ (coach workflow: WHAT to work on → WHO's dragging → pulse → detail)
 *   HERO (focal) — a single "Work on this first" panel that NAMES the team's
 *     weakest area in plain words (the lowest of the five 0–100 category
 *     ratings), shows that rating as a supporting Fragment-Mono number + a
 *     mid-line chip, frames the toughest yardage band as muted evidence (a flat
 *     Ribbon, or — when the chart is starved — the category bar strip so the
 *     right column never collapses to whitespace), and gives ONE green action
 *     into that category's Signals. A foot strip names up to three flagged
 *     players "dragging" it (or falls back to the category's lead insight).
 *   OTHER AREAS — the remaining four categories as a worst-first inline bar
 *     strip, each a Link into its Signals filter.
 *   TEAM PULSE — the old twin-number hero, DEMOTED to one slim reference line
 *     (composite + health + meta). It answers "how are we doing", not "what to
 *     work on", so it sits below the directive.
 *   CATEGORY DETAIL — per-category health rows (one evidence insight each) that
 *     LINK into Signals.
 *
 * ── HONESTY ────────────────────────────────────────────────────────────────
 * The stats action returns a fabricated 50-across when the cache is empty
 * (statsRowCount === 0). The entire LIVE hero + pulse are gated on
 * hasTeamStats; starved → a dim "awaiting — N of M" instrument, NEVER a named
 * weakness at 50. No roster → an EmptyState. No deadZones → the band sentence
 * is dropped (no invented band). Effectiveness / schedule / qualifying are NOT
 * in this route's data contract and are never fabricated here.
 *
 * ── PRESERVED LOGIC (imported + consumed UNCHANGED) ─────────────────────────
 * Brief accepts the EXACT props the intelligence route fetches above its fork
 * (`getTeamOverview` + `getTeamCategoryInsights`) and reuses every value
 * unchanged. NO data fetching, server action, mutation, genome compute, or
 * prediction pipeline is defined or altered here. The lazy V2 engine
 * (`IntelligenceCommandCenter`) is imported UNCHANGED — only its chrome is
 * re-framed (demoted into the collapsed disclosure).
 *
 * ADDITIVE + GATED — consumed only behind the isRedesignEnabled() fork.
 * ========================================================================== */

import { Suspense, lazy, useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  CoachHelmShell,
  type CoachHelmShellProps,
} from './index';
import {
  Badge,
  InstrumentPanel,
  Readout,
  Ribbon,
  Button,
  EmptyState,
  SkeletonCard,
  InlineNotice,
  type RibbonPoint,
} from '@/components/fairway';
import {
  IconArrowRight,
  IconChevronDown,
  IconChevronRight,
  IconBrain,
  IconTrendingUp,
  IconTrendingDown,
  IconActivity,
  IconSettings,
} from '@/components/icons';
import { Flag as LucideFlag } from 'lucide-react';
import type {
  TeamOverviewResult,
  TeamCategoryInsightsResult,
  TeamCategory,
  CategoryInsight,
  PlayerCategoryStat,
} from '@/app/golf/actions/team-category-insights';
import {
  FairwayAspectDrillDown,
  type AspectDrillDownTarget,
} from './FairwayAspectDrillDown';

/* ──────────────────────────────────────────────────────────────────────────
 * PRESERVED ENGINE — the V2 deep-analysis command center, imported UNCHANGED.
 * Lazy so it streams under Suspense in the demoted "Deep analysis" section and
 * never blocks the brief first paint. Engine + handlers untouched.
 * ────────────────────────────────────────────────────────────────────────── */
const IntelligenceCommandCenter = lazy(() =>
  import('@/components/golf/coachhelm/v2').then((m) => ({
    default: m.IntelligenceCommandCenter,
  })),
);

/* ──────────────────────────────────────────────────────────────────────────
 * Props — the route fetches these above the fork and passes them straight in.
 * Identical data contract to the existing intelligence/page.tsx.
 * ────────────────────────────────────────────────────────────────────────── */

export interface FairwayBriefProps {
  /** From getTeamOverview(teamId) — team composite, categories, shot analysis. */
  overview: TeamOverviewResult;
  /** From getTeamCategoryInsights(teamId) — per-category health + insights. */
  categoryInsights: TeamCategoryInsightsResult;
  /** Resolved org→team id (shared lookup, passed for the preserved engine). */
  teamId: string;
  /** The coach id (passed straight to the preserved engine). */
  coachId: string;
  /**
   * Unread urgent/high open-signal count (getAlertCounts) — forwarded to the
   * shell's Signals badge. null/0 → no badge (honest, never "0").
   */
  signalCount?: number | null;
  /** Optional shell overrides (title/eyebrow/breadcrumbs/actions). */
  shell?: Partial<Pick<CoachHelmShellProps, 'title' | 'eyebrow' | 'breadcrumbs'>>;
}

/* ──────────────────────────────────────────────────────────────────────────
 * Category → label / headline phrase / Signals-link presentation map.
 * PRESENTATION ONLY — ratings come from getTeamOverview's `teamCategories`
 * (0–100) and the per-category health from getTeamCategoryInsights. We only
 * choose how to LABEL each category and which Signals filter it links to.
 * `ratingKey` joins to teamCategories; `categoryId` joins to the insights
 * payload AND is the Signals deep-link target — reused VERBATIM so the hero's
 * primary action lands on the correct filter.
 * ────────────────────────────────────────────────────────────────────────── */

interface CatPresentation {
  ratingKey: 'teeGame' | 'approach' | 'shortGame' | 'putting' | 'scoring';
  categoryId: string;
  /** compact tile label */
  label: string;
  /** fuller phrase for the directive headline */
  long: string;
}

const CATEGORY_ROW: CatPresentation[] = [
  { ratingKey: 'teeGame', categoryId: 'driving', label: 'Driving', long: 'Driving' },
  { ratingKey: 'approach', categoryId: 'approach', label: 'Approach', long: 'Approach play' },
  { ratingKey: 'shortGame', categoryId: 'short_game', label: 'Short', long: 'Short game' },
  { ratingKey: 'putting', categoryId: 'putting', label: 'Putting', long: 'Putting' },
  { ratingKey: 'scoring', categoryId: 'scoring', label: 'Scoring', long: 'Scoring' },
];

/** Map a category's aggregate insight tone to the row priority accent. */
function categoryPriority(cat: TeamCategory): 'high' | 'medium' | 'low' {
  if (cat.attentionCount > 0 || cat.trend === 'declining') return 'high';
  if (cat.trend === 'improving') return 'low';
  return 'medium';
}

/**
 * One-word-ish plain-English status for a category (reused by the bar strip
 * and the strengths/weaknesses rows). Blends the canonical TREND with the
 * category's RATING so the two never read as contradictory: a category can
 * legitimately be both weak (rating < 50, "needs the most work") AND
 * improving (trend momentum) at the same time — those are different
 * questions ("how good is it right now" vs "which way is it moving"). Rather
 * than a bare green "Trending up" sitting right under a hero that just named
 * this category the team's weakest, a below-mid-line category that's
 * improving reads as "Weak, improving" — still a green accent (the movement
 * IS good news), just not claiming the category is doing well overall.
 */
function statusTag(
  trend: 'improving' | 'stable' | 'declining' | undefined,
  attentionCount: number,
  rating?: number,
): { label: string; className: string } {
  if (attentionCount > 0)
    return { label: `${attentionCount} to watch`, className: 'text-fw-warning' };
  const isWeak = rating != null && rating < 50;
  if (trend === 'improving') {
    return isWeak
      ? { label: 'Weak, improving', className: 'text-fw-success' }
      : { label: 'Trending up', className: 'text-fw-success' };
  }
  if (trend === 'declining') return { label: 'Trending down', className: 'text-text-tertiary' };
  return { label: 'Steady', className: 'text-text-tertiary' };
}

/** Word for a player's own trend in the foot strip. */
function playerTrendWord(trend: 'improving' | 'stable' | 'declining'): string {
  return trend === 'improving' ? 'trending up' : trend === 'declining' ? 'trending down' : 'steady';
}

/**
 * Categories whose "toughest yardage band" evidence is genuinely sourced from
 * the full-swing (non-green-lie) shot curve — `teamShotAnalysis.deadZones`
 * excludes every putt (`buildYardageCurve` skips `lieBefore === 'green'`
 * entirely), so a yardage-band sentence only ever describes driving/approach/
 * short-game shots. Putting and Scoring have no yardage-band representation
 * at all; citing the yardage sentence under either is a wrong-category detail
 * (#946 — "Toughest from 275–300 yds" appearing under Putting · 20/100).
 */
const YARDAGE_BAND_CATEGORY_IDS = new Set(['driving', 'approach', 'short_game']);
export function isYardageBandCategory(categoryId: string): boolean {
  return YARDAGE_BAND_CATEGORY_IDS.has(categoryId);
}

/** The hero's headline support sentence — presentation-only text, chosen. */
export interface HeroSupportDetail {
  kind: 'yardage-band' | 'lead-insight' | 'none';
  text: string | null;
}

/**
 * Picks the ONE supporting-evidence sentence under the hero headline,
 * constrained to the SAME category the headline just named. The yardage-band
 * `worstZone` sentence is only ever true for driving/approach/short-game (see
 * `isYardageBandCategory`); for putting/scoring it falls back to that
 * category's OWN lead insight (from `getTeamCategoryInsights`, already filed
 * under the correct category id), and drops to nothing rather than invent a
 * detail — matching this file's existing "no deadZones → drop the band
 * sentence" honesty doctrine.
 */
export function selectHeroSupportDetail(
  categoryId: string,
  worstZone: { rangeStart: number; rangeEnd: number; deficit: number } | null,
  leadInsight: CategoryInsight | null,
): HeroSupportDetail {
  if (isYardageBandCategory(categoryId) && worstZone) {
    return {
      kind: 'yardage-band',
      text: `Toughest from ${worstZone.rangeStart}–${worstZone.rangeEnd} yds — about ${Math.abs(worstZone.deficit).toFixed(2)} of a stroke behind par there.`,
    };
  }
  if (!isYardageBandCategory(categoryId) && leadInsight) {
    return { kind: 'lead-insight', text: leadInsight.message };
  }
  return { kind: 'none', text: null };
}

/**
 * The foot-strip section label naming who's "dragging" the weakest category.
 * `needsAttention` flags a player on absolute standing, not direction — a
 * player can be BOTH flagged AND improving (weak but trending up). Blanket-
 * labeling that group "Dragging putting" misrepresents an improving player as
 * a drag (#946). A uniform group keeps the single-word label (still honest);
 * a mixed group splits it so nobody's direction is misstated.
 */
export function footStripLabel(categoryLabel: string, players: PlayerCategoryStat[]): string {
  const improving = players.filter((p) => p.trend === 'improving').length;
  const notImproving = players.length - improving;
  if (players.length === 0 || improving === 0) return `Dragging ${categoryLabel}`;
  if (notImproving === 0) return `Improving ${categoryLabel}`;
  return `${notImproving} dragging ${categoryLabel} · ${improving} improving`;
}

/** Signals deep-link for a category. The team-category taxonomy calls the tee
 *  game 'driving'; evidence insights file it under 'tee' — alias at this single
 *  emit point so the deep-link lands on the right filter (the other four match). */
function signalsHref(categoryId: string): string {
  const token = categoryId === 'driving' ? 'tee' : categoryId;
  return `/golf/dashboard/insights?category=${encodeURIComponent(token)}`;
}

/**
 * `dateOnly` is `getTeamCategoryInsights`'s `lastAnalyzed` — a plain
 * 'YYYY-MM-DD' calendar date sourced from `golf_rounds.round_date` (a DATE
 * column, no time-of-day component). Format it as a DATE ONLY.
 *
 * 2026-07-17 — #920 (fake timestamp): this used to be `new Date(iso)` +
 * `toLocaleString(..., { hour, minute })`, which (a) parsed the date-only
 * string as UTC MIDNIGHT then localized it to the viewer's timezone,
 * fabricating a specific clock time ("Jun 8, 8:00 PM") the round never had,
 * and (b) for viewers west of UTC, silently shifted the calendar date itself
 * back a day. Anchoring BOTH the parse and the format in UTC (never the
 * viewer's local zone) means every viewer sees the SAME calendar day — the
 * correct behavior for a value that has no time-of-day or timezone to begin
 * with — and keeps this deterministic across SSR/hydration (no LocalTime
 * needed; there's no real instant here to localize).
 *
 * Exported (not just used internally) so the date-only/no-timezone-shift/
 * no-fabricated-time contract has a direct unit test — see
 * src/components/fairway/pages/coachhelm/FairwayBrief.formatAnalyzed.test.ts.
 */
export function formatAnalyzed(dateOnly: string): string {
  const d = new Date(`${dateOnly}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/** Strokes-gained value formatter (signed, 2dp) — no raw fractions. */
function fmtSG(v: number): string {
  return v > 0 ? `+${v.toFixed(2)}` : v.toFixed(2);
}

/**
 * Plausibility band for a per-round TEAM strokes-gained-vs-par number.
 * A real per-round category/band SG sits within roughly ±5; |value| > ~10 is
 * physically impossible and means the loader fed cumulative/season SG into a
 * per-round benchmark (e.g. sg_putting avg −37.11, which even mis-names the
 * team's best putter as worst). PRESENTATION-ONLY guard — we don't fix the
 * loader, we only refuse to assert an authoritative weakness off such
 * uncalibrated inputs.
 *
 * NOTE: this band applies ONLY to true strokes-gained numbers (the
 * shot-analysis avgSG / dead-zone deficit, i.e. the Ribbon's "Strokes vs
 * par"). The category teamAvg / player value carry percentages and counts
 * (fairway %, GIR %, putts-per-round ≈ 30) that legitimately exceed 10, so
 * they are deliberately NOT range-checked here — doing so would false-trip on
 * a perfectly healthy team. A non-finite value is treated as "no SG signal"
 * (not a violation).
 */
const SG_PER_ROUND_PLAUSIBLE_MAX = 10;
function isImplausibleSG(v: number | null | undefined): boolean {
  return typeof v === 'number' && Number.isFinite(v) && Math.abs(v) > SG_PER_ROUND_PLAUSIBLE_MAX;
}

/** A ranked category row, joined across overview ratings + insight health. */
interface RankedCategory extends CatPresentation {
  rating: number;
  cat?: TeamCategory;
}

/** Flatten a ranked category into the drill-down's presentation-ready target.
 *  Strength vs weakness is the same 50 mid-line the hero already speaks in. */
function toAspect(r: RankedCategory): AspectDrillDownTarget {
  return {
    categoryId: r.categoryId,
    label: r.label,
    long: r.long,
    rating: r.rating,
    kind: r.rating >= 50 ? 'strength' : 'weakness',
    players: r.cat?.players ?? [],
    primaryMetric: r.cat?.primaryMetric,
  };
}

/* ──────────────────────────────────────────────────────────────────────────
 * Component
 * ────────────────────────────────────────────────────────────────────────── */

export function FairwayBrief({
  overview,
  categoryInsights,
  teamId,
  coachId,
  signalCount,
  shell,
}: FairwayBriefProps) {
  // Deep-analysis is DEMOTED + collapsed by default (glance vs deep-dive split).
  const [deepOpen, setDeepOpen] = useState(false);
  // The aspect drill-down (team strengths/weaknesses → goals / plans / calendar).
  const [activeAspect, setActiveAspect] = useState<AspectDrillDownTarget | null>(null);

  // ── Cross-user freshness ────────────────────────────────────────────────
  // The Brief reads live, fresh DB, but ROUNDS are logged by PLAYERS, not the
  // coach — so a player's submit revalidates the player's cache, never the
  // coach's. The coach's RSC payload then sits frozen in the client Router
  // Cache until a hard reload. Re-fetch when the coach returns to the tab
  // (focus / visibility) so "this week" reflects rounds logged since they left.
  // Debounced so a quick alt-tab doesn't spam refreshes.
  const router = useRouter();
  useEffect(() => {
    let last = 0;
    const refresh = () => {
      if (document.visibilityState !== 'visible') return;
      const now = Date.now();
      if (now - last < 5000) return;
      last = now;
      router.refresh();
    };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [router]);

  const ov = overview.success ? overview.data : undefined;
  const ci = categoryInsights.success ? categoryInsights.data : undefined;

  // ── Honesty gate: the stats cache is empty → the composite/category ratings
  //    are a fabricated 50-across (the action returns that when no rows). Show
  //    the dim awaiting instrument, NEVER the authoritative 50.
  const statsRows = ov?.statsRowCount ?? 0;
  const playerCount = ov?.playerCount ?? 0;
  const hasTeamStats = statsRows > 0;
  const needSamples = Math.max(1, Math.min(playerCount || 1, 3));

  const teamHealth = ci?.teamHealth ?? null;
  const composite = ov?.teamComposite ?? null;
  const lastAnalyzed = ci?.lastAnalyzed ? formatAnalyzed(ci.lastAnalyzed) : '';
  const categories = ci?.categories ?? [];

  const catById = new Map<string, TeamCategory>();
  for (const c of categories) catById.set(c.id, c);

  // ── Rank the five categories worst-first (only when stats are real). The
  //    weakest is promoted into the hero; the rest become the bar strip. The
  //    weakest pick is deterministic (lowest rating; array order breaks ties),
  //    and NEVER derived from deadZones.
  const tc = ov?.teamCategories;
  const ranked: RankedCategory[] =
    hasTeamStats && tc
      ? CATEGORY_ROW.map((c) => ({
          ...c,
          rating: Math.round(tc[c.ratingKey]),
          cat: catById.get(c.categoryId),
        })).sort((a, b) => a.rating - b.rating)
      : [];
  const weakest = ranked[0] ?? null;

  // Category id → 0–100 rating, so the "Category detail" cards below can
  // blend rating + trend the same way the hero/strip do (statusTag) instead
  // of a bare trend-only headline that can read as contradicting the hero.
  const ratingByCategoryId = new Map<string, number>(ranked.map((r) => [r.categoryId, r.rating]));

  // ── Strengths vs weaknesses split — partitioned at the 50 mid-line (the same
  //    line the hero speaks in). `ranked` is worst-first; weaknesses keep that
  //    order, strengths read best-first. Each row opens the rich aspect panel.
  const weaknesses = ranked.filter((r) => r.rating < 50);
  const strengths = [...ranked].filter((r) => r.rating >= 50).reverse();

  // ── Hero evidence: avg strokes-gained vs par by yardage band (the Ribbon),
  //    and the toughest band sentence (largest-deficit dead zone). Honest empty.
  const curve = ov?.teamShotAnalysis.yardageCurve ?? [];
  const ribbonPoints: RibbonPoint[] = curve.map((b) => ({
    x: `${b.rangeStart}-${b.rangeEnd}y`,
    y: b.avgSG,
  }));
  const deadZones = ov?.teamShotAnalysis.deadZones ?? [];
  const worstZone = deadZones.length
    ? [...deadZones].sort((a, b) => b.deficit - a.deficit)[0] ?? null
    : null;

  // ── Hero foot strip: up to 3 flagged players in the weakest category.
  const flaggedPlayers: PlayerCategoryStat[] = weakest?.cat
    ? weakest.cat.players.filter((p) => p.needsAttention).slice(0, 3)
    : [];
  const weakestLeadInsight = weakest?.cat?.insights[0] ?? null;

  // ── Honesty guard #2: the per-round strokes-gained-vs-par numbers (the
  //    shot-analysis avgSG / dead-zone deficit that feed the Ribbon and the
  //    "worst category" read) can come back with impossible magnitudes when the
  //    loader feeds cumulative/season SG into a per-round benchmark — e.g.
  //    −37.11, which even names the team's BEST putter as worst. When ANY of
  //    those true-SG numbers is out of the plausible per-round band the
  //    worst-category read is uncalibrated, so we dim the focal hero to the
  //    EXISTING "awaiting" instrument and hedge the foot strip rather than
  //    assert an authoritative weakness. PRESENTATION-ONLY; loader untouched.
  const sgVsParSamples: number[] = [
    ...curve.map((b) => b.avgSG),
    ...deadZones.map((z) => z.deficit),
  ];
  const isSgCalibrated = !sgVsParSamples.some((v) => isImplausibleSG(v));

  // DISTINCT players needing attention across categories — NOT a sum of each
  // category's attentionCount. A player can be flagged in 2+ categories (e.g.
  // below-average in both putting AND approach), and summing counted them
  // once per category, so "N need attention" could exceed the roster size
  // (observed live: "8 need attention" on a 7-player team). Union the
  // flagged player ids so the count is honestly bounded by playerCount.
  const attentionPlayerIds = new Set<string>();
  for (const c of categories) {
    for (const p of c.players) {
      if (p.needsAttention) attentionPlayerIds.add(p.playerId);
    }
  }
  const totalAttention = attentionPlayerIds.size;

  /* -- masthead action cluster: NO primary here — the one green primary lives
        in the hero ("Work on {category}"). The old "Players"/"Ask CoachHelm"
        buttons duplicated the top tab strip (Players + Ask tabs), so they're
        dropped; only the single, non-duplicative settings affordance remains. -- */
  const actions = (
    <Button variant="secondary" size="sm" asChild>
      <Link href="/golf/dashboard/settings/coaching-intelligence" aria-label="Coaching intelligence settings">
        <IconSettings size={16} />
        <span>Settings</span>
      </Link>
    </Button>
  );

  return (
    <CoachHelmShell
      active="brief"
      // eslint-disable-next-line jsx-a11y/aria-role
      role="coach"
      signalCount={signalCount}
      title={shell?.title ?? 'Team Brief'}
      eyebrow={shell?.eyebrow}
      description="What to work on first, who's dragging it, and where each signal leads."
      breadcrumbs={shell?.breadcrumbs}
      actions={actions}
    >
      <div className="flex flex-col gap-8">
        {/* Load failures degrade independently — they never blank the hero. */}
        {!overview.success ? (
          <InlineNotice tone="warning" title="Couldn’t refresh the team read">
            {overview.error ||
              'Make sure your team has players with round data, then refresh.'}
          </InlineNotice>
        ) : null}
        {!categoryInsights.success ? (
          <InlineNotice tone="warning" title="Couldn’t load team intelligence">
            {categoryInsights.error ||
              'Make sure your team has players with round data, then refresh.'}
          </InlineNotice>
        ) : null}

        {/* ── 1 · WORK-ON-THIS-FIRST HERO ─────────────────────────────────── */}
        {playerCount === 0 ? (
          <InstrumentPanel depth="raised" padding="lg" as="section" header="Work on this first">
            <EmptyState
              variant="subtle"
              icon={LucideFlag}
              title="No active players yet"
              description="Invite players and log rounds — CoachHelm names what to work on as the stats cache builds."
              action={
                <Button variant="secondary" size="sm" asChild>
                  <Link href="/golf/dashboard/development">Open Players</Link>
                </Button>
              }
            />
          </InstrumentPanel>
        ) : !hasTeamStats || !weakest || !isSgCalibrated ? (
          <InstrumentPanel
            depth="raised"
            padding="lg"
            as="section"
            header="Work on this first"
            className="flex flex-col items-start gap-4"
          >
            <Readout
              state="awaiting"
              size="md"
              samples={hasTeamStats && weakest ? undefined : { have: statsRows, need: needSamples }}
              awaitingLabel={
                hasTeamStats && weakest
                  ? 'Calibrating strokes-gained'
                  : 'Awaiting players with stats'
              }
              label="Team read"
            />
            <p className="font-fw-sans text-body-sm text-text-secondary">
              {hasTeamStats && weakest
                ? 'Strokes-gained is still calibrating for this team — we’ll name what to work on once the per-round numbers settle into range.'
                : 'We’ll name what to work on once players log rounds — the cache needs a few scored rounds first.'}
            </p>
            <Button variant="secondary" size="sm" asChild>
              <Link href="/golf/dashboard/development">Open Players</Link>
            </Button>
          </InstrumentPanel>
        ) : (
          <WorkOnThisHero
            weakest={weakest}
            ribbonPoints={ribbonPoints}
            allRanked={ranked}
            worstZone={worstZone}
            flaggedPlayers={flaggedPlayers}
            leadInsight={weakestLeadInsight}
            sgCalibrated={isSgCalibrated}
          />
        )}

        {/* ── 2 · STRENGTHS & WEAKNESSES — clickable split into the aspect panel ─ */}
        {hasTeamStats && ranked.length > 0 ? (
          <section aria-label="Team strengths and weaknesses" className="flex flex-col gap-3">
            <SectionHeading
              title="Strengths & weaknesses"
              hint={isSgCalibrated ? 'Tap an area to plan goals, drills & practice' : 'Benchmark ratings — strokes-gained still calibrating'}
            />
            <div className="grid gap-4 md:grid-cols-2">
              <AspectColumn
                title="Strengths"
                tone="success"
                rows={strengths}
                emptyHint="No area is above the mid-line yet."
                onOpen={(r) => setActiveAspect(toAspect(r))}
              />
              <AspectColumn
                title="Needs work"
                tone="warning"
                rows={weaknesses}
                emptyHint="Nothing sits below the mid-line — well balanced."
                onOpen={(r) => setActiveAspect(toAspect(r))}
              />
            </div>
          </section>
        ) : null}

        {/* ── 3 · TEAM PULSE — demoted reference line (was the twin-number hero) ─ */}
        {hasTeamStats ? (
          <PulseStrip
            composite={composite}
            teamHealth={teamHealth}
            playerCount={playerCount}
            lastAnalyzed={lastAnalyzed}
            attention={totalAttention}
          />
        ) : null}

        {/* ── 4 · CATEGORY DETAIL — health rows that LINK into Signals ──────── */}
        <section aria-label="Category detail" className="flex flex-col gap-3">
          <SectionHeading title="Category detail" hint="Each routes into Signals" />
          {categories.length > 0 && playerCount > 0 ? (
            <div className="flex flex-col gap-3">
              {categories.map((cat) => (
                <CategoryHealthRow key={cat.id} cat={cat} rating={ratingByCategoryId.get(cat.id)} />
              ))}
            </div>
          ) : (
            <InstrumentPanel depth="base" padding="md">
              <EmptyState
                variant="subtle"
                icon={LucideFlag}
                title="No category signals yet"
                description="Make sure your team has players with round data — CoachHelm surfaces category health as activity builds."
                action={
                  <Button variant="secondary" size="sm" asChild>
                    <Link href="/golf/dashboard/development">Open Players</Link>
                  </Button>
                }
              />
            </InstrumentPanel>
          )}
        </section>

        {/* ── 5 · DEEP ANALYSIS — DEMOTED, collapsed disclosure (engine preserved) ─ */}
        <section aria-label="Deep analysis" className="flex flex-col gap-3">
          {/* eslint-disable-next-line helm/no-raw-button */}
          <button
            type="button"
            aria-expanded={deepOpen}
            aria-controls="brief-deep-analysis"
            onClick={() => setDeepOpen((v) => !v)}
            className={cn(
              'group flex w-full items-center justify-between gap-3 rounded-card',
              'bg-surface border border-border-subtle p-5 text-left',
              'transition-[box-shadow,transform,border-color] duration-fast ease-soft',
              'hover:shadow-soft hover:-translate-y-px hover:border-transparent active:translate-y-[0.5px]',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
            )}
          >
            <span className="flex items-center gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-fw-md bg-surface-sunken text-text-secondary">
                <IconBrain size={18} />
              </span>
              <span className="flex flex-col">
                <span className="font-fw-sans text-h3 font-semibold text-text-primary">
                  Deep analysis
                </span>
                <span className="font-fw-sans text-caption text-text-tertiary">
                  Full intelligence command center — insights, patterns and predictions.
                </span>
              </span>
            </span>
            <IconChevronDown
              size={20}
              className={cn(
                'shrink-0 text-text-tertiary transition-transform duration-medium ease-soft motion-reduce:transition-none',
                deepOpen && 'rotate-180',
              )}
              aria-hidden
            />
          </button>

          {deepOpen ? (
            <div id="brief-deep-analysis">
              <Suspense fallback={<DeepAnalysisSkeleton />}>
                <IntelligenceCommandCenter
                  teamId={teamId}
                  coachId={coachId}
                  variant="widget"
                />
              </Suspense>
            </div>
          ) : null}
        </section>
      </div>

      {/* Aspect drill-down — team strengths/weaknesses → goals, plans, calendar. */}
      <FairwayAspectDrillDown
        open={activeAspect !== null}
        onOpenChange={(o) => {
          if (!o) setActiveAspect(null);
        }}
        aspect={activeAspect}
        teamId={teamId}
      />
    </CoachHelmShell>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
 * WORK-ON-THIS-FIRST HERO — the directive focal. The h3 SENTENCE is the focal;
 * the /100 number is a supporting chip; the Ribbon is muted evidence (or the
 * bar strip when the chart is starved). A foot strip names who's dragging it.
 * ══════════════════════════════════════════════════════════════════════════ */
function WorkOnThisHero({
  weakest,
  ribbonPoints,
  allRanked,
  worstZone,
  flaggedPlayers,
  leadInsight,
  sgCalibrated,
}: {
  weakest: RankedCategory;
  ribbonPoints: RibbonPoint[];
  allRanked: RankedCategory[];
  worstZone: { rangeStart: number; rangeEnd: number; deficit: number } | null;
  flaggedPlayers: PlayerCategoryStat[];
  leadInsight: CategoryInsight | null;
  /**
   * Whether the per-round SG category inputs are in a plausible band. When
   * false the foot strip must NOT name a specific player/category as the team
   * weakness — it softens to a neutral "still calibrating" treatment.
   * PRESENTATION-ONLY; the parent normally dims the whole hero in this case,
   * so this is a defensive guard on the foot strip itself.
   */
  sgCalibrated: boolean;
}) {
  const rating = weakest.rating;
  const belowMid = rating < 50;
  const midGap = Math.abs(rating - 50);
  // Constrained to the SAME category the headline just named — never a
  // driving/approach yardage-band detail under Putting/Scoring (#946).
  const supportDetail = selectHeroSupportDetail(weakest.categoryId, worstZone, leadInsight);

  return (
    <InstrumentPanel
      depth="raised"
      padding="lg"
      as="section"
      header="Work on this first"
      className="flex flex-col gap-5"
    >
      <div className="grid gap-6 md:grid-cols-[1.1fr_0.9fr]">
        {/* LEFT — the directive (the focal). `justify-center` so a short
            headline never leaves a void under the CTA when the right column
            (the Ribbon / bar-strip card) renders taller (#946). */}
        <div className="flex min-w-0 flex-col justify-center gap-3">
          <h3 className="font-fw-display text-h2 font-semibold leading-tight text-text-primary">
            {weakest.long} needs the most work right now.
          </h3>

          <div className="flex flex-wrap items-end gap-3">
            <Readout
              value={rating}
              display={String(rating)}
              size="md"
              label={`${weakest.label} · out of 100`}
            />
            <Badge tone={belowMid ? 'warning' : 'success'} size="sm" className="mb-1">
              {midGap} {belowMid ? 'below' : 'above'} the 50 mid-line
            </Badge>
          </div>

          {supportDetail.text ? (
            <p className="font-fw-sans text-body-sm text-text-secondary">{supportDetail.text}</p>
          ) : null}

          <div className="pt-0.5">
            <Button variant="primary" size="sm" asChild>
              <Link href={signalsHref(weakest.categoryId)}>
                <span>Work on {weakest.label}</span>
                <IconArrowRight size={16} />
              </Link>
            </Button>
          </div>
        </div>

        {/* RIGHT — muted evidence: the yardage Ribbon, or the bar strip when starved */}
        <div className="flex min-w-0 flex-col justify-center">
          {ribbonPoints.length >= 2 ? (
            <Ribbon
              title="Yardage map"
              overline="Last 90 days · team"
              data={ribbonPoints}
              benchmark={{ value: 0, label: 'Par' }}
              valueFormatter={fmtSG}
              seriesName="Strokes vs par"
              height={180}
              minPoints={2}
              // Stack the readout under the eyebrow/header instead of beside
              // them (this card lives in a narrow ~0.9fr grid column — a
              // side-by-side row can get squeezed into overlap regardless of
              // viewport width), and name what the value/delta actually are:
              // the curve is a YARDAGE-band spread, not a time series, so
              // "last vs first" means farthest vs closest plotted band (#946).
              readoutPlacement="below"
              readoutLabels={(first, last) => ({
                value: `Strokes vs par · ${last.x}`,
                delta: `vs ${first.x}`,
              })}
            />
          ) : (
            <div className="flex h-full flex-col gap-2">
              <span className="font-fw-display text-eyebrow uppercase tracking-[0.12em] text-text-tertiary">
                How the five areas rate
              </span>
              <InstrumentPanel depth="inset" padding="sm" className="flex-1">
                <CategoryBars rows={allRanked} lowestRating={allRanked[0]?.rating ?? -1} />
              </InstrumentPanel>
            </div>
          )}
        </div>
      </div>

      {/* FOOT STRIP — who's dragging it (or the category's lead insight). When
          the SG inputs are uncalibrated we must NOT name a specific player or
          category as the weakness, so the strip softens to a neutral
          "strokes-gained still calibrating" treatment. */}
      <div className="flex flex-col gap-2 border-t border-border-subtle pt-4">
        <span className="font-fw-display text-eyebrow uppercase tracking-[0.12em] text-text-tertiary">
          {sgCalibrated
            ? footStripLabel(weakest.long.toLowerCase(), flaggedPlayers)
            : 'Strokes-gained still calibrating'}
        </span>
        {!sgCalibrated ? (
          <p className="font-fw-sans text-body-sm text-text-secondary">
            We’re not naming who’s dragging an area yet — the per-round
            strokes-gained numbers are still calibrating for this team.
          </p>
        ) : flaggedPlayers.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {flaggedPlayers.map((p) => {
              const first = p.playerName.split(' ')[0] || p.playerName;
              const dot =
                p.trend === 'declining'
                  ? 'bg-fw-warning'
                  : p.trend === 'improving'
                    ? 'bg-fw-success'
                    : 'bg-text-tertiary';
              return (
                <span
                  key={p.playerId}
                  className="inline-flex items-center gap-2 rounded-full border border-border-subtle bg-surface-sunken px-3 py-1"
                >
                  <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', dot)} aria-hidden />
                  <span className="font-fw-sans text-caption font-semibold text-text-primary">
                    {first}
                  </span>
                  <span className="font-fw-sans text-caption text-text-tertiary">
                    {playerTrendWord(p.trend)}
                  </span>
                </span>
              );
            })}
          </div>
        ) : leadInsight && supportDetail.kind !== 'lead-insight' ? (
          // Only shown here when the headline support line ABOVE didn't
          // already use this same insight (it does for putting/scoring —
          // see selectHeroSupportDetail) — never repeat the same sentence
          // twice on one card.
          <p className="font-fw-sans text-body-sm text-text-secondary">{leadInsight.message}</p>
        ) : (
          <p className="font-fw-sans text-body-sm text-text-secondary">
            No one’s flagged in {weakest.long.toLowerCase()} yet — it’s the lowest area by rating.
          </p>
        )}
      </div>
    </InstrumentPanel>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * CategoryBars — worst-first inline bar rows. Each is a Link into the category's
 * Signals filter: label · a flat mini-bar (vs a faint 50 tick) · /100 number ·
 * one-word status. Flat encoding only — no gauge, no dial.
 * ─────────────────────────────────────────────────────────────────────────── */
function CategoryBars({
  rows,
  lowestRating,
}: {
  rows: RankedCategory[];
  lowestRating: number;
}) {
  return (
    <ul className="flex flex-col gap-2">
      {rows.map((row) => {
        const isWorst = row.rating === lowestRating;
        const tag = statusTag(row.cat?.trend, row.cat?.attentionCount ?? 0, row.rating);
        const barColor = isWorst
          ? 'bg-fw-warning'
          : row.rating >= 50
            ? 'bg-fw-success'
            : 'bg-text-tertiary/60';
        return (
          <li key={row.categoryId}>
            <Link
              href={signalsHref(row.categoryId)}
              aria-label={`${row.label} ${row.rating} of 100 — open Signals`}
              className={cn(
                'grid grid-cols-[5.5rem_1fr_auto] items-center gap-3 rounded-fw-md border border-border-subtle px-3 py-2.5',
                'transition-colors duration-fast ease-soft hover:bg-surface-sunken/60',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-1 focus-visible:ring-offset-surface',
              )}
            >
              <span className="truncate font-fw-display text-eyebrow uppercase tracking-[0.12em] text-text-tertiary">
                {row.label}
              </span>
              <div className="flex items-center gap-3">
                <div className="relative h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-sunken">
                  <div
                    className={cn('absolute inset-y-0 left-0 rounded-full', barColor)}
                    style={{ width: `${Math.max(2, Math.min(100, row.rating))}%` }}
                  />
                  <span className="absolute inset-y-0 left-1/2 w-px bg-text-tertiary/40" aria-hidden />
                </div>
                <span className="w-7 shrink-0 text-right font-fw-mono text-body-sm font-semibold tabular-nums text-text-primary">
                  {row.rating}
                </span>
              </div>
              <span className={cn('shrink-0 font-fw-sans text-caption font-medium', tag.className)}>
                {tag.label}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * AspectColumn — one half of the strengths/weaknesses split. Each row is a
 * BUTTON (not a link) that opens the rich aspect drill-down (goals / plans /
 * documents / calendar). Empty halves degrade to an honest one-liner.
 * ─────────────────────────────────────────────────────────────────────────── */
function AspectColumn({
  title,
  tone,
  rows,
  emptyHint,
  onOpen,
}: {
  title: string;
  tone: 'success' | 'warning';
  rows: RankedCategory[];
  emptyHint: string;
  onOpen: (row: RankedCategory) => void;
}) {
  const dotColor = tone === 'success' ? 'bg-fw-success' : 'bg-fw-warning';
  return (
    <InstrumentPanel depth="base" padding="md" className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className={cn('h-2 w-2 shrink-0 rounded-full', dotColor)} aria-hidden />
        <h3 className="font-fw-display text-eyebrow uppercase tracking-[0.14em] text-text-tertiary">
          {title}
        </h3>
      </div>
      {rows.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {rows.map((row) => (
            <li key={row.categoryId}>
              <AspectRow row={row} tone={tone} onOpen={onOpen} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="font-fw-sans text-body-sm text-text-secondary">{emptyHint}</p>
      )}
    </InstrumentPanel>
  );
}

function AspectRow({
  row,
  tone,
  onOpen,
}: {
  row: RankedCategory;
  tone: 'success' | 'warning';
  onOpen: (row: RankedCategory) => void;
}) {
  const tag = statusTag(row.cat?.trend, row.cat?.attentionCount ?? 0, row.rating);
  const barColor = tone === 'success' ? 'bg-fw-success' : 'bg-fw-warning';
  return (
    /* eslint-disable-next-line helm/no-raw-button */
    <button
      type="button"
      onClick={() => onOpen(row)}
      aria-label={`${row.label} ${row.rating} of 100 — open team aspect`}
      className={cn(
        'grid w-full grid-cols-[5.5rem_1fr_auto_auto] items-center gap-3 rounded-fw-md border border-border-subtle px-3 py-2.5 text-left',
        'transition-colors duration-fast ease-soft hover:bg-surface-sunken/60',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-1 focus-visible:ring-offset-surface',
      )}
    >
      <span className="truncate font-fw-display text-eyebrow uppercase tracking-[0.12em] text-text-tertiary">
        {row.label}
      </span>
      <div className="flex items-center gap-3">
        <div className="relative h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-sunken">
          <div
            className={cn('absolute inset-y-0 left-0 rounded-full', barColor)}
            style={{ width: `${Math.max(2, Math.min(100, row.rating))}%` }}
          />
          <span className="absolute inset-y-0 left-1/2 w-px bg-text-tertiary/40" aria-hidden />
        </div>
        <span className="w-7 shrink-0 text-right font-fw-mono text-body-sm font-semibold tabular-nums text-text-primary">
          {row.rating}
        </span>
      </div>
      <span className={cn('hidden shrink-0 font-fw-sans text-caption font-medium sm:inline', tag.className)}>
        {tag.label}
      </span>
      <IconChevronRight size={16} className="shrink-0 text-text-tertiary" aria-hidden />
    </button>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * PulseStrip — the DEMOTED team read (was the twin-60px hero). One slim line:
 * composite + health as small inline Readouts + a muted meta line.
 * ─────────────────────────────────────────────────────────────────────────── */
function PulseStrip({
  composite,
  teamHealth,
  playerCount,
  lastAnalyzed,
  attention,
}: {
  composite: number | null;
  teamHealth: number | null;
  playerCount: number;
  lastAnalyzed: string;
  attention: number;
}) {
  const compLive = composite != null;
  const healthLive = teamHealth != null;
  const midDelta = compLive ? Math.round(composite) - 50 : 0;

  return (
    <InstrumentPanel depth="base" padding="md">
      <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
        <Readout
          value={compLive ? Math.round(composite) : 0}
          display={compLive ? String(Math.round(composite)) : '—'}
          size="sm"
          label="Team form · out of 100"
          delta={
            compLive
              ? { value: midDelta, format: (v) => `${v >= 0 ? '+' : '−'}${Math.abs(v)} vs mid` }
              : undefined
          }
        />
        <Readout
          value={healthLive ? Math.round(teamHealth) : 0}
          display={healthLive ? String(Math.round(teamHealth)) : '—'}
          size="sm"
          label="Health · out of 100"
        />
        <span className="font-fw-sans text-caption text-text-tertiary">
          {playerCount} active {playerCount === 1 ? 'player' : 'players'}
          {attention > 0 ? ` · ${attention} need attention` : ''}
          {lastAnalyzed ? ` · updated ${lastAnalyzed}` : ''}
        </span>
      </div>
    </InstrumentPanel>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
 * CategoryHealthRow — one team category as a flat InstrumentPanel (InsightCard
 * vocabulary: overline · headline · ONE evidence insight · action). The action
 * LINKS into Signals filtered to this category.
 * ────────────────────────────────────────────────────────────────────────── */

function CategoryHealthRow({ cat, rating }: { cat: TeamCategory; rating?: number }) {
  const priority = categoryPriority(cat);
  const TrendIcon =
    cat.trend === 'improving'
      ? IconTrendingUp
      : cat.trend === 'declining'
        ? IconTrendingDown
        : IconActivity;

  // Rating and trend are different questions ("how good right now" vs "which
  // way is it moving") — blend them so an improving-but-still-weak category
  // doesn't read as an unqualified "trending up" directly under a hero that
  // just named it the team's weakest area.
  const isWeak = rating != null && rating < 50;
  const headline =
    cat.attentionCount > 0
      ? `${cat.attentionCount} player${cat.attentionCount === 1 ? ' needs' : 's need'} attention in ${cat.label.toLowerCase()}`
      : cat.trend === 'improving'
        ? isWeak
          ? `${cat.label} is weak but improving`
          : `${cat.label} is trending up`
        : cat.trend === 'declining'
          ? `${cat.label} is trending down`
          : `${cat.label} is holding steady`;

  // Trimmed to ONE evidence insight — the stacked 3-bullet insets created dead
  // vertical bands down the lower page.
  const evidence = cat.insights[0] ?? null;

  const accent =
    priority === 'high'
      ? 'text-fw-warning'
      : priority === 'low'
        ? 'text-fw-success'
        : 'text-text-secondary';

  return (
    <InstrumentPanel
      depth="base"
      tone={priority === 'high' ? 'accent' : 'neutral'}
      padding="md"
      className="flex flex-col gap-3"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <span
            aria-hidden
            className={cn(
              'mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-fw-md bg-surface-sunken',
              accent,
            )}
          >
            <TrendIcon size={18} />
          </span>
          <div className="min-w-0 space-y-1">
            <p className="font-fw-display text-eyebrow uppercase tracking-[0.14em] text-text-tertiary">
              {cat.label} · {cat.primaryMetric}
            </p>
            <h3 className="font-fw-display text-h3 font-semibold leading-tight text-text-primary">
              {headline}
            </h3>
          </div>
        </div>
        {cat.teamAvgLabel && cat.teamAvgLabel !== 'No data' ? (
          <span className="shrink-0 font-fw-mono text-caption tabular-nums text-text-secondary">
            {cat.teamAvgLabel}
          </span>
        ) : null}
      </div>

      {evidence ? (
        <div className="flex items-start gap-2 rounded-fw-md bg-surface-sunken px-3 py-2.5">
          <span
            aria-hidden
            className={cn(
              'mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full',
              evidence.tone === 'positive'
                ? 'bg-fw-success'
                : evidence.tone === 'negative'
                  ? 'bg-fw-warning'
                  : 'bg-text-tertiary',
            )}
          />
          <span className="font-fw-sans text-body-sm text-text-secondary">{evidence.message}</span>
          {/* Fixes #922 (Phase 1) — badges a genuine engine-backed sentence
              (assembleBriefEngineInsights, from evidence.counterfactual on a
              real golf_coach_insights row) with its real strokes-saved figure.
              Absent on the hand-written template rows (no fabricated number). */}
          {evidence.engineBacked && evidence.strokesSavedPerRound != null ? (
            <Badge tone="warning" size="sm" className="ml-auto shrink-0">
              {evidence.strokesSavedPerRound.toFixed(1)}/rd
            </Badge>
          ) : null}
        </div>
      ) : null}

      <div>
        <Button variant="ghost" size="sm" asChild>
          <Link href={signalsHref(cat.id)} aria-label={`Triage ${cat.label} signals`}>
            <span>Triage signals</span>
            <IconChevronRight size={16} />
          </Link>
        </Button>
      </div>
    </InstrumentPanel>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
 * Small presentation helpers
 * ────────────────────────────────────────────────────────────────────────── */

function SectionHeading({ title, hint }: { title: ReactNode; hint?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h2 className="font-fw-display text-h3 font-semibold text-text-primary">{title}</h2>
      {hint ? (
        <span className="font-fw-sans text-caption text-text-tertiary">{hint}</span>
      ) : null}
    </div>
  );
}

/** Shape-matched reserved skeleton for the streamed Deep-analysis engine. */
function DeepAnalysisSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-live="polite">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
      <SkeletonCard lines={4} />
    </div>
  );
}

export default FairwayBrief;
