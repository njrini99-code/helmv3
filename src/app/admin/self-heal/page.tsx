import { ChevronRight } from 'lucide-react';
import { requireSuperAdmin } from '@/lib/admin/require-super-admin';
import { fetchSelfHealBoard, type SelfHealStageDetail } from '@/lib/admin/data/selfheal';
import type { CapabilityEvidence } from '@/lib/admin/selfheal-capability';
import { SELFHEAL_RUNNER_LABEL } from '@/lib/admin/selfheal-registry';
import { Surface, StatusPill, InlineNotice, Eyebrow } from '@/components/fairway';
import { PanelBoundary } from '../_components/PanelBoundary';
import { PanelPageSkeleton } from '../_components/PanelSkeletons';
import { PanelStale } from '../_components/PanelStates';
import { AutoRefresh } from '../_components/AutoRefresh';
import { LocalTime } from '../_components/LocalTime';
import { SelfHealCircuit, RunHistoryHeatmap, VERDICT_TONE, formatStageAge } from './_components/SelfHealCircuit';

export const dynamic = 'force-dynamic';

/**
 * The self-healing loop's own board — the fuller instrument `/admin/jobs`'s
 * "Self-healing loop" panel links out to.
 *
 * That panel (and the registry it reads, `selfheal-registry.ts`) answers one
 * question: is each stage running on schedule. This page answers the second,
 * harder one: has each stage ever actually DONE anything. The two are
 * independent facts — see `selfheal-capability.ts`'s header for why a stage
 * can heartbeat green every day while never once producing its output. This
 * page exists so that gap is a thing an operator can see, not a thing they
 * have to already know to go looking for.
 */

/* ---------------------------------------------------------------------------
 * Throughput — a plain pipeline, not a conversion funnel.
 * ------------------------------------------------------------------------- */

function ThroughputStep({
  label,
  description,
  count,
}: {
  label: string;
  description: string;
  count: number | null;
}) {
  return (
    <div className="min-w-0 flex-1 rounded-fw-md bg-surface-sunken p-3">
      <p className="text-eyebrow font-semibold uppercase tracking-widest text-warm-400">{label}</p>
      {count === null ? (
        <p className="mt-1 text-sm font-semibold text-fw-warning-ink">unknown</p>
      ) : (
        <p className="mt-1 font-fw-mono text-lg font-semibold tabular-nums text-warm-900">
          {count.toLocaleString()}
        </p>
      )}
      <p className="mt-1 text-caption text-warm-500">
        {description}
        {count === null ? ' Could not be read this refresh — that is not the same fact as zero.' : null}
      </p>
    </div>
  );
}

/** A plain left-to-right arrow, not a Sankey diagram — this pipeline is not
 *  claiming any step converts into the next one, so no width encodes a rate. */
function PipelineArrow() {
  return (
    <div aria-hidden className="hidden shrink-0 items-center justify-center text-warm-300 sm:flex">
      <ChevronRight className="h-4 w-4" />
    </div>
  );
}

function ThroughputPipeline({ evidence }: { evidence: CapabilityEvidence }) {
  return (
    <div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
        <ThroughputStep
          label="Signals collected"
          description="Correlated signals in the latest readable reliability snapshot."
          count={evidence.signalsCollected}
        />
        <PipelineArrow />
        <ThroughputStep
          label="Analyses written"
          description="rca_analysis rows Diagnose wrote in the last 7 days."
          count={evidence.analysesWritten}
        />
        <PipelineArrow />
        <ThroughputStep
          label="Repair PRs opened"
          description="Pull requests that name an incident Repair fixed."
          count={evidence.repairPrsOpened}
        />
        <PipelineArrow />
        <ThroughputStep
          label="Auto resolutions recorded"
          description="Rows Close wrote to admin_error_resolutions with resolution_source = 'auto'."
          count={evidence.autoResolutionsRecorded}
        />
      </div>
      {/* The honesty line this block exists to carry: these four numbers are
          read from three different tables under three different windows (a
          rolling 7 days for analyses, all-time for PRs and resolutions, and
          whatever the latest 3-hourly reliability run covers) — a drop
          between any two of them is a fact about the windows, not a
          conversion rate the loop is failing to hit. */}
      <p className="mt-3 text-xs text-warm-500">
        These are counts from different systems over different windows — analyses over the last 7 days, PRs and
        resolutions all-time, signals from the latest reliability run only. The drop between any two numbers here is
        not a conversion rate.
      </p>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Local runner
 * ------------------------------------------------------------------------- */

function LocalRunnerStage({ stage }: { stage: SelfHealStageDetail }) {
  return (
    <div className="rounded-fw-md bg-surface-sunken p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-warm-900">{stage.title}</span>
        <span className="font-fw-mono text-caption text-warm-500">{SELFHEAL_RUNNER_LABEL[stage.runner]}</span>
      </div>
      <dl className="mt-1.5 space-y-0.5 text-caption">
        <div className="flex items-baseline justify-between gap-2">
          <dt className="text-warm-500">Last heartbeat</dt>
          <dd className="min-w-0 text-right font-fw-mono tabular-nums text-warm-600">
            {stage.lastRunAt ? formatStageAge(stage.lastRunAt) : 'no heartbeat on record'}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <dt className="text-warm-500">Next expected</dt>
          <dd className="min-w-0 text-right font-fw-mono tabular-nums text-warm-600">
            {stage.nextExpectedAt ? <LocalTime iso={stage.nextExpectedAt} variant="datetime" /> : '—'}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <dt className="text-warm-500">Contract</dt>
          <dd className="min-w-0 break-all text-right font-fw-mono text-warm-600">{stage.contract}</dd>
        </div>
      </dl>
      {/* Overdue is a scheduling fact, not a diagnosis — a laptop's launchd
          agent goes quiet for reasons that have nothing to do with the code
          it runs (the machine slept, the plist was never loaded; see
          selfheal-registry.ts's header for the 2026-08-27 instance of the
          second one). Naming the stage as broken without evidence of an
          actual failed run would be a claim this page cannot back up. */}
      {stage.status === 'overdue' ? (
        <p className="mt-1.5 text-caption text-fw-warning-ink">
          Overdue. The machine may have been asleep, or the launchd job did not fire.
        </p>
      ) : null}
    </div>
  );
}

function LocalRunnerBlock({ stages }: { stages: readonly SelfHealStageDetail[] }) {
  const local = stages.filter((s) => s.runner === 'local-agent');
  if (local.length === 0) return null;

  return (
    <Surface padding="sm">
      <Eyebrow as="h2">Local runner</Eyebrow>
      <p className="mt-1 text-xs text-warm-500">
        Runs on the owner&rsquo;s laptop via launchd, outside this deployment — nothing here can watch it fail, only
        notice that it stopped writing a heartbeat.
      </p>
      <div className="mt-3 space-y-3">
        {local.map((stage) => (
          <LocalRunnerStage key={stage.id} stage={stage} />
        ))}
      </div>
    </Surface>
  );
}

/* ---------------------------------------------------------------------------
 * Body
 * ------------------------------------------------------------------------- */

async function SelfHealBody() {
  const result = await fetchSelfHealBoard();

  // Never render an empty circuit on a failed fetch — that reads as a loop
  // with no stages, which is a different (and much calmer) claim than "we
  // could not read the board this refresh".
  if (result.status !== 'ok' || !result.data) {
    return <PanelStale label="Self-heal board" error={result.error ?? 'unknown error'} />;
  }

  const board = result.data;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill tone={VERDICT_TONE[board.verdict.tone]} dot size="md">
          {board.verdict.label}
        </StatusPill>
        <span className="text-sm text-warm-600">{board.verdict.detail}</span>
      </div>

      <Surface padding="sm">
        <Eyebrow as="h2">Circuit</Eyebrow>
        <p className="mt-1 text-xs text-warm-500">
          Runtime (is it on schedule) and capability (has it ever produced its output) for each stage, in order.
        </p>
        <div className="mt-3">
          <SelfHealCircuit stages={board.stages} verdict={board.verdict} />
        </div>
      </Surface>

      <Surface padding="sm">
        <Eyebrow as="h2">Throughput</Eyebrow>
        <div className="mt-3">
          <ThroughputPipeline evidence={board.evidence} />
        </div>
      </Surface>

      <Surface padding="sm">
        <Eyebrow as="h2">Run history</Eyebrow>
        <p className="mt-1 text-xs text-warm-500">
          Newest run on the right, per stage. A stage with no recorded runs shows empty cells, not a missing row.
        </p>
        <div className="mt-3">
          <RunHistoryHeatmap stages={board.stages} />
        </div>
      </Surface>

      <LocalRunnerBlock stages={board.stages} />

      {board.unreadable.length > 0 ? (
        <InlineNotice tone="warning" title="Some stages could not be read">
          {board.unreadable.join(', ')} — the run-history query failed this refresh, so these fall back to
          &ldquo;never-ran&rdquo;. Treat that as unknown, not healthy. Reload to retry.
        </InlineNotice>
      ) : null}
    </div>
  );
}

export default async function SelfHealPage() {
  await requireSuperAdmin();

  return (
    <div className="space-y-6">
      <AutoRefresh intervalMs={60_000} />
      <div>
        <h1 className="text-lg font-semibold text-warm-900">Self-heal</h1>
        <p className="mt-0.5 max-w-2xl text-sm text-warm-600">
          Error to diagnosis to repair to closure — and whether each stage has ever actually produced its output,
          not just whether it ran.
        </p>
      </div>
      <PanelBoundary title="Self-heal" skeleton={<PanelPageSkeleton rows={6} />}>
        <SelfHealBody />
      </PanelBoundary>
    </div>
  );
}
