import type { Metadata } from 'next';
import Link from 'next/link';
import { DESK_TABS } from '../../_components/space-tabs';
import { requireSuperAdmin } from '@/lib/admin/require-super-admin';
import { BR } from '@/lib/admin/clubhouse/br-codes';
import { fetchHeldMigrations } from '@/lib/admin/command-deck/held-migrations';
import { fetchBenLeahOpenIssues } from '@/lib/admin/ben-leah-issues';
import { settleRead } from '@/lib/admin/data/today-space';
import { Panel, Pill, SpaceHeader, SpaceRoot, SpaceState, Stat } from '../_ui/ui';
import { Chevron, FailedInline, TabLinkRow } from '../_landing/parts';
import { deskHeadline, deskQueue, heldCount } from '../_landing/model';

export const metadata: Metadata = { title: 'Desk' };

export const dynamic = 'force-dynamic';

const HREF = '/admin/spaces/desk';
const SHOWN = 12;

const TABS = DESK_TABS;

/**
 * Desk space, B24 (plan: docs/superpowers/specs/helm-bridge/2026-11-26-bridge-spaces-build.md).
 * "What is waiting on you?" Two real sources only: HOLD rows in supabase/migrations/HELD.md (the register the
 * Engineering OS decision inbox reads) and Ben + Leah reports still open on GitHub (read-only list, no label writes).
 * Janitor findings are not counted: that report is not shipped to production.
 */
export default async function DeskSpacePage() {
  await requireSuperAdmin();

  const [held, reports] = await Promise.all([
    settleRead('desk.held', async () => {
      const rows = await fetchHeldMigrations();
      if (rows === null) throw new Error('supabase/migrations/HELD.md could not be read');
      return rows;
    }),
    settleRead('desk.reports', async () => {
      const r = await fetchBenLeahOpenIssues();
      if (r.status === 'unconfigured') return null;
      if (r.status !== 'ok' || !r.data) throw new Error(r.error ?? 'GitHub issues read failed');
      return r.data;
    }),
  ]);

  const heldN = held.ok ? heldCount(held.data) : null;
  const reportList = reports.ok ? reports.data : null;
  const reportN = reportList ? reportList.length : null;
  const queue = deskQueue(held.ok ? held.data : null, reportList);
  const head = deskHeadline(heldN, reportN);
  const anyFailed = !held.ok || !reports.ok;
  // GitHub not configured: the reports were not read, so the queue is not known to be empty.
  const reportsUnread = reports.ok && reports.data === null;

  return (
    <SpaceRoot br={anyFailed ? BR.desk.failed : queue.length === 0 && !reportsUnread ? BR.desk.empty : ''}>
      <SpaceHeader
        eyebrow="Desk · what is waiting on you"
        title={head.title}
        second={head.second}
        secondTone={head.tone}
        lede="Migrations held out of production, from the HELD register the Engineering OS decision inbox also reads, and Ben + Leah reports still open on GitHub. Janitor findings are not counted: that report is not shipped to production."
      />

      <section aria-label="Sources" className="bs-tiles">
        <Stat label="Held migrations" value={heldN} sub="HOLD rows in HELD.md" tone={heldN ? 'watch' : 'muted'} href="/admin/engineering" />
        <Stat
          label="Open reports"
          value={reportN}
          sub={reportsUnread ? 'GitHub is not configured here, so reports were not read' : 'Ben + Leah, open on GitHub'}
          tone={reportN ? 'watch' : 'muted'}
          href="/admin/ben-leah"
        />
      </section>

      <Panel title="Decision queue" note="reports by priority, then held migrations in register order">
        {!held.ok ? <FailedInline br={BR.desk.failed} what="The held-migration register" retryHref={HREF} /> : null}
        {!reports.ok ? <FailedInline br={BR.desk.failed} what="Ben + Leah reports" retryHref={HREF} /> : null}
        {reportsUnread ? (
          <p className="bs-panel-note bs-tone-watch" style={{ margin: '0 22px 12px' }}>
            Ben + Leah reports were not read: no GitHub token is configured here. Open reports may be waiting on the Ben + Leah tab.
          </p>
        ) : null}
        {queue.length === 0 && !anyFailed && !reportsUnread ? (
          <SpaceState br={BR.desk.empty} title="Nothing is waiting on you." />
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {queue.slice(0, SHOWN).map((q) => (
              <li key={q.key}>
                <Link href={q.href} className="bs-decision" data-br={BR.desk.decisionRow}>
                  <span style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    <Pill tone={q.tone} dot>
                      {q.state}
                    </Pill>
                    <span className={`bs-decision-title ${q.kind === 'held-migration' ? 'bs-mono' : ''}`}>{q.title}</span>
                  </span>
                  <Chevron />
                  <span className="bs-decision-why">{q.why}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {queue.length > SHOWN ? (
          <p className="bs-note" style={{ padding: '12px 22px 18px', margin: 0, borderTop: '1px solid var(--bs-line)' }}>
            {queue.length - SHOWN} more in{' '}
            <Link href="/admin/engineering" className="bs-link">
              Engineering OS
            </Link>{' '}
            and{' '}
            <Link href="/admin/ben-leah" className="bs-link">
              Ben + Leah
            </Link>
            .
          </p>
        ) : null}
      </Panel>

      <TabLinkRow links={TABS} br={BR.desk.tabLink} />
    </SpaceRoot>
  );
}
