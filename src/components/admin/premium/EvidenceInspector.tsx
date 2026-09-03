'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Sheet, Segmented } from '@/components/fairway';
import { cn } from '@/lib/utils';
import type { LifecycleVerdict, IncidentRepair, IncidentSeverity } from '@/lib/admin/incidents/types';
import { LIFECYCLE_LABEL, LIFECYCLE_TONE } from '@/lib/admin/incidents/types';
import type { EvidenceSourceCoverage } from '@/lib/admin/incidents/coverage';
import type { Episode } from '@/lib/admin/incidents/episodes';
import type { ReleaseRelationshipVerdict } from '@/lib/admin/incidents/release-context';
import { PosturePill, type BridgePostureTone } from './PosturePill';
import { EvidenceSourceChips, SourceConfidenceRing } from './EvidenceSourceChips';
import { ReleaseRelationshipLabel } from './ReleaseRelationshipLabel';
import { EpisodeTimelineStrip } from './EpisodeTimelineStrip';
import { UnknownInline } from './UnknownValue';

/**
 * ============================================================================
 * Bridge Premium · EvidenceInspector
 * ----------------------------------------------------------------------------
 * The shared drawer (brief §13 "Shared Evidence Inspector"): "Any incident,
 * release, feature, journey, trace, team, user or agent run opens the same
 * Fairway Sheet from the right, context-sensitive but structurally stable...
 * tabs Summary / Evidence / Timeline / Repair... No full navigation for
 * every drill-down."
 *
 * DELIBERATELY A NARROW, TYPED PROP SHAPE, NOT A RAW `UnifiedIncident`. Later
 * phases will open this same Sheet for releases, features, journeys, traces,
 * teams, users and agent runs (§13) — none of which are incidents. Coupling
 * this component to `UnifiedIncident` would force every future caller to
 * fabricate a fake incident to open it. `EvidenceInspectorData` is the
 * subset every one of those entity kinds can plausibly supply: a title, a
 * technical signature, an operation context, a lifecycle-shaped state, an
 * evidence-coverage row and (optionally) a release relationship / episode
 * timeline / repair state. An incident today maps onto it directly; a
 * release, feature or trace in a later phase will too.
 *
 * COMPACT, PRE-COMPUTED DATA ONLY (brief §41/§46: "no raw provider payloads
 * to the client... compact read models"). This component never fetches —
 * the caller (a server component) builds `EvidenceInspectorData` from
 * already-computed read models and hands it down once.
 * ========================================================================== */

export interface EvidenceInspectorData {
  id: string;
  /** The Phase 0 human title — never a raw code, UUID or stack line. */
  title: string;
  technicalSignature: string;
  operationContext: string | null;
  severity: IncidentSeverity;
  lifecycle: LifecycleVerdict;
  firstSeen: string;
  lastSeen: string;
  occurrences: number;
  affectedUsers: number;
  affectedUsersKnown: boolean;
  releaseRelationship: ReleaseRelationshipVerdict | null;
  evidenceCoverage: EvidenceSourceCoverage;
  episodes: readonly Episode[];
  episodesIncomplete: boolean;
  repair: IncidentRepair | null;
  /** Full-page detail route, for "Open full incident →". */
  linkTarget: string | null;
}

export interface EvidenceInspectorProps {
  data: EvidenceInspectorData | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const SEVERITY_TONE: Readonly<Record<IncidentSeverity, BridgePostureTone>> = {
  critical: 'danger',
  error: 'danger',
  warning: 'warning',
  info: 'neutral',
};

type InspectorTab = 'summary' | 'evidence' | 'timeline' | 'repair';

const TAB_OPTIONS: ReadonlyArray<{ value: InspectorTab; label: string }> = [
  { value: 'summary', label: 'Summary' },
  { value: 'evidence', label: 'Evidence' },
  { value: 'timeline', label: 'Timeline' },
  { value: 'repair', label: 'Repair' },
];

function SummaryTab({ data }: { data: EvidenceInspectorData }) {
  return (
    <div className="space-y-3">
      <p className="text-body-sm leading-5 text-warm-700">{data.lifecycle.headline}</p>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
        <div>
          <dt className="text-eyebrow uppercase tracking-wide text-warm-500">Occurrences</dt>
          <dd className="font-fw-mono text-sm tabular-nums text-warm-900">{data.occurrences}</dd>
        </div>
        <div>
          <dt className="text-eyebrow uppercase tracking-wide text-warm-500">Affected users</dt>
          <dd className="font-fw-mono text-sm tabular-nums text-warm-900">
            {data.affectedUsersKnown ? data.affectedUsers : <UnknownInline label="unknown identity" />}
          </dd>
        </div>
        <div>
          <dt className="text-eyebrow uppercase tracking-wide text-warm-500">First seen</dt>
          <dd className="font-fw-mono text-sm text-warm-900">{data.firstSeen}</dd>
        </div>
        <div>
          <dt className="text-eyebrow uppercase tracking-wide text-warm-500">Last seen</dt>
          <dd className="font-fw-mono text-sm text-warm-900">{data.lastSeen}</dd>
        </div>
      </dl>
      <div>
        <p className="text-eyebrow uppercase tracking-wide text-warm-500">Release relationship</p>
        <div className="mt-1">
          {data.releaseRelationship ? (
            <ReleaseRelationshipLabel verdict={data.releaseRelationship} showConfidence />
          ) : (
            <UnknownInline label="no release context available" />
          )}
        </div>
      </div>
    </div>
  );
}

function EvidenceTab({ data }: { data: EvidenceInspectorData }) {
  const gaps = data.evidenceCoverage.cells.filter((c) => c.mark !== 'check');
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <SourceConfidenceRing coverage={data.evidenceCoverage} />
        <p className="text-body-sm text-warm-700">
          {data.evidenceCoverage.present} of {data.evidenceCoverage.total} sources read
        </p>
      </div>
      <EvidenceSourceChips coverage={data.evidenceCoverage} />
      <div>
        <p className="text-eyebrow uppercase tracking-wide text-warm-500">What we do not know</p>
        {gaps.length === 0 ? (
          <p className="mt-1 text-body-sm text-warm-600">Every source read cleanly this refresh.</p>
        ) : (
          <ul className="mt-1 space-y-1">
            {gaps.map((cell) => (
              <li key={cell.source} className="text-body-sm leading-5 text-warm-600">
                <span className="font-medium text-warm-800">{cell.source}</span>
                {cell.reason ? `: ${cell.reason}` : ''}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function TimelineTab({ data }: { data: EvidenceInspectorData }) {
  return (
    <div className="space-y-3">
      <EpisodeTimelineStrip episodes={data.episodes} incomplete={data.episodesIncomplete} />
      <ul className="space-y-2">
        {data.episodes.map((episode) => (
          <li key={episode.number} className="rounded-fw-md bg-surface-sunken p-2.5">
            <p className="text-body-sm font-medium text-warm-900">{episode.headline}</p>
            <p className="mt-0.5 font-fw-mono text-caption text-warm-500">
              {episode.occurrenceCount} occurrence{episode.occurrenceCount === 1 ? '' : 's'} ·{' '}
              {episode.endedAt ? `resolved ${episode.endedAt}` : 'open'}
            </p>
          </li>
        ))}
      </ul>
      {data.episodesIncomplete ? (
        <p className="text-caption text-warm-500">
          This timeline is a lower bound — the incident has reopened more times than two known timestamps can
          reconstruct into distinct episodes.
        </p>
      ) : null}
    </div>
  );
}

function RepairTab({ repair }: { repair: IncidentRepair | null }) {
  if (!repair || repair.status === 'none') {
    return <p className="text-body-sm text-warm-600">No repair has been attempted for this incident.</p>;
  }
  return (
    <div className="space-y-2">
      <p className="text-body-sm text-warm-800">
        {repair.prUrl && repair.prNumber ? (
          <Link href={repair.prUrl} target="_blank" rel="noreferrer" className="font-medium underline">
            PR #{repair.prNumber}
          </Link>
        ) : (
          <span className="font-medium">{repair.status === 'unknown' ? <UnknownInline label="repair status unknown" /> : repair.status}</span>
        )}
      </p>
      {repair.checks ? (
        <p className="text-caption text-warm-600">
          checks: {repair.checks.passed} passed, {repair.checks.failed} failed, {repair.checks.pending} pending
        </p>
      ) : (
        <p className="text-caption text-warm-500">
          <UnknownInline label="checks could not be read" />
        </p>
      )}
      {repair.note ? <p className="text-caption text-warm-600">{repair.note}</p> : null}
    </div>
  );
}

export function EvidenceInspector({ data, open, onOpenChange }: EvidenceInspectorProps) {
  const [tab, setTab] = useState<InspectorTab>('summary');

  return (
    <Sheet open={open} onOpenChange={onOpenChange} side="right" mobileSide="bottom" title={data?.title ?? 'Incident'}>
      {data ? (
        <div className="space-y-4 p-1">
          <div className="flex flex-wrap items-center gap-2">
            <PosturePill tone={SEVERITY_TONE[data.severity]} size="sm">
              {data.severity.toUpperCase()}
            </PosturePill>
            <PosturePill tone={LIFECYCLE_TONE[data.lifecycle.state]} size="sm">
              {LIFECYCLE_LABEL[data.lifecycle.state]}
            </PosturePill>
          </div>

          {data.operationContext ? <p className="text-body-sm text-warm-600">{data.operationContext}</p> : null}
          <p className={cn('break-words font-fw-mono text-caption leading-5 text-warm-500', '[overflow-wrap:anywhere]')}>
            {data.technicalSignature}
          </p>

          <Segmented options={TAB_OPTIONS} value={tab} onValueChange={setTab} size="sm" fullWidth />

          <div>
            {tab === 'summary' ? <SummaryTab data={data} /> : null}
            {tab === 'evidence' ? <EvidenceTab data={data} /> : null}
            {tab === 'timeline' ? <TimelineTab data={data} /> : null}
            {tab === 'repair' ? <RepairTab repair={data.repair} /> : null}
          </div>

          {data.linkTarget ? (
            <Link href={data.linkTarget} className="inline-flex text-body-sm font-medium text-accent-700 underline">
              Open full incident →
            </Link>
          ) : null}
        </div>
      ) : (
        <p className="p-1 text-body-sm text-warm-600">No incident selected.</p>
      )}
    </Sheet>
  );
}
