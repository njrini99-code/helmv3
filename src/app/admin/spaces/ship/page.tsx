import type { Metadata } from 'next';
import Link from 'next/link';
import { requireSuperAdmin } from '@/lib/admin/require-super-admin';
import { BR } from '@/lib/admin/clubhouse/br-codes';
import { fetchReleaseLedger } from '@/lib/admin/data/release-ledger';
import { fetchFeatureFlags } from '@/lib/admin/data/feature-flags';
import { fetchDatabaseMissionControl, type DatabaseMissionControlSnapshot } from '@/lib/admin/database/overview';
import type { AdminFetchResult } from '@/lib/admin/fetch-result';
import { fetchDeployFreshness } from '@/lib/admin/deploy-freshness';
import { fetchHeldMigrations } from '@/lib/admin/command-deck/held-migrations';
import { fetchJobsHealth, servedReleaseSha, settleRead, type SettledRead } from '@/lib/admin/data/today-space';
import { Panel, Pill, SpaceHeader, SpaceRoot, Stat, toneClass, type Tone } from '../_ui/ui';
import { Chevron, FailedInline, TabLinkRow } from '../_landing/parts';
import {
  RELEASE_WORD,
  ago,
  flagSummary,
  heldCount,
  judgeCard,
  plural,
  releaseHealth,
  releaseSentence,
  shipHeadline,
  shortSha,
  summarizeJobs,
  utcClock,
  utcShortDate,
  type ReleaseCardLite,
} from '../_landing/model';

export const metadata: Metadata = { title: 'Ship' };

export const dynamic = 'force-dynamic';

const HREF = '/admin/spaces/ship';

const TABS = [
  { label: 'Deploys & Infra', href: '/admin/deploys', note: 'release ledger, web insight' },
  { label: 'Releases', href: '/admin/releases', note: 'feature flags, kill switches' },
  { label: 'Database', href: '/admin/database', note: 'posture, performance, schema' },
  { label: 'Jobs & Integrity', href: '/admin/jobs', note: 'crons, guards, checks' },
];

/**
 * Ship space, B23 (plan: docs/superpowers/specs/helm-bridge/2026-11-26-bridge-spaces-build.md).
 * "What is live, what is next, is the platform OK?" The served release is the deployment's own stamp (what
 * `npm run release:status` finds in the served chunks), compared with main through GitHub. No Vercel deploy API is
 * called beyond the release ledger's read-only deployment list.
 */
export default async function ShipSpacePage() {
  await requireSuperAdmin();
  const now = Date.now();
  const servedSha = servedReleaseSha();

  const [ledger, fresh, db, jobs, held] = await Promise.all([
    settleRead('ship.ledger', async () => {
      const r = await fetchReleaseLedger();
      if (r.status !== 'ok' || !r.data) throw new Error(r.error ?? 'release ledger unavailable');
      return r.data;
    }),
    fetchDeployFreshness(new Date(now), servedSha ?? undefined),
    settleRead('ship.database', fetchDatabaseMissionControl),
    settleRead('ship.jobs', async () => {
      const j = await fetchJobsHealth(new Date(now));
      return summarizeJobs(j.board, j.integrity);
    }),
    settleRead('ship.held', async () => {
      const rows = await fetchHeldMigrations();
      if (rows === null) throw new Error('supabase/migrations/HELD.md could not be read');
      return heldCount(rows);
    }),
  ]);
  const flags = flagSummary(fetchFeatureFlags(new Date(now)).flags);

  const cards: ReleaseCardLite[] = ledger.ok ? ledger.data.cards : [];
  const release = ledger.ok ? releaseHealth(servedSha, cards) : servedSha ? null : releaseHealth(null, []);
  const head = shipHeadline(release ?? { state: 'outside-ledger', sha: servedSha, card: null }, fresh);
  const live = release?.card ?? null;
  const freshTone: Tone = fresh.state === 'current' ? 'good' : fresh.state === 'unknown' ? 'muted' : 'watch';
  const anyFailed = !ledger.ok || !db.ok || !jobs.ok || !held.ok;

  return (
    <SpaceRoot br={anyFailed ? BR.ship.failed : ''}>
      <SpaceHeader
        eyebrow="Ship · what is live, what is next"
        title={head.title}
        second={head.second}
        secondTone={head.tone}
        badges={
          <Pill tone={freshTone} dot>
            {fresh.state === 'current' ? 'level with main' : fresh.state === 'unknown' ? 'drift unknown' : fresh.state === 'stale' ? 'stale' : 'behind main'}
          </Pill>
        }
        lede={
          <>
            {fresh.summary} {release ? releaseSentence(release) : 'The release ledger could not be read, so the live release has no verdict here.'}
          </>
        }
      />

      <section aria-label="The live release" className="bs-tiles">
        <Stat
          label="Live release"
          value={release ? RELEASE_WORD[release.state].word : null}
          sub={release?.sha ? shortSha(release.sha) : 'no release stamp'}
          tone={release ? RELEASE_WORD[release.state].tone : 'muted'}
        />
        <Stat label="Live for" value={live ? ago(live.createdAt, now).replace(/ ago$/, '') : null} sub={live ? `went out ${utcShortDate(live.createdAt)} ${utcClock(live.createdAt)} UTC` : ''} />
        <Stat
          label="New errors since"
          value={live ? live.newFingerprintsSince : null}
          sub="error fingerprints first seen after it went out"
          tone={live && live.newFingerprintsSince > 0 ? 'bad' : 'muted'}
        />
        <Stat
          label="Errors, 2 h before → after"
          value={live && live.errorsAfter2h !== null ? `${live.errorsBefore2h} → ${live.errorsAfter2h}` : null}
          sub="failure-severity admin events"
          tone={live && live.errorsAfter2h !== null && live.errorsAfter2h > live.errorsBefore2h ? 'bad' : 'ink'}
        />
      </section>

      <Panel
        title="Release runway"
        note={
          <>
            production deploys in the last 7 days, newest first ·{' '}
            <Link href="/admin/deploys" className="bs-link">
              Deploys & Infra
            </Link>
          </>
        }
      >
        {!ledger.ok ? (
          <FailedInline br={BR.ship.failed} what="The release ledger" retryHref={HREF} />
        ) : cards.length === 0 ? (
          <div className="bs-inline-state" data-br={BR.ship.empty}>
            No production deploy in the last 7 days.
          </div>
        ) : (
          <ol className="bs-runway">
            {cards.slice(0, 6).map((c) => {
              const state = judgeCard(c);
              const w = RELEASE_WORD[state];
              const isLive = Boolean(servedSha && c.commitSha && (c.commitSha.startsWith(servedSha) || servedSha.startsWith(c.commitSha)));
              const firstLine = (c.commitMessage ?? '').split('\n')[0]?.trim() || 'no commit message';
              return (
                <li key={`${c.commitSha ?? 'x'}-${c.createdAt}`}>
                  <Link href="/admin/deploys" className="bs-release" data-br={BR.ship.releaseCard}>
                    <span style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <span style={{ fontSize: 14, fontWeight: 600 }}>
                        {utcShortDate(c.createdAt)} · {utcClock(c.createdAt)}
                      </span>
                      <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <span className="bs-chip">{c.commitSha ? shortSha(c.commitSha) : 'no sha'}</span>
                        {isLive ? <Pill tone="good">Live</Pill> : null}
                      </span>
                    </span>
                    <span className="bs-release-body" style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <span className="bs-release-msg">{firstLine}</span>
                      <span className="bs-release-meta">
                        {c.errorsAfter2h === null ? 'after-window still filling' : `errors ${c.errorsBefore2h} → ${c.errorsAfter2h} across 2 h`} ·{' '}
                        {plural(c.newFingerprintsSince, 'new fingerprint')} · {c.resolvedAndQuietSince} went quiet
                      </span>
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Pill tone={w.tone} dot>
                        {w.word}
                      </Pill>
                      <Chevron />
                    </span>
                  </Link>
                </li>
              );
            })}
          </ol>
        )}
        {ledger.ok && ledger.data.deploySource === 'marker-fallback' ? (
          <p className="bs-note" style={{ padding: '0 22px 18px', margin: 0 }}>
            Vercel’s deployment list did not answer, so this runway is built from recorded deploy markers.
          </p>
        ) : null}
      </Panel>

      <section className="bs-grid" aria-label="Platform">
        <Panel title="Flags" note={<Link href="/admin/releases" className="bs-link">Releases</Link>}>
          <dl className="bs-kv" style={{ padding: '4px 22px 20px' }}>
            <dt>Registered, not archived</dt>
            <dd>{flags.live}</dd>
            <dt>On in production</dt>
            <dd>{flags.onInProduction}</dd>
            <dt>Expiring within 14 days</dt>
            <dd className={flags.expiringSoon ? 'bs-tone-watch' : ''}>{flags.expiringSoon}</dd>
            <dt>Past their expiry</dt>
            <dd className={flags.expired ? 'bs-tone-bad' : ''}>{flags.expired}</dd>
          </dl>
        </Panel>

        <Panel title="Database" note={<Link href="/admin/database" className="bs-link">Database</Link>}>
          <DatabaseBody db={db} now={now} />
        </Panel>

        <Panel title="Jobs" note={<Link href="/admin/jobs" className="bs-link">Jobs & Integrity</Link>}>
          {jobs.ok ? (
            <dl className="bs-kv" style={{ padding: '4px 22px 20px' }}>
              <dt>Running on time</dt>
              <dd className="bs-tone-good">
                {jobs.data.ok} of {jobs.data.total}
              </dd>
              <dt>Failed or degraded</dt>
              <dd className={jobs.data.failed + jobs.data.degraded ? 'bs-tone-bad' : ''}>{jobs.data.failed + jobs.data.degraded}</dd>
              <dt>Overdue</dt>
              <dd className={jobs.data.overdue ? 'bs-tone-watch' : ''}>{jobs.data.overdue}</dd>
              <dt>Never ran</dt>
              <dd>{jobs.data.neverRan}</dd>
              {jobs.data.unreadable ? (
                <>
                  <dt>History unreadable</dt>
                  <dd className="bs-tone-bad">{jobs.data.unreadable}</dd>
                </>
              ) : null}
              <dt>Integrity checks failing</dt>
              <dd className={jobs.data.integrityFailed ? 'bs-tone-bad' : ''}>
                {jobs.data.integrityFailed} of {jobs.data.integrityTotal}
              </dd>
            </dl>
          ) : (
            <FailedInline br={BR.ship.failed} what="Job history" retryHref={HREF} />
          )}
        </Panel>

        <Panel title="Next to ship" note={<Link href="/admin/spaces/desk" className="bs-link">Desk</Link>}>
          <div style={{ padding: '4px 22px 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span className={`bs-stat-value ${held.ok ? (held.data > 0 ? 'bs-tone-watch' : '') : 'bs-tone-muted'}`} style={{ marginTop: 0 }}>
              {held.ok ? held.data : '—'}
            </span>
            <span className="bs-panel-note">
              {held.ok ? 'migrations held out of production, each waiting on your decision' : 'the held-migration register could not be read'}
            </span>
            <span className="bs-panel-note">{fresh.summary}</span>
          </div>
        </Panel>
      </section>

      <TabLinkRow links={TABS} br={BR.ship.tabLink} />
    </SpaceRoot>
  );
}

function DatabaseBody({ db, now }: { db: SettledRead<AdminFetchResult<DatabaseMissionControlSnapshot>>; now: number }) {
  if (!db.ok || db.data.status === 'error') return <FailedInline br={BR.ship.failed} what="Database posture" retryHref={HREF} />;
  if (db.data.status === 'unconfigured' || !db.data.data) {
    return (
      <div className="bs-inline-state" data-br={BR.ship.noSignal}>
        The health sampler isn’t running in this database yet (its migration is held), so posture is not measured here.
      </div>
    );
  }
  const s = db.data.data.latestSample;
  if (!s) {
    return (
      <div className="bs-inline-state" data-br={BR.ship.noSignal}>
        No health sample has been written yet.
      </div>
    );
  }
  const conn = s.connectionsPctMax;
  const cache = s.cacheHitRatio;
  return (
    <dl className="bs-kv" style={{ padding: '4px 22px 20px' }}>
      <dt>Connections in use</dt>
      <dd className={conn !== null && conn >= 80 ? 'bs-tone-bad' : conn !== null && conn >= 60 ? 'bs-tone-watch' : ''}>
        {conn === null ? '—' : `${Math.round(conn)}% of max`}
      </dd>
      <dt>Cache hit ratio</dt>
      <dd className={cache !== null && cache < 0.95 ? 'bs-tone-watch' : ''}>{cache === null ? '—' : `${(cache * 100).toFixed(1)}%`}</dd>
      <dt>Waiting on a lock</dt>
      <dd className={s.connectionsWaitingLock > 0 ? 'bs-tone-watch' : ''}>{s.connectionsWaitingLock}</dd>
      <dt>Last sample</dt>
      <dd className={toneClass(now - Date.parse(s.sampledAt) > 30 * 60_000 ? 'watch' : 'ink')}>{ago(Date.parse(s.sampledAt), now)}</dd>
    </dl>
  );
}
