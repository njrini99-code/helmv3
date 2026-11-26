import Link from 'next/link';
import { RotateCw } from 'lucide-react';
import { BR } from '@/lib/admin/clubhouse/br-codes';
import { WINDOW_MS, inScope, withLive } from '@/lib/admin/clubhouse/live-model';
import { pulseModel, pulseReport } from '@/lib/admin/clubhouse/pulse';
import { clubhouseHref, type SearchParams } from '@/lib/admin/clubhouse/screens';
import { parseLiveScope } from '@/lib/admin/clubhouse/live-scope';
import { readHourly, readLiveSnapshot } from '@/lib/admin/clubhouse/live';
import { cachedIncidentBoard } from '@/lib/admin/incidents/fetch';
import { BRIDGE_UI_SCOPE } from '@/lib/admin/bridge-scope';
import { DEFAULT_INCIDENT_WINDOW_HOURS } from '@/lib/admin/data/incident-feed';
import { ClubhouseFrame, GraphUnavailable, NoSignal } from './frame';
import { GRAPH_SOURCE, readClubhouse } from './load';
import { LensLinks, LiveFailed, PipeBanner } from './live';
import { NewIncidents, PulseBody } from './PulseBody';

/**
 * B01 Pulse (plan §8): "Is Clubhouse OK right now, and if not, where?" Rules first, then the page wall, what is rising,
 * the actions slipping, the newest incidents and what the live release changed. It mounts at the top of /admin, and
 * the cross-sport overview stays below it there (owner decision, plan §11: it does not move to Health).
 */
export async function ClubhousePulse({ searchParams }: { searchParams?: SearchParams }) {
  const read = readClubhouse(searchParams);
  if (!read) return <GraphUnavailable code={BR.pulse.failed} title="Pulse" retryHref="/admin" />;
  const { graph, scope, pages } = read;
  const live = parseLiveScope(searchParams);
  const now = Date.now();

  const [snapshot, board] = await Promise.all([
    readLiveSnapshot(graph, now),
    cachedIncidentBoard(DEFAULT_INCIDENT_WINDOW_HOURS, BRIDGE_UI_SCOPE).catch(() => null),
  ]);
  const windowRows =
    live.w === '24h'
      ? { state: snapshot.state, data: snapshot.dayRows, truncated: snapshot.truncated }
      : await readHourly({ sinceIso: new Date(now - WINDOW_MS[live.w]).toISOString() });
  const model = pulseModel({
    graph,
    rows: inScope(windowRows.data, scope, live),
    dayRows: snapshot.dayRows,
    alerts: snapshot.alerts,
    pipe: snapshot.pipe,
    release: snapshot.release,
    readErrors: [...snapshot.errors, ...('error' in windowRows && windowRows.error ? [windowRows.error] : [])],
  });
  const incidents = (board?.incidents ?? [])
    .slice()
    .sort((a, b) => b.firstSeen.localeCompare(a.firstSeen))
    .slice(0, 5);

  return (
    <ClubhouseFrame
      title="Pulse"
      question="Is Clubhouse OK right now, and if not, where?"
      graph={graph}
      scope={scope}
      pages={pages}
      noSignalCode={BR.pulse.noSignal}
      copyCode={BR.pulse.copy}
      report={pulseReport(model)}
      live={{ pipe: snapshot.pipe, scope: live, truncated: snapshot.truncated || windowRows.truncated, pipeCode: BR.pulse.pipeDot }}
      sources={[
        'clubhouse_signal_hourly (last day, the week before, the same hour four weeks back)',
        'clubhouse_sessions and clubhouse_session_events (sessions with a failure)',
        'clubhouse_drift',
        'admin_events and Sentry, through the incident board',
        GRAPH_SOURCE,
      ]}
      actions={
        <Link
          href={withLive('/admin', scope, live)}
          prefetch={false}
          data-br={BR.pulse.refresh}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-fw-sm border border-border-control px-3 text-caption font-medium text-text-secondary hover:border-border-strong hover:text-text-primary"
        >
          <RotateCw size={14} aria-hidden />
          Read again
        </Link>
      }
    >
      <section aria-labelledby="pulse-rules" className="min-w-0 space-y-4">
        <h2 id="pulse-rules" className="sr-only">
          Clubhouse rules
        </h2>
        <PipeBanner pipe={snapshot.pipe} code={snapshot.pipe.tone === 'no-signal' ? BR.pulse.noSignal : BR.pulse.pipeDot} href={clubhouseHref.pipe()} />
        {snapshot.state === 'error' ? (
          <LiveFailed code={BR.pulse.failed} label="Clubhouse signals" error={snapshot.errors[0]} retryHref={withLive('/admin', scope, live)} />
        ) : null}
        {snapshot.state === 'no-signal' ? (
          <NoSignal code={BR.pulse.noSignal} what="The rules, the page wall, rising codes, slipping actions and the release delta" />
        ) : (
          <PulseBody model={model} graph={graph} scope={scope} live={live} incidents={incidents} />
        )}
        {snapshot.state === 'no-signal' ? <NewIncidents incidents={incidents} /> : null}
        <LensLinks scope={scope} live={live} />
      </section>
    </ClubhouseFrame>
  );
}
