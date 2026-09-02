import { StatusPill, type FwStatusTone } from '@/components/fairway';
// The pure vocabulary module, NOT `@/lib/admin/rca` (which is `server-only`
// and pulls the AI SDK into any client bundle it reaches). See RcaPanel's own
// note — this is the exact import that broke `next build` once.
import {
  deriveRcaCategory,
  RCA_CATEGORY_LABEL,
  type RcaCategory,
} from '@/lib/admin/rca-category';
import type { RcaAnalysis } from '@/lib/admin/rca';
import { LocalTime } from '../../_components/LocalTime';
import { FieldCopy } from './FieldCopy';

/**
 * The one canonical way to render a stored `RcaAnalysis`.
 *
 * Extracted from `RcaPanel` on 2026-08-28 so a SECOND surface — the
 * Reliability tab and the `rel:*` detail page — can show an analysis
 * identically instead of hand-rolling a divergent copy. `RcaPanel` keeps the
 * interactive shell (the "Analyze with Claude" button, notices, state); this
 * is purely the read-out.
 *
 * No `'use client'`: it holds no hooks. It composes two client leaves
 * (`LocalTime`, `FieldCopy`) which become their own islands — valid in both a
 * client tree (RcaPanel) and a server tree (the reliability page has no
 * `'use client'` anywhere). Its only value imports are from the pure
 * `rca-category` module, so it never drags `server-only` into a client bundle.
 */

// Category is the VERDICT (fix here / already fixed / not a defect / needs
// evidence); confidence is only how sure the writer was of it. Both shown.
const CATEGORY_TONE: Record<RcaCategory, FwStatusTone> = {
  'fix-here': 'warning',
  'already-fixed': 'success',
  'not-a-defect': 'neutral',
  'needs-more-evidence': 'info',
  uncategorized: 'info',
};

const CONFIDENCE_TONE: Record<RcaAnalysis['confidence'], FwStatusTone> = {
  high: 'success',
  medium: 'warning',
  low: 'danger',
};

export function RcaAnalysisView({ analysis }: { analysis: RcaAnalysis }) {
  // Derived, never stored — the four-string vocabulary is enforced nowhere at
  // write time (the writers are two agent routines), so a persisted category
  // would be a claim about text rather than a reading of it.
  const category = deriveRcaCategory(analysis.suggestedFix);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill tone={CATEGORY_TONE[category]} dot size="sm">
          {RCA_CATEGORY_LABEL[category]}
        </StatusPill>
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
  );
}
