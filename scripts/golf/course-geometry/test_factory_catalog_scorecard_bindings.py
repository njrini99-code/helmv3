"""Scorecard bindings stay explicit; absent source evidence never becomes a card."""
import os
import unittest

from factory.catalog import load_catalog


HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
CATALOG = os.path.join(REPO, 'course-geometry', 'catalog')


class CatalogScorecardBindingTests(unittest.TestCase):
    def setUp(self):
        self.catalog = load_catalog(CATALOG)

    def test_blue_ridge_official_card_is_the_explicit_reference(self):
        layout = self.catalog.layouts['blue-ridge-shadows-gc']
        profile_id = 'blue-ridge-shadows-official-black'
        self.assertEqual(layout['referenceScorecardProfileId'], profile_id)
        card = self.catalog.scorecards[profile_id]
        self.assertEqual(card['layoutId'], layout['layoutId'])
        self.assertEqual(len(card['holes']), len(layout['holeOrder']))
        self.assertEqual(card['source']['provider'], 'official_course_site')

    def test_shenandoah_remains_explicitly_unbound_without_a_library_or_official_card(self):
        layout = self.catalog.layouts['shenandoah-valley-gc']
        self.assertEqual(layout['scorecardProfiles'], [])
        self.assertNotIn('referenceScorecardProfileId', layout)
        self.assertEqual(self.catalog.scorecards_of(layout['layoutId']), [])


if __name__ == '__main__':
    unittest.main()
