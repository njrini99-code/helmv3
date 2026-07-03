import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ActivityItem } from '@/lib/admin/data/activity';
import { LocalTime } from '../_components/LocalTime';
import { EmptyState } from '@/components/fairway';
import { groupActivityByDay } from './group-by-day';
import { kindMeta, kindChipClasses } from './kind-meta';

// A pinned ActivityItem doesn't carry a raw email field for demo_session —
// only the pre-formatted `detail` string ("email — school" or bare email).
// Pulling the email back out for a mailto: link is the best this UI can do
// without a data-lane change; browser/user-agent isn't in the string at all
// (see the drift note in this PR's summary — golf_demo_sessions may have a
// browser column, but fetchGolfActivity doesn't surface it today).
const EMAIL_RE = /[^\s—]+@[^\s—]+\.[^\s—]+/;

function DemoDetail({ detail }: { detail: string | null }) {
  if (!detail) return null;
  const match = detail.match(EMAIL_RE);
  if (!match) {
    return <p className="break-words text-xs text-warm-500 [overflow-wrap:anywhere]">{detail}</p>;
  }
  const email = match[0];
  const rest = detail.slice(match.index! + email.length).replace(/^\s*—\s*/, '').trim();
  return (
    <p className="break-words text-xs text-warm-500 [overflow-wrap:anywhere]">
      <a href={`mailto:${email}`} className="text-accent-700 underline">
        {email}
      </a>
      {rest ? ` — ${rest}` : ''}
    </p>
  );
}

function ActivityRow({ item }: { item: ActivityItem }) {
  const meta = kindMeta(item.kind);
  const Icon = meta.icon;
  const chip = kindChipClasses(meta.tone);
  const isDemo = item.kind === 'demo_session';

  const body = (
    <>
      <span
        aria-hidden
        className={cn('flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full', chip.bg)}
      >
        <Icon size={16} className={chip.icon} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="break-words text-sm font-medium text-warm-900 [overflow-wrap:anywhere]">{item.title}</p>
        {isDemo ? (
          <DemoDetail detail={item.detail} />
        ) : item.detail ? (
          <p className="break-words text-xs text-warm-500 [overflow-wrap:anywhere]">{item.detail}</p>
        ) : null}
        <p className="mt-0.5 font-fw-mono text-xs tabular-nums text-warm-500">
          {/* Date is implied by the day-group header above; the row only
              needs local time-of-day (see the UTC-bucketing note on
              groupActivityByDay for why "Today" is a UTC calendar day). */}
          <LocalTime iso={item.ts} variant="time" />
        </p>
      </div>
    </>
  );

  // Leader row: soft green wash + 2px green left bar (GREEN CONTRACT — the
  // one deliberately-highlighted kind).
  const rowClass = cn(
    'flex min-w-0 items-start gap-3 rounded-fw-md px-3 py-3',
    isDemo && 'border-l-2 border-accent-500 bg-accent-50/60',
  );

  // demo_session rows carry a mailto: <a> inside the detail — nesting that
  // inside another <a> (the row-level Link) would be invalid HTML, so demo
  // rows render as a non-link container with a separate, explicit chevron
  // link instead of a whole-row Link. Every other kind stays a single
  // whole-row Link (EVERYTHING CLICKS).
  if (isDemo) {
    return (
      <li className={rowClass}>
        {body}
        {item.href ? (
          <Link
            href={item.href}
            aria-label="Open demo activity"
            className="-m-2 ml-1 flex-shrink-0 self-start rounded-full p-2 text-warm-400 transition-colors hover:bg-surface-sunken hover:text-accent-700"
          >
            <ChevronRight size={16} aria-hidden />
          </Link>
        ) : null}
      </li>
    );
  }

  if (item.href) {
    return (
      <li>
        <Link
          href={item.href}
          className={cn(
            rowClass,
            'block transition-colors hover:bg-surface-sunken',
            'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500',
          )}
        >
          {body}
          <ChevronRight size={16} className="mt-1.5 flex-shrink-0 self-start text-warm-400" aria-hidden />
        </Link>
      </li>
    );
  }

  return <li className={rowClass}>{body}</li>;
}

export function ActivityFeed({ items, now }: { items: readonly ActivityItem[]; now: Date }) {
  if (items.length === 0) {
    return (
      <EmptyState
        variant="subtle"
        title="No activity in this view"
        description="Nothing matches the current filters yet — try All kinds / All teams, or check back after the next round, sign-in, or upload."
      />
    );
  }

  const groups = groupActivityByDay(items, now);

  return (
    <div className="space-y-5">
      {groups.map((group) => (
        <section key={group.dayKey} aria-label={group.label}>
          <h3 className="mb-1 border-b border-accent-600/25 pb-1.5 text-xs font-semibold uppercase tracking-widest text-warm-500">
            {group.label}
          </h3>
          <ul className="divide-y divide-warm-200/60">
            {group.items.map((item) => (
              <ActivityRow key={item.id} item={item} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
