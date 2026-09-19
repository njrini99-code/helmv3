"""Catalog validation for the course factory: the checked-in catalog is
clean, and every cross-file invariant names the offending document the same
way `catalogProblems` does in catalog.ts. Network-free."""
import json
import os
import shutil
import tempfile
import unittest

from factory.catalog import load_catalog
from factory_testkit import HERE, write_catalog, write_json

REPO = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
CATALOG = os.path.join(REPO, 'course-geometry', 'catalog')


class CheckedInCatalogTests(unittest.TestCase):
    def test_checked_in_catalog_has_no_problems(self):
        catalog = load_catalog(CATALOG)
        self.assertEqual(catalog.problems, [])
        self.assertIn('cacapon', catalog.layouts)
        self.assertIn('peek-n-peak-upper', catalog.layouts)
        self.assertGreaterEqual(len(catalog.layouts), 16)

    def test_every_layout_names_a_facility_and_its_scorecards(self):
        catalog = load_catalog(CATALOG)
        for layout in catalog.layouts.values():
            self.assertIn(layout['facilityId'], catalog.facilities, layout['layoutId'])
            for profile in layout['scorecardProfiles']:
                self.assertEqual(catalog.scorecards[profile]['layoutId'], layout['layoutId'])

    def test_retained_paths_exist(self):
        catalog = load_catalog(CATALOG)
        for doc in list(catalog.facilities.values()) + list(catalog.layouts.values()):
            for key, rel in (doc.get('retained') or {}).items():
                self.assertTrue(os.path.exists(os.path.join(REPO, rel)), f'{doc.get("facilityId") or doc.get("layoutId")}.retained.{key}: {rel}')

    def test_intake_layouts_start_at_c0_without_routes_or_geometry(self):
        catalog = load_catalog(CATALOG)
        for layout_id, layout in catalog.layouts.items():
            if layout_id in ('cacapon', 'peek-n-peak-upper'):
                continue
            self.assertEqual(layout['capabilityTier'], 'C0', layout_id)
            self.assertIsNone(layout['routeWayIds'], layout_id)
            self.assertIsNone(layout['geometry'], layout_id)


class InvariantTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix='factory-catalog-')
        self.root = os.path.join(self.tmp, 'catalog')
        write_catalog(self.root)

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def edit(self, sub, name, change):
        path = os.path.join(self.root, sub, f'{name}.json')
        with open(path, encoding='utf-8') as f:
            doc = json.load(f)
        change(doc)
        write_json(path, doc)

    def test_synthetic_catalog_is_clean(self):
        self.assertEqual(load_catalog(self.root).problems, [])

    def test_unknown_facility(self):
        self.edit('layouts', 'synthetic-a', lambda d: d.update(facilityId='elsewhere'))
        self.assertIn('layout synthetic-a: unknown facility elsewhere', load_catalog(self.root).problems)

    def test_site_must_be_pinned_by_the_facility(self):
        self.edit('layouts', 'synthetic-a', lambda d: d.update(siteIds=['osm-way-42']))
        self.assertIn('layout synthetic-a: site osm-way-42 is not pinned by facility synthetic', load_catalog(self.root).problems)

    def test_scorecard_hole_count_matches_the_layout(self):
        self.edit('scorecards', 'synthetic-a-blue', lambda d: d['holes'].pop())
        self.assertIn('scorecard synthetic-a-blue has 17 holes, layout synthetic-a plays 18', load_catalog(self.root).problems)

    def test_scorecard_belongs_to_the_layout_that_lists_it(self):
        self.edit('layouts', 'synthetic-a', lambda d: d.update(scorecardProfiles=['synthetic-b-blue']))
        self.assertIn('scorecard synthetic-b-blue belongs to synthetic-b, listed by synthetic-a', load_catalog(self.root).problems)

    def test_file_name_must_match_the_declared_id(self):
        self.edit('facilities', 'synthetic', lambda d: d.update(facilityId='other'))
        problems = load_catalog(self.root).problems
        self.assertIn('facilities/synthetic.json declares facilityId other', problems)
        self.assertIn('layout synthetic-a: unknown facility synthetic', problems)

    def test_unknown_keys_and_bad_retained_are_reported_per_file(self):
        self.edit('facilities', 'synthetic', lambda d: d.update(retained={'osm': 'x', 'bogus': 'y'}, extraKey=1))
        problems = load_catalog(self.root).problems
        self.assertTrue(any(p.startswith('facilities/synthetic.json: retained:') for p in problems), problems)
        self.assertIn('facilities/synthetic.json: unknown keys: extraKey', problems)

    def test_layout_par_and_yards_ranges(self):
        self.edit('scorecards', 'synthetic-a-blue', lambda d: d['holes'][0].update(yards=999))
        self.assertTrue(any('synthetic-a-blue' in p for p in load_catalog(self.root).problems))


if __name__ == '__main__':
    unittest.main()
