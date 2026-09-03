import Link from 'next/link';
import type { PostureSentence as PostureSentenceModel } from '@/lib/admin/command-deck/posture';
import { POSTURE_TONE_STATE_TONE } from '@/lib/admin/command-deck/types';
import { PosturePill } from '@/components/admin/premium';

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
 * alone: the chip carries the same word `TONE_LABEL` states in prose). The
 * chip itself is `bridge-premium-p1`'s shared `PosturePill` — the tone maps
 * via `POSTURE_TONE_STATE_TONE` (`command-deck/types.ts`) since this
 * module's `PostureTone` is a coarser four-value axis than `PosturePill`'s
 * `StateTone | 'unknown'`, and `PosturePill`'s own `'unknown'` branch
 * already renders `UnknownValue`'s hatched treatment rather than a plain
 * pill — exactly the "unknown never equals healthy" distinction this whole
 * page exists to keep visible.
 */
export function PostureSentenceBanner({ posture }: { posture: PostureSentenceModel }) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-3 rounded-xl border border-warm-200 bg-surface px-4 py-3">
      <PosturePill
        tone={POSTURE_TONE_STATE_TONE[posture.tone]}
        reason={posture.tone === 'unknown' ? 'Posture could not be fully determined — a required source is blind or unread this refresh.' : null}
      >
        {TONE_LABEL[posture.tone]}
      </PosturePill>
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
