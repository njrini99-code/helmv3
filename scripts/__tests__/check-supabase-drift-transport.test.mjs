import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  toSqlLiteral,
  createManagementApiSql,
} from '../db/check-supabase-drift.mjs';

/**
 * `db:drift:check` gained a Supabase Management API transport so it can gate
 * production drift in CI, where a Management access token exists but no
 * database password does.
 *
 * That transport is the only place this read-only guard talks to production
 * with elevated privileges, so its two safety properties are tested rather than
 * assumed:
 *
 *   1. Only SELECT/WITH statements are ever sent. Without this, a future edit
 *      turns a drift GUARD into a production WRITE path.
 *   2. Interpolated values become literals only when they are hardcoded
 *      identifiers. The `postgres` driver binds parameters; the API takes one
 *      string, and that difference is exactly where string concatenation
 *      normally sneaks in.
 */

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(impl) {
  const spy = vi.fn(impl);
  vi.stubGlobal('fetch', spy);
  return spy;
}

const okJson = (rows = []) => ({
  ok: true,
  status: 200,
  statusText: 'OK',
  json: async () => rows,
});

describe('toSqlLiteral', () => {
  it('renders an identifier array as a SQL array literal', () => {
    expect(toSqlLiteral(['get_admin_errors_rollup', 'get_admin_event_summary']))
      .toBe("array['get_admin_errors_rollup', 'get_admin_event_summary']");
  });

  it('refuses an array element that is not a bare identifier', () => {
    // The guard that stops a future edit from concatenating something dynamic.
    expect(() => toSqlLiteral(["x'; drop table users; --"])).toThrow(/non-identifier/i);
    expect(() => toSqlLiteral(['has space'])).toThrow(/non-identifier/i);
    expect(() => toSqlLiteral(['Uppercase'])).toThrow(/non-identifier/i);
  });

  it('refuses a non-array interpolation outright', () => {
    // Better to fail loudly than to invent an escaping rule for a type this
    // script has never needed to interpolate.
    expect(() => toSqlLiteral('plain string')).toThrow(/unsupported interpolation/i);
    expect(() => toSqlLiteral(42)).toThrow(/unsupported interpolation/i);
  });
});

describe('createManagementApiSql — read-only enforcement', () => {
  it.each([
    ['delete', 'delete from public.golf_rounds'],
    ['update', 'update public.users set role = 3'],
    ['insert', "insert into public.users (id) values ('x')"],
    ['drop', 'drop table public.golf_rounds'],
    ['grant', 'grant all on public.golf_rounds to anon'],
    ['truncate', 'truncate public.golf_rounds'],
  ])('refuses to send a %s statement', async (_label, statement) => {
    const fetchSpy = stubFetch(async () => okJson());
    const sql = createManagementApiSql('proj', 'token');
    await expect(sql([statement])).rejects.toThrow(/non-SELECT/i);
    // The decisive assertion: nothing was transmitted at all.
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it.each([
    ['select', 'select 1'],
    ['leading whitespace', '\n  select proname from pg_proc'],
    ['with (CTE)', 'with x as (select 1) select * from x'],
    ['uppercase', 'SELECT 1'],
  ])('allows a read-only %s statement', async (_label, statement) => {
    const fetchSpy = stubFetch(async () => okJson([{ ok: true }]));
    const sql = createManagementApiSql('proj', 'token');
    await expect(sql([statement])).resolves.toEqual([{ ok: true }]);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

describe('createManagementApiSql — request shape', () => {
  it('posts to the project-scoped query endpoint with a bearer token', async () => {
    const fetchSpy = stubFetch(async () => okJson());
    const sql = createManagementApiSql('qmnss', 'secret-token');
    await sql(['select 1']);

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://api.supabase.com/v1/projects/qmnss/database/query');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer secret-token');
    expect(JSON.parse(init.body)).toEqual({ query: 'select 1' });
  });

  it('assembles interpolated values into one query string', async () => {
    const fetchSpy = stubFetch(async () => okJson());
    const sql = createManagementApiSql('proj', 'token');
    await sql(['select proname from pg_proc where proname = any(', ')'], ['fn_a', 'fn_b']);
    expect(JSON.parse(fetchSpy.mock.calls[0][1].body).query)
      .toBe("select proname from pg_proc where proname = any(array['fn_a', 'fn_b'])");
  });

  it('throws on a non-2xx WITHOUT echoing the response body', async () => {
    // An auth failure echoes the request back, which would put the token in CI
    // logs. The status line is enough to diagnose.
    stubFetch(async () => ({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      text: async () => 'Bearer secret-token was rejected',
      json: async () => ({}),
    }));
    const sql = createManagementApiSql('proj', 'secret-token');
    await expect(sql(['select 1'])).rejects.toThrow(/401 Unauthorized/);
    await expect(sql(['select 1'])).rejects.not.toThrow(/secret-token/);
  });

  it('returns [] when the API responds with a non-array payload', async () => {
    // Shape-defensive, not error-swallowing: a genuine failure still throws
    // above. This only covers a 200 whose body is not the row array.
    stubFetch(async () => okJson({ unexpected: true }));
    const sql = createManagementApiSql('proj', 'token');
    await expect(sql(['select 1'])).resolves.toEqual([]);
  });

  it('exposes a no-op end() so callers need no transport branch', async () => {
    const sql = createManagementApiSql('proj', 'token');
    await expect(sql.end()).resolves.toBeUndefined();
  });
});
