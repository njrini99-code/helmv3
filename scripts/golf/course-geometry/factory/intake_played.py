"""`intake-played`: catalog the played courses the batch skips (plan W4,
"intake by name for the uncatalogued courses").

`intake` reads a fixed usage-cohort snapshot (2026-09-13) that predates
several played courses, and a library coverage audit whose rows for a few
facilities are unusable (no polygon, or a way/relation anchor written before
`facility_resolver` began vetting anchor tags). This driver closes both gaps
without new resolution or intake logic of its own:

  1. The cohort comes from `played-courses.json` (the same production read
     `ship --all-played` uses), so every played course is considered.
  2. `facility_resolver.merge_played_courses` resolves only the courses whose
     coverage row is missing or unusable -- a stale-anchor row is re-resolved
     rather than trusted -- and the merged coverage is written to its own
     file, never over the audit's.
  3. `intake.build_entries`/`write_entries` do the rest, unchanged: C0
     manifests only, never overwriting a catalogued layout, and a course that
     still cannot be resolved is reported with its reason.
"""
import json
import os

from .intake import build_entries

OUT_OF_SCOPE = {'Oviinbyrd Golf Club'}


def cohort_from_played(played, out_of_scope=OUT_OF_SCOPE):
    """`played-courses.json` rows as `build_entries` cohort rows. `queriedAt`
    carries through: `import_profiles` stamps it as each scorecard's
    `retrievedAt`, and a profile without one is SCORECARD_INVALID."""
    return {'queriedAt': played.get('queriedAt') or '', 'courses': [{'id': c['dbCourseId'], 'name': c['name'], 'city': c.get('city'), 'state': c.get('state'),
                         'completed_rounds': c.get('rounds') or 0}
                        for c in played.get('courses', []) if c['name'] not in out_of_scope]}


def _usable(facility):
    """Mirrors what `build_entries` will accept as an AOI source: a pin, an
    OSM course polygon, or a way/relation anchor whose real tags were
    fetched (`realTags`) and are not an administrative boundary."""
    if not facility:
        return False
    if facility.get('osmPin') or facility.get('osmCourse'):
        return True
    anchor = facility.get('anchor') or {}
    tags = anchor.get('realTags')
    return anchor.get('type') in ('way', 'relation') and tags is not None and not ({'boundary', 'place', 'admin_level'} & set(tags))


def resolution_plan(cohort, coverage, catalog):
    """Which cohort rows need the resolver: not already bound to a catalog
    layout and without a usable coverage row. Returns `(rows, reresolve_ids)`
    -- `reresolve_ids` are the ones whose existing row merely *looks*
    resolved to `merge_played_courses` (a stale anchor) and must be forced."""
    bound = {cid for layout in catalog.layouts.values() for cid in (layout.get('externalBindings') or {}).get('golfCourseIds', [])}
    by_id = {lid: f for f in coverage.get('facilities', []) for lid in f.get('libraryIds', [])}
    rows, reresolve = [], set()
    for course in cohort['courses']:
        if course['id'] in bound or _usable(by_id.get(course['id'])):
            continue
        rows.append({'id': course['id'], 'name': course['name'], 'city': course.get('city'), 'state': course.get('state')})
        existing = by_id.get(course['id'])
        if existing and (existing.get('anchor') or {}).get('type') in ('way', 'relation'):
            reresolve.add(course['id'])
    return rows, reresolve


def run(played, coverage, scorecards, catalog, *, resolve=None, min_rounds=1):
    """Pure orchestration; `resolve(rows, coverage, reresolve_ids)` returns a
    merged coverage document (production: `merge_played_courses`). With
    `resolve=None` nothing is resolved -- a report on current evidence."""
    cohort = cohort_from_played(played)
    rows_to_resolve, reresolve = resolution_plan(cohort, coverage, catalog)
    merged = resolve(rows_to_resolve, coverage, reresolve) if (resolve and rows_to_resolve) else coverage
    return merged, rows_to_resolve, build_entries(cohort, merged, scorecards, catalog, min_rounds)


def cmd_intake_played(session, args, out):
    from .facility_resolver import ResponseCache, merge_played_courses
    from .intake import render, write_entries

    def path(p):
        return p if os.path.isabs(p) else os.path.join(session.repo_root, p)

    def read(p):
        if not os.path.isfile(path(p)):
            raise SystemExit(f'missing input {path(p)}')
        with open(path(p), encoding='utf-8') as f:
            return json.load(f)

    resolve = None
    if not args.no_resolve:
        cache = ResponseCache(path(args.cache))

        def resolve(rows, coverage, reresolve_ids):
            return merge_played_courses(rows, coverage, sleep=args.sleep, cache=cache, reresolve_library_ids=reresolve_ids)

    merged, resolved_rows, rows = run(read(args.played), read(args.coverage), read(args.scorecards), session.catalog,
                                      resolve=resolve, min_rounds=args.min_rounds)
    if merged is not None and resolved_rows and not args.no_resolve:
        os.makedirs(os.path.dirname(path(args.coverage_out)), exist_ok=True)
        with open(path(args.coverage_out), 'w', encoding='utf-8') as f:
            json.dump(merged, f, indent=1)
            f.write('\n')
    written = write_entries(session.catalog_root, rows) if args.write else []
    if args.json:
        out.write(json.dumps({'resolverRows': [r['name'] for r in resolved_rows], 'resolverRan': not args.no_resolve, 'coverageOut': args.coverage_out if resolved_rows and not args.no_resolve else None,
                              'rows': [{k: v for k, v in r.items() if k != 'docs'} for r in rows],
                              'written': [session.ctx.relpath(w) for w in written]}, indent=1) + '\n')
    else:
        verb = 'needs the resolver (not run: --no-resolve)' if args.no_resolve else 'resolver ran for'
        out.write(f'{verb} {len(resolved_rows)} course(s)' + (f': {", ".join(r["name"] for r in resolved_rows)}' if resolved_rows else '') + '\n')
        out.write(render([r for r in rows if r['status'] != 'catalogued']) + '\n')
        if args.write:
            out.write(f'wrote {len(written)} manifest(s)\n' + ''.join(f'  {session.ctx.relpath(w)}\n' for w in written))
        elif any(r['status'] == 'ready_to_write' for r in rows):
            out.write('re-run with --write to add the ready_to_write rows to the catalog\n')
    return 0
