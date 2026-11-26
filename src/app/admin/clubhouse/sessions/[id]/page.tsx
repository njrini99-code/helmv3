import Link from 'next/link';
import { bridgePseudonym } from '@/lib/admin/clubhouse/pseudonym';
import type { Metadata } from 'next';
import { ExternalLink } from 'lucide-react';
import { requireSuperAdmin } from '@/lib/admin/require-super-admin';
import { EmptyState } from '@/components/fairway';
import { BR } from '@/lib/admin/clubhouse/br-codes';
import type { BridgeGraph } from '@/lib/admin/clubhouse/graph';
import {
  PLATFORM_WORDS,
  categoryLookup,
  failingCodes,
  isFailureRow,
  liveHref,
  msText,
  parseLiveScope,
  reproSteps,
  sessionMinutes,
  shortId,
  timelineLanes,
  withLive,
  type LiveScope,
  type SessionEventRow,
} from '@/lib/admin/clubhouse/live-model';
import { readPeopleNames, readPipe, readSession, readSessionEvents, readSessions, readTeamName } from '@/lib/admin/clubhouse/live';
import { clubhouseHref, type ClubhouseScope, type SearchParams } from '@/lib/admin/clubhouse/screens';
import { ClubhouseFrame, GraphUnavailable, NoSignal, Section } from '../../_components/frame';
import { CategoryDot, IdChip, PageChip } from '../../_components/chips';
import { GRAPH_SOURCE, readClubhouse } from '../../_components/load';
import { Fact, LiveFailed } from '../../_components/live';
import { CopyReportButton } from '../../../_components/CopyReportButton';
import { LocalTime } from '../../../_components/LocalTime';

export const metadata: Metadata = { title: 'Session' };

export const dynamic = 'force-dynamic';

/** Sentry Replay at a moment (org helm-xs). */
function replayUrl(replayId: string): string {
  return `https://helm-xs.sentry.io/replays/${replayId}/`;
}

const KIND_MARK: Record<string, string> = {
  view: 'view',
  tap: 'tap',
  action: 'action',
  toast: 'toast',
  state: 'state',
  crash: 'crash',
  vital: 'vital',
  frustration: 'frustration',
};

/**
 * B07, one session (plan §8): one lane per page, every mark in order, a failure opening its trail. The person's name
 * is read live here, for the super admin who opened it (D7); the Copy report and the reproduction steps stay
 * pseudonymous.
 */
export default async function ClubhouseSessionPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams?: Promise<SearchParams> }) {
  await requireSuperAdmin();
  const { id } = await params;
  const sp = (await searchParams) ?? {};
  const read = readClubhouse(sp);
  if (!read) return <GraphUnavailable code={BR.sessions.failed} title="Session" retryHref={liveHref.session(id)} />;
  const { graph, scope, pages } = read;
  const live = parseLiveScope(sp);
  const sessionId = decodeURIComponent(id);

  const [pipe, session, events] = await Promise.all([readPipe(), readSession(sessionId), readSessionEvents([sessionId])]);
  const s = session.data;
  const [names, teamName, others] = s
    ? await Promise.all([
        readPeopleNames(s.user_id ? [s.user_id] : []),
        s.team_id ? readTeamName(s.team_id) : Promise.resolve(null),
        s.user_id ? readSessions({ userId: s.user_id, limit: 6 }) : Promise.resolve({ state: 'ok' as const, data: [] }),
      ])
    : [new Map(), null, { state: 'ok' as const, data: [] }];
  const person = s?.user_id ? names.get(s.user_id) : undefined;
  const routeOf = (page: string) => graph.pages[page as keyof typeof graph.pages]?.routes[0] ?? null;
  const steps = s ? reproSteps(s, events.data, routeOf) : [];
  const fails = failingCodes(events.data);

  const report = s
    ? [
        // Pseudonymous: a report leaves the screen, and a session id joins straight to its person (D7).
        `# Clubhouse session ${bridgePseudonym('session', s.session_id)}`,
        '',
        `${bridgePseudonym('person', s.user_id) ?? 'signed out'} · ${s.role} · ${PLATFORM_WORDS[s.platform] ?? s.platform} · release ${s.release.slice(0, 7)} · ${sessionMinutes(s)} min · ${s.failure_count} failures`,
        '',
        '## Steps',
        ...steps.map((step, i) => `${i + 1}. ${step}`),
      ].join('\n')
    : `# Clubhouse session ${bridgePseudonym('session', sessionId)}\n\nNot found.`;

  return (
    <ClubhouseFrame
      title={<span className="font-fw-mono">{sessionId.slice(0, 16)}</span>}
      question="What exactly did this person see, in order?"
      graph={graph}
      scope={scope}
      pages={pages}
      noSignalCode={BR.sessions.noSignal}
      copyCode={BR.sessions.copy}
      report={report}
      showScope={false}
      live={{ pipe, scope: live, truncated: events.truncated }}
      sources={['clubhouse_sessions', 'clubhouse_session_events (sessions with a failure, 14 days)', 'users, golf_coaches, golf_players (the name, read live)', GRAPH_SOURCE]}
      actions={
        <Link href={withLive(liveHref.sessions(), scope, live)} className="text-caption font-medium text-accent-ink hover:underline">
          All sessions
        </Link>
      }
    >
      {session.state === 'no-signal' ? (
        <NoSignal code={BR.sessions.noSignal} what="This session's pages, marks and failures" />
      ) : session.state === 'error' ? (
        <LiveFailed code={BR.sessions.failed} label="Clubhouse session" error={session.error} retryHref={withLive(liveHref.session(sessionId), scope, live)} />
      ) : !s ? (
        <div data-br={BR.sessions.empty}>
          <EmptyState variant="search" title="No session with this id" description="Sessions are kept 30 days. Check the id, or open the index." />
        </div>
      ) : (
        <>
          <Section
            title={
              <span className="flex flex-wrap items-baseline gap-x-2">
                {s.user_id ? (
                  <Link href={withLive(liveHref.person(s.user_id), scope, live)} data-br={BR.sessions.person} className="text-accent-ink hover:underline">
                    {person?.name ?? person?.email ?? shortId(s.user_id)}
                  </Link>
                ) : (
                  <span>Signed out</span>
                )}
                <span className="text-caption font-normal text-text-tertiary">{s.role}</span>
              </span>
            }
            description={teamName ? `Team: ${teamName}` : s.team_id ? `Team ${shortId(s.team_id)}` : 'No team'}
            actions={
              <>
                {s.replay_id ? (
                  <a
                    href={replayUrl(s.replay_id)}
                    target="_blank"
                    rel="noreferrer"
                    data-br={BR.sessions.replay}
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-fw-sm border border-border-control px-3 text-caption font-medium text-text-secondary hover:border-border-strong hover:text-text-primary"
                  >
                    Replay
                    <ExternalLink size={12} aria-hidden />
                    <span className="sr-only">(opens Sentry)</span>
                  </a>
                ) : (
                  <span data-br={BR.sessions.replay} className="text-caption text-text-tertiary">No replay</span>
                )}
                <span data-br={BR.sessions.reproduce}>
                  <CopyReportButton report={steps.map((step, i) => `${i + 1}. ${step}`).join('\n')} label="Copy reproduction steps" size="sm" />
                </span>
              </>
            }
          >
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <Fact label="Platform" value={PLATFORM_WORDS[s.platform] ?? s.platform} />
              <Fact label="Release" value={s.release.slice(0, 7)} />
              <Fact label="Started" value={<LocalTime iso={s.started_at} />} />
              <Fact label="Minutes" value={sessionMinutes(s)} />
              <Fact label="Signals" value={s.signal_count} />
              <Fact label="Failures" value={s.failure_count} tone={s.failure_count ? 'danger' : undefined} />
            </dl>
          </Section>

          <Section title="Timeline" description="One lane per page, in the order the person reached it. Open a mark to see its envelope; a failure shows its trail.">
            {events.state === 'error' ? (
              <LiveFailed code={BR.sessions.failed} label="Session events" error={events.error} retryHref={withLive(liveHref.session(sessionId), scope, live)} />
            ) : events.data.length === 0 ? (
              <p className="text-body-sm text-text-secondary">
                {s.failure_count ? 'This session’s events have aged out (14 days).' : 'Events are kept only for sessions with a failure, so this one has none (plan §4.5).'}
              </p>
            ) : (
              <Timeline events={events.data} graph={graph} scope={scope} live={live} />
            )}
          </Section>

          {fails.length ? (
            <Section title="Failures in this session">
              <ul className="flex flex-wrap gap-2">
                {fails.map((f) => (
                  <li key={f.code}>
                    <IdChip id={String(graph.chIndex[f.code] ?? f.code)} ch={graph.chIndex[f.code] ? f.code : undefined} href={withLive(clubhouseHref.code(graph.chIndex[f.code] ?? f.code), scope, live)} br={BR.sessions.idChip} />
                    <span className="ml-1 font-fw-mono text-caption tabular-nums text-text-tertiary">×{f.count}</span>
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}

          {others.data.filter((o) => o.session_id !== s.session_id).length ? (
            <Section title="Their other sessions">
              <ul className="divide-y divide-border-subtle">
                {others.data
                  .filter((o) => o.session_id !== s.session_id)
                  .map((o) => (
                    <li key={o.session_id}>
                      <Link href={withLive(liveHref.session(o.session_id), scope, live)} data-br={BR.sessions.row} className="flex flex-wrap justify-between gap-2 px-1 py-2 hover:bg-surface-sunken">
                        <span className="font-fw-mono text-caption text-text-primary">{o.session_id.slice(0, 12)}</span>
                        <span className="font-fw-mono text-caption tabular-nums text-text-tertiary">
                          <LocalTime iso={o.last_at} /> · {o.failure_count} failed
                        </span>
                      </Link>
                    </li>
                  ))}
              </ul>
            </Section>
          ) : null}
        </>
      )}
    </ClubhouseFrame>
  );
}

function Timeline({ events, graph, scope, live }: { events: SessionEventRow[]; graph: BridgeGraph; scope: ClubhouseScope; live: LiveScope }) {
  const categoryOf = categoryLookup(graph);
  return (
    <ol className="space-y-3">
      {timelineLanes(events).map((lane) => (
        <li key={lane.page || 'none'} className="min-w-0">
          <div className="mb-1.5">
            {lane.page ? <PageChip id={lane.page} name={graph.pages[lane.page as keyof typeof graph.pages]?.name} href={withLive(clubhouseHref.page(lane.page), scope, live)} br={BR.pages.row} /> : <span className="text-caption text-text-tertiary">No page</span>}
          </div>
          <ol className="flex min-w-0 flex-wrap gap-1.5">
            {lane.events.map((e) => {
              const failure = isFailureRow({ kind: e.kind, outcome: e.outcome });
              const category = e.code ? categoryOf(e.code) : null;
              return (
                <li key={e.seq} className="min-w-0">
                  <details data-br={BR.sessions.mark} className="group/mark min-w-0">
                    <summary
                      className={`inline-flex min-h-8 cursor-pointer list-none items-center gap-1.5 rounded-full border px-2 text-caption [@media(pointer:coarse)]:min-h-10 ${failure ? 'border-fw-danger/40 bg-fw-danger/5 text-fw-danger-ink' : 'border-border-subtle bg-surface text-text-secondary'}`}
                    >
                      {category ? <CategoryDot category={category} /> : null}
                      <span className="font-fw-mono tabular-nums text-text-tertiary">#{e.seq}</span>
                      {KIND_MARK[e.kind] ?? e.kind}
                      {e.outcome ? ` · ${e.outcome}` : ''}
                      {e.code ? <span className="font-fw-mono">{e.code}</span> : null}
                    </summary>
                    <dl className="mt-1.5 grid max-w-xl grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 rounded-fw-sm border border-border-subtle bg-surface-sunken p-2 font-fw-mono text-caption text-text-secondary">
                      <dt>at</dt>
                      <dd><LocalTime iso={e.sent_at} /></dd>
                      {e.action_id || e.act ? (<><dt>action</dt><dd className="break-all">{e.action_id ?? e.act}</dd></>) : null}
                      {e.control_id ? (<><dt>control</dt><dd>{e.control_id}</dd></>) : null}
                      {e.duration_ms !== null ? (<><dt>took</dt><dd>{msText(e.duration_ms)}</dd></>) : null}
                      {e.server_code ? (<><dt>server</dt><dd>{e.server_code}</dd></>) : null}
                      {e.message ? (<><dt>message</dt><dd className="whitespace-pre-wrap break-words font-fw-sans">{e.message}</dd></>) : null}
                      {e.drift.length ? (<><dt>drift</dt><dd>{e.drift.join(', ')}</dd></>) : null}
                      {e.trail?.length ? (
                        <>
                          <dt>trail</dt>
                          <dd>
                            <ol className="list-decimal pl-4 font-fw-sans">
                              {e.trail.map((t, i) => (
                                <li key={i} className="break-words">{t}</li>
                              ))}
                            </ol>
                          </dd>
                        </>
                      ) : null}
                    </dl>
                  </details>
                </li>
              );
            })}
          </ol>
        </li>
      ))}
    </ol>
  );
}
