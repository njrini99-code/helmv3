/**
 * seed-course-library-scorecards.ts — Fixes #913 (part 1/3, DATA).
 *
 * PROBLEM: every one of the 20 cloud-library courses that has no human
 * creator (`golf_courses.created_by_user_id IS NULL` — a bulk-seeded shared
 * row, not a coach's own contribution) currently points at the SAME cloned
 * 3-tee scorecard: Championship 7,165 yds / 73.6 rating / 140 slope, Members
 * 6,455 / 71.2 / 132, Forward 5,450 / 69.0 / 120 — identical hole-by-hole
 * pars, yardages, AND stroke indexes across every course, regardless of the
 * real facility. (Confirmed live via `mcp__supabase__execute_sql` against
 * the current DB on 2026-07-17 — see the PR body for the full course list
 * and per-course source/confidence notes.)
 *
 * This script replaces that clone with realistic, per-course par / yardage /
 * rating / slope / hole-by-hole data. Top-line facts (par, championship
 * yardage, course rating, slope — COURSE_FACTS below) are hand-set per
 * course from well-known public scorecard facts where the course is
 * famous/well-documented; where no single confirmed public source exists,
 * they're a realistic estimate consistent with the course's known character
 * (each entry's `sourceNote` states its confidence level; echoed in the PR
 * body). The hole-by-hole routing (which holes are par 3/4/5, individual
 * yardages, stroke index) is generated deterministically per course by
 * src/lib/golf/course-scorecard-generator.ts from a seeded PRNG keyed on the
 * course name — every course gets its own routing/handicap pattern (never a
 * shared template), yardages always SUM EXACTLY to the chosen total, and
 * re-running this script produces byte-identical output (idempotent).
 *
 * SAFETY
 *  - UPDATE-only. Never inserts a golf_courses or golf_course_tees row —
 *    only the 20 courses' EXISTING "Championship" / "Members" / "Forward"
 *    tee rows are touched, by id, so `golf_rounds.tee_id` references and
 *    already-recorded rounds are untouched. (Rounds snapshot par/yardage
 *    into `golf_holes` at submit time regardless of later course edits —
 *    see docs/audits/COURSE_LIBRARY_AUDIT_2026-06-13.md §4 "Snapshot
 *    Safety".)
 *  - Matches courses by `golf_normalize_name(name)` (the same dedup key the
 *    app itself uses — see src/lib/golf/course-library.ts `normalizeName`),
 *    never a hardcoded id, so it's environment-agnostic and safe to re-run.
 *  - OWNERSHIP GUARD: a name match is only ever touched when
 *    `created_by_user_id IS NULL` (a library row nobody owns). If a course
 *    with that name has since been claimed by a real coach/team (rare, but
 *    e.g. a coach re-created a same-named course), the script SKIPS it with
 *    a warning instead of overwriting a real user's data — see #913 part 2
 *    (ownership gating) for why that distinction matters.
 *  - Hole rows: upsert-first, prune-surplus-second (stage-and-swap) — the
 *    same non-destructive pattern `updateTeeImpl` uses in
 *    src/app/golf/actions/course-library.ts. Never a wipe-then-reinsert
 *    that could transiently empty a hole set.
 *  - Defaults to --dry-run: prints the full per-course/per-tee diff and
 *    writes NOTHING. Only `--apply` performs writes.
 *
 * THIS SCRIPT IS COMMITTED FOR REVIEW. It has not been executed against any
 * environment as part of this PR. A human must review the numbers below,
 * then decide whether/when to run --apply against a real database.
 *
 * Usage:
 *   npx tsx scripts/seed-course-library-scorecards.ts               # dry-run (default)
 *   npx tsx scripts/seed-course-library-scorecards.ts --apply       # writes
 *   npx tsx scripts/seed-course-library-scorecards.ts --course="Pinehurst No. 2" --apply
 *
 * Requires (only when --apply is actually invoked by a human):
 *   - NEXT_PUBLIC_SUPABASE_URL
 *   - SUPABASE_SERVICE_ROLE_KEY
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { normalizeName } from '../src/lib/golf/course-library';
import { buildCourseSeed, type CourseFact } from '../src/lib/golf/course-scorecard-generator';

// ─────────────────────────────────────────────────────────────────────────────
// Course facts — the "well-known public scorecard" inputs. See PR body for
// the same table with source/confidence annotations spelled out per course.
// ─────────────────────────────────────────────────────────────────────────────

const COURSE_FACTS: CourseFact[] = [
  {
    matchName: 'Bethpage Black',
    location: 'Farmingdale, NY',
    par: 71,
    championshipYards: 7468,
    championshipRating: 76.6,
    championshipSlope: 148,
    sourceNote: 'Well documented — 2002/2009 US Open + 2019 PGA Championship host. Par 71; back-tee yardage/rating/slope are the commonly published member-back-tee figures (tournament setups play a few hundred yards longer).',
  },
  {
    matchName: 'Harbour Town Golf Links',
    location: 'Hilton Head, SC',
    par: 71,
    championshipYards: 7099,
    championshipRating: 74.9,
    championshipSlope: 137,
    sourceNote: 'Well documented — annual RBC Heritage host, Pete Dye design. Notably short for a Tour venue (~7,100 yds); par 71 and approximate yardage are high confidence, rating/slope are typical published-range estimates.',
  },
  {
    matchName: 'Isleworth Golf & Country Club',
    location: 'Windermere, FL',
    par: 72,
    championshipYards: 7207,
    championshipRating: 75.6,
    championshipSlope: 143,
    sourceNote: 'Private club (Tiger Woods’ home course); par 72 is high confidence, yardage/rating/slope are realistic estimates (no public tee sheet).',
  },
  {
    matchName: 'Kiawah Island - Ocean Course',
    location: 'Kiawah Island, SC',
    par: 72,
    championshipYards: 7356,
    championshipRating: 76.9,
    championshipSlope: 155,
    sourceNote: 'Well documented — 2012 & 2021 PGA Championship host, Pete Dye design, one of the highest slope ratings in the US (published figures often cite ~155 from the regular back tees). High confidence on par/character, yardage/rating are the commonly cited back-tee figures.',
  },
  {
    matchName: 'Marsh Landing Country Club',
    location: 'Ponte Vedra Beach, FL',
    par: 71,
    championshipYards: 6900,
    championshipRating: 73.5,
    championshipSlope: 132,
    sourceNote: 'Private club near TPC Sawgrass; par 71 and moderate yardage/rating/slope are realistic estimates (no confirmed public tee sheet).',
  },
  {
    matchName: 'Pebble Beach Golf Links',
    location: 'Pebble Beach, CA',
    par: 72,
    championshipYards: 6828,
    championshipRating: 74.9,
    championshipSlope: 143,
    sourceNote: 'Iconic, extensively documented — multiple US Opens. 6,828 yds / par 72 / 74.9 rating / 143 slope is the widely published standard back-tee card (major-championship setups play longer, ~7,075+). High confidence.',
  },
  {
    matchName: 'Pinehurst No. 2',
    location: 'Pinehurst, NC',
    par: 72,
    championshipYards: 7209,
    championshipRating: 75.4,
    championshipSlope: 137,
    sourceNote: 'Well documented — Donald Ross design, multiple US Opens (2024 major setup plays ~7,588). 7,209 yds / par 72 is the commonly cited resort back-tee card. High confidence.',
  },
  {
    matchName: 'Reynolds Lake Oconee - Great Waters',
    location: 'Greensboro, GA',
    par: 72,
    championshipYards: 7048,
    championshipRating: 74.5,
    championshipSlope: 141,
    sourceNote: 'Real, well-regarded resort course (Jack Nicklaus design) at Reynolds Lake Oconee. Par 72 high confidence; yardage/rating/slope are realistic published-range estimates.',
  },
  {
    matchName: 'Sawgrass Country Club',
    location: 'Ponte Vedra Beach, FL',
    par: 72,
    championshipYards: 7100,
    championshipRating: 74.3,
    championshipSlope: 133,
    sourceNote: 'Real private club, historic pre-TPC PGA Tour stop. Par 72 moderate-high confidence; yardage/rating/slope are realistic estimates.',
  },
  {
    matchName: 'Sea Island - Seaside Course',
    location: 'St. Simons Island, GA',
    par: 70,
    championshipYards: 7005,
    championshipRating: 73.4,
    championshipSlope: 137,
    sourceNote: 'Well documented — annual RSM Classic host. Par 70 (Rees Jones/Tom Fazio redesign) is high confidence; yardage/rating/slope are realistic published-range estimates.',
  },
  {
    matchName: 'TPC Sawgrass',
    location: 'Ponte Vedra Beach, FL',
    par: 70,
    championshipYards: 6864,
    championshipRating: 72.6,
    championshipSlope: 128,
    sourceNote: 'Treated as the Dye’s Valley Course at TPC Sawgrass (the property’s second, non-Stadium 18 — the Stadium Course is the separate "TPC Sawgrass - Stadium" library entry). Par 70 / ~6,864 yds is the commonly cited Valley Course card; moderate confidence.',
  },
  {
    matchName: 'TPC Sawgrass - Stadium',
    location: 'Ponte Vedra Beach, FL',
    par: 72,
    championshipYards: 7275,
    championshipRating: 74.1,
    championshipSlope: 144,
    sourceNote: 'Well documented — THE PLAYERS Championship host (Pete Dye, island 17th). 7,275 yds from the Players tees / par 72 is high confidence (widely published); member-card rating/slope are realistic estimates (tournament setup plays much harder).',
  },
  {
    matchName: 'Whistling Straits',
    location: 'Kohler, WI',
    par: 72,
    championshipYards: 7142,
    championshipRating: 76.7,
    championshipSlope: 152,
    sourceNote: 'Well documented — 2004/2010/2015 PGA Championship + 2021 Ryder Cup (Straits Course). Par 72 high confidence; yardage is the commonly cited standard back-tee card (Ryder Cup tips play ~7,790); rating/slope reflect its reputation as one of the hardest public courses in the US.',
  },
  {
    matchName: 'World Golf Village - King & Bear',
    location: 'St. Augustine, FL',
    par: 72,
    championshipYards: 7279,
    championshipRating: 75.4,
    championshipSlope: 140,
    sourceNote: 'Real course — Arnold Palmer ("The King") / Jack Nicklaus ("The Golden Bear") collaborative design. Par 72 / yardage moderate-high confidence; rating/slope realistic estimates.',
  },
  {
    matchName: 'Golden Horseshoe gold course',
    location: 'Williamsburg, VA',
    par: 71,
    championshipYards: 6817,
    championshipRating: 73.2,
    championshipSlope: 144,
    sourceNote: 'Real — Colonial Williamsburg’s Golden Horseshoe Gold Course, Robert Trent Jones Sr. design, tight tree-lined layout. Par 71 high confidence; yardage/rating/slope realistic estimates consistent with its reputation as tough for its length.',
  },
  {
    matchName: 'Club at Savannah Habor', // sic — matches the existing (typo'd) DB row verbatim; this script never rewrites `name`
    location: 'Savannah, GA',
    par: 72,
    championshipYards: 7288,
    championshipRating: 75.2,
    championshipSlope: 130,
    sourceNote: 'Real — The Club at Savannah Harbor (Westin Savannah Harbor Golf Resort), Robert Cupp design, has hosted LPGA events. Par 72 / yardage moderate-high confidence; rating/slope realistic estimates. NOTE: the stored course name has a pre-existing typo ("Habor") — matched verbatim on purpose; renaming is out of scope for this script (see #913 PR body).',
  },
  {
    matchName: 'Forest Creek',
    location: 'Pinehurst, NC',
    par: 72,
    championshipYards: 7154,
    championshipRating: 74.9,
    championshipSlope: 143,
    sourceNote: 'Real — Forest Creek Golf Club (North Course), Tom Fazio design, highly rated Pinehurst-area private club. Par 72 high confidence; yardage/rating/slope realistic estimates.',
  },
  {
    matchName: 'Pine Lakes Jekyll Island',
    location: 'Jekyll Island, GA',
    par: 72,
    championshipYards: 6657,
    championshipRating: 71.8,
    championshipSlope: 124,
    sourceNote: 'Pine Lakes is one of the Jekyll Island Golf Club’s four 18-hole courses (with Oleander, Indian Mound, and the historic 9-hole Great Dunes). Moderate confidence — resort-style, shorter/easier than the championship-caliber entries above.',
  },
  {
    matchName: 'Poplar Grove (real)',
    location: 'Amherst, VA',
    par: 71,
    championshipYards: 6450,
    championshipRating: 71.0,
    championshipSlope: 125,
    sourceNote: 'LOW CONFIDENCE — no single confirmed public scorecard found for a facility matching this exact name + Amherst, VA. Treated as a realistic small-market Virginia public/semi-private course. Flagged for a human to verify or replace if a real source turns up.',
  },
  {
    matchName: 'The Cardinal',
    location: 'Greensboro, NC',
    par: 72,
    championshipYards: 7213,
    championshipRating: 76.0,
    championshipSlope: 147,
    sourceNote: 'Real — The Cardinal by Pete Dye, Greensboro NC. Par 72 moderate-high confidence; yardage/rating/slope realistic estimates consistent with a modern Pete Dye design (typically high slope).',
  },
];

// Courses intentionally NOT in COURSE_FACTS / touched by this script: the 4
// library-page rows that already have a real human creator (`created_by_user_id`
// is set) — "Danville Golf Club" (source=round), "Forsyth Country Club"
// (source=manual), "Pebble Beach Golf Club" (source=round, distinct from the
// library's "Pebble Beach Golf Links"), and "Statesville Country Club"
// (source=manual). Those already carry distinct, real, user-entered scorecards
// (confirmed via mcp__supabase__execute_sql) — this script's ownership guard
// would skip them even if they were listed, so they're omitted rather than
// implying they need fixing.

// ─────────────────────────────────────────────────────────────────────────────
// DB apply
// ─────────────────────────────────────────────────────────────────────────────

interface CourseDbRow {
  id: string;
  name: string;
  created_by_user_id: string | null;
}
interface TeeDbRow {
  id: string;
  tee_name: string;
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const courseFilterArg = args.find((a) => a.startsWith('--course='));
  const courseFilter = courseFilterArg ? normalizeName(courseFilterArg.slice('--course='.length)) : null;

  const facts = courseFilter
    ? COURSE_FACTS.filter((f) => normalizeName(f.matchName) === courseFilter)
    : COURSE_FACTS;

  console.log(`seed-course-library-scorecards: ${apply ? 'APPLY' : 'DRY-RUN'} — ${facts.length} course(s) targeted\n`);

  let supabase: ReturnType<typeof createClient> | null = null;
  if (apply) {
    const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim();
    const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
    if (!supabaseUrl || !serviceKey) throw new Error('Missing SUPABASE env vars for --apply');
    supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  }

  let touched = 0;
  let skippedNotFound = 0;
  let skippedUserOwned = 0;

  for (const fact of facts) {
    const seed = buildCourseSeed(fact);
    const normalized = normalizeName(seed.matchName);

    console.log(`── ${seed.matchName} (${seed.location}) — par ${seed.par}`);
    console.log(`   source: ${seed.sourceNote}`);
    for (const tee of seed.tees) {
      console.log(
        `   ${tee.teeName.padEnd(12)} par ${tee.totalPar}  ${tee.totalYards} yds  `
        + `${tee.courseRating.toFixed(1)}/${tee.slopeRating}`,
      );
    }

    if (!supabase) continue; // dry-run: report only, no DB round trip

    const { data: courseRow, error: courseErr } = await supabase
      .from('golf_courses')
      .select('id, name, created_by_user_id')
      .eq('normalized_name', normalized)
      .is('deleted_at', null)
      .maybeSingle();
    if (courseErr) throw courseErr;
    const course = courseRow as CourseDbRow | null;
    if (!course) {
      console.warn(`   SKIP — no active golf_courses row matches "${seed.matchName}"`);
      skippedNotFound++;
      continue;
    }
    if (course.created_by_user_id) {
      console.warn(`   SKIP — "${course.name}" has a real creator (${course.created_by_user_id}); not a library row, leaving untouched`);
      skippedUserOwned++;
      continue;
    }

    const { error: courseUpdateErr } = await supabase
      .from('golf_courses')
      .update({
        par: seed.par,
        course_rating: seed.championshipRating,
        slope_rating: seed.championshipSlope,
        last_edited_at: new Date().toISOString(),
      })
      .eq('id', course.id);
    if (courseUpdateErr) throw courseUpdateErr;

    const { data: teeRows, error: teeErr } = await supabase
      .from('golf_course_tees')
      .select('id, tee_name')
      .eq('course_id', course.id)
      .is('deleted_at', null);
    if (teeErr) throw teeErr;
    const teesByName = new Map(((teeRows ?? []) as TeeDbRow[]).map((t) => [t.tee_name, t.id]));

    for (const tee of seed.tees) {
      const teeId = teesByName.get(tee.teeName);
      if (!teeId) {
        console.warn(`   SKIP tee — "${course.name}" has no active "${tee.teeName}" tee to update`);
        continue;
      }

      const { error: teeUpdateErr } = await supabase
        .from('golf_course_tees')
        .update({
          total_yards: tee.totalYards,
          total_par: tee.totalPar,
          course_rating: tee.courseRating,
          slope_rating: tee.slopeRating,
          is_draft: false,
          last_edited_at: new Date().toISOString(),
        })
        .eq('id', teeId);
      if (teeUpdateErr) throw teeUpdateErr;

      // Stage-and-swap: upsert the new hole rows FIRST (never a moment with
      // fewer than 18 rows present), then prune any surplus. Mirrors
      // updateTeeImpl in src/app/golf/actions/course-library.ts.
      const holeRows = tee.holes.map((h) => ({
        tee_id: teeId, hole_number: h.hole, par: h.par, yardage: h.yards, handicap_index: h.hcp,
      }));
      const { error: upsertErr } = await supabase
        .from('golf_course_tee_holes')
        .upsert(holeRows, { onConflict: 'tee_id,hole_number' });
      if (upsertErr) throw upsertErr;

      const keep = holeRows.map((r) => r.hole_number);
      const { error: pruneErr } = await supabase
        .from('golf_course_tee_holes')
        .delete()
        .eq('tee_id', teeId)
        .not('hole_number', 'in', `(${keep.join(',')})`);
      if (pruneErr) throw pruneErr;
    }

    touched++;
    console.log('   ✓ applied');
  }

  console.log(
    `\nDone. ${apply ? `applied=${touched} ` : ''}skipped_not_found=${skippedNotFound} skipped_user_owned=${skippedUserOwned}`,
  );
  if (!apply) {
    console.log('Dry-run only — nothing was written. Re-run with --apply to write.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
