"""Review-only route-candidate compiler contracts; no canonical world input."""
import gzip
import hashlib
import importlib.util
import json
import shutil
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location('visual_route_compiler', ROOT / 'compile-visual-route-candidates.py')
compiler = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(compiler)


def polygon(way_id, golf, x, y):
    return {'type': 'way', 'id': way_id, 'tags': {'golf': golf}, 'geometry': [
        {'lon': x, 'lat': y}, {'lon': x + .0001, 'lat': y}, {'lon': x + .0001, 'lat': y + .0001},
        {'lon': x, 'lat': y + .0001}, {'lon': x, 'lat': y},
    ]}


class VisualRouteCompilerTests(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix='visual-route-compiler-'))
        self.repo = self.tmp / 'repo'
        self.output = self.repo / 'output/course-geometry/factory'
        source_path = self.output / 'facilities/synthetic/osm/overpass.json.gz'
        source_path.parent.mkdir(parents=True)
        self.raw = {'elements': [polygon(11, 'tee', -79, 36), polygon(12, 'green', -79, 36.003), polygon(13, 'fairway', -79.0001, 36.001)]}
        raw_bytes = json.dumps(self.raw).encode()
        source_path.write_bytes(gzip.compress(raw_bytes))
        self.sha = hashlib.sha256(raw_bytes).hexdigest()
        self.source = {'kind': 'retained_overpass_extract', 'path': str(source_path.relative_to(self.repo)),
                       'sha256': self.sha, 'license': 'ODbL-1.0', 'verification': 'snapshot_manifest_sha256_verified'}
        self.candidate = {
            'candidateId': 'visual-corridor-osm-way-12-from-11', 'truthClass': 'estimated', 'authority': 'visual_only',
            'visualCorridorWgs84': {'type': 'LineString', 'coordinates': [[-78.99995, 36.00005], [-78.99995, 36.00305]]},
            'sourceFeatures': {
                'tee': {'wayId': 11, 'centerWgs84': [-78.99995, 36.00005]},
                'green': {'wayId': 12, 'centerWgs84': [-78.99995, 36.00305]},
                'fairwayContext': {'wayId': 13, 'centerWgs84': [-79.00005, 36.00105]},
            },
            'limitations': ['display-only'],
        }
        self.contract = {'canRender': True, 'canMeasure': False, 'maySupplyHoleAssociation': False,
                         'maySupplyTeeIdentity': False, 'maySupplyRouteIdentity': False,
                         'maySupplyPhysicalGeometry': False, 'mayEnterCanonicalPackage': False,
                         'mayEnterOneTap': False, 'mayPublishAsPhysicalHoleWorld': False}
        self.asset = {'assetKey': 'synthetic--candidate', 'candidateId': self.candidate['candidateId'], 'sceneType': 'tee_green_candidate',
                      'sourceArtifact': self.source, 'sourceWayIds': [11, 12, 13], 'truthClass': 'estimated',
                      'authority': 'visual_only',
                      'suggestedDerivedDirectory': 'output/course-geometry/factory/layouts/synthetic/visual-route-candidates/candidate',
                      'limitations': ['display-only']}
        self.plan = {'schema': 'golfhelm-visual-route-render-plan-v1', 'layoutId': 'synthetic', 'status': 'ready_display_only_compile',
                     'sourceArtifact': self.source, 'contentHash': 'b' * 64, 'assets': [self.asset],
                     'renderingContract': self.contract, '_routeCandidates': [self.candidate]}

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_rehydrates_only_explicit_verified_source_way_polygons(self):
        raw = compiler.load_raw_extract(self.repo / self.source['path'], self.sha)
        data = compiler.compile_input(self.asset, self.plan, raw)
        self.assertEqual(data['schema'], 'golfhelm-visual-route-candidate-compile-input-v1')
        self.assertEqual([item['wayId'] for item in data['sourceFeatures']], [11, 12, 13])
        self.assertNotIn('physicalHoleId', data['candidate'])
        self.assertNotIn('ordinal', data['candidate'])
        self.assertFalse(data['renderingContract']['canMeasure'])
        tampered = dict(self.asset, sourceWayIds=[11, 12, 99])
        with self.assertRaisesRegex(ValueError, 'source way'):
            compiler.compile_input(tampered, self.plan, raw)

    def test_dry_run_is_serial_bounded_and_writes_no_derived_asset(self):
        report = {'schema': 'golfhelm-factory-route-recovery-v1', 'layouts': [{
            'layoutId': 'synthetic', 'visualRouteCandidates': {'candidates': [self.candidate], 'greenOnlyCandidates': []},
            'visualRenderPlan': {key: value for key, value in self.plan.items() if key != '_routeCandidates'},
        }]}
        report_path = self.tmp / 'route-recovery.json'
        report_path.write_text(json.dumps(report))
        report_out = self.tmp / 'result.json'
        result = compiler.main([str(report_path), '--repo-root', str(self.repo), '--factory-output', str(self.output),
                                '--layout', 'synthetic', '--dry-run', '--max-assets', '1', '--report-out', str(report_out)])
        self.assertEqual(result, 0)
        body = json.loads(report_out.read_text())
        self.assertEqual(body['mode'], 'dry_run')
        self.assertEqual(body['results'][0]['status'], 'dry_run_validated')
        self.assertFalse((self.output / 'layouts/synthetic/visual-route-candidates/candidate').exists())
        self.assertFalse(body['renderingContract']['mayEnterCanonicalPackage'])
        self.assertFalse(body['renderingContract']['mayEnterOneTap'])

    def test_rejects_plan_path_outside_factory_output(self):
        escaped = dict(self.asset, suggestedDerivedDirectory='../outside')
        with self.assertRaisesRegex(ValueError, 'escapes'):
            compiler.asset_output(self.repo, self.output, escaped, self.plan['contentHash'])


if __name__ == '__main__':
    unittest.main()
