#!/usr/bin/env node
// scripts/lib/deploy-week-count.mjs — count this ISO week's (America/New_York,
// Monday 00:00:00 through Sunday 23:59:59) production deployments from the
// TEXT `vercel ls <project> --prod` prints. Text, not --json: the CLI does not
// commit to a stable JSON shape across versions any more than it commits to
// the human table shape, and this repo has already been burned once by
// trusting Vercel CLI output without reading it defensively first
// (scripts/deploy-prod.sh's own `vercel inspect` EPIPE incident, 2026-09-02).
//
// Contract:
//   - stdin: the CLI's raw stdout+stderr, exactly as captured (do not filter
//     before piping in — this script does its own line matching).
//   - stdout: exactly one line — a non-negative integer, or the literal
//     string UNKNOWN.
//   - exit code: always 0. "I could not tell" is a well-formed answer, not a
//     crash. The caller (scripts/deploy-prod.sh) is what turns UNKNOWN into a
//     refusal.
//
// UNKNOWN is deliberately the wide net: a row whose age token uses a unit this
// parser does not recognize, or an output that names zero rows without the
// CLI's own "no deployments" wording, comes back UNKNOWN rather than a
// possibly-wrong number. A production deploy budget that silently undercounts
// because the CLI's table format changed underneath it is worse than one that
// refuses and asks a human to look.
//
// Testing: HELM_DEPLOY_WEEK_COUNT_NOW=<ISO-8601> pins "now" so a fixture's
// relative ages ("2h", "3d") resolve to a deterministic ISO week.

const TZ = 'America/New_York';

function readStdin() {
  return new Promise((resolveStdin) => {
    const chunks = [];
    process.stdin.on('data', (c) => chunks.push(c));
    process.stdin.on('end', () => resolveStdin(Buffer.concat(chunks).toString('utf8')));
    process.stdin.on('error', () => resolveStdin(''));
  });
}

function nyOffsetMinutesAt(utcMs) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    timeZoneName: 'shortOffset',
  }).formatToParts(new Date(utcMs));
  const tz = parts.find((p) => p.type === 'timeZoneName')?.value || 'GMT-5';
  const m = /GMT([+-]\d+)/.exec(tz);
  return m ? parseInt(m[1], 10) * 60 : -300;
}

// Wall-clock NY time -> the UTC instant it names, looking up the real offset
// for THAT date (handles EST/EDT correctly instead of assuming one).
function nyWallClockToUtcMs(y, mo, d, hh, mi, se) {
  const guess = Date.UTC(y, mo - 1, d, hh, mi, se);
  return guess - nyOffsetMinutesAt(guess) * 60000;
}

function nyCalendarPartsOf(date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  }).formatToParts(date);
  const get = (t) => parts.find((p) => p.type === t)?.value;
  return { y: Number(get('year')), mo: Number(get('month')), d: Number(get('day')), weekday: get('weekday') };
}

const WEEKDAY_INDEX = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };

/** [weekStart, weekEnd) as UTC epoch ms for the ISO week (Mon-Sun) `now` falls in, NY-local. */
function currentIsoWeekBoundsUtcMs(now) {
  const { y, mo, d, weekday } = nyCalendarPartsOf(now);
  const dayIndex = WEEKDAY_INDEX[weekday];
  if (dayIndex === undefined) return null;

  const dayUtc = Date.UTC(y, mo - 1, d);
  const monday = new Date(dayUtc - dayIndex * 86400000);
  const nextMonday = new Date(dayUtc - dayIndex * 86400000 + 7 * 86400000);

  const weekStart = nyWallClockToUtcMs(monday.getUTCFullYear(), monday.getUTCMonth() + 1, monday.getUTCDate(), 0, 0, 0);
  const weekEnd = nyWallClockToUtcMs(
    nextMonday.getUTCFullYear(), nextMonday.getUTCMonth() + 1, nextMonday.getUTCDate(), 0, 0, 0,
  );
  return { weekStart, weekEnd };
}

// Vercel CLI `ls` age column, observed shape: "3s" "45m" "4h" "2d" "3w".
// Months/years or any other unit are outside what a weekly budget check ever
// needs to trust, so they fall through to UNKNOWN below along with anything
// else this pattern does not recognize.
const UNIT_MS = { s: 1000, m: 60000, h: 3600000, d: 86400000, w: 7 * 86400000 };
const AGE_LINE_RE = /^\s*(\d+)(s|m|h|d|w)\s+\S/;

export function countThisWeek(text, now) {
  if (/no deployments found/i.test(text)) return 0;

  const bounds = currentIsoWeekBoundsUtcMs(now);
  if (!bounds) return null;

  let matched = 0;
  let inWeek = 0;
  for (const line of text.split(/\r?\n/)) {
    const m = AGE_LINE_RE.exec(line);
    if (!m) continue;
    matched += 1;
    const ageMs = Number(m[1]) * UNIT_MS[m[2]];
    const deployedAt = now.getTime() - ageMs;
    if (deployedAt >= bounds.weekStart && deployedAt < bounds.weekEnd) inWeek += 1;
  }

  // Output was non-trivial but not one line matched a deployment row shape —
  // the CLI's table format changed underneath this parser. Do not guess 0.
  if (matched === 0) return null;
  return inWeek;
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const nowOverride = process.env.HELM_DEPLOY_WEEK_COUNT_NOW;
  const now = nowOverride ? new Date(nowOverride) : new Date();
  readStdin().then((text) => {
    const count = countThisWeek(text, now);
    process.stdout.write(count === null ? 'UNKNOWN\n' : `${count}\n`);
  });
}
