/**
 * Grouping for errors Sentry's Supabase integration captures on its own.
 *
 * `Sentry.instrumentSupabaseClient` (wired in src/lib/supabase/{admin,client,
 * server}.ts) reports EVERY PostgREST error response as an unhandled
 * exception with mechanism `auto.db.supabase.postgres` — including responses
 * the calling code expects and handles. It builds `new Error(res.error.message)`
 * and hangs the Postgres code on the Error object itself, so the code reaches
 * `beforeSend` only as `hint.originalException.code`, never as a tag, context
 * or extra. `fingerprintByPostgresCode` in src/instrumentation.ts read only
 * those three, so it never matched one of these events.
 *
 * The cost was measured on 2026-09-23: 35 of the 100 top unresolved Sentry
 * issues were integration auto-captures, and one database event on
 * 2026-09-18 19:54Z (a PostgREST schema-cache reload under statement
 * timeouts) became 15+ separate issues, one per call site that happened to be
 * querying at the time.
 *
 * Two kinds of failure get different treatment:
 *  - INFRASTRUCTURE codes (connection, schema cache, statement timeout,
 *    resource exhaustion) describe the database, not the query. They group on
 *    the code ALONE, so one incident is one issue however many call sites it
 *    hits.
 *  - Everything else (RLS denial, constraint violation, bad input) is a fact
 *    about the query. Those keep Sentry's default grouping as the first axis,
 *    exactly like `fingerprintByPostgresCode`, so two different 42501s stay
 *    two issues.
 *
 * Transport failures (the fetch timed out or aborted before PostgREST
 * answered) carry no code at all; they group by failure kind.
 */

type Fingerprintable = {
  fingerprint?: string[];
  tags?: Record<string, unknown>;
  exception?: { values?: Array<{ value?: string; mechanism?: { type?: string } }> };
};

const SUPABASE_MECHANISM = 'auto.db.supabase.postgres';
const PG_CODE = /^(PGRST\d{3}|[0-9A-Z]{5})$/;

/**
 * PGRST000-003: PostgREST could not reach Postgres, or its schema cache is
 * stale/reloading. 08: connection exception. 53: insufficient resources
 * (53300 too many connections). 57014: statement timeout. 57P0x: admin or
 * crash shutdown. 55P03: lock not available.
 */
export function isInfrastructurePgCode(code: string): boolean {
  return (
    /^PGRST00[0-3]$/.test(code) ||
    code.startsWith('08') ||
    code.startsWith('53') ||
    code === '57014' ||
    code.startsWith('57P0') ||
    code === '55P03'
  );
}

/** The Postgres/PostgREST code the integration attached to the thrown Error. */
export function postgresCodeFromHint(hint: { originalException?: unknown } | undefined): string | null {
  const original = hint?.originalException;
  if (!original || typeof original !== 'object') return null;
  const code = (original as { code?: unknown }).code;
  return typeof code === 'string' && PG_CODE.test(code) ? code : null;
}

function isSupabaseAutoCapture(event: Fingerprintable): boolean {
  return event.exception?.values?.some((value) => value.mechanism?.type === SUPABASE_MECHANISM) ?? false;
}

function transportFailureKind(event: Fingerprintable): string | null {
  const text = event.exception?.values?.map((value) => value.value ?? '').join(' ') ?? '';
  if (/\bTimeoutError\b|signal timed out/i.test(text)) return 'timeout';
  if (/\bAbortError\b/.test(text)) return 'aborted';
  if (/\bfetch failed\b/i.test(text)) return 'fetch-failed';
  return null;
}

/**
 * Regroups an integration auto-capture. Never overrides a deliberate
 * fingerprint, and returns every other event untouched.
 */
export function fingerprintSupabaseAutoCapture<E extends Fingerprintable>(
  event: E,
  hint: { originalException?: unknown } | undefined,
): E {
  if (event.fingerprint || !isSupabaseAutoCapture(event)) return event;

  const code = postgresCodeFromHint(hint);
  if (code) {
    return {
      ...event,
      tags: { ...event.tags, pg_code: code },
      fingerprint: isInfrastructurePgCode(code)
        ? ['supabase-infra', `pg:${code}`]
        : ['{{ default }}', `pg:${code}`],
    };
  }

  const kind = transportFailureKind(event);
  if (kind) {
    return { ...event, fingerprint: ['supabase-transport', kind] };
  }
  return event;
}
