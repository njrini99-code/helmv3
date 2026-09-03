/**
 * Reads `supabase/migrations/HELD.md` at request time and parses it with
 * `parseHeldMigrations` (`decisions.ts`). Kept separate from that file so
 * `decisions.ts` stays 100% pure and importable from a vitest node
 * environment with no filesystem dependency.
 *
 * KNOWN GAP, stated rather than hidden: this repo has no
 * `outputFileTracingIncludes` entry for `supabase/migrations/HELD.md` in
 * `next.config.mjs`, and Next.js's production output file tracing only
 * bundles files it can see imported or explicitly included — a plain markdown
 * file read via `fs` at runtime is not guaranteed to ship with a Vercel
 * serverless function. This was NOT verified against a real build (the
 * worktree gate rules for this task explicitly exclude `npm run build`), so
 * this function is written to degrade safely rather than assumed to work:
 * ANY read failure (ENOENT included) returns `null`, and
 * `buildDecisionInbox` already treats `heldMigrations: null` as
 * `readable: false`, not as an empty, all-clear list. If a production HELD.md
 * read starts failing, the fix is a `next.config.mjs` `outputFileTracingIncludes`
 * entry for `supabase/migrations/HELD.md`, not a change to this file's shape.
 */

import 'server-only';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parseHeldMigrations, type HeldMigrationRow } from './decisions';

const HELD_MD_PATH = path.join(process.cwd(), 'supabase', 'migrations', 'HELD.md');

export async function fetchHeldMigrations(): Promise<HeldMigrationRow[] | null> {
  try {
    const raw = await readFile(HELD_MD_PATH, 'utf8');
    return parseHeldMigrations(raw);
  } catch {
    return null;
  }
}
