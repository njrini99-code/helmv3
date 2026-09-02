/**
 * Production target guard for destructive maintenance scripts.
 *
 * WHY THIS EXISTS
 * ---------------
 * A 2026-08-18 sweep of every path that can delete GolfHelm player data found
 * four scripts that delete real rounds — and therefore, by FK cascade,
 * `golf_holes`, `golf_shots`, `golf_round_reviews` and
 * `golf_round_stats_cache` — with NO target check of any kind:
 *
 *   scripts/refresh-demo-nick-rini.ts        header instructs running it against
 *                                            .vercel/.env.production.local
 *   scripts/seed-demo-team-from-guilford.ts  same
 *   scripts/seed-demo-player.ts              hardcoded demo id, no guard
 *   scripts/debug-player-insert.mjs          deletes golf_players, no guard
 *
 * Each is scoped by a hardcoded id today, so the blast radius is small AS
 * WRITTEN. The hazard is not the current code — it is that nothing stops the
 * next edit. Change a constant, widen a filter, or pick up "refresh the demo"
 * without reading the header comment, and there is no automated backstop
 * between that and production round data.
 *
 * `scripts/seed-baseball-stats.mjs` already solved this. This module is that
 * pattern extracted so the four scripts above stop each needing to remember it.
 *
 * WHAT IT DOES NOT DO
 * -------------------
 * It does not prevent a deliberate production run — `--allow-prod` still works,
 * because refreshing the demo account on production is a real task. It converts
 * an *accidental* production write into a loud refusal, which is the only part
 * that was missing.
 */

/** The production project ref, derived from its Supabase URL hostname. */
export const KNOWN_PROD_PROJECT_REF = 'qmnssrrolpinvwjjnufo';

/** Tables whose loss is unrecoverable. Named so refusals can say what was at stake. */
export const PROTECTED_TABLES = [
  'golf_rounds',
  'golf_shots',
  'golf_holes',
  'golf_round_reviews',
  'golf_round_stats_cache',
  'golf_players',
];

/**
 * Resolve the project ref a script is pointed at.
 * Returns '' when the URL is absent or unparseable — callers must treat that as
 * "unknown", never as "not production".
 */
export function resolveProjectRef(url) {
  if (!url) return '';
  try {
    return new URL(url).hostname.split('.')[0] ?? '';
  } catch {
    return '';
  }
}

/**
 * Refuse to run a destructive script against production unless explicitly told to.
 *
 * Fails CLOSED in three separate ways, because each has a different failure mode:
 *   - missing URL      -> cannot prove the target, so refuse
 *   - unparseable URL  -> same
 *   - prod without the flag -> refuse and name what would have been deleted
 *
 * A DRY RUN against production is permitted without the flag. Blocking it would
 * be actively harmful: previewing what a script would do to prod is the correct
 * way to use these, and refusing it just trains people to pass --allow-prod
 * reflexively, which is the habit the guard exists to prevent.
 *
 * @param {object}  o
 * @param {string}  o.url          NEXT_PUBLIC_SUPABASE_URL the script will use
 * @param {boolean} o.allowProd    true when --allow-prod was passed
 * @param {string}  o.scriptName   for the refusal message
 * @param {string[]} [o.deletes]   tables this script deletes from
 * @param {boolean} [o.dryRun]     true when --dry-run was passed; permits prod
 * @returns {{ projectRef: string, isProd: boolean }}
 */
export function assertSafeTarget({ url, allowProd, scriptName, deletes = [], dryRun = false }) {
  const projectRef = resolveProjectRef(url);

  if (!projectRef) {
    console.error(
      `[${scriptName}] REFUSING TO RUN: could not resolve a Supabase project from ` +
        `NEXT_PUBLIC_SUPABASE_URL (${url ? 'unparseable' : 'not set'}).\n` +
        `An unknown target is not a safe target — this script deletes ` +
        `${deletes.length ? deletes.join(', ') : 'player data'}.`,
    );
    process.exit(1);
  }

  const isProd = projectRef === KNOWN_PROD_PROJECT_REF;

  if (isProd && dryRun && !allowProd) {
    console.warn(
      `[${scriptName}] DRY RUN against PRODUCTION (${projectRef}). No writes will be made.\n` +
        `To actually execute against production, re-run with --allow-prod.`,
    );
    return { projectRef, isProd };
  }

  if (isProd && !allowProd) {
    const hit = deletes.filter((t) => PROTECTED_TABLES.includes(t));
    console.error(
      `[${scriptName}] REFUSING TO RUN against PRODUCTION project ${projectRef}.\n` +
        (hit.length
          ? `This script deletes from ${hit.join(', ')}. Player rounds and shots ` +
            `cannot be recovered — every child row cascades.\n`
          : '') +
        `If this is deliberate, re-run with --allow-prod.`,
    );
    process.exit(1);
  }

  if (isProd && allowProd) {
    console.warn(
      `[${scriptName}] Running against PRODUCTION (${projectRef}) with --allow-prod.` +
        (deletes.length ? ` Will delete from: ${deletes.join(', ')}.` : ''),
    );
  }

  return { projectRef, isProd };
}
