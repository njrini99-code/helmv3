#!/usr/bin/env node
/**
 * audit-ambient-zone — find local-timezone date logic that feeds a UTC consumer.
 *
 * WHY
 * ---
 * Production runs on Vercel in UTC. Developer machines and browsers do not.
 * So a local date getter feeding a UTC-serialized value AGREES WITH ITSELF in
 * CI and in production, and disagrees only for real users in real timezones.
 * That is why this class survives review, and why three separate instances
 * shipped before anyone noticed:
 *
 *   detectSemester        getMonth() bucketed a date into a semester. Off-by-one
 *                         month for every 1st-of-month west of UTC.
 *   generateTimeSlots     setHours(<literal>) built a meeting slot. "Find a Time"
 *                         offered 03:00-15:00 Eastern instead of 08:00-17:00.
 *   event reminders       setHours(<literal>) built a send time. Wrong day AND hour.
 *
 * THE DISCRIMINATOR (this is the whole point of the script)
 * --------------------------------------------------------
 * A first pass that grepped for any local date method flagged 45 files and was
 * useless. All three real bugs share a narrower shape: a WALL-CLOCK value — a
 * specific hour, or a calendar-bucket boundary — crossing into a UTC instant.
 *
 *   FLAGGED    setHours(0, 0, 0, 0)        constructing a day boundary
 *   FLAGGED    d.getMonth() >= 4           bucketing on a calendar boundary
 *   NOT        setDate(getDate() - 90)     rolling-window arithmetic; a 90-day
 *                                          window has no calendar semantics, so
 *                                          it cannot land in the wrong bucket
 *
 * KNOWN FALSE-POSITIVE CLASSES — check these before "fixing" a hit
 * ---------------------------------------------------------------
 * 1. Deliberate local rendering. `toDateTimeLocalValue`
 *    (components/golf/calendar/event-form-helpers.ts) MUST use local getters:
 *    it feeds a <input type="datetime-local">, which is local by definition.
 *    Making it UTC would REINTRODUCE audit finding #15.
 * 2. Pure modules consumed by client components. `dayBucketFor`
 *    (golf/actions/unified-notifications-model.ts) lives under actions/ but its
 *    caller, NotificationFeedPanel.tsx, is 'use client'. It runs in the browser,
 *    where the runtime zone IS the user's zone — correct as written.
 * 3. Rolling windows. `extractTemporalFeatures` (coachhelm/v2/features/temporal.ts)
 *    does setDate(getDate() - 90) purely to offset an instant. No boundary.
 *
 * The script cannot tell these apart on its own — it reports candidates. Confirm
 * the consumer and the execution context before changing anything, and never
 * "fix" a site whose failure mode you have not observed.
 *
 * USAGE
 *   node scripts/audit-ambient-zone.mjs          # report candidates
 *   node scripts/audit-ambient-zone.mjs --all    # include already-reviewed sites
 *
 * Always exits 0 — this is an audit aid, not a gate. Gating would need a
 * checked-in baseline, and a stale baseline is worse than no baseline.
 */
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

// execFileSync with an argument array: no shell, nothing interpolated.
const files = execFileSync(
  'git',
  ['ls-files', 'src/**/*.ts', 'src/**/*.tsx'],
  { encoding: 'utf8' }
).trim().split('\n').filter(Boolean);

/** A specific wall-clock time being CONSTRUCTED — excludes setHours(d.getHours() - n). */
const WALL_CLOCK_SET = /\.setHours\s*\(\s*(?!\w+\.getHours)/;
/** A calendar field used as a BUCKET: compared against a numeric boundary. */
const BUCKET_COMPARE = /\.(getMonth|getDay|getDate|getHours)\s*\(\)\s*(===|!==|<=|>=|<|>)\s*\d/;
/** A calendar field used as an array index (month/day name lookup). */
const BUCKET_INDEX = /\[\s*\w+\.(getMonth|getDay)\s*\(\)\s*\]/;
/** Evidence the value is serialized as a UTC instant. */
const UTC_EMIT = /(toISOString\s*\(\)|'Z'|yyyyMMdd|\.toJSON\s*\(\))/;
/** Evidence the file already reasons about zones explicitly. */
const ZONE_AWARE = /(wallClockInZone|getUTC[A-Z]|timeZone|Intl\.DateTimeFormat|LANDMINE|datetime-local)/;

/**
 * Sites reviewed 2026-08-16 and deliberately left alone, with the reason.
 * Anything NOT in here is genuinely new and deserves a look.
 */
const REVIEWED = new Map([
  ['src/components/golf/calendar/event-form-helpers.ts', 'local by design — feeds datetime-local input (finding #15)'],
  ['src/app/golf/actions/unified-notifications-model.ts', 'consumed by NotificationFeedPanel.tsx, a client component'],
  ['src/lib/coachhelm/v2/features/temporal.ts', 'rolling 90/30/14/7-day windows, no calendar boundary'],
  ['src/lib/calendar/ical.ts', 'LANDMINE-commented; branch unreachable (caller passes start_time null)'],
  ['src/lib/coachhelm/v2/prediction/trajectory-forecaster.ts', 'fixed in #1451 — seasonalAdjustmentFor uses getUTCMonth'],
  ['src/lib/calendar/availability.ts', 'fixed in #1449 — takes an explicit required timeZone'],
]);

const showAll = process.argv.includes('--all');
const candidates = [];

for (const f of files) {
  if (/\.test\.|\.spec\./.test(f)) continue;
  let src;
  try { src = readFileSync(f, 'utf8'); } catch { continue; }
  if (/^\s*['"]use client['"]/.test(src)) continue;   // browser zone == user zone
  if (!UTC_EMIT.test(src)) continue;                  // nothing crosses into UTC

  const found = [];
  src.split('\n').forEach((line, i) => {
    const t = line.trim();
    if (t.startsWith('*') || t.startsWith('//')) return;
    let kind = null;
    if (WALL_CLOCK_SET.test(line)) kind = 'wall-clock-set';
    else if (BUCKET_COMPARE.test(line)) kind = 'bucket-compare';
    else if (BUCKET_INDEX.test(line)) kind = 'bucket-index';
    if (kind) found.push({ line: i + 1, kind, text: t.slice(0, 90) });
  });

  if (found.length) {
    candidates.push({ file: f, found, zoneAware: ZONE_AWARE.test(src), reviewed: REVIEWED.get(f) });
  }
}

const fresh = candidates.filter((c) => !c.reviewed && !c.zoneAware);
const known = candidates.filter((c) => c.reviewed || c.zoneAware);

console.log(`Scanned ${files.length} files (server-side only).\n`);

if (fresh.length === 0) {
  console.log('No unreviewed wall-clock/bucket sites feeding a UTC consumer.');
} else {
  console.log(`${fresh.length} file(s) to review — confirm the consumer and execution context first:\n`);
  for (const c of fresh) {
    console.log(`  ${c.file}`);
    for (const h of c.found) console.log(`     ${h.line}  [${h.kind}]  ${h.text}`);
    console.log('');
  }
}

if (showAll) {
  console.log(`\n--- ${known.length} already reviewed or zone-aware ---`);
  for (const c of known) {
    console.log(`  ${c.file}\n     ${c.reviewed ?? 'references a zone/UTC API'}`);
  }
} else if (known.length) {
  console.log(`\n(${known.length} more already reviewed or zone-aware — pass --all to list them)`);
}
