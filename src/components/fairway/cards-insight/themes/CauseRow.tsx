'use client';

/**
 * ============================================================================
 * Fairway · CoachHelm v3 THEMES — CauseRow
 * ----------------------------------------------------------------------------
 * One DIRECT CAUSE under a {@link ThemeCard}. Expandable disclosure (matte
 * border, rotating ChevronDown, focus-visible ring — copied verbatim from the
 * `ComprehensiveDetail` / `DetailedStandingsSection` toggle in
 * `FairwayStatsCockpit.tsx`). Plain CSS transition only — NO per-row
 * framer-motion (the Signals scroll-perf lesson).
 *
 * Collapsed: title + chevron sit on their own row (chevron never competes with
 * pill text for space); the strokes pill sits on a second, wrapping row below
 * so nothing clips. Honest strokes pill copy is human prose — "{realistic}
 * strokes/round from your team average," with a smaller, un-bracketed "{tour}
 * from Tour" ceiling note alongside when the Tour gap is larger — UNLESS the
 * counterfactual is suppressed, in which case a neutral, player-legible
 * "Tendency" chip with NO fabricated number (a directional read, not a leak).
 * When the team fraction fell back to 1 (no team data — detected as
 * strokesSavedPerRound == tourGapPerRound) the pill honestly reads "from Tour"
 * instead of "from your team average," and the redundant ceiling note is
 * hidden. No `≈`, no `/rd` shorthand, no mono font — this is prose, not a
 * data table.
 *
 * Expanded:
 *   • for a suppressed/Tendency cause, a short caption explaining it's a
 *     directional read with no reliable stroke estimate yet
 *   • cause.content as prose, capped to its first ~2 sentences with a "Read
 *     more" disclosure (real button, aria-expanded) revealing the rest —
 *     nothing is deleted, just not all shown at once
 *   • ROOT DRIVERS — each driver's title + prose as a nested `Inset` well (a
 *     tint step, not a bordered card-in-card — 'composite' source labelled as
 *     the synthesized root driver)
 *   • DEVELOPMENT PLAN LEAF — the drills as simple Fairway chips (drills from
 *     the cause + any collected from drivers, de-duped by drill_id)
 *   • "Make it a plan" CTA — a Fairway Button (sm), enabled per the role rules
 *     below; honest caption when the player has no drill yet. SUPPRESSED causes
 *     never get the primary CTA (no quantified target) — they get a soft
 *     "talk to your coach" caption instead.
 *
 * PRESENTATION ONLY — no data fetch, no server action import. The "make it a
 * plan" handler is INJECTED (`onMakePlan`) so this surface stays decoupled.
 *
 * ── DrillChips fit note ──────────────────────────────────────────────────────
 *   The legacy `DrillChips`
 *   (src/components/golf/coachhelm/insight-card/DrillChips.tsx) takes
 *   `InsightAttachedDrill[]` = `{ id, title, duration_min, difficulty }` (+ an
 *   `insightId`) and opens a heavy `DrillSheet`. The locked `DriverLeaf` shape
 *   is `{ drill_id, slug, title }` — no `duration_min`/`difficulty`, different
 *   id key, and the sheet behaviour is unwanted in this read-only scaffold.
 *   It does NOT fit cleanly, so per the brief we render simple Fairway chips
 *   with the drill title instead (no forced bad prop fit).
 *
 * ADDITIVE — new file under the Fairway tree. Renders inside `.fairway-ds`.
 * ========================================================================== */

import { useId, useMemo, useState } from 'react';
import { ChevronDown, Target } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Inset, Button } from '@/components/fairway';
import type {
  CauseNode,
  DriverLeaf,
  RootDriver,
} from '@/lib/coachhelm/v3/themes/types';

/* ───────────────────────────────────────────────────────────────────────────
 * Props
 * ────────────────────────────────────────────────────────────────────────── */

export interface CauseRowProps {
  cause: CauseNode;
  /** Drives the role-specific "Make it a plan" enablement rules. */
  role: 'coach' | 'player';
  /** Injected handler — keeps the surface decoupled from server actions. */
  onMakePlan?: () => void;
  /** True while this cause's plan is being created (busy state on the CTA). */
  makePlanPending?: boolean;
  /** Open by default (the parent may auto-open the top cause). */
  defaultOpen?: boolean;
}

/* ───────────────────────────────────────────────────────────────────────────
 * Helpers
 * ────────────────────────────────────────────────────────────────────────── */

/** Collect cause-level + driver-level drills, de-duped by drill_id, order-stable. */
function collectDrills(cause: CauseNode): DriverLeaf[] {
  const seen = new Set<string>();
  const out: DriverLeaf[] = [];
  const push = (d: DriverLeaf) => {
    if (d.drill_id && seen.has(d.drill_id)) return;
    if (d.drill_id) seen.add(d.drill_id);
    out.push(d);
  };
  for (const d of cause.drills) push(d);
  for (const driver of cause.drivers) for (const d of driver.drills) push(d);
  return out;
}

/** Human label for the root-driver source kind. */
function driverSourceLabel(source: RootDriver['source']): string {
  switch (source) {
    case 'composite':
      return 'Root driver';
    case 'shot_detail':
      return 'Shot pattern';
    case 'diagnostic':
    default:
      return 'Diagnostic';
  }
}

/** Always-visible cap on `cause.content` before the "Read more" disclosure. */
const PREVIEW_SENTENCE_COUNT = 2;

/**
 * Split cause prose into sentences for the always-visible / "Read more" cap.
 * Splits on whitespace that follows a terminator (`.` `!` `?`) and precedes a
 * capital letter or open-paren — a typical sentence start. Decimal numbers
 * (e.g. "28%") have no whitespace to split on, so they're safe. Presentation-
 * only approximation, not a real sentence parser — worst case the preview
 * boundary lands a little early or late; the full text is always one tap away.
 */
function splitSentences(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  return trimmed
    .split(/(?<=[.!?])\s+(?=[A-Z(])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/* ───────────────────────────────────────────────────────────────────────────
 * Component
 * ────────────────────────────────────────────────────────────────────────── */

export function CauseRow({
  cause,
  role,
  onMakePlan,
  makePlanPending = false,
  defaultOpen = false,
}: CauseRowProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [contentExpanded, setContentExpanded] = useState(false);
  const panelId = useId();

  const drills = collectDrills(cause);
  const hasDrill = drills.length > 0;

  // "Read more" cap on cause.content — see splitSentences() above. Only the
  // truncated PREVIEW is ever derived text; once there's nothing more to
  // reveal (or the reader expands it), the original string renders verbatim.
  const contentSentences = useMemo(() => splitSentences(cause.content), [cause.content]);
  const hasMoreContent = contentSentences.length > PREVIEW_SENTENCE_COUNT;
  const contentPreview = contentSentences.slice(0, PREVIEW_SENTENCE_COUNT).join(' ');

  // Suppressed counterfactual → no reliable stroke estimate. We surface it as a
  // legible "Tendency" (directional read), never a fabricated number, and we
  // gate the plan CTA off entirely (a plan needs a quantified target).
  const suppressed = cause.counterfactualSuppressed;

  // Enablement (NON-suppressed only): coach → canMakePlan; player → canMakePlan
  // AND a drill exists (Practice-Rx hard-errors with no matching drill). Player
  // with no drill sees the honest caption instead of a button.
  const planEnabled =
    !suppressed &&
    (role === 'coach' ? cause.canMakePlan : cause.canMakePlan && hasDrill);
  const playerNeedsDrill =
    !suppressed && role === 'player' && cause.canMakePlan && !hasDrill;

  // Strokes pill: only when NOT suppressed. Show the REALISTIC gap-to-team-avg as
  // the primary number; when the raw Tour gap is larger, append it as a smaller
  // ceiling note (never framed as "strokes you're losing"). When the team
  // fraction fell back to 1 (no team reference), the realistic value equals the
  // raw Tour gap — detect that and label the primary "from Tour" honestly, hiding
  // the now-redundant ceiling note.
  const strokes = cause.strokesSavedPerRound;
  const tourGap = cause.tourGapPerRound;
  const showStrokesPill = !suppressed && strokes > 0;
  const toTourOnly =
    tourGap != null && tourGap.toFixed(1) === strokes.toFixed(1);
  const primaryLabel = toTourOnly ? 'from Tour' : 'from your team average';
  const showTourCeiling = !toTourOnly && tourGap != null && tourGap > strokes;

  return (
    <div
      className="flex flex-col gap-3"
      data-slot="fairway-cause-row"
      data-cause-id={cause.insight_id}
    >
      {/* Disclosure header — matches the cockpit ComprehensiveDetail toggle.
          Title + chevron on their own row so the chevron never competes with
          the pill for space; the pill (and ceiling note) sit on a second,
          wrapping row below so long human copy never clips. */}
      <Button
        type="button"
        variant="ghost"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        className="group block h-auto min-h-0 w-full rounded-card border border-border-subtle bg-surface px-4 py-3 text-left font-normal outline-none transition-colors [transition-duration:180ms] hover:bg-surface-tint focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas motion-reduce:transition-none"
      >
        <span className="flex w-full flex-col gap-2 whitespace-normal">
          <span className="flex w-full items-center justify-between gap-3">
            <span className="min-w-0 flex-1 truncate font-fw-sans text-body-sm font-medium text-text-primary">
              {cause.title}
            </span>
            <ChevronDown
              className={cn(
                'h-4 w-4 flex-shrink-0 text-text-tertiary transition-transform [transition-duration:180ms] motion-reduce:transition-none',
                open && 'rotate-180',
              )}
              aria-hidden
            />
          </span>
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {showStrokesPill ? (
              <span className="inline-flex w-fit items-center gap-1 rounded-full bg-fw-warning-bg px-2.5 py-1 font-fw-sans text-eyebrow font-medium text-fw-warning-ink">
                <span className="tabular-nums">{strokes.toFixed(1)}</span>
                <span>strokes/round {primaryLabel}</span>
              </span>
            ) : (
              <span className="inline-flex w-fit items-center rounded-full bg-inset px-2 py-0.5 font-fw-sans text-eyebrow font-medium uppercase tracking-[0.08em] text-text-tertiary">
                Tendency
              </span>
            )}
            {showTourCeiling && tourGap != null ? (
              <span className="font-fw-sans text-eyebrow text-text-tertiary">
                <span className="tabular-nums">{tourGap.toFixed(1)}</span> from Tour
              </span>
            ) : null}
          </span>
        </span>
      </Button>

      {open ? (
        <div id={panelId} className="flex flex-col gap-4 px-1 pb-1">
          {/* Tendency caption — frames a suppressed cause as an intentional
              directional read, not an engine failure. No fabricated number. */}
          {suppressed ? (
            <p className="font-fw-sans text-caption leading-relaxed text-text-tertiary">
              A directional read from your pattern — there isn&rsquo;t a reliable
              stroke estimate for this yet, so treat it as a tendency to watch
              rather than a measured leak.
            </p>
          ) : null}

          {/* Cause prose — capped to ~2 sentences with a "Read more" disclosure.
              Nothing is deleted; the full text is one tap away. */}
          {cause.content ? (
            <div className="flex flex-col gap-2">
              <p className="font-fw-sans text-body-sm leading-relaxed text-text-secondary">
                {hasMoreContent && !contentExpanded ? contentPreview : cause.content}
              </p>
              {hasMoreContent ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="w-fit self-start"
                  aria-expanded={contentExpanded}
                  onClick={() => setContentExpanded((v) => !v)}
                >
                  {contentExpanded ? 'Show less' : 'Read more'}
                </Button>
              ) : null}
            </div>
          ) : null}

          {/* Root drivers — nested Inset wells (a tint step, not a bordered
              card-in-card competing with the CauseRow's own chrome). */}
          {cause.drivers.length > 0 ? (
            <div className="flex flex-col gap-2">
              {cause.drivers.map((driver, i) => (
                <Inset
                  key={`${cause.insight_id}-driver-${i}`}
                  padding="sm"
                  className="flex flex-col gap-1.5"
                >
                  <span className="font-fw-sans text-eyebrow font-medium uppercase tracking-[0.1em] text-text-tertiary">
                    {driverSourceLabel(driver.source)}
                  </span>
                  {driver.title ? (
                    <span className="font-fw-sans text-body-sm font-medium text-text-primary">
                      {driver.title}
                    </span>
                  ) : null}
                  {driver.prose ? (
                    <p className="font-fw-sans text-caption leading-relaxed text-text-secondary">
                      {driver.prose}
                    </p>
                  ) : null}
                </Inset>
              ))}
            </div>
          ) : null}

          {/* Development plan leaf — drills as simple Fairway chips */}
          {hasDrill ? (
            <div className="flex flex-col gap-2">
              <span className="inline-flex items-center gap-1.5 font-fw-sans text-eyebrow font-medium uppercase tracking-[0.1em] text-text-tertiary">
                <Target className="h-3 w-3 text-accent-600" aria-hidden />
                Drills
              </span>
              <div className="flex flex-wrap gap-2">
                {drills.map((drill) => (
                  <span
                    key={drill.drill_id || drill.slug || drill.title}
                    className="inline-flex items-center rounded-full border border-border-subtle bg-surface-sunken px-3 py-1 font-fw-sans text-caption font-medium text-text-secondary"
                  >
                    {drill.title}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {/* "Make it a plan" CTA — or an honest caption. Suppressed causes
              never get the primary CTA (no quantified target): a plan can't be
              built around an unmeasured tendency, so we point to a coach chat. */}
          {suppressed ? (
            <p className="font-fw-sans text-caption text-text-tertiary">
              {role === 'coach'
                ? 'Discuss with your coach'
                : 'Talk to your coach about this'}
            </p>
          ) : planEnabled ? (
            <div>
              <Button
                variant="primary"
                size="sm"
                busy={makePlanPending}
                disabled={makePlanPending}
                onClick={onMakePlan}
              >
                Make it a plan
              </Button>
            </div>
          ) : playerNeedsDrill ? (
            <p className="font-fw-sans text-caption text-text-tertiary">
              No drill yet — talk to your coach.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default CauseRow;
