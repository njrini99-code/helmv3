import type { ReactNode } from 'react';
import Link from 'next/link';
import { Surface, StatusPill, Badge, InlineNotice, type FwStatusTone } from '@/components/fairway';
import { DatelineRule } from '@/components/ui/card';
import { fetchPlayerDetail, type PlayerRoundTier } from '@/lib/admin/data/player-detail';
import { ROUND_STATUS_TONE } from '../../golf/tracer/tracer-shared';
import { PanelNoData, PanelAllClear } from '../../_components/PanelStates';
import { LocalTime } from '../../_components/LocalTime';

/**
 * New panel for /admin/users/[id] — mirrors EngagementPanel's contract
 * ("touches nothing else on that page"): a self-contained fetch
 * (`fetchPlayerDetail`) mounted inside its own `PanelBoundary` by the parent
 * page, so a failure here degrades only this section. Renders nothing (not
 * even a heading) when the account isn't a golf player at all — this is a
 * golf-specific enrichment of the cross-sport user page above it, not a
 * replacement for it.
 */

const TIER_TONE: Record<PlayerRoundTier, FwStatusTone> = {
  stuck: 'danger',
  abandoned: 'warning',
  stale: 'neutral',
  in_progress: 'accent',
};

const TIER_LABEL: Record<PlayerRoundTier, string> = {
  stuck: 'stuck',
  abandoned: 'abandoned',
  stale: 'stale (30d+)',
  in_progress: 'in progress',
};

const ERROR_SEVERITY_TONE: Record<string, FwStatusTone> = {
  critical: 'danger',
  error: 'danger',
  warning: 'warning',
  info: 'neutral',
};

/** Mirrors tracer-shared.ts's `formatStuckDuration` (same idle-hours ↔ text
 *  convention) but this panel imports the round TIER map from tracer-shared
 *  directly for status pills and keeps this one local — it's a one-line
 *  format, not worth a cross-module dependency for. */
function formatHoursIdle(hours: number | null): string {
  if (hours === null) return 'idle time unknown';
  if (hours < 24) return `${hours.toFixed(1)}h idle`;
  return `${(hours / 24).toFixed(1)}d idle`;
}

function GraphiteStat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 rounded-fw-md bg-surface-sunken p-3">
      <span className="font-fw-mono text-lg font-bold tabular-nums text-warm-900">{value}</span>
      <span className="text-eyebrow uppercase tracking-widest text-warm-500">{label}</span>
    </div>
  );
}

function SubLabel({ children }: { children: ReactNode }) {
  return (
    <h3 className="border-b border-accent-600/25 pb-2 text-xs font-semibold uppercase tracking-widest text-warm-500">
      {children}
    </h3>
  );
}

export async function GolfPlayerDetailPanel({ userId }: { userId: string }) {
  const detail = await fetchPlayerDetail(userId);

  if (!detail.player) return null;

  const { player, roundsSummary, stuckRounds, recentRounds, qualifiers, errors, mostRecentRoundTraceHref, degraded } = detail;

  return (
    <Surface padding="sm">
      <DatelineRule className="mb-3" />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-warm-500">Golf player detail</h2>
        {degraded.length > 0 ? (
          <InlineNotice tone="warning">
            {degraded.join(', ')} could not be read this load — those figures below are unknown, not zero. Reload to
            retry.
          </InlineNotice>
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span className="font-semibold text-warm-900">{player.name}</span>
        <span className="font-fw-mono text-xs text-warm-500" title={player.playerId}>
          player {player.playerId.slice(0, 8)}
        </span>
        {degraded.includes('identity') ? (
          <span className="text-warm-500">team unknown</span>
        ) : player.team ? (
          <Link href={`/admin/teams/${player.team.id}`} className="text-accent-700 underline-offset-2 hover:underline">
            {player.team.name}
          </Link>
        ) : (
          <span className="text-warm-500">no active team</span>
        )}
        {player.graduationYear ? <span className="text-warm-500">Class of {player.graduationYear}</span> : null}
        {player.handicapIndex !== null ? <span className="text-warm-500">HCP {player.handicapIndex}</span> : null}
        <Badge tone={player.profileQuality === 'complete' ? 'success' : player.profileQuality === 'partial' ? 'warning' : 'danger'} variant="soft" size="sm">
          profile {player.profileQuality}
        </Badge>
      </div>
      <p className="mt-1 font-fw-mono text-xs tabular-nums text-warm-500">
        joined {player.createdAt ? <LocalTime iso={player.createdAt} variant="date" /> : '—'} · last seen{' '}
        {degraded.includes('identity') ? 'unknown' : player.lastSeen ? <LocalTime iso={player.lastSeen} variant="datetime" /> : 'never'}
      </p>

      {/* `roundsFailed` gates every tile below to "unknown", never a
          computed-looking number or "never" — `totalCount ?? fetchedCount`
          would otherwise silently read as `0` and a null `lastRoundAt` would
          read as the outright false claim "never" when the truth is simply
          "couldn't check this load". The footnote alone was not enough:
          apologetic prose next to a confident zero still reads as a zero. */}
      {(() => {
        const roundsFailed = degraded.includes('rounds');
        return (
          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-5">
            <GraphiteStat label="Total rounds" value={roundsFailed ? '—' : roundsSummary.totalCount ?? roundsSummary.fetchedCount} />
            <GraphiteStat label="Completed" value={roundsFailed ? '—' : roundsSummary.completed} />
            <GraphiteStat label="Non-terminal" value={roundsFailed ? '—' : roundsSummary.nonTerminal} />
            <GraphiteStat
              label="Avg score"
              value={!roundsFailed && roundsSummary.averageScore !== null ? roundsSummary.averageScore.toFixed(1) : '—'}
            />
            <GraphiteStat
              label="Last round"
              value={
                roundsFailed ? (
                  'unknown'
                ) : roundsSummary.lastRoundAt ? (
                  <LocalTime iso={roundsSummary.lastRoundAt} variant="date" />
                ) : (
                  'never'
                )
              }
            />
          </div>
        );
      })()}
      {roundsSummary.truncated ? (
        <p className="mt-2 text-xs text-warm-500">
          Showing the most recent {roundsSummary.fetchedCount} of {roundsSummary.totalCount} rounds — the figures above
          are windowed to that page, not this player&apos;s full history.
        </p>
      ) : null}
      {degraded.includes('rounds') ? (
        <p className="mt-2 text-xs text-fw-warning-ink">Round history could not be read this load — the tiles above show unknown, not zero.</p>
      ) : null}

      {/* IN-PROGRESS / STUCK ROUNDS — the single most actionable
          player-level fact (task brief). Never truncated to the recent-
          rounds window: a stuck round from weeks ago still belongs here. */}
      <div className="mt-5">
        <SubLabel>In-progress / stuck rounds ({stuckRounds.length})</SubLabel>
        <div className="mt-2">
          {stuckRounds.length === 0 ? (
            degraded.includes('rounds') ? (
              <PanelNoData label="Unknown" description="Round history could not be read this load — this is not an all-clear." />
            ) : (
              <PanelAllClear label="No in-progress or stuck rounds" checkedAt={new Date().toISOString()} />
            )
          ) : (
            <ul className="divide-y divide-warm-200/60">
              {stuckRounds.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
                  <StatusPill tone={TIER_TONE[r.tier]} dot size="sm">
                    {TIER_LABEL[r.tier]}
                  </StatusPill>
                  <span className="min-w-0 flex-1 basis-full break-words text-warm-800 sm:basis-auto">
                    {r.courseName ?? 'Round'} · hole {r.currentHole ?? '—'}
                    {r.holesPlayed !== null ? ` (${r.holesPlayed} played)` : ''}
                  </span>
                  <span className="font-fw-mono text-xs tabular-nums text-warm-500">{formatHoursIdle(r.hoursIdle)}</span>
                  <span className="font-fw-mono text-xs tabular-nums text-warm-400">
                    {r.updatedAt ? <LocalTime iso={r.updatedAt} variant="datetime" /> : '—'}
                  </span>
                  <Link href="/admin/golf/tracer#stuck-rounds" className="text-xs text-accent-700 underline-offset-2 hover:underline">
                    Open in Tracer →
                  </Link>
                  {r.traceHref ? (
                    <Link href={r.traceHref} className="text-xs text-accent-700 underline-offset-2 hover:underline">
                      View flight trace →
                    </Link>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Recent round history */}
      <div className="mt-5">
        <SubLabel>Recent rounds ({recentRounds.length})</SubLabel>
        <div className="mt-2">
          {recentRounds.length === 0 ? (
            degraded.includes('rounds') ? (
              <PanelNoData label="Unknown" description="Round history could not be read this load." />
            ) : (
              <PanelNoData label="No rounds yet" description="This player hasn't logged a round." />
            )
          ) : (
            <ul className="divide-y divide-warm-200/60">
              {recentRounds.map((r, i) => (
                <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5 text-sm">
                  <StatusPill tone={ROUND_STATUS_TONE[r.status] ?? 'neutral'} dot size="sm">
                    {r.status}
                  </StatusPill>
                  <span className="min-w-0 flex-1 basis-full break-words text-warm-800 sm:basis-auto">
                    {r.courseName ?? 'Round'}
                    {r.totalScore !== null ? ` · ${r.totalScore}` : ''}
                    {r.scoreToPar !== null ? (r.scoreToPar > 0 ? ` (+${r.scoreToPar})` : r.scoreToPar === 0 ? ' (E)' : ` (${r.scoreToPar})`) : ''}
                    {r.qualifierRoundNumber !== null ? ` · qualifier round ${r.qualifierRoundNumber}` : ''}
                  </span>
                  <span className="font-fw-mono text-xs tabular-nums text-warm-500">
                    {r.createdAt ? <LocalTime iso={r.createdAt} variant="date" /> : '—'}
                  </span>
                  {/* Only the single most recent round is checked against the
                      trace store (see fetchPlayerDetail's bounded candidate
                      set) — a link only ever appears here when one was
                      actually found. */}
                  {i === 0 && mostRecentRoundTraceHref ? (
                    <Link href={mostRecentRoundTraceHref} className="text-xs text-accent-700 underline-offset-2 hover:underline">
                      View flight trace →
                    </Link>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Qualifier participation + round-number gaps */}
      <div className="mt-5">
        <SubLabel>Qualifier participation ({qualifiers.length})</SubLabel>
        <div className="mt-2">
          {qualifiers.length === 0 ? (
            degraded.includes('qualifiers') ? (
              <PanelNoData label="Unknown" description="Qualifier entries could not be read this load." />
            ) : (
              <PanelNoData label="No qualifier entries" description="This player hasn't entered a qualifier." />
            )
          ) : (
            <ul className="divide-y divide-warm-200/60">
              {qualifiers.map((q) => (
                <li key={q.qualifierId} className="flex flex-col gap-1 py-2 text-sm">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="min-w-0 flex-1 basis-full font-medium text-warm-900 sm:basis-auto">{q.qualifierName}</span>
                    {q.qualifierStatus ? (
                      <Badge tone="neutral" variant="outline" size="sm">
                        {q.qualifierStatus}
                      </Badge>
                    ) : null}
                    {q.position !== null ? (
                      <span className="font-fw-mono text-xs tabular-nums text-warm-500">pos {q.position}</span>
                    ) : null}
                    {q.totalToPar !== null ? (
                      <span className="font-fw-mono text-xs tabular-nums text-warm-500">
                        {q.totalToPar > 0 ? `+${q.totalToPar}` : q.totalToPar === 0 ? 'E' : q.totalToPar}
                      </span>
                    ) : null}
                  </div>
                  <p className="text-xs text-warm-600">
                    rounds used: {q.roundNumbersUsed.length > 0 ? q.roundNumbersUsed.join(', ') : 'none'} of {q.numRounds}
                  </p>
                  {q.missingRoundNumbers.length > 0 ? (
                    <p className="flex flex-wrap items-center gap-1.5 text-xs">
                      <span className="text-fw-warning-ink">gap:</span>
                      {q.missingRoundNumbers.map((n) => (
                        <Badge key={n} tone="warning" variant="soft" size="sm" numeric>
                          {n}
                        </Badge>
                      ))}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Errors attributed to this player, last 7 days */}
      <div className="mt-5">
        <SubLabel>
          Errors, 7d {errors.count7d !== null ? `(${errors.count7d})` : ''}
        </SubLabel>
        <div className="mt-2">
          {errors.count7d === null ? (
            <PanelNoData label="Unknown" description="Errors could not be read this load — this is not an all-clear." />
          ) : errors.recent.length === 0 ? (
            <PanelAllClear label="No errors attributed to this player in 7d" checkedAt={new Date().toISOString()} />
          ) : (
            <ul className="divide-y divide-warm-200/60">
              {errors.recent.map((e) => (
                <li key={e.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 py-1.5 text-sm">
                  <StatusPill tone={ERROR_SEVERITY_TONE[e.severity] ?? 'neutral'} dot size="sm">
                    {e.severity}
                  </StatusPill>
                  {e.fingerprint ? (
                    <Link
                      href={`/admin/errors/${e.fingerprint}`}
                      className="min-w-0 flex-1 basis-full break-words text-warm-800 hover:underline sm:basis-auto"
                    >
                      {e.title}
                    </Link>
                  ) : (
                    <span className="min-w-0 flex-1 basis-full break-words text-warm-800 sm:basis-auto">{e.title}</span>
                  )}
                  <span className="font-fw-mono text-xs tabular-nums text-warm-500">
                    <LocalTime iso={e.createdAt} variant="datetime" />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Surface>
  );
}
