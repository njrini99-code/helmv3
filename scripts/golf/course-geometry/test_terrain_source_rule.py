"""Network-free tests for the shared terrain-source rule: recency ordering
and the reject-and-walk mechanics, replayed against Peek's actually recorded
acquisition (NY Southwest East 2017 selected; PA_WesternPA_2019 rejected for
61.5% empty fill) so a change here can't silently reproduce a different
course's answer."""
import json
import unittest
from pathlib import Path

from terrain_source_rule import SourceRejected, order_by_recency, parse_acquisition_year, select_first_survivor

FIXTURE = Path(__file__).resolve().parents[3] / 'src/test/fixtures/course-geometry/sources/peek-n-peak-upper-terrain/source-manifest.json'


class ParseAcquisitionYearTests(unittest.TestCase):
    def test_reads_the_year_usgs_and_nc_both_embed_in_a_title(self):
        self.assertEqual(parse_acquisition_year('USGS 1 Meter 17 x74y435 VA_NorthernShenandoah_2020_D20'), 2020)
        self.assertEqual(parse_acquisition_year('USGS 1 Meter 17 x60y466 PA_WesternPA_2019_D20'), 2019)
        self.assertEqual(parse_acquisition_year('Durham_2024_QL1_03ft_CountywideRaster'), 2024)
        self.assertEqual(parse_acquisition_year('Orange_2024_QL1_03ft_CountywideRaster'), 2024)

    def test_a_resolution_or_service_token_is_never_mistaken_for_a_year(self):
        self.assertIsNone(parse_acquisition_year('Wake_Countywide_DEM03'))
        self.assertIsNone(parse_acquisition_year('Edgecombe_Ground_3ft'))
        self.assertIsNone(parse_acquisition_year(None))
        self.assertIsNone(parse_acquisition_year(''))


class OrderByRecencyTests(unittest.TestCase):
    def test_newest_titled_candidate_first_undated_last_stable_tiebreak(self):
        candidates = [
            {'objectId': 1367, 'title': 'Wake_Countywide_DEM03'},
            {'objectId': 1343, 'title': 'Orange_2024_QL1_03ft_CountywideRaster'},
            {'objectId': 1307, 'title': 'Durham_2024_QL1_03ft_CountywideRaster'},
        ]
        ordered = order_by_recency(candidates, lambda c: c['title'], lambda c: c['objectId'])
        self.assertEqual([c['objectId'] for c in ordered], [1307, 1343, 1367])

    def test_order_does_not_depend_on_input_order(self):
        candidates = [
            {'objectId': 1339, 'title': 'Nash_Ground_3ft'},
            {'objectId': 1308, 'title': 'Edgecombe_Ground_3ft'},
        ]
        forward = order_by_recency(candidates, lambda c: c['title'], lambda c: c['objectId'])
        backward = order_by_recency(list(reversed(candidates)), lambda c: c['title'], lambda c: c['objectId'])
        self.assertEqual(forward, backward)
        # Neither name embeds a year: undated candidates keep a deterministic
        # objectId order rather than an invented recency.
        self.assertEqual([c['objectId'] for c in forward], [1308, 1339])


class SelectFirstSurvivorReplayTests(unittest.TestCase):
    """Replay Peek's real, retained terrain acquisition through the shared
    walk. `evaluate` here is exactly what a provider's per-candidate check
    reduces to: raise SourceRejected with the recorded reason, or succeed."""

    def setUp(self):
        self.manifest = json.loads(FIXTURE.read_text())

    def test_ny_wins_and_pa_is_rejected_for_recorded_empty_fill(self):
        selected_title = self.manifest['selectedTitle']
        rejected_entry = self.manifest['rejectedCandidates'][0]
        self.assertIn('PA_WesternPA_2019', rejected_entry['title'])
        self.assertGreater(rejected_entry['emptyFraction'], 0.5)

        candidates = [
            {'title': rejected_entry['title'], 'emptyFraction': rejected_entry['emptyFraction']},
            {'title': selected_title, 'emptyFraction': 0.0},
        ]
        ordered = order_by_recency(candidates, lambda c: c['title'], lambda c: c['title'])

        def evaluate(candidate):
            if candidate['emptyFraction'] > 0.001:
                raise SourceRejected('export_empty_fraction_exceeds_threshold', emptyFraction=candidate['emptyFraction'])
            return {'ok': True}

        selected, extra, rejected = select_first_survivor(ordered, evaluate)
        self.assertEqual(selected['title'], selected_title)
        self.assertEqual(extra, {'ok': True})
        self.assertEqual(len(rejected), 1)
        self.assertIn('PA_WesternPA_2019', rejected[0]['candidate']['title'])
        self.assertEqual(rejected[0]['reason'], 'export_empty_fraction_exceeds_threshold')

    def test_every_candidate_rejected_returns_none_and_every_reason(self):
        candidates = [{'title': 'A'}, {'title': 'B'}]

        def evaluate(candidate):
            raise SourceRejected('vertical_datum_unverified')

        selected, extra, rejected = select_first_survivor(candidates, evaluate)
        self.assertIsNone(selected)
        self.assertIsNone(extra)
        self.assertEqual([r['reason'] for r in rejected], ['vertical_datum_unverified', 'vertical_datum_unverified'])


if __name__ == '__main__':
    unittest.main()
