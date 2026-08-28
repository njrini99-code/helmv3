import Link from 'next/link';
import { CloudOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { LocalTime } from './LocalTime';
import { PanelNoData } from './PanelStates';
import type { ChangeEvent, ChangeEventKind, ChangeTimelineSnapshot } from '@/lib/admin/data/change-timeline';
import type { StateTone } from '@/lib/admin/incidents/types';

/**
 * The Change Timeline — a single ordered rail answering "what changed, and
 * in what order?" over the deploys, incident sightings, diagnoses, repair
 * PRs and resolutions of the last `snapshot.windowMs`.
 *
 * Purely presentational: every fact here already lives on `snapshot`, built
 * by `buildChangeTimeline` in `@/lib/admin/data/change-timeline`. This
 * component's only job is to render that list honestly — which mainly means
 * NOT rendering an all-clear when a source behind it could not be read, and
 * NOT drawing a causal line between two events that merely sit near each
 * other on the rail. See the data module's doc comment for why that second
 * rule is the point of the whole feature.
 */

const KIND_LABEL: Readonly<Record<ChangeEventKind, string>> = {
  deploy: 'DEPLOY',
  'incident-first-seen': 'INCIDENT',
  analysis: 'ANALYSIS',
  'pr-opened': 'PR OPENED',
  'pr-merged': 'PR MERGED',
  resolved: 'RESOLVED',
  regressed: 'REGRESSED',
};

/** Saturated, for the rail dot — mirrors `Row.tsx`'s RAIL/`-ink` split:
 *  a dot is a block of colour and takes the full value, text takes the ink
 *  pairing so it actually reads (design-tokens.css measured warning at
 *  2.08:1 and danger at 4.01:1 as TEXT; the `-ink` pairings measure 7.27:1). */
const TONE_DOT: Readonly<Record<StateTone, string>> = {
  danger: 'bg-fw-danger',
  warning: 'bg-fw-warning',
  accent: 'bg-accent-600',
  success: 'bg-fw-success',
  neutral: 'bg-warm-300',
};

const TONE_INK: Readonly<Record<StateTone, string>> = {
  danger: 'text-fw-danger-ink',
  warning: 'text-fw-warning-ink',
  accent: 'text-accent-700',
  success: 'text-fw-success-ink',
  neutral: 'text-warm-500',
};

function windowHours(windowMs: number): number {
  return Math.round(windowMs / 3600_000);
}

function UnreadableBanner({ unreadable }: { unreadable: readonly string[] }) {
  return (
    <div className="mb-3 flex items-start gap-2 rounded-lg bg-fw-warning-bg px-3 py-2">
      <CloudOff size={14} className="mt-0.5 shrink-0 text-fw-warning-ink" aria-hidden />
      <p className="text-caption leading-5 text-fw-warning-ink">
        Partial: {unreadable.join('; ')}. Some changes may be missing from this strip.
      </p>
    </div>
  );
}

function EventBody({ event }: { event: ChangeEvent }) {
  return (
    <>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span
          className={cn('text-eyebrow font-bold uppercase tracking-wide', TONE_INK[event.tone])}
        >
          {KIND_LABEL[event.kind]}
        </span>
        {event.ref ? (
          <span className="font-fw-mono text-caption text-warm-400">{event.ref}</span>
        ) : null}
      </div>
      <p className="break-words text-body-sm font-semibold leading-snug text-warm-900 [overflow-wrap:anywhere]">
        {event.title}
      </p>
      {event.detail ? (
        <p className="break-words text-caption leading-5 text-warm-500 [overflow-wrap:anywhere]">
          {event.detail}
        </p>
      ) : null}
    </>
  );
}

function EventRow({ event, isLast }: { event: ChangeEvent; isLast: boolean }) {
  return (
    <li className="relative flex gap-3">
      <div className="flex w-14 shrink-0 flex-col items-end pt-3.5">
        <span className="font-fw-mono text-caption tabular-nums text-warm-400">
          <LocalTime iso={event.at} variant="time" />
        </span>
      </div>

      <div className="relative flex w-4 shrink-0 flex-col items-center">
        <span
          aria-hidden
          className={cn('mt-4 h-2.5 w-2.5 shrink-0 rounded-full ring-4 ring-warm-50', TONE_DOT[event.tone])}
        />
        {!isLast ? <span aria-hidden className="w-px flex-1 bg-warm-200" /> : null}
      </div>

      <div className="min-w-0 flex-1 pb-4">
        {event.href ? (
          <Link
            href={event.href}
            className="-mx-2 -my-1 flex min-h-11 flex-col justify-center gap-0.5 rounded-md px-2 py-1 transition-colors hover:bg-warm-100/70"
          >
            <EventBody event={event} />
          </Link>
        ) : (
          <div className="flex min-h-11 flex-col justify-center gap-0.5 py-1">
            <EventBody event={event} />
          </div>
        )}
      </div>
    </li>
  );
}

export function ChangeTimeline({ snapshot }: { snapshot: ChangeTimelineSnapshot }) {
  const hasUnreadable = snapshot.unreadable.length > 0;
  const isQuiet = snapshot.events.length === 0 && !hasUnreadable;

  return (
    <div className="w-full max-w-full">
      {hasUnreadable ? <UnreadableBanner unreadable={snapshot.unreadable} /> : null}

      {isQuiet ? (
        <PanelNoData
          label="All quiet"
          description={`No deploys, repairs or closures in the last ${windowHours(snapshot.windowMs)}h.`}
        />
      ) : snapshot.events.length > 0 ? (
        <ol className="flex flex-col">
          {snapshot.events.map((event, i) => (
            <EventRow
              key={`${event.kind}:${event.ref ?? ''}:${event.at}`}
              event={event}
              isLast={i === snapshot.events.length - 1}
            />
          ))}
        </ol>
      ) : null}

      {snapshot.incidentsCapped ? (
        <p className="mt-1 text-caption text-warm-400">
          Incident volume exceeded this strip&rsquo;s per-refresh cap — only the most severe and
          most recent are shown.
        </p>
      ) : null}
    </div>
  );
}
