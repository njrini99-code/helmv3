import { notFound } from 'next/navigation';
import { CoachHelmEvidencePreview } from './coachhelm-evidence-preview';

/**
 * Local fixture of a CoachHelm Ask thread with every evidence visual the chat
 * renders (metric panel, trend, make curve, bar compare, strokes-gained
 * tornado, comparison, ranking, partial and empty states), for screenshots.
 * Synthetic data; no reads, no writes, not served in production.
 */
export default function CoachHelmEvidencePreviewPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <CoachHelmEvidencePreview />;
}
