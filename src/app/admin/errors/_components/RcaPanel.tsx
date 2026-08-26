'use client';

import { useState, useTransition } from 'react';
import { Sparkles } from 'lucide-react';
import { Button, InlineNotice, StatusPill, Surface, type FwStatusTone } from '@/components/fairway';
import type { RcaAnalysis, RcaResult } from '@/lib/admin/rca';
import { LocalTime } from '../../_components/LocalTime';
import { analyzeErrorFingerprint } from '../../actions/analyze-error';
import { FieldCopy } from './FieldCopy';

/**
 * Root-cause analysis panel for the fingerprint detail page.
 *
 * `initialAnalysis` is whatever `fetchFingerprintDetail` already read back
 * from `admin_events` (forensics.storedRca) — this component never fetches
 * on mount, so it never blocks or delays the rest of the page. "Analyze with
 * Claude" runs a fresh pass via the `analyzeErrorFingerprint` server action
 * and replaces the displayed analysis on success; an unconfigured provider or
 * a model failure surfaces inline and leaves whatever was already shown (if
 * anything) in place.
 */

const CONFIDENCE_TONE: Record<RcaAnalysis['confidence'], FwStatusTone> = {
  high: 'success',
  medium: 'warning',
  low: 'danger',
};

export function RcaPanel({
  fingerprint,
  initialAnalysis,
  onAnalyze = analyzeErrorFingerprint,
}: {
  fingerprint: string;
  initialAnalysis: RcaAnalysis | null;
  onAnalyze?: (fingerprint: string) => Promise<RcaResult>;
}) {
  const [analysis, setAnalysis] = useState<RcaAnalysis | null>(initialAnalysis);
  const [notice, setNotice] = useState<{ tone: 'warning' | 'danger'; message: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function handleAnalyze() {
    setNotice(null);
    startTransition(async () => {
      try {
        const result = await onAnalyze(fingerprint);
        if (result.status === 'ok') {
          setAnalysis(result.analysis);
          return;
        }
        if (result.status === 'unconfigured') {
          setNotice({ tone: 'warning', message: result.message });
          return;
        }
        setNotice({ tone: 'danger', message: result.message });
      } catch {
        // requireSuperAdmin() throws for a dead/non-admin session — say so
        // rather than leaving the button silently spin back to idle.
        setNotice({ tone: 'danger', message: 'Not permitted — sign back in as a super admin and retry.' });
      }
    });
  }

  return (
    <Surface padding="sm" className="min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-warm-200 pb-2">
        <h2 className="text-eyebrow uppercase text-warm-500">Root-cause analysis</h2>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          busy={pending}
          onClick={handleAnalyze}
          leftIcon={<Sparkles size={13} aria-hidden />}
        >
          Analyze with Claude
        </Button>
      </div>

      {notice ? (
        <InlineNotice tone={notice.tone} className="mt-3">
          {notice.message}
        </InlineNotice>
      ) : null}

      {analysis ? (
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill tone={CONFIDENCE_TONE[analysis.confidence]} dot size="sm">
              {analysis.confidence} confidence
            </StatusPill>
            <span className="font-fw-mono text-caption text-warm-500">
              {analysis.model} · generated <LocalTime iso={analysis.generatedAt} variant="datetime" />
            </span>
          </div>

          <div>
            <p className="text-caption uppercase tracking-widest text-warm-500">Probable cause</p>
            <p className="mt-1 break-words text-sm text-warm-900 [overflow-wrap:anywhere]">{analysis.probableCause}</p>
          </div>

          {analysis.suspectFiles.length > 0 ? (
            <div>
              <p className="text-caption uppercase tracking-widest text-warm-500">Suspect files</p>
              <ul className="mt-1 space-y-1.5">
                {analysis.suspectFiles.map((f, i) => (
                  <li key={`${f.path}-${i}`} className="min-w-0 rounded-fw-md bg-surface-sunken px-2 py-1.5">
                    <FieldCopy label={`suspect file ${f.path}`} value={f.line ? `${f.path}:${f.line}` : f.path} />
                    <p className="mt-0.5 break-words text-caption text-warm-500 [overflow-wrap:anywhere]">{f.reason}</p>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div>
            <p className="text-caption uppercase tracking-widest text-warm-500">Suggested fix</p>
            <p className="mt-1 break-words text-sm text-warm-900 [overflow-wrap:anywhere]">{analysis.suggestedFix}</p>
          </div>

          {analysis.relatedFingerprints.length > 0 ? (
            <p className="break-words font-fw-mono text-caption text-warm-500 [overflow-wrap:anywhere]">
              Related fingerprints: {analysis.relatedFingerprints.join(', ')}
            </p>
          ) : null}
        </div>
      ) : !notice ? (
        <p className="mt-3 text-sm text-warm-500">
          No analysis yet — run one to get a probable cause, suspect files and a suggested fix.
        </p>
      ) : null}
    </Surface>
  );
}
