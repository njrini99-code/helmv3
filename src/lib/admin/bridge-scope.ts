import { CLUBHOUSE_UI } from '@/lib/observability/ui-surface';

/**
 * What the Bridge's error and incident VIEWS show. Owner, 2026-11-17: "Bridge should just be clubhouse only" — the
 * Bridge pages a person reads (the nav badge, Overview's incident numbers and board, the Incidents page and its Sources
 * and Loop views, the Golf page's incident panel, the Activity tab's error tiles) list Clubhouse errors and nothing
 * else.
 *
 * VIEWS ONLY. The machinery reads the whole feed and must keep doing so: the admin-digest cron, the self-heal circuit,
 * auto-resolve, the RCA run, the integrity checks and every alert call the same fetchers WITHOUT a scope, and an
 * unscoped call is exactly what it was before this file existed. A scope is only ever passed by a page.
 *
 * The one switch is BRIDGE_UI_SCOPE. Set it to 'all' and every scoped view goes back to the whole app.
 *
 * WHERE THE TAG LIVES. `ui: 'clubhouse'` is written by three paths (src/lib/observability/ui-surface.ts), and older
 * rows carry it in two other places, so the filter reads all three:
 *  - admin_events.metadata.ui            — every new row (server-error-logger and /api/log-error, from 2026-11-17)
 *  - admin_events.metadata.context.ui    — browser reports before then (chReport, via /api/log-error)
 *  - admin_events.metadata.tags.ui       — server reads before then (chLogServer)
 * error_logs mirrors it at context.ui / context.tags.ui. In Sentry the tag is `ui:clubhouse` on browser events (the
 * session tag), on server renders (gate.ts), on every server log (server-error-logger) and on unhandled request
 * errors (instrumentation.ts).
 */
export type BridgeUiScope = typeof CLUBHOUSE_UI | 'all';

/** The Bridge views' scope. The single switch. */
export const BRIDGE_UI_SCOPE: BridgeUiScope = CLUBHOUSE_UI;

/** Whether a scope narrows anything. `undefined` (the machinery's call) never does. */
export function isScoped(scope: BridgeUiScope | undefined): scope is typeof CLUBHOUSE_UI {
  return scope === CLUBHOUSE_UI;
}

/** PostgREST `or` filter matching an admin_events row tagged with the Clubhouse UI, wherever the tag was written. */
export const ADMIN_EVENTS_CLUBHOUSE_FILTER = [
  `metadata->>ui.eq.${CLUBHOUSE_UI}`,
  `metadata->context->>ui.eq.${CLUBHOUSE_UI}`,
  `metadata->tags->>ui.eq.${CLUBHOUSE_UI}`,
].join(',');

/** The same for an error_logs row. */
export const ERROR_LOGS_CLUBHOUSE_FILTER = [
  `context->>ui.eq.${CLUBHOUSE_UI}`,
  `context->tags->>ui.eq.${CLUBHOUSE_UI}`,
].join(',');

interface OrFilterable<T> {
  or: (filters: string) => T;
}

/**
 * Narrow an admin_events query to the scope. A no-op for 'all' and for an unscoped (machinery) call. Uses PostgREST's
 * `or`, so a query that already has an `or` of its own must not pass through here (none of the scoped ones do).
 */
export function scopeAdminEvents<T extends OrFilterable<T>>(query: T, scope: BridgeUiScope | undefined): T {
  return isScoped(scope) ? query.or(ADMIN_EVENTS_CLUBHOUSE_FILTER) : query;
}

/** Narrow an error_logs query to the scope. Same contract as scopeAdminEvents. */
export function scopeErrorLogs<T extends OrFilterable<T>>(query: T, scope: BridgeUiScope | undefined): T {
  return isScoped(scope) ? query.or(ERROR_LOGS_CLUBHOUSE_FILTER) : query;
}

/** Sentry issue-search tokens for the scope: `ui:clubhouse`, or none. */
export function sentryScopeTokens(scope: BridgeUiScope | undefined): string[] {
  return isScoped(scope) ? [`ui:${CLUBHOUSE_UI}`] : [];
}

/** The Sentry issue search for an unfiltered unresolved pull under the scope. */
export function scopedSentryUnresolvedQuery(scope: BridgeUiScope | undefined): string {
  return ['is:unresolved', ...sentryScopeTokens(scope)].join(' ');
}

/**
 * Whether one stored row (an admin_events metadata object, or an error_logs context) is tagged Clubhouse. The JS
 * mirror of the filters above, for a view that narrows rows it already fetched.
 */
export function isClubhouseTagged(record: unknown): boolean {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return false;
  const r = record as Record<string, unknown>;
  const nested = (key: string): unknown => {
    const v = r[key];
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>).ui : undefined;
  };
  return r.ui === CLUBHOUSE_UI || nested('context') === CLUBHOUSE_UI || nested('tags') === CLUBHOUSE_UI;
}

/** Page copy: what a scoped view covers, in the Bridge's header voice. */
export const BRIDGE_SCOPE_NOTE = 'Clubhouse only: errors raised while serving a golf coach or player.';

/** Short label for a count or a chip under the scope. */
export function scopeLabel(scope: BridgeUiScope | undefined): string | null {
  return isScoped(scope) ? 'Clubhouse' : null;
}
