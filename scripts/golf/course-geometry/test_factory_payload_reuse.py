import copy
import gzip
import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

from factory.fingerprints import content_hash_matches, digest, terrain_source_identity
from factory.payload_reuse import (
    load_receipt,
    physical_payload_hash,
    rebind_context,
    rebind_terrain,
    retain_receipt,
    terrain_files,
    write_json,
)


class PayloadReuseTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='payload-reuse-')
        self.root = Path(self.temp.name).resolve()
        self.folder = self.root / 'layouts' / 'example' / 'compiled-base'
        self.pkg = {'holes': [{'key': 'example-01', 'ordinal': 1, 'par': 4, 'scorecardYards': 400}],
                    'features': [{'geometry': [1, 2], 'reviewed': False}], 'sources': [{'date': '2026-09-20'}]}
        self.pkg['contentHash'] = digest(self.pkg)
        self.source = {'fileHashes': {'elevation.tif': '1' * 64}, 'requestedLocalBoundsM': [0, 0, 100, 100]}
        self.mesh = {'physicalHoleKey': 'example-01', 'geometryHash': self.pkg['contentHash'], 'vertices': [1, 2, 3], 'metricGrid': [4, 5, 6]}
        self.mesh['contentHash'] = digest(self.mesh)
        write_json(self.folder / 'example-01-terrain.json', self.mesh)
        payload = (self.folder / 'example-01-terrain.json').read_bytes()
        (self.folder / 'example-01-terrain.json.gz').write_bytes(gzip.compress(payload))
        self.report = {'physicalHoleKey': 'example-01', 'contentHash': self.mesh['contentHash'], 'geometryHash': self.pkg['contentHash']}
        write_json(self.folder / 'example-01-report.json', self.report)
        write_json(self.folder / 'asset-manifest.json', {'geometryHash': self.pkg['contentHash'], 'sourceIdentity': terrain_source_identity(self.source),
            'holes': {'example-01': {'fileName': 'example-01-terrain.json.gz', 'contentHash': self.mesh['contentHash']}}})
        write_json(self.folder / 'compilation-report.json', {'packageHash': self.pkg['contentHash'], 'holes': [self.report]})
        self.ctx = SimpleNamespace(output_root=str(self.root), layout_out=lambda _: str(self.folder.parent))

    def tearDown(self):
        self.temp.cleanup()

    def test_only_card_fields_are_excluded_and_unknown_fields_remain_inputs(self):
        updated = copy.deepcopy(self.pkg)
        updated['holes'][0].update(par=5, scorecardYards=500)
        updated['contentHash'] = 'new'
        self.assertEqual(physical_payload_hash(self.pkg), physical_payload_hash(updated))
        for change in [lambda p: p['features'][0].update(reviewed=True), lambda p: p['features'][0].update(geometry=[2, 3]),
                       lambda p: p['sources'][0].update(date='2026-09-21'), lambda p: p.update(newGeometryKnob=1)]:
            other = copy.deepcopy(updated)
            change(other)
            self.assertNotEqual(physical_payload_hash(updated), physical_payload_hash(other))

    def test_rebinding_updates_all_hashes_without_changing_numerical_payload(self):
        updated = copy.deepcopy(self.pkg)
        updated['holes'][0]['scorecardYards'] = 410
        updated['contentHash'] = digest({k: v for k, v in updated.items() if k != 'contentHash'})
        rebind_terrain(self.folder, updated, self.pkg['contentHash'], self.source)
        mesh = json.loads((self.folder / 'example-01-terrain.json').read_text())
        assets = json.loads((self.folder / 'asset-manifest.json').read_text())
        self.assertEqual(mesh['vertices'], self.mesh['vertices'])
        self.assertEqual(mesh['metricGrid'], self.mesh['metricGrid'])
        self.assertEqual(mesh['geometryHash'], updated['contentHash'])
        self.assertTrue(content_hash_matches(mesh))
        self.assertNotEqual(mesh['contentHash'], self.mesh['contentHash'])
        self.assertEqual(assets['holes']['example-01']['contentHash'], mesh['contentHash'])
        decoded = json.loads(gzip.decompress((self.folder / 'example-01-terrain.json.gz').read_bytes()))
        self.assertEqual(decoded, mesh)

    def test_receipt_binds_prior_bytes_inputs_and_rejects_tampering(self):
        identity = physical_payload_hash(self.pkg)
        retain_receipt(self.ctx, 'example', 'terrain-base', identity, self.pkg['contentHash'], terrain_files(self.folder))
        self.assertIsNotNone(load_receipt(self.ctx, 'example', 'terrain-base', identity))
        self.assertIsNone(load_receipt(self.ctx, 'example', 'terrain-base', 'different-input'))
        (self.folder / 'example-01-terrain.json').write_text('{}')
        self.assertIsNone(load_receipt(self.ctx, 'example', 'terrain-base', identity))

    def test_real_base_adapter_rebinds_card_change_without_running_compiler(self):
        from unittest.mock import patch

        from factory.adapters import compile_terrain_base
        from factory.payload_reuse import stage_identity
        spec = SimpleNamespace(settings={})
        node = SimpleNamespace(scope=SimpleNamespace(layout_id='example'), spec=spec)
        package_path = self.root / 'package.json'
        write_json(package_path, self.pkg)
        self.ctx.impl_hash = lambda _: 'compiler-version-a'
        self.ctx.terrain_source_manifest = lambda _: self.source
        self.ctx.terrain_base_out = lambda _: str(self.folder)
        self.ctx.package_path = lambda _: str(package_path)
        self.ctx.json = lambda path, fresh=False: json.loads(Path(path).read_text())
        identity = stage_identity(self.ctx, node, self.pkg)
        retain_receipt(self.ctx, 'example', 'terrain-base', identity, self.pkg['contentHash'], terrain_files(self.folder))
        updated = copy.deepcopy(self.pkg)
        updated['holes'][0]['scorecardYards'] = 410
        updated['contentHash'] = digest({k: v for k, v in updated.items() if k != 'contentHash'})
        write_json(package_path, updated)
        with patch('factory.adapters._compile') as compile_numeric:
            refs = compile_terrain_base(node, self.ctx, None)
        compile_numeric.assert_not_called()
        self.assertTrue(all(Path(ref.path).is_file() for ref in refs))
        mesh = json.loads((self.folder / 'example-01-terrain.json').read_text())
        self.assertEqual(mesh['geometryHash'], updated['contentHash'])
        self.assertEqual(mesh['vertices'], self.mesh['vertices'])
        self.assertIsNotNone(load_receipt(self.ctx, 'example', 'terrain-base', identity))


    def test_context_rebind_preserves_all_zones_and_reviews(self):
        layer = {'packageHash': self.pkg['contentHash'], 'zones': [{'id': 'tree', 'reviewed': False}]}
        layer['contentHash'] = digest(layer)
        target = self.root / 'context.json'
        report = self.root / 'context-report.json'
        write_json(target, layer)
        write_json(report, {'packageHash': self.pkg['contentHash'], 'layerHash': layer['contentHash']})
        rebind_context(target, report, 'f' * 64, self.pkg['contentHash'])
        rebound = json.loads(target.read_text())
        self.assertEqual(rebound['zones'], layer['zones'])
        self.assertTrue(content_hash_matches(rebound))
        self.assertEqual(json.loads(report.read_text())['layerHash'], rebound['contentHash'])


if __name__ == '__main__':
    unittest.main()
