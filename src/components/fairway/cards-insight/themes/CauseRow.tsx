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
 * Collapsed: cause.title + an honest strokes pill (`≈{realistic}/rd to team
 * avg`, with a smaller `({tour} to Tour)` ceiling note when the Tour gap is
 * larger) UNLESS the counterfactual is suppressed — then a neutral,
 * player-legible "Tendency" chip with NO fabricated number (a directional read,
 * not a leak). When the team fraction fell back to 1 (no team data — detected as
 * strokesSavedPerRound == tourGapPerRound) the pill is honestly labeled "to
 * Tour" instead of "to team avg," and the redundant ceiling note is hidden.
 *
 * Expanded:
 *   • for a suppressed/Tendency cause, a short caption explaining it's a
 *     directional read with no reliable stroke estimate yet
 *   • cause.content as prose
 *   • ROOT DRIVERS — each driver's title + prose as a nested matte sub-row
 *     ('composite' source labelled as the synthesized root driver)
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

import { useId, useState } from 'react';
import { ChevronDown, Target } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Surface, Button } from '@/components/fairway';
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
  const panelId = useId();

  const drills = collectDrills(cause);
  const hasDrill = drills.length > 0;

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
  // raw Tour gap — detect that and label the primary "to Tour" honestly, hiding
  // the now-redundant ceiling note.
  const strokes = cause.strokesSavedPerRound;
  const tourGap = cause.tourGapPerRound;
  const showStrokesPill = !suppressed && strokes > 0;
  const toTourOnly =
    tourGap != null && tourGap.toFixed(1) === strokes.toFixed(1);
  const primaryLabel = toTourOnly ? 'to Tour' : 'to team avg';
  const showTourCeiling = !toTourOnly && tourGap != null && tourGap > strokes;

  return (
    <div
      className="flex flex-col gap-3"
      data-slot="fairway-cause-row"
      data-cause-id={cause.insight_id}
    >
      {/* Disclosure header — matches the cockpit ComprehensiveDetail toggle. */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        className="group flex w-full items-center justify-between gap-3 rounded-card border border-border-subtle bg-surface px-4 py-3 text-left outline-none transition-colors [transition-duration:180ms] hover:bg-surface-tint focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas motion-reduce:transition-none"
      >
        <span className="flex min-w-0 flex-1 items-center gap-3">
          <span className="min-w-0 flex-1 truncate font-fw-sans text-body-sm font-medium text-text-primary">
            {cause.title}
          </span>
          {showStrokesPill ? (
            <span className="inline-flex w-fit flex-shrink-0 items-center gap-1 rounded-full bg-fw-warning-bg px-2 py-0.5 font-fw-mono text-eyebrow font-medium tabular-nums text-fw-warning">
              ≈{strokes.toFixed(1)}/rd {primaryLabel}
              {showTourCeiling && tourGap != null ? (
                <span className="font-normal text-fw-warning/70">
                  ({tourGap.toFixed(1)} to Tour)
                </span>
              ) : null}
            </span>
          ) : (
            <span className="inline-flex w-fit flex-shrink-0 items-center rounded-full bg-inset px-2 py-0.5 font-fw-sans text-eyebrow font-medium uppercase tracking-[0.08em] text-text-tertiary">
              Tendency
            </span>
          )}
        </span>
        <ChevronDown
          className={cn(
            'h-4 w-4 flex-shrink-0 text-text-tertiary transition-transform [transition-duration:180ms] motion-reduce:transition-none',
            open && 'rotate-180',
          )}
          aria-hidden
        />
      </button>

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

          {/* Cause prose */}
          {cause.content ? (
            <p className="font-fw-sans text-body-sm leading-relaxed text-text-secondary">
              {cause.content}
            </p>
          ) : null}

          {/* Root drivers — nested matte sub-rows */}
          {cause.drivers.length > 0 ? (
            <div className="flex flex-col gap-2">
              {cause.drivers.map((driver, i) => (
                <Surface
                  key={`${cause.insight_id}-driver-${i}`}
                  elevation="border"
                  padding="md"
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
                </Surface>
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
