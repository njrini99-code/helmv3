"""Complete-library selection, identity holds, and immutable C0 writes."""
import copy
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from factory.catalog import Catalog, load_catalog
from factory.intake import write_entries
from factory.library_intake import build_library_dossier

A = '11111111-1111-4111-8111-aaaaaaaaaaaa'
B = '22222222-2222-4222-8222-bbbbbbbbbbbb'
T1 = '33333333-3333-4333-8333-cccccccccccc'
T2 = '44444444-4444-4444-8444-dddddddddddd'


def fixture():
    course = {'id': A, 'name': 'Alpha Country Club', 'state': 'NC', 'country': None}
    cards = [{'course_id': A, 'tee_id': tee, 'tee_name': name,
              'holes': [{'number': n, 'par': 4, 'yardage': yards} for n in range(1, 19)]}
             for tee, name, yards in ((T1, 'Blue', 400), (T2, 'White', 350))]
    snapshot = {'schema': 'golfhelm-team-course-library-snapshot-v1', 'queriedAt': '2026-09-21T00:00:00Z',
                'completeness': {'method': 'exact-count-stable-id-pagination', 'courses': 1, 'tees': 2},
                'courses': [course], 'scorecards': cards}
    coverage = {'generatedAt': '2026-09-18T00:00:00Z', 'facilities': [
        {'name': course['name'], 'state': 'NC', 'libraryIds': [A], 'libraryNames': [course['name']],
         'osmCourse': {'type': 'way', 'id': 111, 'name': course['name'], 'center': [36.1, -79.9]},
         'holes': 18, 'featureBasis': 'course_area'}]}
    return snapshot, coverage


class LibraryIntakeTests(unittest.TestCase):
    def test_no_round_count_still_selects_all_tees_and_c0_only(self):
        snapshot, coverage = fixture()
        report = build_library_dossier(snapshot, coverage, Catalog('unused'))
        self.assertEqual(report['summary']['readyToWrite'], 1)
        self.assertEqual(report['summary']['newCatalogProfiles'], 2)
        docs = report['rows'][0]['docs']
        layout = docs['layout']
        self.assertEqual(layout['externalBindings']['golfCourseIds'], [A])
        self.assertEqual(layout['capabilityTier'], 'C0')
        for field in ('routeWayIds', 'bboxWgs84', 'geometry'):
            self.assertIsNone(layout[field])
        self.assertEqual({p['libraryBinding']['teeId'] for p in docs['scorecards']}, {T1, T2})
        self.assertEqual(docs['facility']['country'], 'US')
        self.assertEqual(docs['facility']['providerPolicy']['imagery'], ['nc_onemap_2024_2027_analysis', 'usgs_naip_plus'])

    def test_alias_group_is_held_without_merging_course_ids_or_losing_profiles(self):
        snapshot, coverage = fixture()
        snapshot['courses'].append({'id': B, 'name': 'Alpha CC', 'state': 'NC'})
        snapshot['completeness']['courses'] = 2
        coverage['facilities'][0]['libraryIds'].append(B)
        report = build_library_dossier(snapshot, coverage, Catalog('unused'))
        self.assertEqual(report['summary']['held'], 2)
        self.assertEqual(report['summary']['validSourceProfiles'], 2)
        self.assertEqual({row['libraryId'] for row in report['rows']}, {A, B})
        for row in report['rows']:
            self.assertNotIn('docs', row)
            self.assertIn('ALIAS_OR_SIBLING_REVIEW', row['reason'])

    def test_non_us_course_cannot_receive_us_provider_documents(self):
        snapshot, coverage = fixture()
        snapshot['courses'][0].update(state='ON', country='Canada')
        report = build_library_dossier(snapshot, coverage, Catalog('unused'))
        self.assertEqual(report['rows'][0]['status'], 'held')
        self.assertIn('COUNTRY_PROVIDER_UNSUPPORTED', report['rows'][0]['reason'])
        self.assertNotIn('docs', report['rows'][0])

    def test_same_facility_slug_at_different_pin_is_held(self):
        snapshot, coverage = fixture()
        catalog = Catalog('unused')
        catalog.facilities['alpha-country-club'] = {'facilityId': 'alpha-country-club',
                                                  'aoi': {'id': 'way/222'}, 'sourcePins': {'osm': ['way/222']}}
        report = build_library_dossier(snapshot, coverage, catalog)
        self.assertIn('FACILITY_SLUG_COLLISION', report['rows'][0]['reason'])

    def test_multicourse_site_and_generic_subcourse_are_held(self):
        for holes, name, expected in ((36, 'Alpha Country Club', 'MULTI_LAYOUT_SOURCE_REVIEW'),
                                      (18, 'South Course', 'SUBCOURSE_IDENTITY_UNRESOLVED')):
            with self.subTest(expected=expected):
                snapshot, coverage = fixture()
                coverage['facilities'][0]['holes'] = holes
                coverage['facilities'][0]['osmCourse']['name'] = name
                report = build_library_dossier(snapshot, coverage, Catalog('unused'))
                self.assertIn(expected, report['rows'][0]['reason'])

    def test_snapshot_count_mismatch_and_conflicting_tee_ownership_fail_closed(self):
        snapshot, coverage = fixture()
        snapshot['completeness']['courses'] = 2
        with self.assertRaisesRegex(ValueError, 'LIBRARY_SNAPSHOT_INCOMPLETE'):
            build_library_dossier(snapshot, coverage, Catalog('unused'))
        snapshot['courses'].append({'id': B, 'name': 'Beta', 'state': 'NC'})
        snapshot['scorecards'].append({**snapshot['scorecards'][0], 'course_id': B})
        with self.assertRaisesRegex(ValueError, 'TEE_COURSE_CONFLICT'):
            build_library_dossier(snapshot, coverage, Catalog('unused'))

    def test_retained_discovery_does_not_replace_missing_polygon(self):
        snapshot, coverage = fixture()
        coverage['facilities'][0].pop('osmCourse')
        report = build_library_dossier(snapshot, coverage, Catalog('unused'),
                                       [{'courseId': A, 'bboxWgs84': [-80, 35, -79, 36], 'identityEvidence': 'nearby city'}])
        row = report['rows'][0]
        self.assertIn('SOURCE_AOI_UNRESOLVED', row['reason'])
        self.assertEqual(row['evidence']['retainedDiscovery']['courseId'], A)

    def test_write_is_valid_idempotent_and_does_not_mutate_inputs(self):
        snapshot, coverage = fixture()
        original = copy.deepcopy((snapshot, coverage))
        with tempfile.TemporaryDirectory() as root:
            report = build_library_dossier(snapshot, coverage, load_catalog(root))
            written = write_entries(root, report['rows'])
            self.assertEqual(len(written), 4)
            before = {path: Path(path).read_bytes() for path in written}
            catalog = load_catalog(root)
            self.assertEqual(catalog.problems, [])
            second = build_library_dossier(snapshot, coverage, catalog)
            self.assertEqual(second['summary']['catalogued'], 1)
            self.assertEqual(write_entries(root, second['rows']), [])
            self.assertEqual(before, {path: Path(path).read_bytes() for path in written})
        self.assertEqual(original, (snapshot, coverage))

    def test_cli_stale_plan_hash_does_not_write_catalog(self):
        snapshot, coverage = fixture()
        with tempfile.TemporaryDirectory() as root:
            root = Path(root)
            (root / 'snapshot.json').write_text(json.dumps(snapshot))
            (root / 'coverage.json').write_text(json.dumps(coverage))
            result = subprocess.run([sys.executable, str(Path(__file__).with_name('build-library-intake-dossier.py')),
                                     '--snapshot', str(root / 'snapshot.json'), '--coverage', str(root / 'coverage.json'),
                                     '--catalog', str(root / 'catalog'), '--out', str(root / 'report.json'),
                                     '--write', '--expect-plan-hash', 'stale'], capture_output=True, text=True, check=False)
            self.assertEqual(result.returncode, 2)
            self.assertIn('inputs/catalog changed', result.stderr)
            self.assertFalse((root / 'catalog').exists())
            self.assertFalse((root / 'report.json').exists())


if __name__ == '__main__':
    unittest.main()
