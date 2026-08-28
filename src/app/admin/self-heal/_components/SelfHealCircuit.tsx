import { StatusPill, type FwStatusTone } from '@/components/fairway';
import { cn } from '@/lib/utils';
import { SELFHEAL_RUNNER_LABEL } from '@/lib/admin/selfheal-registry';
import type { SelfHealStageDetail, StageRunRecord } from '@/lib/admin/data/selfheal';
import type { CapabilityState, LoopVerdict } from '@/lib/admin/selfheal-capability';
import { PanelNoData } from '../../_components/PanelStates';
import { LocalTime } from '../../_components/LocalTime';

/**
 * The self-healing circuit, rendered so the two facts it exists to keep apart
 * — RUNTIME ("did the process run on schedule") and CAPABILITY ("has it ever
 * produced its output") — stay visually separate all the way down to the
 * single stage card, never folded into one chip.
 *
 * See `selfheal-capability.ts`'s header for why this distinction exists at
 * all: the Repair stage's heartbeat was healthy every single day while it had
 * never once opened a pull request (observed 2026-08-28). A board that only
 * shows the heartbeat cannot tell that story. This one is built specifically
 * so it can.
 */

/** Runtime status, keyed off the registry's own classification — same
 *  mapping `jobs/page.tsx`'s `SelfHealLoop` uses, so the summary card here and
 *  the full board this page links out from never disagree on what a color
 *  means. `never-ran` stays neutral (an awaited first run is not a fault);
 *  `unreadable` overrides the LABEL, not the tone, for the same reason —
 *  see the render below. */
const RUNTIME_TONE: Record<SelfHealStageDetail['status'], FwStatusTone> = {
  ok: 'success',
  overdue: 'danger',
  failed: 'danger',
  'never-ran': 'neutral',
};

/**
 * Capability tone. Three states, three tones — `unknown` deliberately does
 * NOT share a tone with `unproven`: one means "we looked and found nothing"
 * (a real gap, amber), the other means "the read itself failed" (no evidence
 * in either direction, and reusing amber would make an instrument failure
 * look like the same kind of finding as a genuine miss). `info` is the
 * Fairway tone with no success/danger connotation, which is exactly the
 * neutral-but-not-calm register an unread stage needs.
 */
const CAPABILITY_TONE: Record<CapabilityState, FwStatusTone> = {
  proven: 'success',
  unproven: 'warning',
  unknown: 'info',
};

/** Loop verdict tone — exported so `page.tsx`'s header banner and this
 *  component's footer line render the identical color for the identical
 *  word, rather than two independently-authored mappings drifting apart. */
export const VERDICT_TONE: Record<LoopVerdict['tone'], FwStatusTone> = {
  ok: 'success',
  warning: 'warning',
  danger: 'danger',
  unknown: 'info',
};

function formatDuration(ms: number | null): string {
  if (ms === null) return 'unknown duration';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatCadence(cadenceMinutes: number): string {
  if (cadenceMinutes === 24 * 60) return 'daily';
  if (cadenceMinutes % 60 === 0) return `every ${cadenceMinutes / 60}h`;
  return `every ${cadenceMinutes}m`;
}

/**
 * A plain, hour/day-bucketed "ago" string, computed once against
 * `Date.now()` inside a Server Component's render — deterministic for this
 * purpose because a Server Component renders exactly once per request and
 * embeds its output as-is; there is no client-side re-render to disagree
 * with it (see `LocalTime.tsx`'s header on which bug class that guards
 * against, and why it's a 'use client'-only problem).
 *
 * Deliberately NOT `RelativeTime` (`../../_components/RelativeTime`): that
 * component is the chrome freshness ticker — "updated Ns ago", a 10s-interval
 * Client Component built for a stat strip that changes under the viewer's
 * eyes. Every stage in `SELFHEAL_STAGES` runs on a DAILY cadence, so its
 * minutes-only granularity would render a perfectly healthy stage's last run
 * as "updated 720m ago" on every single render — technically correct and
 * functionally unreadable. This is the plain-language formatter that fact
 * actually needs.
 */
export function formatStageAge(iso: string): string {
  const minutes = Math.round(Math.max(0, Date.now() - Date.parse(iso)) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

/* ---------------------------------------------------------------------------
 * Connector — the line between two stage cards.
 * ------------------------------------------------------------------------- */

type ConnectorTone = 'solid' | 'dashed' | 'danger';

/**
 * Solid means the upstream stage has DEMONSTRATED its output (capability
 * `proven`) and the downstream stage has actually run at least once —
 * evidence genuinely flowed across this link. Dashed is the default: the
 * link is expected by the registry but nothing has proven it moves anything
 * yet. Danger overrides both when the downstream stage's last run failed
 * outright, regardless of what came before it.
 */
function connectorTone(upstream: SelfHealStageDetail, downstream: SelfHealStageDetail): ConnectorTone {
  if (downstream.status === 'failed') return 'danger';
  if (upstream.capability.state === 'proven' && downstream.lastRunAt !== null) return 'solid';
  return 'dashed';
}

const CONNECTOR_COLOR: Record<ConnectorTone, string> = {
  solid: 'border-fw-success',
  dashed: 'border-warm-300',
  danger: 'border-fw-danger',
};

/**
 * Purely decorative (`aria-hidden`) — every fact this line encodes is stated
 * in words on the two cards it joins, so hiding it from assistive tech drops
 * nothing. Deliberately STATIC: a continuously animated connector is exactly
 * the "the pipeline is glowing, therefore it's alive" decoration this whole
 * page exists to refuse. The one motion this file allows lives on the
 * in-progress stage's own status dot below, gated to a run that is actually,
 * currently, happening.
 */
function Connector({ tone }: { tone: ConnectorTone }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'mx-auto h-6 w-0 shrink-0 border-l-2 md:mx-0 md:h-0 md:w-6 md:self-center md:border-l-0 md:border-t-2',
        tone === 'dashed' ? 'border-dashed' : 'border-solid',
        CONNECTOR_COLOR[tone],
      )}
    />
  );
}

/* ---------------------------------------------------------------------------
 * StageCard
 * ------------------------------------------------------------------------- */

export function StageCard({ stage }: { stage: SelfHealStageDetail }) {
  // `history` is newest-first (see data/selfheal.ts), so index 0 is the most
  // recent run. A run is genuinely IN PROGRESS only when it has started and
  // has not yet completed — not merely because the stage "looks busy".
  const latestRun = stage.history[0] ?? null;
  const inProgress = Boolean(latestRun?.startedAt) && latestRun?.completedAt == null;

  return (
    <div className="min-w-0 flex-1 rounded-fw-md border border-warm-200 bg-surface p-4 md:max-w-[19rem]">
      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-warm-200 font-fw-mono text-caption text-warm-600"
        >
          {stage.step}
        </span>
        <span className="text-sm font-semibold text-warm-900">{stage.title}</span>
      </div>

      <p className="mt-1.5 break-words text-xs text-warm-500 [overflow-wrap:anywhere]">{stage.what}</p>

      {/* Runtime block — is the process running on schedule. */}
      <div className="mt-3 border-t border-warm-200 pt-2.5">
        <p className="text-eyebrow font-semibold uppercase tracking-widest text-warm-400">Runtime</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <StatusPill
            tone={RUNTIME_TONE[stage.status]}
            dot
            size="sm"
            // `pulse` only fires when `inProgress` is true, and StatusPill's
            // own implementation already wraps the animation in
            // `motion-safe:` with a static dot as the `motion-reduce:`
            // fallback (src/components/fairway/controls/status-pill.tsx) — a
            // stage that isn't actively running never pulses, so the circuit
            // can't manufacture a false sense of constant activity.
            pulse={inProgress}
          >
            {stage.unreadable ? 'unreadable' : stage.status}
          </StatusPill>
          {inProgress ? <span className="text-caption text-warm-500">run in progress</span> : null}
        </div>
        <dl className="mt-1.5 space-y-0.5 text-caption">
          <div className="flex items-baseline justify-between gap-2">
            <dt className="text-warm-500">Last run</dt>
            <dd className="min-w-0 text-right font-fw-mono tabular-nums text-warm-600">
              {stage.unreadable ? (
                <span className="text-fw-warning-ink">unreadable this refresh</span>
              ) : stage.lastRunAt ? (
                formatStageAge(stage.lastRunAt)
              ) : (
                'no heartbeat on record'
              )}
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <dt className="text-warm-500">Next expected</dt>
            <dd className="min-w-0 text-right font-fw-mono tabular-nums text-warm-600">
              {stage.nextExpectedAt ? <LocalTime iso={stage.nextExpectedAt} variant="datetime" /> : '—'}
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <dt className="text-warm-500">Runner</dt>
            <dd className="min-w-0 text-right text-warm-600">{SELFHEAL_RUNNER_LABEL[stage.runner]}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <dt className="text-warm-500">Cadence</dt>
            <dd className="min-w-0 text-right text-warm-600">{formatCadence(stage.cadenceMinutes)}</dd>
          </div>
        </dl>
        {stage.lastError ? (
          <p className="mt-1.5 break-words text-caption text-fw-danger-ink [overflow-wrap:anywhere]">
            {stage.lastError}
          </p>
        ) : null}
      </div>

      {/* Capability block — has it EVER produced its output. */}
      <div className="mt-3 border-t border-warm-200 pt-2.5">
        <p className="text-eyebrow font-semibold uppercase tracking-widest text-warm-400">Capability</p>
        <div className="mt-1.5">
          <StatusPill tone={CAPABILITY_TONE[stage.capability.state]} dot size="sm">
            {stage.capability.state.toUpperCase()}
          </StatusPill>
        </div>
        <p className="mt-1.5 break-words text-caption text-warm-600 [overflow-wrap:anywhere]">
          {stage.capability.evidence}
        </p>
        {stage.capability.provenAt ? (
          <p className="mt-1 font-fw-mono text-caption text-warm-500">
            proven <LocalTime iso={stage.capability.provenAt} variant="datetime" />
          </p>
        ) : null}
      </div>

      <p className="mt-3 break-all border-t border-warm-200 pt-2.5 font-fw-mono text-caption text-warm-400">
        {stage.contract}
      </p>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * SelfHealCircuit
 * ------------------------------------------------------------------------- */

export function SelfHealCircuit({
  stages,
  verdict,
}: {
  stages: readonly SelfHealStageDetail[];
  verdict: LoopVerdict;
}) {
  if (stages.length === 0) {
    return (
      <PanelNoData
        label="No self-healing stages registered"
        description="SELFHEAL_STAGES is empty — the loop has no expected half to compare against."
      />
    );
  }

  const ordered = [...stages].sort((a, b) => a.step - b.step);

  return (
    <div>
      <div className="flex flex-col items-stretch gap-0 md:flex-row md:items-stretch">
        {ordered.map((stage, i) => {
          const next = ordered[i + 1];
          return (
            <div key={stage.id} className="flex flex-col items-stretch md:flex-1 md:flex-row md:items-stretch">
              <StageCard stage={stage} />
              {next ? <Connector tone={connectorTone(stage, next)} /> : null}
            </div>
          );
        })}
      </div>
      {/* Plain running prose, deliberately NOT `flex` on the `<p>` — flex
          would turn each text run either side of the pill into its own
          anonymous flex item, inserting a `gap-2` at every boundary
          (including mid-sentence around "worst") and letting each run wrap
          as its own block instead of one sentence. `StatusPill` is already
          `inline-flex` + `align-middle`, so it sits correctly inline without
          any flex on its container — same as the plain-block precedent in
          `jobs/page.tsx`'s `SelfHealLoop` footer line. */}
      <p className="mt-3 text-xs text-warm-500">
        The loop&rsquo;s verdict is the <strong className="font-semibold text-warm-900">worst</strong> of runtime
        and capability, not an average of the two —{' '}
        <StatusPill tone={VERDICT_TONE[verdict.tone]} dot size="sm">
          {verdict.label}
        </StatusPill>{' '}
        — because a stage that runs on schedule but has never produced its output is not a working loop.
      </p>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * RunHistoryHeatmap
 * ------------------------------------------------------------------------- */

function runCellTone(status: string): string {
  if (status === 'completed') return 'bg-fw-success';
  if (status === 'failed') return 'bg-fw-danger';
  // Any other recorded status (most often a run whose `completed_at` is
  // still null) is neither a proven success nor a failure — distinct amber,
  // never silently folded into one of the two real outcomes.
  return 'bg-fw-warning';
}

function runCellTitle(run: StageRunRecord): string {
  const parts = [
    `status ${run.status}`,
    run.startedAt ? `started ${run.startedAt}` : 'no start recorded',
    run.completedAt ? `completed ${run.completedAt}` : 'not completed',
    `duration ${formatDuration(run.durationMs)}`,
    run.errorMessage ? `error: ${run.errorMessage}` : null,
  ];
  return parts.filter((p): p is string => Boolean(p)).join(' · ');
}

function runSummary(stage: SelfHealStageDetail): string {
  if (stage.history.length === 0) return `${stage.title}: never ran`;
  const completed = stage.history.filter((r) => r.status === 'completed').length;
  const failed = stage.history.filter((r) => r.status === 'failed').length;
  return `${stage.title}: ${stage.history.length} runs, ${completed} completed, ${failed} failed`;
}

/**
 * Rows = stages, columns = each stage's own run history, newest at the
 * right. `columnCount` comes from whichever stage has the deepest history —
 * not a copy of `data/selfheal.ts`'s own per-stage fetch cap, which this
 * file has no access to and shouldn't hardcode a second time — so a stage
 * with fewer recorded runs than its siblings still gets a row that reads as
 * "shorter history", and a stage with NONE gets that same width in visibly
 * empty, dashed placeholder cells rather than a row that looks blank or
 * missing.
 */
export function RunHistoryHeatmap({ stages }: { stages: readonly SelfHealStageDetail[] }) {
  const ordered = [...stages].sort((a, b) => a.step - b.step);
  const columnCount = Math.max(1, ...ordered.map((s) => s.history.length));

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-max border-separate border-spacing-y-2 text-left">
        <tbody>
          {ordered.map((stage) => {
            // `history` is newest-first; reversed here so the row reads
            // oldest-to-newest left-to-right, ending with the most recent
            // run on the right — the direction a timeline is normally read.
            const chronological = [...stage.history].reverse();
            const summary = runSummary(stage);

            return (
              <tr key={stage.id}>
                <th scope="row" className="whitespace-nowrap pr-3 align-middle text-xs font-medium text-warm-700">
                  {stage.title}
                </th>
                <td className="align-middle">
                  <div role="img" aria-label={summary} title={summary} className="flex items-center gap-1">
                    {stage.history.length === 0
                      ? Array.from({ length: columnCount }, (_, i) => (
                          <span
                            key={i}
                            aria-hidden
                            className="h-4 w-4 shrink-0 rounded-sm border border-dashed border-warm-300"
                          />
                        ))
                      : chronological.map((run, i) => (
                          <span
                            key={`${run.startedAt ?? 'unknown'}-${i}`}
                            aria-hidden
                            title={runCellTitle(run)}
                            className={cn('h-4 w-4 shrink-0 rounded-sm', runCellTone(run.status))}
                          />
                        ))}
                  </div>
                </td>
                <td className="whitespace-nowrap pl-3 align-middle text-right font-fw-mono text-caption tabular-nums text-warm-500">
                  {stage.history.length === 0 ? 'never ran' : summary.slice(summary.indexOf(': ') + 2)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
