import Link from 'next/link';
import type { Metadata } from 'next';
import { requireSuperAdmin } from '@/lib/admin/require-super-admin';
import { BR } from '@/lib/admin/clubhouse/br-codes';
import { readPipe } from '@/lib/admin/clubhouse/live';
import { CONTEXT_KINDS, EDGE_CASES, ERROR_KINDS, HOURLY_KEY, NEVER_ERROR_OUTCOMES, ruleBook } from '@/lib/admin/clubhouse/rule-book';
import { Panel, SpaceHeader, SpaceRoot } from '../../_ui/ui';
import { ReliabilityTabs, TruthLine } from '../_components/shared';

export const metadata: Metadata = { title: 'Reliability · How errors are counted' };

export const dynamic = 'force-dynamic';

const SEVERITY_TONE: Record<string, string> = { critical: 'bad', high: 'bad', medium: 'watch', low: 'muted' };

/**
 * B20 How errors are counted (plan 2026-11-26-bridge-spaces-build.md). Generated from the code: kinds and outcomes from
 * signal.ts, limits from ingest.ts and rules.ts, each rule's severity read by firing it (rule-book.ts). Nothing on this
 * page is a live number, so it never says "all clear"; the pipe pill says whether the counts it explains are arriving.
 */
export default async function ReliabilityRulesPage() {
  await requireSuperAdmin();
  const pipe = await readPipe();
  const rules = ruleBook();
  return (
    <SpaceRoot br={BR.rules.ruleRow}>
      <ReliabilityTabs current="rules" />
      <SpaceHeader
        eyebrow="Reliability · the counting rules"
        title="One error, counted once,"
        second="in the right place."
        lede={
          <>
            These are the rules the ingest already runs (src/lib/admin/clubhouse/ingest.ts and live-model.ts), written out from the code itself. Every number on
            the Bridge comes from them, so a count means what it says.
          </>
        }
      />
      <TruthLine pipe={pipe}>
        <span>The rules apply whether or not signals are arriving; the pill says whether they are.</span>
      </TruthLine>

      <div className="rl-kinds">
        <section className="bs-panel bs-panel-pad">
          <h2 className="bs-eyebrow bs-tone-bad" style={{ margin: 0 }}>Counts as an error</h2>
          <div className="rl-kind-title">A crash, or an action that ended in failure</div>
          <div className="rl-chips">
            <span className="bs-chip">kind: {ERROR_KINDS.kind}</span>
            <span className="bs-chip">outcome: {ERROR_KINDS.outcome}</span>
          </div>
          <p className="rl-body">
            Every one carries the CH code the person saw, a Bridge ID, the page and, for an action, its name. A failure whose code the Bridge map does not know is
            still counted, under &ldquo;unknown&rdquo;, and also logged as drift.
          </p>
        </section>
        <section className="bs-panel bs-panel-pad">
          <h2 className="bs-eyebrow bs-tone-watch" style={{ margin: 0 }}>Counted, never as an error</h2>
          <div className="rl-kind-title">Things that went sideways but did not fail</div>
          <div className="rl-chips">
            {NEVER_ERROR_OUTCOMES.map((o) => (
              <span key={o} className="bs-chip">{o}</span>
            ))}
          </div>
          <p className="rl-body">An offline try, a busy button, a person who cancelled or gave up waiting, a Try again. They show on the action&apos;s outcome bar, never in error totals.</p>
        </section>
        <section className="bs-panel bs-panel-pad">
          <h2 className="bs-eyebrow bs-tone-good" style={{ margin: 0 }}>Context, not errors</h2>
          <div className="rl-kind-title">What makes the pages, speed and timelines</div>
          <div className="rl-chips">
            {CONTEXT_KINDS.map((k) => (
              <span key={k} className="bs-chip">{k}</span>
            ))}
          </div>
          <p className="rl-body">They make the pages, speed and session timelines. A session&apos;s full timeline is kept only once it has a failure; otherwise only its counts.</p>
        </section>
      </div>

      <Panel title='The key: what makes two errors "the same"'>
        <div className="rl-key">
          {HOURLY_KEY.map((k) => (
            <div key={k.part}>
              <b>{k.part}</b>
              <span>{k.says}</span>
            </div>
          ))}
        </div>
        <p className="rl-body" style={{ padding: '14px 22px 20px', maxWidth: 900 }}>
          Every signal adds one to the hourly row with these nine values. A <b>cause</b> on the feed is one code on one page; its count splits by coach and player,
          device and release underneath. <b>People</b> are the distinct signed-in users in those rows, kept per row as a set, so a person is never counted twice
          inside a cause.
        </p>
      </Panel>

      <div className="bs-grid bs-grid-wide">
        <Panel title="Edge cases, decided">
          <div className="rl-cases">
            {EDGE_CASES.map((c) => (
              <div key={c.case}>
                <b>{c.case}</b>
                <span>{c.decided}</span>
              </div>
            ))}
          </div>
        </Panel>
        <Panel title="When something is raised" note="Severity read from each rule">
          <div>
            {rules.map((r) => {
              const body = (
                <>
                  <span className="bs-mono bs-tone-muted">{r.id}</span>
                  <span>
                    <b>{r.name}</b> · <span className="bs-tone-muted">{r.when}</span>
                  </span>
                  <span className={`bs-tone-${SEVERITY_TONE[r.severity.split(' ')[0]!] ?? 'muted'}`} style={{ fontSize: 12, fontWeight: 600, textAlign: 'right' }}>
                    {r.severity}
                  </span>
                  {r.where ? <span className="rl-where-link">Shows on {r.where}</span> : null}
                </>
              );
              return r.href ? (
                <Link key={r.id} href={r.href} className="rl-rule" data-br={BR.rules.ruleRow}>
                  {body}
                </Link>
              ) : (
                <div key={r.id} className="rl-rule" data-br={BR.rules.ruleRow}>
                  {body}
                </div>
              );
            })}
          </div>
        </Panel>
      </div>
    </SpaceRoot>
  );
}
