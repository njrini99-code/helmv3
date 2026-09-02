'use client';

import Link from 'next/link';
import { ExternalLink, CheckCheck, Sparkles } from 'lucide-react';
import { Button, Sparkline } from '@/components/fairway';
import type { TriageItem } from '@/lib/admin/data/triage';
import { INCIDENT_CLASS_LABEL } from '@/lib/admin/incident-classification';
import { hasUnknownAffectedUsers } from '@/lib/admin/incident-report';
import { LocalTime } from './LocalTime';
import { CopyReportButton } from './CopyReportButton';
import { RailRow, RowHead, FactLine, RowPath, RowFoot, StateChip } from './Row';

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
    <RailRow severity={item.severity}>
      {/* Every piece below comes from ./Row — the same language Reliability,
          Jobs and Health render, so the tabs cannot drift apart again. */}
      <RowHead
        value={item.occurrences}
        valueLabel={`${item.occurrences} ${item.occurrences === 1 ? 'event' : 'events'}`}
      >
        {isApp && item.fingerprint ? (
          <Link href={`/admin/errors/${item.fingerprint}`} className="hover:underline">
            {item.description}
          </Link>
        ) : (
          item.description
        )}
      </RowHead>

      <FactLine
        items={[item.errorCode, item.feature, item.actionName, item.source]}
        emphasizeFirst={Boolean(item.errorCode)}
      />

      {path ? <RowPath>{path}</RowPath> : null}

      <RowFoot
        meta={
          <>
            {affectedUsersLabel(item)} · <LocalTime iso={item.lastSeen} />
          </>
        }
      >
        {series ? (
          <Sparkline
            data={series}
            goodDirection="down"
            label={`${isApp ? 'App' : 'Sentry'} events, last 24h`}
            width={44}
            height={14}
            showEndDot={false}
            className="mr-1 shrink-0"
          />
        ) : null}

        {item.substatus === 'regressed' ? <StateChip tone="danger">Regressed</StateChip> : null}
        {!item.actionable ? (
          <StateChip title={item.klassReason}>{INCIDENT_CLASS_LABEL[item.klass]}</StateChip>
        ) : null}
        {item.hasDegradedMessage ? (
          <StateChip
            tone="danger"
            title="The message was stringified on capture (e.g. [object Object]) — the real cause was lost. Fix the call site to use describeError()."
          >
            message lost
          </StateChip>
        ) : null}

        {/* THE DOOR — the one accent on the row, only when an analysis exists. */}
        {isApp && item.hasRca && item.fingerprint ? (
          <Link
            href={`/admin/errors/${item.fingerprint}#rca`}
            title="A root-cause analysis exists for this incident — open it"
            className="rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500"
          >
            <StateChip tone="accent">
              <Sparkles size={10} aria-hidden />
              RCA
            </StateChip>
          </Link>
        ) : null}

        <CopyReportButton variant="icon" report={item.report} label={`Copy incident report: ${item.title}`} />
        {!isApp ? (
          <Button asChild variant="ghost" size="sm" aria-label="Open in Sentry">
            <a href={item.permalink ?? '#'} target="_blank" rel="noreferrer">
              <ExternalLink size={13} aria-hidden />
            </a>
          </Button>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label="Resolve incident"
          onClick={() => (isApp ? onResolve(item) : onResolveSentry(item))}
        >
          <CheckCheck size={13} aria-hidden />
        </Button>
      </RowFoot>

      {error ? <p className="mt-1 text-caption text-fw-danger-ink">Resolve failed — {error}</p> : null}
    </RailRow>
  );
}
