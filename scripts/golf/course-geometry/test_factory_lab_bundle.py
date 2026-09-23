import gzip
import hashlib
import json
import tempfile
import unittest
from pathlib import Path

from factory.fingerprints import digest
from factory.lab_bundle import export_bundle


class LabBundleTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='factory-bundle-')
        self.root = Path(self.temp.name).resolve()
        self.layout = self.root / 'layouts' / 'example'
        self.package = {'holes': [{'key': 'example-01', 'ordinal': 1}], 'features': []}
        self.package['contentHash'] = digest(self.package)
        self.write(self.layout / 'package' / 'normalized.json', self.package)
        mesh = {'geometryHash': self.package['contentHash'], 'physicalHoleKey': 'example-01', 'vertices': [1, 2, 3]}
        mesh['contentHash'] = digest(mesh)
        raw = json.dumps(mesh).encode()
        compressed = gzip.compress(raw, mtime=0)
        self.compiled = self.layout / 'compiled-base'
        self.compiled.mkdir()
        (self.compiled / 'example-01.json.gz').write_bytes(compressed)
        self.write(self.compiled / 'asset-manifest.json', {'geometryHash': self.package['contentHash'], 'holes': {
            'example-01': {'fileName': 'example-01.json.gz', 'sha256': hashlib.sha256(compressed).hexdigest(),
                           'compressedBytes': len(compressed), 'uncompressedBytes': len(raw),
                           'uncompressedSha256': hashlib.sha256(raw).hexdigest(), 'contentHash': mesh['contentHash']}}})

    def tearDown(self):
        self.temp.cleanup()

    def write(self, path, doc):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(doc))

    def test_deterministic_immutable_export_survives_mutable_output_rebuild(self):
        first = export_bundle(self.root, 'example')
        self.assertEqual(first, export_bundle(self.root, 'example'))
        manifest = Path(first['manifest']).read_bytes()
        doc = json.loads(manifest)
        self.assertEqual(doc['admission']['status'], 'unassessed')
        self.assertFalse(doc['measurementAuthority'])
        object_path = self.root / 'lab' / 'objects' / doc['package']['sha256']
        prior = object_path.read_bytes()
        self.write(self.layout / 'package' / 'normalized.json', {'changed': True})
        self.assertEqual(object_path.read_bytes(), prior)
        self.assertEqual(Path(first['manifest']).read_bytes(), manifest)
        with self.assertRaisesRegex(ValueError, 'contentHash'):
            export_bundle(self.root, 'example')

    def test_catalog_retained_package_outside_output_root_exports_from_its_own_root(self):
        # Peek adopts a checked-in package fixture; it never exists under
        # layouts/<id>/package, which used to fail every ship capture.
        retained_dir = tempfile.TemporaryDirectory(prefix='retained-')
        self.addCleanup(retained_dir.cleanup)
        retained = Path(retained_dir.name).resolve()
        fixture = retained / 'example.json'
        fixture.write_bytes((self.layout / 'package' / 'normalized.json').read_bytes())
        (self.layout / 'package' / 'normalized.json').unlink()
        with self.assertRaisesRegex(ValueError, 'missing'):
            export_bundle(self.root, 'example')
        exported = export_bundle(self.root, 'example', package_path=fixture, retained_root=retained)
        doc = json.loads(Path(exported['manifest']).read_bytes())
        self.assertEqual(doc['package']['sourceRelativePath'], 'retained:example.json')

    def test_retained_package_must_sit_under_the_retained_root(self):
        elsewhere = Path(tempfile.mkdtemp(prefix='elsewhere-')).resolve()
        try:
            stray = elsewhere / 'example.json'
            stray.write_bytes((self.layout / 'package' / 'normalized.json').read_bytes())
            with self.assertRaisesRegex(ValueError, 'outside'):
                export_bundle(self.root, 'example', package_path=stray, retained_root=self.root / 'no-such-retained-root')
            with self.assertRaisesRegex(ValueError, 'outside'):
                export_bundle(self.root, 'example', package_path=stray)
        finally:
            stray.unlink(missing_ok=True)
            elsewhere.rmdir()

    def test_unknown_hole_and_layout_traversal_fail_closed(self):
        with self.assertRaisesRegex(ValueError, 'unknown hole'):
            export_bundle(self.root, 'example', ['other-01'])
        with self.assertRaisesRegex(ValueError, 'invalid layout'):
            export_bundle(self.root, '../example')

    def test_symlink_asset_and_output_escape_rejected(self):
        original = self.layout / 'package' / 'normalized.json'
        saved = self.root / 'saved.json'
        original.rename(saved)
        original.symlink_to(saved)
        with self.assertRaisesRegex(ValueError, 'symlink'):
            export_bundle(self.root, 'example')
        original.unlink()
        saved.rename(original)
        (self.root / 'lab' / 'objects').rmdir() if (self.root / 'lab' / 'objects').exists() else None
        (self.root / 'lab').mkdir(exist_ok=True)
        (self.root / 'lab' / 'objects').symlink_to(self.layout)
        with self.assertRaisesRegex(ValueError, 'symlink'):
            export_bundle(self.root, 'example')

    def test_corrupted_compressed_bytes_rejected(self):
        (self.compiled / 'example-01.json.gz').write_bytes(b'corrupt')
        with self.assertRaisesRegex(ValueError, 'byte hash'):
            export_bundle(self.root, 'example')

    def test_stale_optional_glb_does_not_block_valid_candidate_terrain(self):
        self.write(self.layout / 'world' / 'holes' / 'example-01' / 'record.json',
                   {'key': 'example-01', 'packageHash': 'e' * 64, 'glb': 'example-01.glb'})
        exported = export_bundle(self.root, 'example')
        hole = json.loads(Path(exported['manifest']).read_text())['holes'][0]
        self.assertEqual(hole['worldRecordStatus'], 'different_package')
        self.assertIsNone(hole['glb'])
        self.assertFalse(hole['truthGatePassed'])


    def test_stale_admission_report_rejected(self):
        self.write(self.layout / 'capability-report.json', {'layoutId': 'example', 'packageHash': '0' * 64})
        with self.assertRaisesRegex(ValueError, 'admission evidence'):
            export_bundle(self.root, 'example')


if __name__ == '__main__':
    unittest.main()
