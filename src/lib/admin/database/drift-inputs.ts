import 'server-only';

/**
 * The thin reader behind `src/lib/observability/supabase/schema-drift.ts`.
 *
 * That module is pure and takes its three listings as arguments. This file is
 * the I/O half — it scans the migrations directory, the generated types file,
 * and (only when a credential is configured) the applied migration ledger, and
 * hands the results over. Same split `release-context.ts` documents for its own
 * migration-head read: the reasoning is unit-tested, the reading is not,
 * because an I/O boundary with no logic of its own has nothing to pin.
 *
 * EVERY FAILURE DEGRADES TO "UNREADABLE", NEVER TO EMPTY
 * ------------------------------------------------------
 * A missing directory, an unparseable file, an absent credential and a network
 * failure all set the corresponding `readable`/`null` flag rather than
 * returning `[]`. `schema-drift.ts` then reports `unknown` for that axis. An
 * empty array would claim "we looked and there is nothing", which is the exact
 * confusion this whole program exists to prevent.
 *
 * KNOWN LIMITATION — THE FILE READS DO NOT WORK ON VERCEL.
 * `supabase/migrations/**` and `src/lib/types/database.ts` are repository
 * files, not part of a traced serverless function bundle, so in a deployed
 * Bridge these reads fail and both axes report `unknown`. That is honest and
 * safe; it is also why the incident detail surface renders an explicit
 * "not readable here" state rather than an empty one. Making them readable in
 * production would mean adding `outputFileTracingIncludes` to `next.config.mjs`,
 * which is a deliberate, separate change.
 *
 * COST (§4): the ledger read is ONE bounded Management API query, and it is
 * OPT-IN — `readSchemaDriftInputs` does not make it unless the caller asks.
 * That gate is load-bearing, not decorative: the Bridge database page carries
 * an unconditional `AutoRefresh intervalMs={60_000}` and is `force-dynamic`, so
 * an unconditional fetch here would become a once-a-minute poll per open tab,
 * indefinitely — which is precisely the recurring-load shape §4 forbids, even
 * though the endpoint itself is free. `incident-detail.ts` asks only for a
 * missing-object mechanism, where the ledger axis means anything; for a 42501
 * (the majority case) it is meaningless and no request is made. No schedule, no
 * writes.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import type { GeneratedTypesListing, MigrationFileListing } from '@/lib/observability/supabase/schema-drift';

// ---------------------------------------------------------------------------
// Migration files
// ---------------------------------------------------------------------------

/**
 * Object names a migration's SQL creates or alters. Deliberately generous —
 * a false "this migration names the object" is far cheaper here than a false
 * "no migration creates it", which would send an operator hunting for a typo
 * that does not exist. `migration-ledger-drift.mjs` makes the same trade in
 * its own `heldVersions()`.
 */
const OBJECT_PATTERNS: readonly RegExp[] = [
  /create\s+(?:or\s+replace\s+)?(?:unlogged\s+|temporary\s+|temp\s+)?table\s+(?:if\s+not\s+exists\s+)?([a-z0-9_."]+)/gi,
  /create\s+(?:or\s+replace\s+)?(?:materialized\s+)?view\s+(?:if\s+not\s+exists\s+)?([a-z0-9_."]+)/gi,
  /create\s+(?:or\s+replace\s+)?function\s+([a-z0-9_."]+)/gi,
  /create\s+schema\s+(?:if\s+not\s+exists\s+)?([a-z0-9_."]+)/gi,
  /alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?([a-z0-9_."]+)/gi,
];

const ADD_COLUMN_RE = /alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?([a-z0-9_."]+)[\s\S]{0,200}?add\s+column\s+(?:if\s+not\s+exists\s+)?([a-z0-9_"]+)/gi;

function unqualify(raw: string): string {
  const cleaned = raw.replace(/["`]/g, '').trim().toLowerCase();
  const segments = cleaned.split('.').filter((s) => s.length > 0);
  return segments[segments.length - 1] ?? cleaned;
}

/** Exported for the unit test — the only genuinely rule-bearing part of this file. */
export function extractObjectsFromMigrationSql(sql: string): string[] {
  const found = new Set<string>();

  for (const pattern of OBJECT_PATTERNS) {
    pattern.lastIndex = 0;
    let match = pattern.exec(sql);
    while (match !== null) {
      const name = unqualify(match[1] ?? '');
      if (name.length > 0) found.add(name);
      match = pattern.exec(sql);
    }
  }

  ADD_COLUMN_RE.lastIndex = 0;
  let columnMatch = ADD_COLUMN_RE.exec(sql);
  while (columnMatch !== null) {
    const table = unqualify(columnMatch[1] ?? '');
    const column = unqualify(columnMatch[2] ?? '');
    if (table.length > 0 && column.length > 0) {
      found.add(column);
      found.add(`${table}.${column}`);
    }
    columnMatch = ADD_COLUMN_RE.exec(sql);
  }

  return Array.from(found);
}

let migrationCache: { files: MigrationFileListing[]; readable: boolean } | null = null;

function readMigrationFiles(): { files: MigrationFileListing[]; readable: boolean } {
  if (migrationCache !== null) return migrationCache;

  try {
    const dir = resolve(process.cwd(), 'supabase/migrations');
    const files: MigrationFileListing[] = [];
    for (const filename of readdirSync(dir)) {
      if (!filename.endsWith('.sql')) continue;
      const version = /^(\d{14})_/.exec(filename)?.[1];
      if (version === undefined) continue;
      try {
        const sql = readFileSync(join(dir, filename), 'utf8');
        files.push({ version, filename, objects: extractObjectsFromMigrationSql(sql) });
      } catch {
        // One unreadable file does not blind the whole listing; it just
        // contributes no objects.
        files.push({ version, filename, objects: [] });
      }
    }
    migrationCache = { files, readable: true };
  } catch {
    migrationCache = { files: [], readable: false };
  }
  return migrationCache;
}

// ---------------------------------------------------------------------------
// HELD.md
// ---------------------------------------------------------------------------

/** Any 14-digit run anywhere in HELD.md counts as accounted for — the exact
 *  tolerance `migration-ledger-drift.mjs` documents for the same file. */
function readHeldVersions(): string[] | null {
  try {
    const held = readFileSync(resolve(process.cwd(), 'supabase/migrations/HELD.md'), 'utf8');
    return Array.from(new Set(held.match(/\d{14}/g) ?? []));
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Generated types
// ---------------------------------------------------------------------------

let typesCache: GeneratedTypesListing | null = null;

/** Exported for the unit test. Line-oriented rather than a TS parse — the
 *  generated file's indentation is stable because a generator writes it. */
export function parseGeneratedTypes(source: string): Omit<GeneratedTypesListing, 'readable'> {
  const tables = new Set<string>();
  const columns = new Set<string>();
  const functions = new Set<string>();

  let section: 'tables' | 'views' | 'functions' | 'other' = 'other';
  let currentTable: string | null = null;
  let inRow = false;

  for (const line of source.split('\n')) {
    const sectionMatch = /^ {4}(Tables|Views|Functions|Enums|CompositeTypes): \{/.exec(line);
    if (sectionMatch) {
      section =
        sectionMatch[1] === 'Tables'
          ? 'tables'
          : sectionMatch[1] === 'Views'
            ? 'views'
            : sectionMatch[1] === 'Functions'
              ? 'functions'
              : 'other';
      currentTable = null;
      inRow = false;
      continue;
    }

    const entryMatch = /^ {6}([a-z0-9_]+): \{/.exec(line);
    if (entryMatch) {
      const name = entryMatch[1]!;
      if (section === 'functions') functions.add(name);
      if (section === 'tables' || section === 'views') {
        tables.add(name);
        currentTable = name;
      }
      inRow = false;
      continue;
    }

    if (currentTable !== null) {
      if (/^ {8}Row: \{/.test(line)) {
        inRow = true;
        continue;
      }
      if (inRow && /^ {8}\}/.test(line)) {
        inRow = false;
        continue;
      }
      if (inRow) {
        const columnMatch = /^ {10}([a-z0-9_]+)\??:/.exec(line);
        if (columnMatch) {
          columns.add(`${currentTable}.${columnMatch[1]}`);
          columns.add(columnMatch[1]!);
        }
      }
    }
  }

  return { tables: Array.from(tables), columns: Array.from(columns), functions: Array.from(functions) };
}

function readGeneratedTypes(): GeneratedTypesListing {
  if (typesCache !== null) return typesCache;
  try {
    const source = readFileSync(resolve(process.cwd(), 'src/lib/types/database.ts'), 'utf8');
    typesCache = { readable: true, ...parseGeneratedTypes(source) };
  } catch {
    typesCache = { readable: false, tables: [], columns: [], functions: [] };
  }
  return typesCache;
}

// ---------------------------------------------------------------------------
// Applied ledger — on demand, credential-gated, fail-open
// ---------------------------------------------------------------------------

/**
 * Reads `supabase_migrations.schema_migrations` through the Management API,
 * the same path `release-context.ts`'s `fetchProductionMigrationHead` already
 * uses. `null` on every failure mode — no token, no project ref, non-2xx,
 * timeout, malformed body.
 *
 * NOT VERIFIED in this worktree: `.env.local` is deliberately withheld from
 * worktrees (`.worktreeinclude`), so no credential was available and this
 * function has never been observed returning a non-null result here.
 */
export async function fetchAppliedMigrationVersions(): Promise<string[] | null> {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  const projectRef = process.env.SUPABASE_PROJECT_REF;
  if (!token || !projectRef) return null;

  try {
    const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'select version from supabase_migrations.schema_migrations' }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const rows = (await res.json()) as Array<{ version?: unknown }>;
    if (!Array.isArray(rows)) return null;
    return rows.map((r) => String(r.version)).filter((v) => /^\d+$/.test(v));
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

export interface SchemaDriftInputs {
  ledger: {
    filesReadable: boolean;
    files: readonly MigrationFileListing[];
    appliedVersions: readonly string[] | null;
    heldVersions: readonly string[] | null;
  };
  types: GeneratedTypesListing;
}

/**
 * `includeAppliedLedger` defaults to FALSE. A caller that does not opt in gets
 * `appliedVersions: null`, which `schema-drift.ts` reports as `ledgerRow:
 * 'unknown'` — the honest answer for an axis nobody looked at, and never
 * `absent`.
 */
export async function readSchemaDriftInputs(
  options?: { includeAppliedLedger?: boolean },
): Promise<SchemaDriftInputs> {
  const migrations = readMigrationFiles();
  const appliedVersions = options?.includeAppliedLedger === true ? await fetchAppliedMigrationVersions() : null;

  return {
    ledger: {
      filesReadable: migrations.readable,
      files: migrations.files,
      appliedVersions,
      heldVersions: readHeldVersions(),
    },
    types: readGeneratedTypes(),
  };
}

/** Test seam: drops the process-lifetime caches. */
export function __resetDriftInputCaches(): void {
  migrationCache = null;
  typesCache = null;
}
