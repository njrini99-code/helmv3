"""Tests for pending physical-review packet generation only."""
import gzip
import json
import os
import subprocess
import tempfile
import unittest
from pathlib import Path

from factory.fingerprints import digest
from factory.physical_review_packet import SCHEMA, build_packet, write_packet


HERE = Path(__file__).resolve().parent


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=1) + '\n', encoding='utf-8')


def package():
    document = {
        'schemaVersion': 1, 'siteId': 'site-a', 'name': 'Synthetic A', 'status': 'source_candidate',
        'originWgs84': [-80.0, 35.0], 'projection': {'units': 'meters'}, 'sources': [], 'features': [],
        'holes': [
            {'key': 'synthetic-a-01', 'ordinal': 1, 'routeFeatureId': 'route-1', 'greenFeatureId': 'green-1'},
            {'key': 'synthetic-a-02', 'ordinal': 2, 'routeFeatureId': 'route-2', 'greenFeatureId': 'green-2'},
        ],
    }
    document['contentHash'] = digest(document)
    return document


class PhysicalReviewPacketTest(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='physical-review-packet-')
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.catalog = self.root / 'catalog'
        self.output = self.root / 'output'
        write_json(self.catalog / 'facilities' / 'facility-a.json', {'schema': 'golfhelm-facility-v1', 'facilityId': 'facility-a'})
        write_json(self.catalog / 'layouts' / 'synthetic-a.json', {
            'schema': 'golfhelm-layout-v1', 'layoutId': 'synthetic-a', 'facilityId': 'facility-a',
        })
        self.package = package()
        write_json(self.output / 'layouts' / 'synthetic-a' / 'package' / 'normalized.json', self.package)
        compiled = {'geometryHash': self.package['contentHash'], 'holes': {}}
        for ordinal in (1, 2):
            key = f'synthetic-a-{ordinal:02d}'
            mesh = self.output / 'layouts' / 'synthetic-a' / 'compiled-base' / f'{key}-terrain.json.gz'
            mesh.parent.mkdir(parents=True, exist_ok=True)
            encoded = gzip.compress(b'{"geometryHash":"test"}')
            mesh.write_bytes(encoded)
            import hashlib
            compiled['holes'][key] = {'fileName': mesh.name, 'sha256': hashlib.sha256(encoded).hexdigest()}
            render = self.output / 'layouts' / 'synthetic-a' / 'world' / 'holes' / key / 'rendering'
            render.mkdir(parents=True)
            glb = render / f'{key}.glb'
            glb.write_bytes(b'glTF-test')
            preview = render / f'{key}-preview.png'
            preview.write_bytes(b'png-test')
            (render / f'{key}-roundtrip.json').write_text('{"passed":true}', encoding='utf-8')
            import hashlib
            record = {'key': key, 'packageHash': self.package['contentHash'], 'glb': glb.name,
                      'glbSha256': hashlib.sha256(glb.read_bytes()).hexdigest()}
            write_json(self.output / 'layouts' / 'synthetic-a' / 'world' / 'holes' / key / 'record.json', record)
        write_json(self.output / 'layouts' / 'synthetic-a' / 'compiled-base' / 'asset-manifest.json', compiled)
        write_json(self.output / 'layouts' / 'synthetic-a' / 'capability-report.json', {
            'layoutId': 'synthetic-a', 'packageHash': self.package['contentHash'], 'perHole': {
                'synthetic-a-01': {'capabilities': {'displayPreview': {'allowed': True}, 'measureGreenDistance': {'allowed': False}}},
            },
        })

    def test_packet_is_pending_and_binds_existing_artifacts(self):
        packet = build_packet(self.output, self.catalog, 'synthetic-a')
        self.assertEqual(packet['schema'], SCHEMA)
        self.assertEqual(packet['review']['status'], 'pending')
        self.assertFalse(packet['review']['approval'])
        self.assertEqual(packet['review']['capabilitiesGranted'], [])
        self.assertEqual(len(packet['holes']), 2)
        first = packet['holes'][0]
        self.assertEqual(first['worldRecord']['role'], 'json-manifest')
        self.assertEqual(len(first['previews']), 1)
        self.assertEqual(len(first['validationReferences']), 1)
        self.assertTrue(any(row['relativePath'].endswith('.glb') for row in first['renderArtifacts']))
        self.assertEqual(first['capabilityEvidence']['allowedCapabilities'], ['displayPreview'])
        self.assertEqual(packet['contentHash'], digest({key: value for key, value in packet.items() if key != 'contentHash'}))

    def test_mismatched_glb_is_rejected_and_write_is_exclusive(self):
        glb = self.output / 'layouts' / 'synthetic-a' / 'world' / 'holes' / 'synthetic-a-01' / 'rendering' / 'synthetic-a-01.glb'
        glb.write_bytes(b'changed')
        with self.assertRaisesRegex(ValueError, 'GLB hash differs'):
            build_packet(self.output, self.catalog, 'synthetic-a')
        glb.write_bytes(b'glTF-test')
        packet = build_packet(self.output, self.catalog, 'synthetic-a')
        destination = self.root / 'review.json'
        write_packet(packet, destination)
        with self.assertRaises(FileExistsError):
            write_packet(packet, destination)

    def test_cli_creates_pending_packet_without_mutating_factory_files(self):
        package_path = self.output / 'layouts' / 'synthetic-a' / 'package' / 'normalized.json'
        before = package_path.read_bytes()
        destination = self.root / 'cli-review.json'
        result = subprocess.run([
            'python3', str(HERE / 'generate-physical-review-packets.py'), '--layout', 'synthetic-a',
            '--output-root', str(self.output), '--catalog', str(self.catalog), '--out', str(destination), '--json',
        ], capture_output=True, text=True, check=False)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(before, package_path.read_bytes())
        report = json.loads(result.stdout)
        self.assertFalse(report['approval'])
        self.assertEqual(json.loads(destination.read_text())['review']['status'], 'pending')
        repeated = subprocess.run([
            'python3', str(HERE / 'generate-physical-review-packets.py'), '--layout', 'synthetic-a',
            '--output-root', str(self.output), '--catalog', str(self.catalog), '--out', str(destination), '--json',
        ], capture_output=True, text=True, check=False)
        self.assertEqual(repeated.returncode, 0, repeated.stderr)
        self.assertEqual(json.loads(repeated.stdout)['status'], 'retained')


if __name__ == '__main__':
    unittest.main()
