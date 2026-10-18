/**
 * An EVALUATING fake of the Supabase client, for tests that run two pipelines (Clubhouse's loaders and production's
 * Fairway code) over the same rows and compare their numbers. Unlike `supabase-fake.ts` (one answer per table), this
 * one holds rows and applies the query: select (with the embedded relations the stats reads use), eq, neq, in, is,
 * not ... is null, gte, lte, gt, lt, order (several keys), range, limit, maybeSingle and single. RPCs answer from
 * `rpc` handlers. A query it does not understand throws, so a test never silently compares against a wrong read.
 *
 *   const db = vi.hoisted(() => ({ current: null as import('./supabase-eval-fake').EvalDb | null }));
 *   vi.mock('@/lib/supabase/server', async () => (await import('./supabase-eval-fake')).evalServer(db));
 */

export type Row = Record<string, unknown>;
export interface EvalDb {
  tables: Record<string, Row[]>;
  rpc?: Record<string, (args: Record<string, unknown>) => unknown>;
}

/** Embedded relations: parent table -> child table -> how a child row joins (one row or many). */
/** Embedded relations: parent table -> child table -> the child's key and the parent's value it matches (one row or many). */
const RELATIONS: Record<string, Record<string, { many: boolean; childKey: string; parentKey: string }>> = {
  golf_team_members: { golf_players: { many: false, childKey: 'id', parentKey: 'player_id' } },
  golf_shots: {
    golf_holes: { many: false, childKey: 'id', parentKey: 'hole_id' },
    putt_details: { many: true, childKey: 'shot_id', parentKey: 'id' },
    approach_miss_details: { many: true, childKey: 'shot_id', parentKey: 'id' },
  },
  golf_team_coach_staff: { golf_coaches: { many: false, childKey: 'id', parentKey: 'coach_id' } },
};

/** Child rows by key, built once per table array (the shot reads embed thousands of rows). */
const INDEX = new WeakMap<Row[], Map<string, Map<unknown, Row[]>>>();
function byKey(rows: Row[], key: string): Map<unknown, Row[]> {
  let perTable = INDEX.get(rows);
  if (!perTable) INDEX.set(rows, (perTable = new Map()));
  let idx = perTable.get(key);
  if (!idx) {
    idx = new Map();
    for (const r of rows) {
      const list = idx.get(r[key]) ?? [];
      list.push(r);
      idx.set(r[key], list);
    }
    perTable.set(key, idx);
  }
  return idx;
}

interface SelectItem {
  kind: 'col' | 'embed';
  name: string;
  alias: string;
  table?: string;
  cols?: SelectItem[];
}

function splitTop(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of s) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out.map((x) => x.trim()).filter(Boolean);
}

export function parseSelect(s: string): SelectItem[] {
  return splitTop(s.replace(/\s+/g, ' ')).map((part): SelectItem => {
    const open = part.indexOf('(');
    if (open < 0) return { kind: 'col', name: part, alias: part };
    const head = part.slice(0, open).trim();
    const inner = part.slice(open + 1, part.lastIndexOf(')'));
    const [alias, rawTable] = head.includes(':') ? head.split(':').map((x) => x.trim()) : [head, head];
    const table = rawTable!.split('!')[0]!.trim();
    return { kind: 'embed', name: table, alias: alias!.split('!')[0]!.trim(), table, cols: parseSelect(inner) };
  });
}

function project(db: EvalDb, table: string, row: Row, items: SelectItem[]): Row {
  const out: Row = {};
  for (const it of items) {
    if (it.kind === 'col') {
      if (it.name === '*') Object.assign(out, row);
      else out[it.alias] = row[it.name] ?? null;
      continue;
    }
    const rel = RELATIONS[table]?.[it.table!];
    if (!rel) throw new Error(`eval-fake: no relation ${table} -> ${it.table}`);
    const kids = (byKey(db.tables[it.table!] ?? [], rel.childKey).get(row[rel.parentKey]) ?? []).map((c) => project(db, it.table!, c, it.cols!));
    out[it.alias] = rel.many ? kids : (kids[0] ?? null);
  }
  return out;
}

type Op = [string, unknown[]];

function compare(a: unknown, b: unknown): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1; // PostgREST: nulls last ascending
  if (b == null) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
}

function run(db: EvalDb, table: string, ops: Op[], mode: 'many' | 'maybe' | 'single') {
  let rows = [...(db.tables[table] ?? [])];
  let select: SelectItem[] = [{ kind: 'col', name: '*', alias: '*' }];
  const orders: Array<{ col: string; asc: boolean }> = [];
  let range: [number, number] | null = null;
  let limit: number | null = null;
  let head = false;
  let count = false;
  for (const [op, args] of ops) {
    const [col, v, w] = args as [string, unknown, unknown];
    switch (op) {
      case 'select':
        select = parseSelect(String(col ?? '*'));
        if (v && typeof v === 'object') {
          head = !!(v as { head?: boolean }).head;
          count = !!(v as { count?: string }).count;
        }
        break;
      case 'eq':
        rows = rows.filter((r) => r[col] === v);
        break;
      case 'neq':
        rows = rows.filter((r) => r[col] !== v);
        break;
      case 'in': {
        const set = new Set(v as unknown[]);
        rows = rows.filter((r) => set.has(r[col]));
        break;
      }
      case 'is':
        rows = rows.filter((r) => (v === null ? r[col] == null : r[col] === v));
        break;
      case 'not':
        if (v !== 'is' || w !== null) throw new Error(`eval-fake: unsupported not(${col}, ${String(v)}, ${String(w)})`);
        rows = rows.filter((r) => r[col] != null);
        break;
      case 'gte':
        rows = rows.filter((r) => r[col] != null && compare(r[col], v) >= 0);
        break;
      case 'lte':
        rows = rows.filter((r) => r[col] != null && compare(r[col], v) <= 0);
        break;
      case 'gt':
        rows = rows.filter((r) => r[col] != null && compare(r[col], v) > 0);
        break;
      case 'lt':
        rows = rows.filter((r) => r[col] != null && compare(r[col], v) < 0);
        break;
      case 'order':
        orders.push({ col, asc: (v as { ascending?: boolean } | undefined)?.ascending !== false });
        break;
      case 'range':
        range = [Number(col), Number(v)];
        break;
      case 'limit':
        limit = Number(col);
        break;
      case 'abortSignal':
        break;
      default:
        throw new Error(`eval-fake: unsupported ${op} on ${table}`);
    }
  }
  if (orders.length) {
    rows.sort((a, b) => {
      for (const o of orders) {
        const c = compare(a[o.col], b[o.col]);
        if (c) return o.asc ? c : -c;
      }
      return 0;
    });
  }
  const total = rows.length;
  if (range) rows = rows.slice(range[0], range[1] + 1);
  if (limit != null) rows = rows.slice(0, limit);
  const data = rows.map((r) => project(db, table, r, select));
  if (head) return { data: null, error: null, count: total };
  if (mode === 'many') return { data, error: null, count: count ? total : null };
  if (mode === 'single' && data.length !== 1) return { data: null, error: { code: 'PGRST116', message: 'not one row' }, count: null };
  if (data.length > 1) return { data: null, error: { code: 'PGRST116', message: 'more than one row' }, count: null };
  return { data: data[0] ?? null, error: null, count: null };
}

function query(holder: { current: EvalDb | null }, table: string) {
  const ops: Op[] = [];
  const db = () => {
    if (!holder.current) throw new Error('eval-fake: no database loaded');
    return holder.current;
  };
  const chain: object = new Proxy(
    {},
    {
      get(_, key: string) {
        if (key === 'then') return (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => Promise.resolve().then(() => run(db(), table, ops, 'many')).then(ok, bad);
        if (key === 'maybeSingle') return () => Promise.resolve().then(() => run(db(), table, ops, 'maybe'));
        if (key === 'single') return () => Promise.resolve().then(() => run(db(), table, ops, 'single'));
        return (...args: unknown[]) => {
          ops.push([key, args]);
          return chain;
        };
      },
    },
  );
  return chain;
}

export function evalClient(holder: { current: EvalDb | null }) {
  return {
    from: (table: string) => query(holder, table),
    rpc: (name: string, args: Record<string, unknown>) => {
      const fn = holder.current?.rpc?.[name];
      if (!fn) return Promise.resolve({ data: null, error: { code: 'PGRST202', message: `Could not find the function public.${name}` } });
      return Promise.resolve({ data: fn(args ?? {}), error: null });
    },
  };
}

export function evalServer(holder: { current: EvalDb | null }) {
  return { createClient: async () => evalClient(holder) };
}
