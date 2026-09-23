"""Review authority cannot authorize a stale or corrupted visual payload."""
import copy
import tempfile
import unittest
from pathlib import Path

from world_render_cache import render_identity, reusable, write_receipt


def world():
    return {'contentHash': 'original-world', 'coordinateSystem': {'oneWorldUnitEqualsMeters': True},
            'terrainField': {'source': {'rasterSha256': 'raster'}, 'grid': {'positionsMeters': [[0, 0, 0]]}},
            'semanticSurfaces': [{'id': 'bunker', 'kind': 'bunker', 'geometryMeters': {'coordinates': [[1, 2, 3]]},
                                  'provenance': {'humanReviewed': False}, 'rendering': {'measurementAuthority': False}}],
            'admission': {'allowed': False}}


class RenderCacheTests(unittest.TestCase):
    def identity(self, value, raster='raster', compiler='compiler', blender='Blender 5.2.1'):
        return render_identity(value, raster, compiler, blender)

    def test_authority_changes_reuse_pixels_without_mutating_canonical_world(self):
        before = world()
        after = copy.deepcopy(before)
        after['contentHash'] = 'reviewed-world'
        after['admission'] = {'allowed': True}
        after['semanticSurfaces'][0]['provenance']['humanReviewed'] = True
        after['semanticSurfaces'][0]['rendering']['measurementAuthority'] = True
        original = copy.deepcopy(after)
        self.assertEqual(self.identity(before), self.identity(after))
        self.assertEqual(after, original)
        self.assertNotEqual(before['contentHash'], after['contentHash'])

    def test_every_geometry_and_tool_change_invalidates_reuse(self):
        source = world()
        initial = self.identity(source)
        for change in ('ground', 'boundary', 'renderClip', 'frame', 'terrainTruth', 'featureTruth'):
            modified = copy.deepcopy(source)
            if change == 'ground':
                modified['terrainField']['grid']['positionsMeters'][0][1] = 1
            elif change == 'boundary':
                modified['semanticSurfaces'][0]['geometryMeters']['coordinates'][0][0] = 9
            elif change == 'renderClip':
                modified['semanticSurfaces'][0]['renderGeometryMeters'] = {'coordinates': []}
            elif change == 'frame':
                modified['coordinateSystem']['origin'] = [1, 2]
            elif change == 'terrainTruth':
                modified['terrainField']['truthClass'] = 'visual_only'
            else:
                modified['semanticSurfaces'][0]['truthClass'] = 'estimated'
            self.assertNotEqual(initial, self.identity(modified), change)
        self.assertNotEqual(initial, self.identity(source, raster='different'))
        self.assertNotEqual(initial, self.identity(source, compiler='changed'))
        self.assertNotEqual(initial, self.identity(source, blender='Blender 5.3'))

    def test_missing_or_modified_assets_and_changed_inputs_never_reuse(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            glb, preview, report = [root / name for name in ('hole.glb', 'preview.png', 'export.json')]
            receipt = root / 'receipt.json'
            for path in (glb, preview, report):
                path.write_bytes(b'original')
            self.assertFalse(reusable(receipt, 'identity', glb, preview, report))
            write_receipt(receipt, 'identity', 'world', glb, preview, report)
            self.assertTrue(reusable(receipt, 'identity', glb, preview, report))
            self.assertFalse(reusable(receipt, 'changed', glb, preview, report))
            for path in (glb, preview, report):
                path.write_bytes(b'corrupted')
                self.assertFalse(reusable(receipt, 'identity', glb, preview, report))
                path.write_bytes(b'original')
            glb.unlink()
            self.assertFalse(reusable(receipt, 'identity', glb, preview, report))


if __name__ == '__main__':
    unittest.main()
