/**
 * Decision Inbox summary (brief §34) — human-judgment items only.
 *
 * Phase 5 builds the full inbox (`docs/ai-system/briefs/...#45`, "Phase 5 —
 * Engineering OS"). This is the Command Deck's compact summary, built from
 * two sources that already carry genuine human-judgment items rather than
 * inventing a new decision taxonomy (§44, "no second ... self-heal
 * lifecycle" — the same principle applied to decisions):
 *
 * 1. `selectAttention`'s `'needs-evidence'` rows (`incidents/attention.ts`)
 *    — "automation cannot safely proceed without a human supplying more
 *    context", which is exactly the brief's §6 `DecisionItem` case "repair
 *    with insufficient evidence".
 * 2. `supabase/migrations/HELD.md`'s `HOLD` rows — a migration deliberately
 *    left unapplied is, by that file's own stated purpose, a standing
 *    "destructive/security schema choice" decision (§6) that has not been
 *    finally resolved either way.
 *
 * `config/open-pr-dispositions.json` was evaluated and NOT used here: its
 * three rows are worktree-lifecycle metadata (park/keep a checkout), not a
 * production incident/release/schema decision — including it would dilute
 * the inbox with a different kind of "open item" the brief's §6 taxonomy
 * does not cover.
 *
 * The empty state is calm ONLY when both sources actually read clean —
 * never when one of them failed to read (`heldMigrationsReadable: false`
 * must never collapse silently into an empty list).
 */

import type { AttentionRow } from '@/lib/admin/incidents/attention';

export interface HeldMigrationRow {
  migration: string;
  status: 'HOLD' | 'OBSOLETE' | 'APPLIED';
  why: string;
  decided: string;
}

export interface DecisionItem {
  id: string;
  kind: 'repair-needs-evidence' | 'migration-hold';
  title: string;
  detail: string;
  href: string | null;
}

export interface DecisionInboxSummary {
  items: readonly DecisionItem[];
  total: number;
  /** false when a source that feeds this inbox could not be read — the
   *  caller must render this as "decisions unknown", never as "none". */
  readable: boolean;
  computedAt: string;
}

/**
 * Pure. Parses `HELD.md`'s one markdown table into rows. Deliberately
 * tolerant of surrounding prose (only lines matching the table's own
 * `| \`file.sql\` | **STATUS** | why | decided |` shape are rows) so an
 * edit to the file's prose above/below the table cannot break this parser.
 *
 * STATUS IS A PREFIX, NOT A WHOLE CELL. This used to require the bold span be
 * pure uppercase (`\*\*([A-Z]+)\*\*`), which matched six of the eleven real
 * HOLD rows — every row whose status carries a qualifier
 * (`**HOLD — R3, not yet reviewed**`, `**APPLIED 2026-09-03 — hold
 * discharged**`) fell through the `if (!match) continue` and vanished. The
 * Decision Inbox then rendered "no held migrations" for five decisions that
 * were genuinely waiting on the owner: a silent zero standing in for unknown,
 * which is the one thing this console's read models are built not to do.
 *
 * `src/lib/admin/engineering/held-migrations.ts` already classified by prefix
 * and already found all eleven. The two parsers reading one file and
 * disagreeing about what is in it is the actual defect; the test pins them
 * against the REAL HELD.md so they cannot drift apart again.
 */
const HELD_ROW = /^\|\s*`([^`]+)`[^|]*\|\s*\*\*([^*]+)\*\*[^|]*\|\s*(.*?)\s*\|\s*(.*?)\s*\|\s*$/;

/** The leading keyword of a status cell — `HOLD — R3` is a HOLD. */
function statusPrefix(cell: string): HeldMigrationRow['status'] | null {
  const first = cell.trim().toUpperCase().split(/[^A-Z-]/)[0] ?? '';
  if (first.startsWith('HOLD')) return 'HOLD';
  if (first.startsWith('OBSOLETE')) return 'OBSOLETE';
  // APPLIED-ELSEWHERE is not APPLIED here: it means another environment ran
  // it, which is still an open decision for production.
  if (first === 'APPLIED') return 'APPLIED';
  return null;
}

export function parseHeldMigrations(markdown: string): HeldMigrationRow[] {
  const rows: HeldMigrationRow[] = [];
  for (const line of markdown.split('\n')) {
    const match = HELD_ROW.exec(line.trim());
    if (!match) continue;
    const migration = match[1];
    const statusRaw = match[2];
    const why = match[3];
    const decided = match[4];
    if (migration === undefined || statusRaw === undefined || why === undefined || decided === undefined) continue;
    const status = statusPrefix(statusRaw);
    if (status === null) continue;
    rows.push({ migration, status, why, decided });
  }
  return rows;
}

export interface BuildDecisionInboxInput {
  /** Full attention list (`selectAttention(input, Number.MAX_SAFE_INTEGER)`),
   *  filtered internally to `'needs-evidence'` — never re-ranked, so this
   *  can never disagree with what the Attention Stack itself shows. */
  attentionRows: readonly AttentionRow[];
  /** null when HELD.md could not be read (missing file, read error) —
   *  distinct from `[]`, which means it read fine and is empty/all-resolved. */
  heldMigrations: readonly HeldMigrationRow[] | null;
  now: number;
}

/** Pure. */
export function buildDecisionInbox(input: BuildDecisionInboxInput): DecisionInboxSummary {
  const items: DecisionItem[] = [];

  for (const row of input.attentionRows) {
    if (row.reason !== 'needs-evidence') continue;
    items.push({
      id: `attn:${row.key}`,
      kind: 'repair-needs-evidence',
      title: row.headline,
      detail: row.why,
      href: row.href,
    });
  }

  const held = input.heldMigrations ?? [];
  for (const row of held) {
    if (row.status !== 'HOLD') continue;
    items.push({
      id: `held:${row.migration}`,
      kind: 'migration-hold',
      title: `Migration on hold — ${row.migration}`,
      detail: row.why,
      href: null,
    });
  }

  return {
    items,
    total: items.length,
    readable: input.heldMigrations !== null,
    computedAt: new Date(input.now).toISOString(),
  };
}
