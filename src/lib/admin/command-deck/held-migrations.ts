/**
 * Reads `supabase/migrations/HELD.md` at request time and parses it with
 * `parseHeldMigrations` (`decisions.ts`). Kept separate from that file so
 * `decisions.ts` stays 100% pure and importable from a vitest node
 * environment with no filesystem dependency.
 *
 * `next.config.mjs` carries an `outputFileTracingIncludes` entry for
 * `/admin` -> `supabase/migrations/HELD.md` so Vercel's output file tracing
 * ships this plain markdown file with the serverless function even though
 * nothing here `import`s it. That entry was NOT verified against a real
 * Vercel build (the worktree gate rules for this task explicitly exclude
 * `npm run build` — disk-space constrained; CI's `next-build` job is the
 * first real check of it). So this function still degrades safely rather
 * than trusting the tracing entry: ANY read failure (ENOENT included)
 * returns `null`, and `buildDecisionInbox` already treats
 * `heldMigrations: null` as `readable: false`, not as an empty, all-clear
 * list. If a production HELD.md read ever fails despite the tracing entry,
 * re-check the glob in `next.config.mjs` first — this file's shape is
 * already correct for either outcome.
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
