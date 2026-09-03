import Link from 'next/link';
import { cn } from '@/lib/utils';
import type { PostureSentence as PostureSentenceModel } from '@/lib/admin/command-deck/posture';
import { POSTURE_TONE_RAIL } from './tone';

const TONE_LABEL: Readonly<Record<PostureSentenceModel['tone'], string>> = {
  healthy: 'HEALTHY',
  degraded: 'DEGRADED',
  critical: 'CRITICAL',
  unknown: 'UNKNOWN',
};

/**
 * The Command Deck's posture sentence (brief §10, §46 "triage in ~5s").
 *
 * `PostureSentence.headline` already joins every clause with " · " — this
 * component renders that string, plus a state-word chip in front of it so
 * the tone is legible before the reader parses any text (never colour
 * alone: the chip carries the same word `TONE_LABEL` states in prose).
 */
export function PostureSentenceBanner({ posture }: { posture: PostureSentenceModel }) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-3 rounded-xl border border-warm-200 bg-surface px-4 py-3">
      <span
        className={cn(
          'inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-eyebrow font-bold uppercase tracking-wide',
          POSTURE_TONE_RAIL[posture.tone],
          posture.tone === 'unknown' ? 'text-warm-700' : 'text-text-on-accent',
        )}
      >
        {TONE_LABEL[posture.tone]}
      </span>
      <p className="min-w-0 flex-1 text-sm font-medium text-warm-900">{posture.headline}</p>
      {posture.topIncident?.href ? (
        <Link
          href={posture.topIncident.href}
          className="shrink-0 text-caption text-accent-700 underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500"
        >
          Open →
        </Link>
      ) : null}
    </div>
  );
}
