/**
 * Tables and columns a HELD migration adds, which `src/lib/types/database.ts` does not list until the migration is applied and
 * `db:types` is rerun. `heldTable` is the typed stand-in for `client.from(table)` on them: not `any`, but a query builder over a
 * real row type per table (`HeldTables`), so a misspelled table or column, or a value of the wrong type, fails to compile, and a
 * caller has to read `error` and gets `data` typed to the table's columns.
 *
 * When a migration is applied and `db:types` covers its tables, delete that table's entry here and use `client.from()` as usual.
 * The entries are the columns of the held migrations 20261025070000 (class tables, `status_enabled`) and 20261025070300
 * (`notify_anyway`, `notify_anyway_pushed_at`); `golf_player_classes` and `golf_messages` extend the generated rows.
 */
import type { Database } from '@/lib/types/database';

type Rows = Database['public']['Tables'];

export type HeldTables = {
  /** One confirmed term per team (20261025070000). Dates are `YYYY-MM-DD`. */
  golf_team_terms: {
    id: string;
    team_id: string;
    label: string;
    classes_start: string;
    classes_end: string;
    exams_end: string;
    time_zone: string;
    confirmed_by: string | null;
    confirmed_at: string;
    created_at: string;
    updated_at: string;
  };
  /** "No class today", team breaks (`kind` off) and exam blocks (`kind` extra) (20261025070000). `player_id` null is team-wide. */
  golf_class_exceptions: {
    id: string;
    team_id: string;
    player_id: string | null;
    class_id: string | null;
    kind: string;
    starts_on: string;
    ends_on: string;
    start_time: string | null;
    end_time: string | null;
    label: string | null;
    created_by: string | null;
    created_at: string;
  };
  /** The player's sharing and hold switches (20261025070000). */
  golf_player_class_settings: {
    player_id: string;
    share_status: boolean;
    hold_pushes: boolean;
    updated_at: string;
  };
  /** The generated row plus the column 20261025070000 adds. */
  golf_player_classes: Rows['golf_player_classes']['Row'] & { status_enabled: boolean };
  /** The generated row plus the columns 20261025070300 adds. */
  golf_messages: Rows['golf_messages']['Row'] & { notify_anyway: boolean; notify_anyway_pushed_at: string | null };
};

export type HeldError = { code?: string; message?: string } | null;
export type HeldResponse<Data> = { data: Data | null; error: HeldError };

/**
 * A PostgREST query over rows of `Row`. `Data` is what the awaited response carries: a list after `select`, one row after
 * `single` / `maybeSingle`, nothing for a write that selects nothing. Selected columns may be a subset, so rows are `Partial<Row>`.
 */
export interface HeldQuery<Row, Data = Partial<Row>[]> extends PromiseLike<HeldResponse<Data>> {
  select(columns?: string): HeldQuery<Row, Partial<Row>[]>;
  insert(values: Partial<Row> | Partial<Row>[]): HeldQuery<Row, null>;
  upsert(values: Partial<Row> | Partial<Row>[], options?: { onConflict?: string; ignoreDuplicates?: boolean }): HeldQuery<Row, null>;
  update(values: Partial<Row>): HeldQuery<Row, null>;
  delete(): HeldQuery<Row, null>;
  eq<K extends keyof Row & string>(column: K, value: Row[K]): HeldQuery<Row, Data>;
  neq<K extends keyof Row & string>(column: K, value: Row[K]): HeldQuery<Row, Data>;
  in<K extends keyof Row & string>(column: K, values: readonly Row[K][]): HeldQuery<Row, Data>;
  is<K extends keyof Row & string>(column: K, value: null | boolean): HeldQuery<Row, Data>;
  gte<K extends keyof Row & string>(column: K, value: Row[K]): HeldQuery<Row, Data>;
  lte<K extends keyof Row & string>(column: K, value: Row[K]): HeldQuery<Row, Data>;
  order<K extends keyof Row & string>(column: K, options?: { ascending?: boolean }): HeldQuery<Row, Data>;
  limit(count: number): HeldQuery<Row, Data>;
  maybeSingle(): HeldQuery<Row, Partial<Row>>;
  single(): HeldQuery<Row, Partial<Row>>;
}

/** `client.from(table)` for a table or column a held migration adds, over that table's real row type. */
export function heldTable<T extends keyof HeldTables>(client: object, table: T): HeldQuery<HeldTables[T]> {
  const from = (client as { from: (name: string) => unknown }).from;
  return from.call(client, table) as HeldQuery<HeldTables[T]>;
}
