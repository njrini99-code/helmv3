/**
 * The slice of node-postgres's `Client` the local-only e2e helpers use (connect, query with $n params, end), on the
 * `postgres` package the repo already depends on. `pg` itself was removed as an unused dependency (5fc8b0429) while
 * these helpers still imported it. One connection (`max: 1`), so `begin` / `set local` / `commit` stay in one session.
 * Unlike pg, a `$n::json` parameter is serialized here: pass the value, not `JSON.stringify(value)`.
 */
import postgres from 'postgres';

export interface PgResult<Row = Record<string, unknown>> {
  rows: Row[];
  rowCount: number;
}

export class PgClient {
  private readonly sql: postgres.Sql;

  constructor({ connectionString }: { connectionString: string }) {
    this.sql = postgres(connectionString, { max: 1, onnotice: () => undefined, prepare: false });
  }

  /** The connection opens on the first query; kept for node-postgres call sites. */
  async connect(): Promise<void> {}

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- rows are whatever the caller's SQL selects
  async query<Row = any>(text: string, params: unknown[] = []): Promise<PgResult<Row>> {
    const rows = (await this.sql.unsafe(text, params as postgres.ParameterOrJSON<never>[])) as unknown as Row[];
    return { rows: [...rows], rowCount: rows.length };
  }

  async end(): Promise<void> {
    await this.sql.end({ timeout: 5 });
  }
}
