import type { Metadata } from 'next';
import Link from 'next/link';
import { requireSuperAdmin } from '@/lib/admin/require-super-admin';
import { BR } from '@/lib/admin/clubhouse/br-codes';
import { fetchFeatureAdoption } from '@/lib/admin/data/feature-adoption';
import { fetchFeatureHealthDbStatuses } from '@/lib/admin/data/feature-health';
import { settleRead } from '@/lib/admin/data/today-space';
import { Panel, SpaceHeader, SpaceRoot, SpaceState, Stat, toneClass, type Tone } from '../_ui/ui';
import { TabLinkRow } from '../_landing/parts';
import { APP_WORD, featureBands, plural, productHeadline, productSummary, type FeatureLite, type HealthStatus } from '../_landing/model';

export const metadata: Metadata = { title: 'Product' };

export const dynamic = 'force-dynamic';

const HREF = '/admin/spaces/product';

const TABS = [
  { label: 'Utilization', href: '/admin/utilization', note: 'adoption by day and person' },
  { label: 'Health', href: '/admin/health', note: 'feature health, budgets, heartbeats' },
  { label: 'Golf (legacy)', href: '/admin/golf', note: 'GolfHelm production signals' },
  { label: 'Baseball', href: '/admin/baseball', note: 'BaseballHelm signals' },
  { label: 'Lift Lab', href: '/admin/lifting', note: 'strength program activity' },
];

const HEALTH: Record<HealthStatus, { word: string; tone: Tone }> = {
  red: { word: 'Red', tone: 'bad' },
  amber: { word: 'Amber', tone: 'watch' },
  // Not "green": amber needs Sentry for one rule, and this page does not read Sentry (see fetchFeatureHealthDbStatuses).
  green: { word: 'No flag', tone: 'muted' },
  neutral: { word: 'No data', tone: 'muted' },
};

/**
 * Product space, B22 (plan: docs/superpowers/specs/helm-bridge/2026-11-26-bridge-spaces-build.md).
 * "Which parts of the app are alive?" Usage from the Utilization reader (`fetchFeatureAdoption`), health from the
 * database-only statuses (`fetchFeatureHealthDbStatuses`, no Sentry fan-out).
 */
export default async function ProductSpacePage() {
  await requireSuperAdmin();
  const now = new Date();

  const [adoption, health] = await Promise.all([
    settleRead('product.adoption', async () => {
      const r = await fetchFeatureAdoption(now);
      if (r.status !== 'ok') throw new Error(r.error ?? 'feature adoption read failed');
      return r;
    }),
    settleRead('product.health', async () => {
      const m = await fetchFeatureHealthDbStatuses();
      if (m === null) throw new Error('get_feature_health() degraded');
      return m;
    }),
  ]);

  if (!adoption.ok) {
    return (
      <SpaceRoot br={BR.product.failed}>
        <SpaceHeader eyebrow="Product" title="Which parts of the app are alive." />
        <SpaceState br={BR.product.failed} title="Feature usage could not be read.">
          The Utilization reader failed, so no feature is shown as used or unused.{' '}
          <Link href={HREF} className="bs-link">
            Try again
          </Link>
        </SpaceState>
        <TabLinkRow links={TABS} br={BR.product.tabLink} />
      </SpaceRoot>
    );
  }

  const statuses = health.ok ? (health.data as ReadonlyMap<string, HealthStatus>) : null;
  const todayKey = now.toISOString().slice(0, 10);
  const features: FeatureLite[] = adoption.data.rows.map((r) => ({
    key: r.key,
    label: r.label,
    app: r.app,
    tier: r.tier,
    uniqueUsers30d: r.uniqueUsers30d,
    uniqueUsers7d: r.uniqueUsers7d,
    usedToday: r.days30.at(-1)?.date === todayKey && (r.days30.at(-1)?.uniqueUsers ?? 0) > 0,
    quietDays: r.quietDays,
  }));
  const summary = productSummary(features, statuses);
  const head = productHeadline(summary);
  const bands = featureBands(features);
  const ro = adoption.data.readouts;

  if (features.length === 0) {
    return (
      <SpaceRoot br={BR.product.empty}>
        <SpaceHeader eyebrow="Product" title="Which parts of the app are alive." />
        <SpaceState br={BR.product.empty} title="No features are registered." />
        <TabLinkRow links={TABS} br={BR.product.tabLink} />
      </SpaceRoot>
    );
  }

  return (
    <SpaceRoot br={health.ok ? '' : BR.product.failed}>
      <SpaceHeader
        eyebrow="Product · which parts of Helm are alive"
        title={head.title}
        second={head.second}
        secondTone={head.tone}
        lede={
          <>
            {summary.usedToday} touched today and {summary.used30d} in the last 30 days; {plural(ro.quiet14d, 'feature has', 'features have')} been quiet
            for two weeks or more. Health flags come from database signals only, so amber is a floor. Test and demo accounts count here,
            as on Utilization: {ro.internalActiveUsers} of the {plural(ro.activeUsers30d, 'person', 'people')} active in 30 days are internal.
          </>
        }
      />

      <section aria-label="Feature counts" className="bs-tiles">
        <Stat label="Used today" value={`${summary.usedToday}/${summary.total}`} sub="since 00:00 UTC" tone={summary.usedToday > 0 ? 'good' : 'watch'} />
        <Stat label="Used this week" value={`${summary.used7d}/${summary.total}`} sub="anyone, last 7 days" tone={summary.used7d > 0 ? 'good' : 'watch'} />
        <Stat label="Used in 30 days" value={`${summary.used30d}/${summary.total}`} sub="anyone, last 30 days" />
        <Stat label="Red" value={summary.red} sub="failing by database signals" tone={summary.red ? 'bad' : 'muted'} href="/admin/health" />
        <Stat label="Amber" value={summary.amber} sub="needs a look (a floor: Sentry not read)" tone={summary.amber ? 'watch' : 'muted'} href="/admin/health" />
      </section>

      {!health.ok ? (
        <SpaceState br={BR.product.failed} title="Feature health could not be read.">
          Dots below read “health unread”, never green.{' '}
          <Link href={HREF} className="bs-link">
            Try again
          </Link>
        </SpaceState>
      ) : null}

      {bands.map((band) => (
        <Panel key={band.app} title={APP_WORD[band.app]} note={`${band.alive} of ${plural(band.features.length, 'feature')} used in 30 days`}>
          <div className="bs-feature-grid">
            {band.features.map((f) => {
              const status = statuses?.get(f.key) ?? null;
              const h = status ? HEALTH[status] : { word: 'Health unread', tone: 'muted' as Tone };
              return (
                <Link
                  key={f.key}
                  href={`/admin/errors?feature=${encodeURIComponent(f.key)}`}
                  className={`bs-feature bs-card-link ${f.uniqueUsers30d === 0 ? 'bs-feature-quiet' : ''}`}
                  data-br={BR.product.featureCard}
                  aria-label={`${f.label}: ${plural(f.uniqueUsers30d, 'person', 'people')} in 30 days, ${f.uniqueUsers7d} this week, health ${h.word.toLowerCase()}`}
                >
                  <span className="bs-feature-name">
                    <span className={`bs-dot ${toneClass(h.tone)}`} aria-hidden="true" />
                    {f.label}
                  </span>
                  <span className={`bs-feature-n ${f.uniqueUsers30d === 0 ? 'bs-tone-muted' : ''}`}>{f.uniqueUsers30d}</span>
                  <span className="bs-tile-sub">
                    {f.uniqueUsers30d === 0
                      ? 'nobody in 30 days'
                      : `${f.uniqueUsers30d === 1 ? 'person' : 'people'} in 30 days · ${f.uniqueUsers7d} this week`}
                  </span>
                  <span className={`bs-tile-sub ${toneClass(h.tone)}`} style={{ fontWeight: 600 }}>
                    {h.word}
                    {f.tier === 'high' ? ' · core' : ''}
                  </span>
                </Link>
              );
            })}
          </div>
        </Panel>
      ))}

      <TabLinkRow links={TABS} br={BR.product.tabLink} />
    </SpaceRoot>
  );
}
