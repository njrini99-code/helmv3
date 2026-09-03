import Link from 'next/link';
import { Surface } from '@/components/fairway';
import { EvidenceSourceChips, EpisodeTimelineStrip } from '@/components/admin/premium';
import type { IncidentGenome } from '@/lib/admin/incidents/genome';
import { LocalTime } from '../../_components/LocalTime';

/**
 * Incident Genome (brief §14 zone B): "occurrence timeline grouped by
 * release: fixed / clean / REGRESSION" plus the root-cause grouping — every
 * attached evidence source, downstream symptoms, and why they were merged.
 */

export function IncidentGenomePanel({ genome }: { genome: IncidentGenome }) {
  const { incidentId, aliasGroup, downstreamSymptoms, episodes, evidenceCoverage } = genome;

  return (
    <Surface padding="sm" className="min-w-0">
      <h2 className="text-eyebrow uppercase text-warm-500">Incident Genome</h2>

      <div className="mt-3">
        <p className="text-caption uppercase tracking-wide text-warm-500">Occurrence timeline</p>
        <div className="mt-1.5">
          <EpisodeTimelineStrip episodes={episodes.episodes} incomplete={episodes.timelineIncomplete} />
        </div>
        <ul className="mt-2 space-y-1.5">
          {episodes.episodes.map((episode) => (
            <li key={episode.number} className="text-body-sm leading-5 text-warm-700">
              <span className="font-medium text-warm-900">{episode.headline}</span>
              <span className="text-warm-500">
                {' '}
                — {episode.occurrenceCount} occurrence{episode.occurrenceCount === 1 ? '' : 's'},{' '}
                {episode.endedAt ? (
                  <>
                    resolved <LocalTime iso={episode.endedAt} variant="datetime" />
                  </>
                ) : (
                  'still open'
                )}
              </span>
            </li>
          ))}
        </ul>
        {episodes.timelineIncomplete ? (
          <p className="mt-1.5 text-caption text-warm-500">
            This has reopened {episodes.knownReopenedCount} time{episodes.knownReopenedCount === 1 ? '' : 's'} total —
            the timeline above is a lower bound reconstructed from the two timestamps this incident model carries.
          </p>
        ) : null}
      </div>

      <div className="mt-4 border-t border-warm-200 pt-3">
        <p className="text-caption uppercase tracking-wide text-warm-500">Root-cause grouping</p>
        {downstreamSymptoms.length === 0 ? (
          <p className="mt-1 text-body-sm text-warm-600">
            No alternate evidence found joining this incident to another one — it stands as its own root cause.
          </p>
        ) : (
          <ul className="mt-1.5 space-y-2">
            {/* Iterate downstreamSymptoms, NOT aliasGroup.aliases directly.
                aliasGroup.aliases is every member except the root — so when
                THIS incident is itself a non-root member, that array includes
                this incident's own id and never includes the real root.
                Iterating it here used to render the incident's own id as a
                linkless "alias of itself" row and never showed the actual
                root cause. downstreamSymptoms (genome.ts) is already the
                correct set: it excludes this incident and includes the root
                whenever this incident isn't it. */}
            {downstreamSymptoms.map((symptom) => {
              const symptomIsRoot = symptom.id === aliasGroup.rootId;
              // aliasGroup.aliases never contains the root itself, so the
              // "why was I linked to this group" reason for the ROOT row is
              // this incident's OWN provenance entry (how it was merged in) —
              // not a lookup keyed by the root's id, which would never match.
              const provenance = aliasGroup.aliases.find((a) => a.id === (symptomIsRoot ? incidentId : symptom.id));
              return (
                <li key={symptom.id} className="rounded-fw-md bg-surface-sunken p-2.5">
                  <p className="text-body-sm font-medium text-warm-900">
                    {symptomIsRoot ? (
                      <span className="mr-1.5 text-caption font-semibold uppercase text-accent-700">Root ·</span>
                    ) : null}
                    {symptom.linkTarget ? (
                      <Link href={symptom.linkTarget} className="hover:underline">
                        {symptom.description}
                      </Link>
                    ) : (
                      symptom.description
                    )}
                  </p>
                  <p className="mt-0.5 text-caption text-warm-600">
                    {provenance ? (
                      <>
                        <span className="font-medium uppercase text-accent-700">{provenance.tier}</span> confidence — {provenance.reason}
                      </>
                    ) : (
                      'Joined this root transitively through a shared alias.'
                    )}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="mt-4 border-t border-warm-200 pt-3">
        <p className="text-caption uppercase tracking-wide text-warm-500">Attached evidence sources</p>
        <div className="mt-1.5">
          <EvidenceSourceChips coverage={evidenceCoverage} />
        </div>
        {evidenceCoverage.present < evidenceCoverage.total ? (
          // Plain prose, not UnknownInline — UnknownInline is a placeholder
          // for one missing VALUE (brief §4/§44's "unknown never rendered as
          // zero"), not a vehicle for an explanatory sentence fragment. This
          // caption isn't standing in for a number that couldn't be read; it
          // is explaining what the coverage count above already shows.
          <p className="mt-1.5 text-caption text-warm-500">
            {evidenceCoverage.present} of {evidenceCoverage.total} sources actually read for this incident — the
            rest carry no opinion, never treated as a clean result.
          </p>
        ) : null}
      </div>
    </Surface>
  );
}
