#!/usr/bin/env tsx
/**
 * Read the live GolfHelm school/team and course-library rows into a disposable
 * factory input. This is deliberately a read-only export: geometry intake
 * still performs its own public-source discovery and never writes Supabase.
 *
 * Usage:
 *   DOTENV_CONFIG_PATH=.env.local node_modules/.bin/tsx -r dotenv/config \
 *     scripts/golf/course-geometry/export-team-course-library-snapshot.mts \
 *     --out output/course-geometry/team-proximity/library-snapshot.json
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import nextEnv from '@next/env';
import { completeScorecard, readAllRows } from './library-snapshot.mts';

const { loadEnvConfig } = nextEnv;

type Row = Record<string, unknown>;

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function fail(message: string): never {
  console.error(`team-course-snapshot: ${message}`);
  process.exit(1);
}

function nonEmpty(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

async function main(): Promise<void> {
  const out = arg('--out');
  if (!out) fail('pass --out <path>');

  // A direct tsx invocation does not load Next's environment automatically.
  loadEnvConfig(process.cwd());
  const url = nonEmpty(process.env.NEXT_PUBLIC_SUPABASE_URL) ?? nonEmpty(process.env.SUPABASE_URL);
  const serviceRole = nonEmpty(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!url || !serviceRole) fail('NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  const supabase = createClient(url, serviceRole, { auth: { persistSession: false, autoRefreshToken: false } });

  const [teamRows, organizationRows, courseRows, teeRows, teeHoleRows] = await Promise.all([
    readAllRows('golf_teams', (from, to) => supabase.from('golf_teams').select('id,name,organization_id,season_active', { count: 'exact' }).eq('season_active', true).order('id').range(from, to)),
    readAllRows('organizations', (from, to) => supabase.from('organizations').select('id,name,location_city,location_state,division,conference', { count: 'exact' }).order('id').range(from, to)),
    readAllRows('golf_courses', (from, to) => supabase.from('golf_courses').select('id,name,city,state,country,address,deleted_at', { count: 'exact' }).is('deleted_at', null).order('id').range(from, to)),
    readAllRows('golf_course_tees', (from, to) => supabase.from('golf_course_tees').select('id,course_id,tee_name,course_rating,slope_rating,holes_count,is_draft,deleted_at,source', { count: 'exact' }).is('deleted_at', null).eq('is_draft', false).order('id').range(from, to)),
    readAllRows('golf_course_tee_holes', (from, to) => supabase.from('golf_course_tee_holes').select('id,tee_id,hole_number,par,yardage,handicap_index', { count: 'exact' }).order('id').range(from, to)),
  ]);

  const organizations = new Map((organizationRows as Row[]).map(row => [String(row.id), row]));
  const teams = (teamRows as Row[])
    .map(team => {
      const organization = organizations.get(String(team.organization_id));
      return {
        id: String(team.id),
        name: String(team.name),
        organizationId: String(team.organization_id),
        schoolName: nonEmpty(organization?.name) ?? String(team.name),
        city: nonEmpty(organization?.location_city),
        state: nonEmpty(organization?.location_state),
        division: nonEmpty(organization?.division),
        conference: nonEmpty(organization?.conference),
      };
    })
    .filter(team => team.city && team.state)
    .sort((a, b) => a.schoolName.localeCompare(b.schoolName) || a.name.localeCompare(b.name));

  const holesByTee = new Map<string, Row[]>();
  for (const hole of teeHoleRows as Row[]) {
    const key = String(hole.tee_id);
    holesByTee.set(key, [...(holesByTee.get(key) ?? []), hole]);
  }
  const scorecards = (teeRows as Row[]).flatMap(tee => {
    const holes = (holesByTee.get(String(tee.id)) ?? [])
      .sort((a, b) => Number(a.hole_number) - Number(b.hole_number))
      .map(hole => ({ number: Number(hole.hole_number), par: Number(hole.par), yardage: Number(hole.yardage),
        ...(hole.handicap_index == null ? {} : { handicap: Number(hole.handicap_index) }) }));
    // Incomplete tee cards must remain absent; the factory will report the
    // scorecard blocker rather than create arbitrary hole data.
    return completeScorecard(holes, Number(tee.holes_count))
      ? [{ course_id: String(tee.course_id), tee_id: String(tee.id), tee_name: String(tee.tee_name),
        course_rating: tee.course_rating, slope_rating: tee.slope_rating, source: tee.source, holes }]
      : [];
  });
  const courses = (courseRows as Row[]).map(course => ({
    id: String(course.id), name: String(course.name), city: nonEmpty(course.city), state: nonEmpty(course.state),
    country: nonEmpty(course.country), address: nonEmpty(course.address),
  })).sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));

  const snapshot = {
    schema: 'golfhelm-team-course-library-snapshot-v1',
    queriedAt: new Date().toISOString(),
    source: { provider: 'helm_supabase_read_only', tables: ['golf_teams', 'organizations', 'golf_courses', 'golf_course_tees', 'golf_course_tee_holes'] },
    completeness: { method: 'exact-count-stable-id-pagination', teams: teamRows.length, organizations: organizationRows.length,
      courses: courseRows.length, tees: teeRows.length, teeHoles: teeHoleRows.length },
    teams, courses, scorecards,
  };
  const target = resolve(out);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
  console.log(`wrote ${target}: ${teams.length} active teams, ${courses.length} active courses, ${scorecards.length} complete tee scorecards`);
}

main().catch(error => fail(error instanceof Error ? error.message : String(error)));
