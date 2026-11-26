import Link from 'next/link';
import { cn } from '@/lib/utils';
import { BR } from '@/lib/admin/clubhouse/br-codes';
import type { BridgeGraph } from '@/lib/admin/clubhouse/graph';
import { liveHref, msText, pctText, withLive, type LiveScope } from '@/lib/admin/clubhouse/live-model';
import { actionIdFor, type PulseModel } from '@/lib/admin/clubhouse/pulse';
import { clubhouseHref, type ClubhouseScope } from '@/lib/admin/clubhouse/screens';
import type { UnifiedIncident } from '@/lib/admin/incidents/types';
import { LocalTime } from '../../_components/LocalTime';
import { Section } from './frame';
import { AlertList, Fact, SeverityTag } from './live';

export type PulseIncident = Pick<UnifiedIncident, 'id' | 'title' | 'firstSeen' | 'occurrences' | 'affectedUsers' | 'linkTarget' | 'severity'>;

/** Pulse's body, pure over the model, so the tests render it from the seeded fixture. */
export function PulseBody({
  model,
  graph,
  scope,
  live,
  incidents,
}: {
  model: PulseModel;
  graph: Pick<BridgeGraph, 'actions' | 'chIndex' | 'pages'>;
  scope: ClubhouseScope;
  live: LiveScope;
  incidents: readonly Pick<UnifiedIncident, 'id' | 'title' | 'firstSeen' | 'occurrences' | 'affectedUsers' | 'linkTarget' | 'severity'>[];
}) {
  return (
    <div className="min-w-0 space-y-4">
      <Section
        title="Needs a look"
        description="High and critical rule hits (R-01 to R-12) in the last day. Every row opens what it names."
        actions={
          <dl className="flex gap-4">
            <Fact label="critical" value={model.counts.critical} tone={model.counts.critical ? 'danger' : undefined} />
            <Fact label="high" value={model.counts.high} tone={model.counts.high ? 'danger' : undefined} />
            <Fact label="medium" value={model.counts.medium} tone={model.counts.medium ? 'warning' : undefined} />
            <Fact label="low" value={model.counts.low} />
          </dl>
        }
      >
        <AlertList
          alerts={model.headline}
          graph={graph}
          scope={scope}
          live={live}
          br={BR.pulse.alertRow}
          empty={
            <p data-br={BR.pulse.empty} className="text-body-sm text-text-secondary">
              {model.allClear
                ? 'Nothing high or critical fired in the last day.'
                : model.readFailures
                  ? 'Nothing high or critical fired in what could be read, but some evidence failed to load (see above).'
                  : 'Nothing high or critical fired, but the pipe cannot vouch for that (see above).'}
            </p>
          }
        />
      </Section>

      <Section title="Page wall" description="Failures against views per page in the window. A quiet page may have a broken instrument (R-08).">
        <ul className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {model.tiles.map((t) => (
            <li key={t.page} className="min-w-0">
              <Link
                href={withLive(clubhouseHref.page(t.page), scope, live)}
                data-br={BR.pulse.pageTile}
                className={cn(
                  'flex h-full min-w-0 flex-col gap-1 rounded-fw-md border px-2.5 py-2 hover:bg-surface-sunken focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-500',
                  t.quiet || t.alerting ? 'border-fw-danger/40' : 'border-border-subtle',
                )}
              >
                <span className="flex min-w-0 items-baseline justify-between gap-1">
                  <span className="truncate text-caption font-semibold text-text-primary">
                    <span className="font-fw-mono tabular-nums">{t.page}</span> {t.name}
                  </span>
                </span>
                <span className="font-fw-mono text-caption tabular-nums text-text-secondary">
                  {t.views.toLocaleString('en-US')} views · <span className={t.failures ? 'font-semibold text-fw-danger-ink' : undefined}>{t.failures} failed</span>
                </span>
                <span className="truncate font-fw-mono text-caption tabular-nums text-text-tertiary">
                  {t.quiet ? 'went quiet' : t.worstCode ? `worst ${t.worstCode}` : t.views ? `rate ${pctText(t.rate)}` : 'no views'}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Section>

      <div className="grid min-w-0 gap-4 lg:grid-cols-2">
        <Section title="Rising" description="Spikes (R-01) and codes new in this release (R-02).">
          <AlertList
            alerts={model.rising}
            graph={graph}
            scope={scope}
            live={live}
            br={BR.pulse.risingRow}
            empty={<p className="text-body-sm text-text-secondary">No code is rising.</p>}
          />
        </Section>
        <Section title="Actions slipping" description="Success rate and p95 in the window; a rule's name when one fired.">
          {model.slipping.length ? (
            <ul className="divide-y divide-border-subtle">
              {model.slipping.map(({ alert, stat }) => (
                <li key={stat.act}>
                  <Link
                    href={withLive(clubhouseHref.action(actionIdFor(graph, stat.act)), scope, live)}
                    data-br={BR.pulse.actionRow}
                    className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 px-1 py-2.5 hover:bg-surface-sunken focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-500"
                  >
                    <span className="min-w-0 break-words font-fw-mono text-caption text-text-primary">{stat.act}</span>
                    <span className="flex items-center gap-2 font-fw-mono text-caption tabular-nums text-text-secondary">
                      {pctText(stat.rate)} of {stat.tries} · p95 {msText(stat.p95)}
                      {alert ? <SeverityTag severity={alert.severity} /> : null}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-body-sm text-text-secondary">Every action with traffic succeeded.</p>
          )}
        </Section>
      </div>

      <div className="grid min-w-0 gap-4 lg:grid-cols-2">
        <NewIncidents incidents={incidents} />
        <Section title="What just changed" description="The live release against the one before it, over the same hours after each deploy.">
          {model.release ? (
            <Link
              href={withLive(liveHref.release(model.release.release), scope, live)}
              data-br={BR.pulse.releaseCard}
              className="block min-w-0 rounded-fw-md border border-border-subtle px-3 py-2.5 hover:bg-surface-sunken focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-500"
            >
              <span className="font-fw-mono text-body-sm font-semibold tabular-nums text-text-primary">{model.release.release.slice(0, 7)}</span>
              <span className="text-caption text-text-tertiary">{model.release.base ? ` against ${model.release.base.slice(0, 7)}` : ' (no earlier release in the last day)'}</span>
              <dl className="mt-2 grid grid-cols-3 gap-2">
                <Fact label="codes new" value={model.release.diff.codes.filter((c) => c.kind === 'new').length} tone={model.release.diff.codes.some((c) => c.kind === 'new') ? 'danger' : undefined} />
                <Fact label="rising" value={model.release.diff.codes.filter((c) => c.kind === 'rising').length} />
                <Fact label="gone" value={model.release.diff.codes.filter((c) => c.kind === 'gone').length} />
              </dl>
            </Link>
          ) : (
            <p className="text-body-sm text-text-secondary">No release has sent signals in the last day.</p>
          )}
        </Section>
      </div>
    </div>
  );
}

export function NewIncidents({ incidents }: { incidents: readonly PulseIncident[] }) {
  return (
    <Section title="New incidents" description="The five newest Clubhouse incidents (B06).">
      {incidents.length ? (
        <ul className="divide-y divide-border-subtle">
          {incidents.map((i) => (
            <li key={i.id}>
              <Link
                href={i.linkTarget ?? liveHref.incident(i.id)}
                data-br={BR.pulse.incidentRow}
                className="block min-w-0 px-1 py-2.5 hover:bg-surface-sunken focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-500"
              >
                <span className="block min-w-0 break-words text-body-sm text-text-primary">{i.title}</span>
                <span className="font-fw-mono text-caption tabular-nums text-text-tertiary">
                  {i.severity} · {i.occurrences}× · {i.affectedUsers} people · first <LocalTime iso={i.firstSeen} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-body-sm text-text-secondary">No incidents in the incident window.</p>
      )}
    </Section>
  );
}
