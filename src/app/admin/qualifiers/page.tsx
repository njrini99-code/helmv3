import { requireSuperAdmin } from '@/lib/admin/require-super-admin';
import { fetchQualifierLogic } from '@/lib/admin/data/qualifier-logic';
import type { QualifierInvariantResult } from '@/lib/admin/qualifier-invariants';
import { Surface, Inset, StatStrip, StatusPill, Badge, InlineNotice, Eyebrow, type FwStatusTone } from '@/components/fairway';
import { cn } from '@/lib/utils';
import { KpiTile } from '../_components/KpiTile';
import { PanelBoundary } from '../_components/PanelBoundary';
import { PanelPageSkeleton } from '../_components/PanelSkeletons';
import { AutoRefresh } from '../_components/AutoRefresh';
import { LocalTime } from '../_components/LocalTime';

export const dynamic = 'force-dynamic';

/**
 * Helm Bridge — Qualifier Logic.
 *
 * Full visibility into qualifier business rules: every invariant
 * `qualifier-invariants.ts` can check against live rows, rendered as a row —
 * whether it is currently violated or not. The value of this page is
 * knowing which rules are checked and that they are holding, not merely
 * seeing failures when they occur; a clean read is "checked, holding", never
 * an empty panel that could be mistaken for "nothing was looked at".
 *
 * All data — lifecycle summary and every invariant result — comes from the
 * pure evaluators in `@/lib/admin/qualifier-invariants`; this page and its
 * data layer contain no business-rule logic of their own.
 *
 * PARTIAL-READ HONESTY: three of the four invariants (cross-team link,
 * orphan link, over cap) look qualifiers up by id out of the SAME bounded
 * `golf_qualifiers` page the lifecycle summary uses. If that page is a
 * partial read of production (`qualifiers.truncated`), a round whose real
 * qualifier merely fell outside the fetched page is indistinguishable, from
 * here, from a round whose qualifier is genuinely gone — and a real
 * cross-team/over-cap match against an unfetched qualifier is invisible
 * either way. So a partial read can move a violation count in either
 * direction, not just under-count. Rather than guess a direction, "0
 * violations" stops being rendered as "checked, holding" the instant either
 * bounded read is a partial one, and the page says so explicitly. At
 * production's actual 2026-08-27 scale (~12 qualifiers, ~121 linked rounds
 * against caps of 2,000 / 20,000) this never fires — it exists so the page
 * degrades to an honest "unconfirmed" instead of a fabricated all-clear if
 * that ever stops being true.
 */

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="border-b border-accent-600/25 pb-2 text-xs font-semibold uppercase tracking-widest text-warm-500">
      {children}
    </h2>
  );
}

const SEVERITY_TONE: Record<QualifierInvariantResult['severity'], FwStatusTone> = {
  critical: 'danger',
  warning: 'warning',
};

/**
 * One invariant, always rendered — passing or not. A passing row still
 * states its rule and its violation count (0) so the page can never be
 * mistaken for "nothing to show here". Under a partial read (`partialRead`)
 * a zero count reads as "no violations in the rows read" rather than the
 * stronger "checked, holding" claim — see the module doc comment above.
 */
function InvariantRow({ result, partialRead }: { result: QualifierInvariantResult; partialRead: boolean }) {
  const holding = result.violations === 0;
  const shown = result.sampleRoundIds.length;
  return (
    <Inset padding="sm" className={cn(!holding && (result.severity === 'critical' ? 'ring-1 ring-fw-danger/30' : 'ring-1 ring-fw-warning/30'))}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-warm-900">{result.label}</p>
          <p className="mt-1 text-xs italic leading-relaxed text-warm-600">&ldquo;{result.rule}&rdquo;</p>
        </div>
        <StatusPill tone={holding ? (partialRead ? 'neutral' : 'success') : SEVERITY_TONE[result.severity]} dot size="sm" className="shrink-0">
          {holding
            ? partialRead
              ? 'no violations in the rows read'
              : 'checked, holding'
            : `${result.violations} violation${result.violations === 1 ? '' : 's'}`}
        </StatusPill>
      </div>
      <p className="mt-2 text-xs text-warm-500">{result.consequence}</p>
      {!holding && shown > 0 ? (
        <details className="mt-2">
          <summary className="flex min-h-[44px] cursor-pointer items-center text-xs text-warm-700 underline decoration-dotted decoration-warm-400 marker:text-warm-400">
            sample round id{shown === 1 ? '' : 's'} ({shown}
            {result.violations > shown ? ` of ${result.violations}` : ''})
          </summary>
          <ul className="mt-1 space-y-0.5 font-fw-mono text-xs text-warm-700">
            {result.sampleRoundIds.map((id) => (
              <li key={id} className="break-all">
                {id}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </Inset>
  );
}

async function QualifierLogicBody() {
  const result = await fetchQualifierLogic();

  if (result.status !== 'ok' || !result.data) {
    return (
      <InlineNotice tone="danger" title="Could not read qualifier data">
        {result.error ?? 'unknown error'} — rendering nothing rather than a fabricated lifecycle or invariant state.
      </InlineNotice>
    );
  }

  const { lifecycle, invariants, worstSeverity, qualifiers, linkedRounds } = result.data;
  const fetchedAt = result.fetchedAt ?? new Date().toISOString();
  const partialRead = qualifiers.truncated || linkedRounds.truncated;
  const violatedCount = invariants.filter((i) => i.violations > 0).length;
  // Best-known total for the KPI tiles: the confirmed count when the probe
  // succeeded, else the page length itself (never a blank).
  const qualifierDisplayTotal = qualifiers.confirmedTotal ?? qualifiers.evaluated;
  const linkedRoundDisplayTotal = linkedRounds.confirmedTotal ?? linkedRounds.evaluated;

  return (
    <div className="space-y-6">
      {partialRead ? (
        <InlineNotice
          tone="warning"
          title="Partial read — invariants below were evaluated against a bounded page, not a confirmed-complete table"
        >
          {qualifiers.truncated ? (
            <p>
              {qualifiers.confirmedTotal !== null
                ? `${qualifiers.confirmedTotal.toLocaleString()} qualifiers exist in production; only the first ${qualifiers.evaluated.toLocaleString()} were read and checked below.`
                : `The qualifiers read came back at its ${qualifiers.evaluated.toLocaleString()}-row cap and the exact total could not be confirmed (the count probe itself failed) — there may be more than ${qualifiers.evaluated.toLocaleString()}.`}
            </p>
          ) : null}
          {linkedRounds.truncated ? (
            <p className={qualifiers.truncated ? 'mt-1' : undefined}>
              {linkedRounds.confirmedTotal !== null
                ? `${linkedRounds.confirmedTotal.toLocaleString()} rounds are linked to a qualifier in production; only the first ${linkedRounds.evaluated.toLocaleString()} were read and checked below.`
                : `The linked-rounds read came back at its ${linkedRounds.evaluated.toLocaleString()}-row cap and the exact total could not be confirmed (the count probe itself failed) — there may be more than ${linkedRounds.evaluated.toLocaleString()}.`}
            </p>
          ) : null}
          {qualifiers.truncated ? (
            <p className="mt-1">
              The cross-team-link, orphan-link, and over-cap checks all look qualifiers up by id out of this same
              partial qualifier page — a count from any of them may not reflect the true violation state (it can run
              either high or low) until a full read confirms it.
            </p>
          ) : null}
        </InlineNotice>
      ) : null}

      <StatStrip count={4} mdColumns={4} ariaLabel="Qualifier lifecycle">
        <KpiTile label="Qualifiers" value={qualifierDisplayTotal} href="#lifecycle" />
        <KpiTile label="Linked rounds" value={linkedRoundDisplayTotal} href="#lifecycle" />
        <KpiTile label="Multi-round" value={lifecycle.multiRound} href="#lifecycle" />
        <KpiTile
          label="Missing cap"
          value={lifecycle.missingCap}
          href="#lifecycle"
          tone={lifecycle.missingCap > 0 ? 'warning' : 'neutral'}
          goodDirection="down"
        />
      </StatStrip>

      <Surface padding="sm" id="lifecycle">
        <SectionLabel>Lifecycle — by status</SectionLabel>
        <p className="mt-1 text-xs text-warm-500">
          {lifecycle.total} qualifier{lifecycle.total === 1 ? '' : 's'} total, {lifecycle.linkedRounds} linked round
          {lifecycle.linkedRounds === 1 ? '' : 's'}. &ldquo;Missing cap&rdquo; is not a violation on its own — legacy
          rows predate the cap — it is the population for which an entry refusal from the configured round count can
          never fire.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {lifecycle.byStatus.length === 0 ? (
            <span className="text-xs text-warm-500">no qualifiers on record</span>
          ) : (
            lifecycle.byStatus.map((s) => (
              <Badge key={s.status} tone="neutral" numeric>
                {s.status}: {s.count}
              </Badge>
            ))
          )}
        </div>
      </Surface>

      <Surface padding="sm" id="invariants">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-accent-600/25 pb-2">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-warm-500">
            Invariants — checked against live rows
          </h2>
          <StatusPill
            tone={worstSeverity !== null ? (worstSeverity === 'critical' ? 'danger' : 'warning') : partialRead ? 'neutral' : 'success'}
            dot
            size="sm"
          >
            {worstSeverity !== null
              ? `${violatedCount} of ${invariants.length} violated`
              : partialRead
                ? 'no violations in the rows read — partial read'
                : `all ${invariants.length} checked, holding`}
          </StatusPill>
        </div>
        <p className="mt-2 text-xs text-warm-500">
          Every business rule below is evaluated fresh against {qualifiers.evaluated.toLocaleString()} qualifiers and{' '}
          {linkedRounds.evaluated.toLocaleString()} linked rounds read this load — not a static claim about what
          &ldquo;should&rdquo; hold. Every rule is listed whether it is currently violated or not: the value here is
          knowing which rules are checked, not only seeing the ones that break.
        </p>
        <p className="mt-1 font-fw-mono text-xs tabular-nums text-warm-400">
          checked <LocalTime iso={fetchedAt} variant="datetime" />
        </p>
        <div className="mt-3 space-y-2">
          {invariants.map((inv) => (
            <InvariantRow key={inv.id} result={inv} partialRead={partialRead} />
          ))}
        </div>
      </Surface>
    </div>
  );
}

export default async function QualifierLogicPage() {
  await requireSuperAdmin();

  return (
    <div className="space-y-6">
      <AutoRefresh intervalMs={60_000} />
      <div>
        <Eyebrow as="p" tone="accent">
          Qualifier Logic
        </Eyebrow>
        <h1 className="mt-1 text-h3 font-semibold text-warm-900 md:text-2xl">
          Every qualifier business rule, checked against live rows
        </h1>
        <p className="mt-1 hidden max-w-2xl text-sm text-warm-500 md:block">
          Lifecycle counts plus every cross-team, orphan-link, duplicate-slot, and over-cap invariant from{' '}
          <span className="font-fw-mono">memory/features/qualifiers.md</span>, evaluated against production on every
          load. A passing row means the rule was checked and held — not that there was nothing to check.
        </p>
      </div>
      <PanelBoundary title="Qualifier Logic" skeleton={<PanelPageSkeleton stats={4} rows={6} />}>
        <QualifierLogicBody />
      </PanelBoundary>
    </div>
  );
}
