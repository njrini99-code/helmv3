import Link from 'next/link';
import { KeyRound, Zap, AlertTriangle, Dumbbell, Users, Flag } from 'lucide-react';
import { requireSuperAdmin } from '@/lib/admin/require-super-admin';
import {
  fetchEntityThread,
  groupEventsByDay,
  type ThreadEntityKind,
  type ThreadEvent,
  type ThreadLane,
} from '@/lib/admin/data/entity-thread';
import { FEATURE_REGISTRY } from '@/lib/admin/feature-registry';
import { Surface, StatusPill, type FwStatusTone } from '@/components/fairway';
import { cn } from '@/lib/utils';
import { PanelBoundary } from '../../../_components/PanelBoundary';
import { PanelNoData } from '../../../_components/PanelStates';
import { LocalTime } from '../../../_components/LocalTime';

export const dynamic = 'force-dynamic';

const FEATURE_LABELS: Record<string, string> = Object.fromEntries(FEATURE_REGISTRY.map((f) => [f.key, f.label]));

const LANE_META: Record<ThreadLane, { label: string; icon: typeof KeyRound; tone: string }> = {
  auth: { label: 'Auth', icon: KeyRound, tone: 'text-accent-700' },
  product: { label: 'Product', icon: Zap, tone: 'text-accent-600' },
  error: { label: 'Error', icon: AlertTriangle, tone: 'text-fw-danger' },
  lift: { label: 'Lift Lab', icon: Dumbbell, tone: 'text-warm-700' },
  roster: { label: 'Roster', icon: Users, tone: 'text-warm-600' },
  account: { label: 'Account', icon: Flag, tone: 'text-warm-500' },
};

const SEVERITY_TONE: Record<string, FwStatusTone> = {
  critical: 'danger',
  error: 'danger',
  warning: 'warning',
  info: 'neutral',
};

function GraphiteStat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex h-full flex-col gap-1 rounded-fw-md bg-surface-sunken p-4">
      <span className="font-fw-mono text-2xl font-bold tabular-nums text-warm-900">{value}</span>
      <span className="text-xs uppercase tracking-widest text-warm-500">{label}</span>
    </div>
  );
}

function EventRow({ event }: { event: ThreadEvent }) {
  const meta = LANE_META[event.lane];
  const Icon = meta.icon;
  const featureLabel = event.feature ? FEATURE_LABELS[event.feature] ?? event.feature : null;
  const body = (
    <div className="flex items-start gap-3 py-3">
      <span className={cn('mt-0.5 shrink-0', meta.tone)}>
        <Icon size={16} aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="min-w-0 flex-1 basis-full text-sm text-warm-900 sm:basis-auto">{event.title}</p>
          {event.severity ? (
            <StatusPill tone={SEVERITY_TONE[event.severity] ?? 'neutral'} dot size="sm">
              {event.severity}
            </StatusPill>
          ) : null}
          {featureLabel ? (
            <span className="inline-flex items-center rounded-full border border-warm-200 bg-warm-50 px-2 py-0.5 font-fw-mono text-caption text-warm-600">
              {featureLabel}
            </span>
          ) : null}
        </div>
        {event.detail ? <p className="mt-0.5 text-xs text-warm-500">{event.detail}</p> : null}
      </div>
      <span className="shrink-0 font-fw-mono text-xs tabular-nums text-warm-400">
        <LocalTime iso={event.ts} variant="time" />
      </span>
    </div>
  );
  return event.href ? (
    <Link href={event.href} className="-mx-2 block rounded-fw-md px-2 transition-colors hover:bg-surface-sunken">
      {body}
    </Link>
  ) : (
    <div className="-mx-2 px-2">{body}</div>
  );
}

async function Body({ kind, id }: { kind: ThreadEntityKind; id: string }) {
  const thread = await fetchEntityThread(kind, id);

  if (!thread.header) {
    return (
      <PanelNoData
        label={`${kind === 'user' ? 'User' : 'Team'} not found`}
        description="This entity doesn't exist, or has no id matching the one in the URL."
      />
    );
  }

  const { header, events, truncated, degradedSources } = thread;
  const dayGroups = groupEventsByDay(events);

  return (
    <div className="space-y-6">
      <Surface padding="sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0" data-fw-title-anchor>
            <span aria-hidden className="mb-3 block h-[2px] w-7 rounded-full bg-accent-500" />
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="min-w-0 truncate text-xl font-semibold text-warm-900">{header.name}</h1>
              <StatusPill tone={header.statusTone} dot size="sm">
                {header.statusLabel}
              </StatusPill>
            </div>
            <p className="mt-1 text-sm text-warm-600">{header.subtitle}</p>
          </div>
          <Link
            href={kind === 'team' ? `/admin/teams/${id}` : `/admin/users/${id}`}
            className="shrink-0 text-xs text-accent-700 underline-offset-2 hover:underline"
          >
            {kind === 'team' ? 'Roster & health →' : 'User detail →'}
          </Link>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <GraphiteStat label="Days in system" value={header.daysInSystem ?? '—'} />
          <GraphiteStat label="Total events" value={header.totalEvents} />
          <GraphiteStat
            label="Last event"
            value={header.lastEventAt ? <LocalTime iso={header.lastEventAt} variant="date" /> : 'never'}
          />
        </div>

        {degradedSources.length > 0 ? (
          <p className="mt-3 border-t border-warm-200 pt-3 text-caption text-fw-warning">
            Some sources were unavailable this load ({degradedSources.join(', ')}) — the timeline below may be missing
            those events. Reload to retry.
          </p>
        ) : null}
        {truncated ? (
          <p className="mt-1 text-caption text-warm-500">
            Showing the most recent {events.length} events — earlier history exists beyond this page.
          </p>
        ) : null}
      </Surface>

      <Surface as="section" padding="sm">
        <h2 className="border-b border-accent-600/25 pb-2 text-xs font-semibold uppercase tracking-widest text-warm-500">
          The thread
        </h2>
        {dayGroups.length === 0 ? (
          <div className="mt-3">
            <PanelNoData label="No events yet" description="Nothing recorded for this entity so far." />
          </div>
        ) : (
          <div className="mt-2">
            {dayGroups.map((group) => (
              <div key={group.day} className="border-t border-warm-200/60 py-2 first:border-t-0">
                <p className="sticky top-0 z-0 bg-surface py-1 font-fw-mono text-xs uppercase tracking-widest text-warm-400">
                  <LocalTime iso={`${group.day}T12:00:00Z`} variant="date" />
                  <span className="ml-2 text-warm-300">· {group.events.length} event{group.events.length === 1 ? '' : 's'}</span>
                </p>
                <div className="divide-y divide-warm-200/40">
                  {group.events.map((event) => (
                    <EventRow key={event.id} event={event} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Surface>
    </div>
  );
}

export default async function EntityThreadPage({
  params,
}: {
  params: Promise<{ entity: string; id: string }>;
}) {
  await requireSuperAdmin();
  const { entity, id } = await params;

  if (entity !== 'user' && entity !== 'team') {
    return (
      <div className="space-y-4">
        <PanelNoData
          label="Unknown entity type"
          description={`The Thread only covers "user" and "team" entities (got "${entity}").`}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Link href={entity === 'team' ? '/admin/teams' : '/admin/users'} className="text-xs text-warm-500 underline">
        ← {entity === 'team' ? 'Teams pulse' : 'Users'}
      </Link>
      <PanelBoundary title="Thread">
        <Body kind={entity} id={id} />
      </PanelBoundary>
    </div>
  );
}
