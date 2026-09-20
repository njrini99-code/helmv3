import importlib.util
import os
import unittest

HERE = os.path.dirname(__file__)
SPEC = importlib.util.spec_from_file_location('team_nearby', os.path.join(HERE, 'build-team-nearby-course-cohort.py'))
team_nearby = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(team_nearby)


class TeamNearbyCourseCohortTests(unittest.TestCase):
    def test_selects_courses_near_active_school_and_keeps_coordinate_truth(self):
        snapshot = {
            'teams': [{'id': 'team-a', 'name': 'Alpha Golf', 'schoolName': 'Alpha University', 'city': 'Town', 'state': 'NC'}],
            'courses': [
                {'id': 'near', 'name': 'Near Club', 'city': 'Town', 'state': 'NC', 'address': '1 Fairway Lane'},
                {'id': 'far', 'name': 'Far Club', 'city': 'Elsewhere', 'state': 'NC'},
            ],
        }
        cache = {
            'school:team-a': {'latitude': 35.0, 'longitude': -80.0, 'truthClass': 'derived_school_geocode'},
            'course:near': {'latitude': 35.1, 'longitude': -80.0, 'truthClass': 'derived_address_geocode'},
            'course:far': {'latitude': 39.0, 'longitude': -80.0, 'truthClass': 'estimated_city_anchor'},
        }
        schools, courses, missing = team_nearby.build(snapshot, cache, 20)
        self.assertEqual(len(schools), 1)
        self.assertEqual([course['id'] for course in courses], ['near'])
        self.assertEqual(courses[0]['selection']['kind'], 'active_team_school_proximity')
        self.assertEqual(courses[0]['selection']['courseCoordinateTruthClass'], 'derived_address_geocode')
        self.assertEqual(courses[0]['completed_rounds'], 1)
        self.assertEqual(missing, [])

    def test_city_only_coordinate_is_never_reported_as_measured(self):
        snapshot = {'teams': [{'id': 'team-a', 'name': 'Alpha', 'schoolName': 'Alpha', 'city': 'Town', 'state': 'NC'}],
                    'courses': [{'id': 'near', 'name': 'Near', 'city': 'Town', 'state': 'NC'}]}
        cache = {
            'school:team-a': {'latitude': 35.0, 'longitude': -80.0, 'truthClass': 'derived_school_geocode'},
            'course:near': {'latitude': 35.0, 'longitude': -80.0, 'truthClass': 'estimated_city_anchor'},
        }
        _schools, courses, _missing = team_nearby.build(snapshot, cache, 5)
        self.assertEqual(courses[0]['selection']['courseCoordinateTruthClass'], 'estimated_city_anchor')

    def test_missing_name_geocode_falls_back_to_city_with_weaker_truth_class(self):
        original = team_nearby.request
        try:
            answers = [None, {'latitude': 35.0, 'longitude': -80.0, 'displayName': 'Town, North Carolina'}]
            team_nearby.request = lambda _query: answers.pop(0)
            cache = {}
            value = team_nearby.coordinate(cache, 'course:near', [('Near Club, Town, NC, USA', 'derived_name_geocode'), ('Town, NC, USA', 'estimated_city_anchor')])
            self.assertEqual(value['truthClass'], 'estimated_city_anchor')
            self.assertEqual(len(value['attempts']), 2)
            self.assertTrue(value['attempts'][0]['missing'])
        finally:
            team_nearby.request = original


if __name__ == '__main__':
    unittest.main()
