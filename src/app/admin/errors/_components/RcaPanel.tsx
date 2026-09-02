'use client';

import { useState, useTransition } from 'react';
import { Sparkles } from 'lucide-react';
import { Button, InlineNotice, Surface } from '@/components/fairway';
import type { RcaAnalysis, RcaResult } from '@/lib/admin/rca';
import { analyzeErrorFingerprint } from '../../actions/analyze-error';
import { RcaAnalysisView } from './RcaAnalysisView';

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
        <div className="mt-3">
          <RcaAnalysisView analysis={analysis} />
        </div>
      ) : !notice ? (
        <p className="mt-3 text-sm text-warm-500">
          No analysis yet — run one to get a probable cause, suspect files and a suggested fix.
        </p>
      ) : null}
    </Surface>
  );
}
