import Link from 'next/link';
import type { ReactNode } from 'react';
import { RadioTower, TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { BridgeGraph } from '@/lib/admin/clubhouse/graph';
import type { BridgeAlert } from '@/lib/admin/clubhouse/rules';
import type { LiveScope, PipeStatus } from '@/lib/admin/clubhouse/live-model';
import { liveHref, withLive } from '@/lib/admin/clubhouse/live-model';
import { alertHref } from '@/lib/admin/clubhouse/pulse';
import { clubhouseHref, type ClubhouseScope } from '@/lib/admin/clubhouse/screens';
import { PanelStale } from '../../_components/PanelStates';

const SEVERITY_CLASS: Record<BridgeAlert['severity'], string> = {
  critical: 'border-fw-danger/50 bg-fw-danger/10 text-fw-danger-ink',
  high: 'border-fw-danger/30 bg-fw-danger/5 text-fw-danger-ink',
  medium: 'border-fw-warning/40 bg-fw-warning/5 text-fw-warning-ink',
  low: 'border-border-subtle bg-surface-sunken text-text-secondary',
};

export function SeverityTag({ severity }: { severity: BridgeAlert['severity'] }) {
  return <span className={cn('inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-caption font-medium', SEVERITY_CLASS[severity])}>{severity}</span>;
}

/** Rule hits (BR-0110 on Pulse): each row opens what the alert names. */
export function AlertList({
  alerts,
  graph,
  scope,
  live,
  br,
  empty,
}: {
  alerts: readonly BridgeAlert[];
  graph: Pick<BridgeGraph, 'actions' | 'chIndex'>;
  scope: ClubhouseScope;
  live: LiveScope;
  br: string;
  empty: ReactNode;
}) {
  if (!alerts.length) return <>{empty}</>;
  return (
    <ul className="divide-y divide-border-subtle">
      {alerts.map((a, i) => {
        const href = alertHref(a, graph);
        const body = (
          <>
            <span className="flex flex-wrap items-center gap-2">
              <span className="font-fw-mono text-caption tabular-nums text-text-tertiary">{a.rule}</span>
              <SeverityTag severity={a.severity} />
            </span>
            <span className="mt-0.5 block min-w-0 break-words text-body-sm text-text-primary">{a.title}</span>
            <span className="mt-0.5 block font-fw-mono text-caption tabular-nums text-text-tertiary">
              {[a.page, a.code, a.action, a.control, a.release ? a.release.slice(0, 7) : null].filter(Boolean).join(' · ')}
            </span>
          </>
        );
        return (
          <li key={`${a.rule}-${a.title}-${i}`}>
            {href ? (
              <Link
                href={withLive(href, scope, live)}
                data-br={br}
                className="block min-w-0 px-1 py-2.5 hover:bg-surface-sunken focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-500"
              >
                {body}
              </Link>
            ) : (
              <div data-br={br} className="min-w-0 px-1 py-2.5">
                {body}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * R-09 (critical): while the pipe is silent, every "all clear" on screen is untrusted. Off and "not there yet" say so
 * more quietly: nothing claims a green it cannot see.
 */
export function PipeBanner({ pipe, code, href }: { pipe: PipeStatus; code: string; href?: string }) {
  if (pipe.tone === 'live') return null;
  const silent = pipe.tone === 'silent';
  const text: Record<Exclude<PipeStatus['tone'], 'live'>, string> = {
    silent: `${pipe.alert?.title ?? 'No signals have arrived for 15 minutes.'} Treat every "nothing fired" below as unknown.`,
    off: 'The clubhouse_signals switch is off, so Clubhouse sends nothing. Nothing below can be counted, so nothing is claimed.',
    'no-signal': 'No Clubhouse signal has reached the Bridge yet (the signal tables are held or empty). Nothing below can be counted, so nothing is claimed.',
    unknown: 'The pipe could not be read, so nothing below can be vouched for.',
  };
  return (
    <div
      role={silent ? 'alert' : 'note'}
      data-br={code}
      className={cn(
        'flex min-w-0 items-start gap-2.5 rounded-fw-md border px-3 py-2.5',
        silent ? 'border-fw-danger/40 bg-fw-danger/5' : 'border-dashed border-border-strong bg-surface-sunken',
      )}
    >
      {silent ? <TriangleAlert size={16} aria-hidden className="mt-0.5 shrink-0 text-fw-danger-ink" /> : <RadioTower size={16} aria-hidden className="mt-0.5 shrink-0 text-text-tertiary" />}
      <p className={cn('min-w-0 text-body-sm', silent ? 'text-fw-danger-ink' : 'text-text-secondary')}>
        <span className="font-medium">{silent ? 'Pipe silent (R-09). ' : pipe.tone === 'off' ? 'Pipe switched off. ' : 'No signal yet. '}</span>
        {text[pipe.tone]}
        {href ? (
          <>
            {' '}
            <Link href={href} prefetch={false} className="font-medium text-accent-ink underline-offset-2 hover:underline">
              Open the pipe panel
            </Link>
          </>
        ) : null}
      </p>
    </div>
  );
}

/** BR-xx92 for a live read: the tables exist but the read failed. Try again re-requests the page. */
export function LiveFailed({ code, label, error, retryHref }: { code: string; label: string; error?: string; retryHref: string }) {
  return (
    <div data-br={code}>
      <PanelStale
        label={label}
        error={error ?? 'The read failed.'}
        action={
          <Link
            href={retryHref}
            prefetch={false}
            className="mt-1 inline-flex min-h-9 items-center rounded-lg border border-fw-warning/40 px-3 text-xs font-medium text-warm-700 hover:bg-fw-warning/10"
          >
            Try again
          </Link>
        }
      />
    </div>
  );
}

/** The lenses one click from Pulse: the registry screens (B02 to B05, B12) and the live ones (B06 to B10). */
export function LensLinks({ scope, live }: { scope: ClubhouseScope; live: LiveScope }) {
  const lenses: Array<[string, string, string]> = [
    ['B02', 'Pages', clubhouseHref.pages()],
    ['B03', 'Controls', clubhouseHref.controls()],
    ['B04', 'Actions', clubhouseHref.actions()],
    ['B05', 'Codes', clubhouseHref.codes()],
    ['B06', 'Incidents', '/admin/errors'],
    ['B07', 'Sessions', liveHref.sessions()],
    ['B09', 'Experience', liveHref.experience()],
    ['B10', 'Releases', liveHref.releases()],
    ['B12', 'Readiness', clubhouseHref.readiness()],
  ];
  return (
    <nav aria-label="Clubhouse lenses" className="flex min-w-0 flex-wrap gap-1.5">
      {lenses.map(([id, label, href]) => (
        <Link
          key={id}
          href={href.startsWith('/admin/clubhouse') ? withLive(href, scope, live) : href}
          className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-border-control bg-surface px-2.5 text-caption font-medium text-text-secondary hover:border-border-strong hover:text-text-primary [@media(pointer:coarse)]:min-h-10"
        >
          <span className="font-fw-mono tabular-nums text-text-tertiary">{id}</span>
          {label}
        </Link>
      ))}
    </nav>
  );
}

/** A small number with its label, for a dense row of facts (not a hero metric). */
export function Fact({ label, value, tone }: { label: string; value: ReactNode; tone?: 'danger' | 'warning' }) {
  return (
    <div className="min-w-0">
      <dt className="text-caption text-text-tertiary">{label}</dt>
      <dd className={cn('font-fw-mono text-body-sm font-semibold tabular-nums text-text-primary', tone === 'danger' && 'text-fw-danger-ink', tone === 'warning' && 'text-fw-warning-ink')}>{value}</dd>
    </div>
  );
}
