"""`factory.intake.build_entries`'s three behavior changes made resolving W4's
uncatalogued played courses (Bryan Park, Forest Oaks, Forest Creek, ...):

  1. An `anchor` (a named OSM element with no enclosing golf_course polygon)
     may become the facility AOI, but only a `way`/`relation` anchor whose
     *real* tags (`facility_resolver.resolve_facility`'s `realTags`, fetched
     with one cached Overpass call before the anchor is ever trusted) have
     been checked and are not an administrative/statistical boundary. A
     `node` anchor, or a `way`/`relation` anchor with no `realTags` key at
     all (written before that check existed), is never used as an AOI.
  2. `providerPolicy.imagery` comes from `source_registry.imagery_policy`,
     not the stale `'naip_current'` placeholder (which names no real
     provider).
  3. A bare directional sub-course OSM name ("South Course") is never used
     as the facility name/id -- it falls back to the coverage/library name,
     so two different facilities' "South Course" polygons never collide on
     one slug (Forest Creek's own failure mode).
"""
import unittest

from factory.catalog import Catalog
from factory.intake import build_entries
from factory.source_registry import imagery_policy

A = '11111111-1111-4111-8111-aaaaaaaaaaaa'


def cohort_for(course_id, name, state='NC'):
    return {'queriedAt': '2026-09-21T00:00:00Z',
            'courses': [{'id': course_id, 'name': name, 'state': state, 'completed_rounds': 3}]}


def run(course_id, name, facility, state='NC'):
    cohort = cohort_for(course_id, name, state)
    coverage = {'generatedAt': '2026-09-18T00:00:00Z',
                'facilities': [{'name': facility.get('facilityName', name), 'state': state,
                                 'libraryIds': [course_id], 'libraryNames': [name], **facility}]}
    scorecards = {'scorecards': []}
    existing = Catalog('unused')
    rows = build_entries(cohort, coverage, scorecards, existing)
    assert len(rows) == 1, rows
    return rows[0]


class AnchorGateTests(unittest.TestCase):
    def test_a_verified_untagged_anchor_is_usable(self):
        row = run(A, 'Bryan Park Players', {
            'anchor': {'type': 'way', 'id': 555, 'name': 'Bryan Park', 'center': [36.1, -79.8], 'realTags': {}},
        })
        self.assertEqual(row['status'], 'ready_to_write')
        self.assertEqual(row['osm'], 'way/555')
        self.assertEqual(row['docs']['facility']['aoi'], {'kind': 'osm', 'id': 'way/555', 'marginM': 300})

    def test_a_verified_park_tagged_anchor_is_usable(self):
        row = run(A, 'Bryan Park Champs', {
            'anchor': {'type': 'way', 'id': 556, 'name': 'Bryan Park', 'center': [36.1, -79.8],
                       'realTags': {'leisure': 'park', 'name': 'Bryan Park'}},
        })
        self.assertEqual(row['status'], 'ready_to_write')
        self.assertEqual(row['osm'], 'way/556')

    def test_a_node_anchor_is_never_used_as_an_aoi(self):
        row = run(A, 'Magnolia Greens (Cam 9)', {
            'anchor': {'type': 'node', 'id': 99, 'name': 'Comfort Suites', 'center': [34.2, -78.0], 'realTags': {}},
        })
        self.assertEqual(row['status'], 'skipped')
        self.assertIn('human pin is needed', row['reason'])

    def test_an_administrative_boundary_anchor_is_rejected_with_a_specific_reason(self):
        row = run(A, 'Forest Oaks', {
            'anchor': {'type': 'relation', 'id': 180400, 'name': 'Forest Oaks', 'center': [35.99, -79.71],
                       'realTags': {'boundary': 'statistical', 'border_type': 'census_designated_place'}},
        })
        self.assertEqual(row['status'], 'skipped')
        self.assertIn('administrative', row['reason'])

    def test_a_legacy_anchor_with_no_realtags_is_held_not_trusted(self):
        # Written before `resolve_facility` fetched and checked real tags at
        # all -- exactly Bryan Park's two original coverage.json rows. It
        # must not be silently accepted just because `type` looks right.
        row = run(A, 'Bryan Park Players', {
            'anchor': {'type': 'way', 'id': 555, 'name': 'Bryan Park', 'center': [36.1, -79.8]},
        })
        self.assertEqual(row['status'], 'skipped')
        self.assertIn('predates tag vetting', row['reason'])


class ImageryPolicyTests(unittest.TestCase):
    def test_facility_doc_uses_the_real_regional_imagery_policy(self):
        row = run(A, 'Forsyth Country Club', {
            'osmCourse': {'type': 'way', 'id': 111, 'name': 'Forsyth Country Club', 'center': [36.1, -80.2]},
        }, state='NC')
        imagery = row['docs']['facility']['providerPolicy']['imagery']
        self.assertEqual(imagery, imagery_policy('NC'))
        self.assertNotEqual(imagery, ['naip_current'])


class GenericSubcourseNamingTests(unittest.TestCase):
    def test_a_bare_directional_osm_name_falls_back_to_the_library_name(self):
        row = run(A, 'Forest Creek (South)', {
            'facilityName': 'Forest Creek',
            'osmCourse': {'type': 'way', 'id': 222, 'name': 'South Course', 'center': [35.2, -79.4]},
        })
        self.assertEqual(row['status'], 'ready_to_write')
        self.assertEqual(row['facilityId'], 'forest-creek')
        self.assertEqual(row['docs']['facility']['name'], 'Forest Creek')

    def test_a_real_named_osm_course_is_still_used_as_the_facility_name(self):
        row = run(A, 'Forsyth Country Club', {
            'osmCourse': {'type': 'way', 'id': 333, 'name': 'Forsyth Country Club', 'center': [36.1, -80.2]},
        })
        self.assertEqual(row['status'], 'ready_to_write')
        self.assertEqual(row['facilityId'], 'forsyth-country-club')


if __name__ == '__main__':
    unittest.main()
