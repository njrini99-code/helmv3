'use client';

/**
 * Brief §56's layered read of one trace, rendered above the containment tree.
 *
 * The tree answers "where did reality diverge"; this answers "which layer was
 * it in, and is the evidence for that answer actually here". Both read the
 * SAME `buildTraceTree` output — this panel adds no second data path, it
 * projects the tree through `toExplorerView`.
 *
 * The banner is the reason this exists. When a transaction rolls back it
 * erases its own `helm_debug.trace_steps` rows, so the RPC renders as one
 * failed step with nothing beneath it — which looks identical to an RPC that
 * simply had no substeps. `toExplorerView` distinguishes those two, and this
 * says so in the words brief §56 specifies.
 */

import { useMemo } from 'react';
import { InlineNotice } from '@/components/fairway';
import type { TraceTree } from './trace-tree';
import { EXPLORER_LAYERS, toExplorerView, type ExplorerLayer } from './trace-explorer-layers';

/**
 * Step keys that ARE a single Postgres transaction but are stored at layer
 * `'supabase'`. Measured, not guessed: `src/app/golf/actions/golf.ts` calls
 * exactly two RPCs — `submit_round_atomic` (already recorded at layer
 * 'postgres', so the explorer reads it as an RPC on its own) and
 * `save_partial_round_atomic`, whose workflow definition declares it
 * 'supabase'. If a third RPC is added, add its step key here; nothing infers
 * this from a key prefix, because a prefix cannot tell an RPC from a table
 * read.
 */
const SUPABASE_DECLARED_RPC_STEP_KEYS = ['db.save_partial_round_atomic'] as const;

const LAYER_LABEL: Record<ExplorerLayer, string> = {
  CLIENT: 'Client',
  SERVER_ACTION: 'Server action',
  SUPABASE_POSTGREST: 'Supabase / PostgREST',
  POSTGRES_RPC: 'Postgres RPC',
  POSTGRES_SUBSTEPS: 'Postgres substeps',
  VERIFICATION: 'Verification',
  ASYNC_DOWNSTREAM: 'Async downstream',
};

export function TraceExplorerLayerPanel({
  tree,
  sentryOrgSlug = null,
}: {
  tree: TraceTree;
  /** Passed through; a null slug renders no Sentry links rather than guessed ones. */
  sentryOrgSlug?: string | null;
}) {
  const view = useMemo(
    () =>
      toExplorerView(tree, {
        sentryOrgSlug,
        additionalRpcStepKeys: SUPABASE_DECLARED_RPC_STEP_KEYS,
      }),
    [tree, sentryOrgSlug],
  );

  return (
    <div className="space-y-3">
      {view.rollbackNotices.map((notice) => (
        <InlineNotice key={notice.stepKey} tone="danger">
          <span className="font-fw-mono">{notice.text}</span>
        </InlineNotice>
      ))}

      <div className="overflow-x-auto">
        <div className="flex min-w-[36rem] gap-2">
          {EXPLORER_LAYERS.map((layer) => {
            const steps = view.byLayer[layer];
            const failed = steps.filter((s) => s.status === 'failure').length;
            const missing = steps.filter((s) => s.isMissing).length;
            return (
              <div
                key={layer}
                className="min-w-0 flex-1 rounded-fw-md border border-warm-200 px-2.5 py-2"
              >
                <p className="truncate text-caption text-warm-500">{LAYER_LABEL[layer]}</p>
                <p
                  className={`font-fw-mono text-body font-semibold tabular-nums ${
                    failed > 0 ? 'text-fw-danger-ink' : 'text-warm-900'
                  }`}
                >
                  {steps.length}
                </p>
                {/* An empty layer says "nothing ran here", which is a fact.
                    A layer with missing steps says something stronger. */}
                {missing > 0 && (
                  <p className="text-caption text-fw-danger-ink">{missing} never ran</p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
