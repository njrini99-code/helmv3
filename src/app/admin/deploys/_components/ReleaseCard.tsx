import { Surface, Inset, StatusPill, BarCompare } from '@/components/fairway';
import { formatDeployAge } from '@/lib/admin/vercel-api';
import { githubIssuesRepo } from '@/lib/admin/github-issues-config';
import type { ReleaseCardData } from '@/lib/admin/data/release-ledger';
import { LocalTime } from '../../_components/LocalTime';
import { ReleaseCardExpand } from './ReleaseCardExpand';

/** Same tiny commit-link builder deploys/page.tsx keeps privately — not
 *  exported from there (a Next.js page module), so this is the one
 *  intentional two-line duplication rather than reshaping the page's
 *  exports for a single helper. */
function githubCommitHref(sha: string | null): string | null {
  if (!sha) return null;
  const { owner, repo } = githubIssuesRepo();
  return `https://github.com/${owner}/${repo}/commit/${sha}`;
}

export function ReleaseCard({ card }: { card: ReleaseCardData }) {
  const shortSha = card.commitSha ? card.commitSha.slice(0, 7) : card.uid.slice(0, 7);
  const commitHref = githubCommitHref(card.commitSha);
  const hasFeatureDeltas = card.topFeatureDeltas.length > 0;

  const summary = (
    <Surface
      padding="sm"
      elevation={card.isLive ? 'shadow' : 'border'}
      className={card.isLive ? 'border-accent-600/40' : undefined}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {commitHref ? (
              <a
                href={commitHref}
                target="_blank"
                rel="noreferrer"
                className="truncate font-fw-mono text-sm font-medium text-accent-700 underline"
              >
                {shortSha}
              </a>
            ) : (
              <span className="truncate font-fw-mono text-sm text-warm-900">{shortSha}</span>
            )}
            {card.isLive ? (
              <StatusPill tone="success" dot size="sm">
                live
              </StatusPill>
            ) : null}
          </div>
          <p className="mt-0.5 truncate text-xs text-warm-600">
            {card.commitMessage ?? card.commitRef ?? 'no commit message'}
          </p>
          {card.commitAuthor ? <p className="text-xs text-warm-500">by {card.commitAuthor}</p> : null}
        </div>
        <StatusPill tone={card.verdict.tone} dot size="sm" className="shrink-0">
          {card.verdict.label}
        </StatusPill>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 border-t border-warm-200 pt-3">
        <div>
          <p className="text-eyebrow uppercase text-warm-500">errors · 2h before</p>
          <p className="font-fw-mono text-lg tabular-nums text-warm-900">{card.errorsBefore2h}</p>
        </div>
        <div>
          <p className="text-eyebrow uppercase text-warm-500">errors · 2h after</p>
          <p className="font-fw-mono text-lg tabular-nums text-warm-900">
            {card.gatheringSignal ? '—' : card.errorsAfter2h}
          </p>
        </div>
      </div>

      {card.gatheringSignal ? (
        <p className="mt-2 text-xs text-warm-500">
          Still gathering signal — shipped {formatDeployAge(card.createdAt)} ago.
        </p>
      ) : (
        <p className="mt-2 text-xs text-warm-500">
          <span className="font-fw-mono tabular-nums text-accent-700">{card.resolvedAndQuietSince}</span> resolved
          &amp; quiet ·{' '}
          <span className="font-fw-mono tabular-nums text-warm-700">{card.newFingerprintsSince}</span> new · shipped{' '}
          {formatDeployAge(card.createdAt)} ago
        </p>
      )}
    </Surface>
  );

  const detail = (
    <Inset padding="sm" className="mt-2 space-y-4">
      {hasFeatureDeltas ? (
        <BarCompare
          title="Feature error deltas"
          subtitle="2h before → 2h after this deploy, top 5 by magnitude"
          data={card.topFeatureDeltas.map((f) => ({
            label: f.feature,
            value: f.delta,
            highlight: f.delta > 0,
          }))}
          valueFormatter={(v) => (v > 0 ? `+${v}` : String(v))}
          height={Math.max(120, card.topFeatureDeltas.length * 40)}
        />
      ) : (
        <p className="text-xs text-warm-500">
          {card.gatheringSignal
            ? 'No feature breakdown yet — still gathering post-ship signal.'
            : 'No feature-tagged error activity in either window.'}
        </p>
      )}

      <div>
        <p className="text-eyebrow uppercase text-warm-500">new fingerprints since ship</p>
        {card.newFingerprintSamples.length === 0 ? (
          <p className="mt-1 text-xs text-warm-500">None — nothing new during this deploy&apos;s reign.</p>
        ) : (
          <ul className="mt-1.5 divide-y divide-warm-200/60">
            {card.newFingerprintSamples.map((f) => (
              <li key={f.fingerprint} className="flex items-center gap-2 py-1.5 text-xs">
                <StatusPill tone={f.severity === 'critical' ? 'danger' : 'warning'} dot size="sm" className="shrink-0">
                  {f.severity}
                </StatusPill>
                <a
                  href={`/admin/errors/${encodeURIComponent(f.fingerprint)}`}
                  className="min-w-0 flex-1 truncate text-accent-700 underline"
                >
                  {f.title}
                </a>
                <span className="shrink-0 font-fw-mono text-warm-500">
                  <LocalTime iso={f.firstSeen} variant="datetime" />
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Inset>
  );

  return <ReleaseCardExpand summary={summary} detail={detail} />;
}
