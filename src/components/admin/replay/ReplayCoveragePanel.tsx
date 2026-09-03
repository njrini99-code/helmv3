import { StatusPill, type FwStatusTone } from '@/components/fairway';
import type { ReplayCoverageIndexRow, ReplayVerdict } from '@/lib/admin/replay/coverage';
import { VERDICT_LABEL } from '@/lib/admin/replay/coverage';

/**
 * REPLAY COVERAGE — Phase G, G.6.
 *
 * A row per backfilled incident replay (`replay/manifests/*.yml`), reusing
 * `SelfHealCircuit.tsx`'s visual pattern (a `StatusPill` tone paired with a
 * word, never color alone) rather than importing that file — it is shared
 * with `/admin`'s overview page (`src/app/admin/_components/SelfHealFlow.tsx`),
 * which is out of scope for this change, so this is a new, additive
 * component wired only into `/admin/self-heal`.
 *
 * `not-yet-run` renders NEUTRAL, never green and never omitted — an
 * un-executed replay is the same "unknown never renders as healthy" rule
 * `canClaimAllClear` applies to a blind incident source. See
 * `coverage.ts`'s header for why the verdict can never be fabricated here:
 * it comes from a generated index that only a real `run.mjs` execution can
 * move off `not-yet-run`.
 */

const VERDICT_TONE: Record<ReplayVerdict, FwStatusTone> = {
  reproduced: 'success',
  inconclusive: 'warning',
  'not-yet-run': 'neutral',
};

function shortSha(sha: string): string {
  return sha.slice(0, 10);
}

export function ReplayCoveragePanel({ rows }: { rows: readonly ReplayCoverageIndexRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-warm-500">
        No replay manifests exist yet. `docs/ai-system/selfheal/repair-contract.md` STEP 3 grows this corpus as a
        required output of every future Repair run.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-warm-200">
      {rows.map((row) => (
        <li key={row.replayId} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-warm-800">{row.title}</p>
            <p className="mt-0.5 text-xs text-warm-500">
              {row.featureId} · {shortSha(row.badVersion)} → {shortSha(row.fixedVersion)}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <StatusPill tone={VERDICT_TONE[row.verdict]} size="sm">
              {VERDICT_LABEL[row.verdict]}
            </StatusPill>
          </div>
        </li>
      ))}
    </ul>
  );
}
