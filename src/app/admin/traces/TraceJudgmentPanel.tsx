'use client';

import { useState } from 'react';
import { Button, InlineNotice, StatusPill } from '@/components/fairway';
import { bridgeJudgeFlightTrace, type FlightTraceJudgmentView } from '@/app/admin/actions/golf-tracer';
import { EYEBROW_CLASS } from './TraceTree';

function tone(disposition: string) {
  if (disposition === 'escalate' || disposition === 'block') return 'danger' as const;
  if (disposition === 'collect_more_evidence' || disposition === 'observe') return 'warning' as const;
  if (disposition === 'pass') return 'success' as const;
  return 'neutral' as const;
}

function pct(value: number | null): string {
  return value == null ? '—' : `${Math.round(value * 100)}%`;
}

/**
 * Collapsed "Judgment" section for one trace. Evidence first, judgment
 * second, versions and mode always visible, `unassessed` said out loud —
 * the judgment is never an opaque authority over the tree above it.
 */
export function TraceJudgmentPanel({ traceId }: { traceId: string }) {
  const [view, setView] = useState<FlightTraceJudgmentView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const next = await bridgeJudgeFlightTrace(traceId);
      if (!next) setError('Trace not found.');
      setView(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Judgment failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <details className="mt-4 rounded-md border border-warm-200 p-3">
      <summary className={EYEBROW_CLASS}>Judgment (Jev, shadow)</summary>
      <div className="mt-2 space-y-2 text-caption">
        {!view && (
          <Button type="button" variant="secondary" size="sm" onClick={run} disabled={busy}>
            {busy ? 'Judging…' : 'Run semantic judgment'}
          </Button>
        )}
        {error && <InlineNotice tone="danger">{error}</InlineNotice>}
        {view && (
          <>
            <div>
              <span className={EYEBROW_CLASS}>Evidence</span>
              <ul className="mt-1 font-fw-mono text-warm-700">
                <li>{view.evidence.requiredObservedSuccess}/{view.evidence.requiredDeclared} required steps observed successful</li>
                {view.evidence.requiredMissing.length > 0 && <li>missing: {view.evidence.requiredMissing.join(', ')}</li>}
                {view.evidence.requiredFailed.length > 0 && <li>failed: {view.evidence.requiredFailed.join(', ')}</li>}
                {view.evidence.verificationMismatches.length > 0 && <li>verification mismatch: {view.evidence.verificationMismatches.join('; ')}</li>}
                <li>recovery path used: {view.evidence.recoveryPath ? 'yes' : 'no'}</li>
                {view.evidence.hardInvariants.length > 0 && <li className="text-fw-danger-ink">hard invariants: {view.evidence.hardInvariants.join(', ')}</li>}
              </ul>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className={EYEBROW_CLASS}>Verdict</span>
              <StatusPill tone={tone(view.disposition)}>{view.disposition.replace(/_/g, ' ')}</StatusPill>
              {view.disposition === 'unassessed' && (
                <span className="text-warm-500">not assessed{view.providerErrorCode ? ` (${view.providerErrorCode})` : ''}</span>
              )}
            </div>
            <ul className="font-fw-mono text-warm-700">
              <li>intent preserved: {pct(view.intentPreserved)}</li>
              <li>silent failure: {pct(view.silentFailure)}</li>
              <li>failure domain: {view.failureDomain ? `${view.failureDomain.choice} (${pct(view.failureDomain.confidence)})` : '—'}</li>
              {view.reasonCodes.length > 0 && <li>reasons: {view.reasonCodes.join(', ')}</li>}
            </ul>
            <p className="text-warm-500">
              {view.evaluatorVersion} · {view.policyVersion} · {view.mode}{view.shadow ? ' (shadow — changes nothing)' : ''} · {view.modelId} · {view.durationMs} ms
            </p>
          </>
        )}
      </div>
    </details>
  );
}
