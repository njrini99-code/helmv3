"""Unit tests for `intake-played` (factory/intake_played.py): the played-course
cohort, which rows reach the facility resolver, and the resolve hook."""
import unittest
from types import SimpleNamespace

from factory.intake_played import cohort_from_played, resolution_plan, run

PLAYED = {'queriedAt': '2026-09-23T03:00:00Z', 'courses': [
    {'dbCourseId': 'bound', 'name': 'Bound Course', 'city': 'A', 'state': 'NC', 'rounds': 40, 'layouts': ['bound-course']},
    {'dbCourseId': 'polygon', 'name': 'Polygon Course', 'city': 'B', 'state': 'NC', 'rounds': 9, 'layouts': []},
    {'dbCourseId': 'stale', 'name': 'Stale Anchor', 'city': 'C', 'state': 'NC', 'rounds': 8, 'layouts': []},
    {'dbCourseId': 'node', 'name': 'Node Anchor', 'city': 'D', 'state': 'NC', 'rounds': 7, 'layouts': []},
    {'dbCourseId': 'absent', 'name': 'Not Audited', 'city': 'E', 'state': 'NC', 'rounds': 6, 'layouts': []},
    {'dbCourseId': 'canada', 'name': 'Oviinbyrd Golf Club', 'city': 'F', 'state': 'ON', 'rounds': 5, 'layouts': []},
]}
COVERAGE = {'facilities': [
    {'libraryIds': ['polygon'], 'osmCourse': {'type': 'way', 'id': 1}},
    {'libraryIds': ['stale'], 'anchor': {'type': 'relation', 'id': 2}},
    {'libraryIds': ['node'], 'anchor': {'type': 'node', 'id': 3}},
]}
CATALOG = SimpleNamespace(layouts={'bound-course': {'layoutId': 'bound-course', 'externalBindings': {'golfCourseIds': ['bound']}}})


class CohortTests(unittest.TestCase):
    def test_rows_map_rounds_and_carry_queried_at(self):
        cohort = cohort_from_played(PLAYED)
        # queriedAt becomes each imported scorecard's retrievedAt; without it
        # every profile is SCORECARD_INVALID.
        self.assertEqual(cohort['queriedAt'], '2026-09-23T03:00:00Z')
        self.assertEqual(cohort['courses'][1], {'id': 'polygon', 'name': 'Polygon Course', 'city': 'B', 'state': 'NC', 'completed_rounds': 9})

    def test_out_of_scope_course_is_dropped(self):
        self.assertNotIn('canada', [c['id'] for c in cohort_from_played(PLAYED)['courses']])


class ResolutionPlanTests(unittest.TestCase):
    def test_only_unbound_unusable_rows_reach_the_resolver(self):
        rows, reresolve = resolution_plan(cohort_from_played(PLAYED), COVERAGE, CATALOG)
        self.assertEqual([r['id'] for r in rows], ['stale', 'node', 'absent'])
        # merge_played_courses would skip a way/relation anchor as resolved;
        # an unvetted one has to be forced.
        self.assertEqual(reresolve, {'stale'})

    def test_vetted_non_administrative_anchor_is_usable(self):
        coverage = {'facilities': [{'libraryIds': ['stale'], 'anchor': {'type': 'relation', 'id': 2, 'realTags': {'leisure': 'park'}}}]}
        rows, _ = resolution_plan(cohort_from_played(PLAYED), coverage, CATALOG)
        self.assertNotIn('stale', [r['id'] for r in rows])

    def test_administrative_anchor_is_not_usable(self):
        coverage = {'facilities': [{'libraryIds': ['stale'], 'anchor': {'type': 'relation', 'id': 2, 'realTags': {'boundary': 'census'}}}]}
        rows, reresolve = resolution_plan(cohort_from_played(PLAYED), coverage, CATALOG)
        self.assertIn('stale', [r['id'] for r in rows])
        self.assertIn('stale', reresolve)


class RunTests(unittest.TestCase):
    def test_resolve_hook_receives_plan_and_its_coverage_is_used(self):
        calls = []

        def resolve(rows, coverage, reresolve_ids):
            calls.append(([r['id'] for r in rows], reresolve_ids))
            return {'facilities': coverage['facilities'] + [{'libraryIds': ['absent'], 'name': 'Not Audited'}]}

        merged, resolved_rows, _ = run(PLAYED, COVERAGE, {'scorecards': []}, SimpleNamespace(layouts=CATALOG.layouts, facilities={}), resolve=resolve)
        self.assertEqual(calls, [(['stale', 'node', 'absent'], {'stale'})])
        self.assertIn('absent', [lid for f in merged['facilities'] for lid in f['libraryIds']])
        self.assertEqual(len(resolved_rows), 3)

    def test_no_resolver_reports_on_current_coverage(self):
        merged, _, rows = run(PLAYED, COVERAGE, {'scorecards': []}, SimpleNamespace(layouts=CATALOG.layouts, facilities={}))
        self.assertIs(merged, COVERAGE)
        by_id = {r['libraryId']: r for r in rows}
        self.assertEqual(by_id['bound']['status'], 'catalogued')
        self.assertEqual(by_id['absent']['status'], 'skipped')


if __name__ == '__main__':
    unittest.main()
