'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Check, Copy, ExternalLink, CheckCheck } from 'lucide-react';
import { Button, Sparkline, StatusPill } from '@/components/fairway';
import type { TriageItem, TriageSeverity } from '@/lib/admin/data/triage';
import { INCIDENT_CLASS_LABEL } from '@/lib/admin/incident-classification';
import { hasUnknownAffectedUsers } from '@/lib/admin/incident-report';
import { cn } from '@/lib/utils';
import { SportBadge } from './SportBadge';
import { LocalTime } from './LocalTime';
import { CopyReportButton, copyTextToClipboard } from './CopyReportButton';

/**
 * ONE incident, as a card rather than a wrapping row.
 *
 * The previous markup was a single `flex flex-wrap items-center` list item.
 * On a desktop viewport that reads as a row; on a phone — which is where the
 * Bridge is actually being read — every child claims its own line, so one
 * incident occupied roughly 400px: title, a mono run of
 * `source · feature · action · route <full absolute URL>` wrapping to three
 * lines, then GOLF, then APP, then a sparkline, then a copy icon, then a
 * full-width Resolve pill. Four incidents filled a screen and none of them
 * said what it was.
 *
 * What this changes, in priority order:
 *
 *   1. TITLE FIRST. Severity led the row before, which is the least
 *      identifying thing on it — nearly every row is error or warning. It is
 *      now a 3px rail down the left edge plus a small word, which scans
 *      faster and costs no vertical space.
 *   2. THE ROW IDENTIFIES ITSELF. Two incidents both titled "Client error:
 *      Load failed" were indistinguishable. The tag strip carries the error
 *      code (the single most identifying field, and already computed — see
 *      TriageItem.errorCode), feature, action and source, each as its own
 *      chip rather than one run-on mono sentence.
 *   3. THE URL STOPS EATING THE CARD. `route` is rendered as a PATH —
 *      `https://helmsportslabs.com/golf/dashboard/messages` was three
 *      wrapped lines of which the first 26 characters were identical on
 *      every single row.
 *   4. COUNTS AND ACTIONS SHARE ONE LINE, as compact controls.
 */

/** Left rail colour per severity. Kept in the warm/fw palette the Bridge
 *  already uses — /admin is a documented non-Fairway consumer, and the
 *  surrounding code's dark-mode reasoning depends on those tokens. */
const SEVERITY_RAIL: Record<TriageSeverity, string> = {
  critical: 'bg-fw-danger-ink',
  error: 'bg-fw-danger-ink',
  warning: 'bg-fw-warning-ink',
  info: 'bg-warm-300',
};

const COPIED_RESET_MS = 1500;

/**
 * Strip the origin from a route so the part that differs is what you read.
 *
 * Every client-origin row carries an absolute URL, so `https://
 * helmsportslabs.com` repeated once per incident and pushed the actual path
 * onto a third line. Server rows already store a path and pass through
 * untouched. A non-URL culprit (Sentry sends things like
 * `app/golf/page.tsx in Page`) is also left alone — it is not a URL and
 * mangling it would lose the frame.
 */
export function routeLabel(route: string | null): string | null {
  if (!route) return null;
  if (!/^https?:\/\//i.test(route)) return route;
  try {
    const url = new URL(route);
    return `${url.pathname}${url.search}` || '/';
  } catch {
    return route;
  }
}

/**
 * "0 users" reads as "this affected nobody," which is misleading for `app`
 * incidents: affectedUsers there counts DISTINCT KNOWN identities, so 0
 * usually means the failure happened before/outside auth — not that zero
 * people were impacted. Sentry items use Sentry's own userCount, which IS
 * zero-means-zero, so only `app` incidents get the "unknown" wording.
 */
export function affectedUsersLabel(item: Pick<TriageItem, 'origin' | 'affectedUsers' | 'occurrences'>): string {
  if (hasUnknownAffectedUsers(item.origin === 'sentry', item.affectedUsers, item.occurrences)) {
    return 'unknown user';
  }
  const n = item.affectedUsers;
  return `${n} user${n === 1 ? '' : 's'}`;
}

/** A tag. One shape for every piece of metadata, so the strip reads as a set
 *  rather than as five unrelated inline styles competing for attention. */
function Chip({
  children,
  title,
  tone = 'neutral',
  mono = false,
}: {
  children: React.ReactNode;
  title?: string;
  tone?: 'neutral' | 'strong' | 'danger';
  mono?: boolean;
}) {
  return (
    <span
      title={title}
      className={cn(
        'inline-flex max-w-full items-center gap-1 rounded px-1.5 py-0.5 text-eyebrow uppercase leading-4',
        mono && 'font-fw-mono normal-case tracking-normal',
        tone === 'neutral' && 'bg-warm-100 text-warm-600',
        tone === 'strong' && 'bg-warm-900 text-warm-50',
        tone === 'danger' && 'bg-fw-danger-bg text-fw-danger-ink',
      )}
    >
      {children}
    </span>
  );
}

/**
 * A chip that copies its own value on tap.
 *
 * The error code and the fingerprint are the two tokens an operator actually
 * needs to carry elsewhere — into a log search, a migration, a message to
 * someone else. The fingerprint previously existed ONLY inside the row's
 * href, so it was clickable and not copyable. Reuses CopyReportButton's
 * clipboard fallback chain rather than adding a third implementation.
 */
function CopyChip({ value, label, tone = 'neutral' }: { value: string; label: string; tone?: 'neutral' | 'strong' }) {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); }, []);

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      aria-label={`Copy ${label}: ${value}`}
      onClick={() => {
        void copyTextToClipboard(value).then((ok) => {
          if (!ok) return;
          setCopied(true);
          if (timeoutRef.current) clearTimeout(timeoutRef.current);
          timeoutRef.current = setTimeout(() => setCopied(false), COPIED_RESET_MS);
        });
      }}
      className={cn(
        'inline-flex max-w-full items-center gap-1 rounded px-1.5 py-0.5 font-fw-mono text-eyebrow leading-4 transition-colors',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500',
        tone === 'strong'
          ? 'bg-warm-900 text-warm-50 hover:bg-warm-800'
          : 'bg-warm-100 text-warm-700 hover:bg-warm-200',
      )}
    >
      <span className="truncate">{value}</span>
      {copied ? <Check size={10} aria-hidden /> : <Copy size={10} aria-hidden className="opacity-50" />}
    </Button>
  );
}

export function IncidentCard({
  item,
  series,
  onResolve,
  onResolveSentry,
  error,
}: {
  item: TriageItem;
  series: number[] | null;
  onResolve: (item: TriageItem) => void;
  onResolveSentry: (item: TriageItem) => void;
  error?: string;
}) {
  const path = routeLabel(item.route);
  const isApp = item.origin === 'app';

  return (
    <li className="relative flex min-w-0 gap-3 py-3 pl-3">
      {/* Severity as a rail. Replaces the leading pill: same information,
          no vertical cost, and it lines the cards up so a screen of them
          reads as a column of severities at a glance. */}
      <span
        aria-hidden
        className={cn('absolute inset-y-2 left-0 w-[3px] rounded-full', SEVERITY_RAIL[item.severity])}
      />
      <div className="min-w-0 flex-1">
        {/* 1 — TITLE, the thing you are looking for. */}
        {isApp && item.fingerprint ? (
          <Link
            href={`/admin/errors/${item.fingerprint}`}
            className="block break-words text-body-sm font-semibold text-warm-900 [overflow-wrap:anywhere] hover:underline"
          >
            {item.title}
          </Link>
        ) : (
          <p className="break-words text-body-sm font-semibold text-warm-900 [overflow-wrap:anywhere]">{item.title}</p>
        )}

        {/* 2 — TAGS. Everything that tells two same-titled incidents apart,
            in one strip, one visual language. Ordered most-identifying
            first: code, then where it happened, then what it is. */}
        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          {item.errorCode ? <CopyChip value={item.errorCode} label="error code" tone="strong" /> : null}
          {item.feature ? <Chip title="Feature registry key">{item.feature}</Chip> : null}
          {item.actionName ? <Chip title="Server action / component" mono>{item.actionName}</Chip> : null}
          {item.source ? <Chip title="Capture source">{item.source}</Chip> : null}
          <SportBadge sport={item.sport} />
          <Chip title={isApp ? 'Captured by the app' : 'Captured by Sentry'}>{isApp ? 'App' : 'Sentry'}</Chip>
          {/* Regressed is the highest-signal thing on a row — a fix did not
              hold — so it keeps a full pill rather than a quiet chip. */}
          {item.substatus === 'regressed' ? (
            <StatusPill tone="danger" dot size="sm">Regressed</StatusPill>
          ) : null}
          {/* Kind axis, still shown only when it is NOT a plain actionable
              defect — labelling every ordinary bug "Defect" would be chrome.
              Unchanged decision, carried over deliberately. */}
          {!item.actionable ? <Chip title={item.klassReason}>{INCIDENT_CLASS_LABEL[item.klass]}</Chip> : null}
          {item.hasDegradedMessage ? (
            <Chip
              tone="danger"
              title="The message was stringified on capture (e.g. [object Object]) — the real cause was lost. Fix the call site to use describeError()."
            >
              message lost
            </Chip>
          ) : null}
        </div>

        {/* 3 — WHERE. Path only; the origin was identical on every row. */}
        {path ? (
          <p className="mt-1 break-words font-fw-mono text-caption leading-4 text-warm-500 [overflow-wrap:anywhere]">
            {path}
          </p>
        ) : null}

        {/* 4 — COUNTS + ACTIONS, one line. */}
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
          <p className="font-fw-mono text-caption tabular-nums text-warm-500">
            {item.occurrences} {item.occurrences === 1 ? 'event' : 'events'} · {affectedUsersLabel(item)} ·{' '}
            <LocalTime iso={item.lastSeen} />
          </p>
          {series ? (
            <Sparkline
              data={series}
              goodDirection="down"
              label={`${isApp ? 'App' : 'Sentry'} events, last 24h`}
              width={52}
              height={16}
              showEndDot={false}
              className="shrink-0"
            />
          ) : null}
          <span className="ml-auto flex shrink-0 items-center gap-1">
            <CopyReportButton variant="icon" report={item.report} label={`Copy incident report: ${item.title}`} />
            {/* aria-label lives on the Button, not only on the inner <a>.
                With asChild the prop merges onto the anchor either way, so the
                rendered accessible name is identical — but
                scripts/__tests__/icon-only-button-aria-label.test.mjs reads the
                <Button> element statically and cannot follow the slot, so a
                label only on the child reads as an unlabelled icon-only button.

                This comment sits ABOVE the ternary on purpose: inside a
                `cond ? ( ... ) : null` brace the contents are an EXPRESSION,
                so a JSX comment written there parses as an empty object
                literal instead. JSX comments are only comments in children
                position. */}
            {!isApp ? (
              <Button asChild variant="ghost" size="sm" aria-label="Open in Sentry">
                <a href={item.permalink ?? '#'} target="_blank" rel="noreferrer">
                  <ExternalLink size={13} aria-hidden />
                </a>
              </Button>
            ) : null}
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => (isApp ? onResolve(item) : onResolveSentry(item))}
              leftIcon={<CheckCheck size={13} aria-hidden />}
            >
              Resolve
            </Button>
          </span>
        </div>

        {error ? <p className="mt-1 text-caption text-fw-danger-ink">Resolve failed — {error}</p> : null}
      </div>
    </li>
  );
}
