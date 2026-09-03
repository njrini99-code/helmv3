import 'server-only';

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { failed, ok, unconfigured, type AdminFetchResult } from '@/lib/admin/fetch-result';
import type { StateTone } from '@/lib/admin/incidents/types';
import { parseHeldMigrations, type HeldMigrationRow } from './held-migrations';

/**
 * Engineering OS Decision Inbox.
 *
 * The control-plane implementation plan (Phase J.4.5) is explicit: do not
 * build a second Decision Inbox — the real one lives in `attention.ts`'s
 * `selectAttention`, rendered on the Bridge home page's AttentionQueue. This
 * module does not compete with that. Its sources are DISJOINT from
 * `UnifiedIncident` / `SelfHealStageDetail` (the data `attention.ts` already
 * derives from) by construction: a HELD migration row and a Janitor finding
 * are Engineering-OS-specific artifacts neither `selectAttention` nor
 * anything on the Bridge home page reads today. Field names deliberately
 * mirror `AttentionRow`'s (`key`, `reason`, `state`, `headline`, `why`,
 * `ageMs`, `href`, `tone`) so a human merging this into `attention.ts` later
 * (adding `AttentionReason` variants per J.4.5) can do so mechanically.
 */

export type EngineeringDecisionReason = 'held-migration' | 'janitor-finding';

export interface EngineeringDecisionItem {
  key: string;
  reason: EngineeringDecisionReason;
  /** Short state word, uppercase — matches AttentionRow's convention. */
  state: string;
  headline: string;
  why: string;
  /** The one command a human runs to see the full evidence before deciding. */
  evidenceCommand: string;
  ageMs: number | null;
  href: string | null;
  tone: StateTone;
}

interface JanitorFindingRow {
  id: string;
  class: string;
  scope: string;
  reason: string;
  closes_when: string | null;
  confidence: 'high' | 'medium' | 'low' | string;
  size_of_change: string;
}

interface JanitorClassRow {
  classId: string;
  evidenceCommand: string;
}

interface JanitorFindingsFile {
  generated_at: string;
  classes: JanitorClassRow[];
  findings: JanitorFindingRow[];
}

function heldMigrationToDecisionItem(row: HeldMigrationRow): EngineeringDecisionItem {
  const isUnreviewed = /not yet reviewed/i.test(row.status);
  return {
    key: `held-migration:${row.migrationFile}`,
    reason: 'held-migration',
    state: isUnreviewed ? 'AWAITING REVIEW' : 'AWAITING APPLY',
    headline: `Migration held: ${row.migrationFile}`,
    why: row.reasonExcerpt,
    evidenceCommand: `grep -A2 '${row.migrationFile}' supabase/migrations/HELD.md`,
    ageMs: null,
    href: null,
    tone: 'warning',
  };
}

const JANITOR_TONE: Record<string, StateTone> = { high: 'accent', medium: 'neutral', low: 'neutral' };

function janitorFindingToDecisionItem(
  finding: JanitorFindingRow,
  evidenceByClass: Map<string, string>,
  generatedAt: string,
  now: number,
): EngineeringDecisionItem {
  const generatedMs = Date.parse(generatedAt);
  return {
    key: `janitor-finding:${finding.id}`,
    reason: 'janitor-finding',
    state: 'PROPOSED FINDING',
    headline: `${finding.class}: ${finding.scope}`,
    why: finding.reason,
    evidenceCommand: evidenceByClass.get(finding.class) ?? 'npm run janitor',
    ageMs: Number.isFinite(generatedMs) ? Math.max(0, now - generatedMs) : null,
    href: null,
    tone: JANITOR_TONE[finding.confidence] ?? 'neutral',
  };
}

export interface BuildDecisionInboxInput {
  heldMarkdown: string | null;
  janitorFindings: JanitorFindingsFile | null;
  now: number;
  /** Cap on Janitor findings surfaced here — the report itself can hold many
   *  more; this inbox is meant to stay short, not replace the full report. */
  janitorLimit?: number;
}

/** Pure — no I/O. Composes the two disjoint sources into one ranked list:
 *  held migrations first (they are a standing, repo-visible owner decision
 *  gate), then the highest-confidence Janitor findings. */
export function buildDecisionInbox(input: BuildDecisionInboxInput): EngineeringDecisionItem[] {
  const items: EngineeringDecisionItem[] = [];

  if (input.heldMarkdown) {
    for (const row of parseHeldMigrations(input.heldMarkdown)) {
      items.push(heldMigrationToDecisionItem(row));
    }
  }

  if (input.janitorFindings) {
    const evidenceByClass = new Map(input.janitorFindings.classes.map((c) => [c.classId, c.evidenceCommand]));
    const limit = input.janitorLimit ?? 10;
    for (const finding of input.janitorFindings.findings.slice(0, limit)) {
      items.push(janitorFindingToDecisionItem(finding, evidenceByClass, input.janitorFindings.generated_at, input.now));
    }
  }

  return items;
}

async function readRepoFile(relativePath: string): Promise<string | null> {
  try {
    return await readFile(join(process.cwd(), relativePath), 'utf-8');
  } catch {
    return null;
  }
}

export interface DecisionInboxSnapshot {
  items: EngineeringDecisionItem[];
  heldMigrationsRead: boolean;
  janitorFindingsRead: boolean;
}

/**
 * Reads both source files off disk (repo-local, not network) and composes
 * them. Neither source is required for the other — a missing Janitor report
 * (it is not committed; regenerate with `npm run janitor`) still yields the
 * HELD-migration half, disclosed via `janitorFindingsRead: false` rather
 * than silently reporting zero decisions as if nothing were waiting.
 */
export async function fetchDecisionInbox(now: number = Date.now()): Promise<AdminFetchResult<DecisionInboxSnapshot>> {
  try {
    const [heldMarkdown, janitorRaw] = await Promise.all([
      readRepoFile('supabase/migrations/HELD.md'),
      readRepoFile('docs/generated/janitor-findings.json'),
    ]);

    if (heldMarkdown === null && janitorRaw === null) {
      return unconfigured('Decision Inbox sources (HELD.md and janitor-findings.json both unreadable)');
    }

    let janitorFindings: JanitorFindingsFile | null = null;
    if (janitorRaw !== null) {
      try {
        janitorFindings = JSON.parse(janitorRaw) as JanitorFindingsFile;
      } catch {
        janitorFindings = null;
      }
    }

    const items = buildDecisionInbox({ heldMarkdown, janitorFindings, now });
    return ok({
      items,
      heldMigrationsRead: heldMarkdown !== null,
      janitorFindingsRead: janitorFindings !== null,
    });
  } catch (error) {
    return failed(error instanceof Error ? error.message : String(error));
  }
}
