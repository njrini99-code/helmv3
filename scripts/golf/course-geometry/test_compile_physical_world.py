"""No-network contract tests for the metric-world boundary."""
import importlib.util
import json
import subprocess
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).with_name('compile-physical-world.py')


class PhysicalWorldTest(unittest.TestCase):
    def test_footprint_only_bunker_cannot_claim_depth_or_lip_geometry(self):
        fixture = {
            'kind': 'golfhelm-canonical-local-meter-study', 'contentHash': 'canonical', 'siteId': 'test', 'physicalStudyKey': 'one', 'status': 'source_candidate_partial',
            'coordinateSystem': {'units': 'meters', 'oneWorldUnitEqualsMeters': True},
            'terrain': {'grid': {'width': 2, 'height': 2, 'positionsMeters': []}, 'source': {'nativeResolutionMeters': 1}},
            'features': [
                {'id': 'green', 'kind': 'green', 'geometryMeters': {'type': 'Polygon', 'coordinates': []}, 'provenance': {'humanReviewed': False, 'boundaryAccuracyMeters': None}},
                {'id': 'bunker', 'kind': 'bunker', 'geometryMeters': {'type': 'Polygon', 'coordinates': []}, 'provenance': {'humanReviewed': False, 'boundaryAccuracyMeters': None}},
            ], 'limitations': [], 'sources': {},
        }
        with tempfile.TemporaryDirectory() as directory:
            inp, out = Path(directory) / 'canonical.json', Path(directory) / 'world.json'
            inp.write_text(json.dumps(fixture))
            subprocess.run(['python3', str(SCRIPT), str(inp), str(out)], check=True, capture_output=True, text=True)
            world = json.loads(out.read_text())
        bunker = next(item for item in world['semanticSurfaces'] if item['id'] == 'bunker')
        green = next(item for item in world['semanticSurfaces'] if item['id'] == 'green')
        self.assertEqual(world['coordinateSystem']['units'], 'meters')
        self.assertIn('bunker_depth', bunker['physical']['forbiddenClaims'])
        self.assertIn('putting_break', green['physical']['forbiddenClaims'])
        self.assertEqual(bunker['physical']['heightModel'], 'shared_terrain_field')
        self.assertEqual(bunker['truthClass'], 'visual_only')
        self.assertTrue(bunker['rendering']['renderable'])
        self.assertFalse(bunker['rendering']['measurementAuthority'])

    def test_rendering_only_terrain_cannot_be_promoted_to_a_physical_height_field(self):
        fixture = {
            'kind': 'golfhelm-canonical-local-meter-study', 'contentHash': 'canonical', 'siteId': 'test', 'physicalStudyKey': 'visual', 'status': 'source_candidate_partial',
            'coordinateSystem': {'units': 'meters', 'oneWorldUnitEqualsMeters': True},
            'terrain': {'truthClass': 'visual_only', 'grid': {'width': 2, 'height': 2, 'positionsMeters': []},
                        'source': {'nativeResolutionMeters': 2, 'sourceNativeResolutionMeters': .9525, 'renderingOnly': True}},
            'features': [], 'limitations': ['A rendering-only source was used.'], 'sources': {},
        }
        with tempfile.TemporaryDirectory() as directory:
            inp, out = Path(directory) / 'canonical.json', Path(directory) / 'world.json'
            inp.write_text(json.dumps(fixture))
            subprocess.run(['python3', str(SCRIPT), str(inp), str(out)], check=True, capture_output=True, text=True)
            world = json.loads(out.read_text())
        self.assertEqual(world['terrainField']['truthClass'], 'visual_only')
        self.assertTrue(world['terrainField']['source']['renderingOnly'])


if __name__ == '__main__':
    unittest.main()
