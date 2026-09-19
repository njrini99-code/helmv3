"""Contract tests for the review-adjustments import (renderer-redesign section 23)."""
import copy
import hashlib
import json
import subprocess
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).with_name('apply-review-adjustments.py')
FIXTURES = Path(__file__).resolve().parents[3] / 'src/test/fixtures/course-geometry'


def sha(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode()).hexdigest()


def content_hash(document):
    return sha({key: value for key, value in document.items() if key != 'contentHash'})


def decision(feature_id, verdict, geometry=None, **extra):
    props = {'featureId': feature_id, 'decision': verdict, 'reviewer': 'reviewer-a', 'reviewedAt': '2026-09-16T05:00:00Z', 'note': 'test'}
    props.update(extra)
    return {'type': 'Feature', 'id': feature_id, 'properties': props, 'geometry': geometry}


def shifted(geometry, delta=0.00002):
    def move(coords):
        if isinstance(coords[0], (int, float)):
            return [coords[0] + delta, coords[1] + delta]
        return [move(item) for item in coords]
    return {'type': geometry['type'], 'coordinates': move(geometry['coordinates'])}


class ApplyReviewAdjustmentsTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.package = json.loads((FIXTURES / 'peek-n-peak-upper.json').read_text())
        cls.context = json.loads((FIXTURES / 'peek-n-peak-upper-context.json').read_text())

    def run_tool(self, sidecar, expect=0):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'pkg.json').write_text(json.dumps(self.package, ensure_ascii=False, separators=(',', ':')))
            (root / 'ctx.json').write_text(json.dumps(self.context, ensure_ascii=False, separators=(',', ':')))
            (root / 'review-adjustments.geojson').write_text(json.dumps({'type': 'FeatureCollection', 'features': sidecar}))
            result = subprocess.run(['python3', str(SCRIPT), str(root / 'pkg.json'), str(root / 'review-adjustments.geojson'), str(root / 'out'), f'--context={root / "ctx.json"}'],
                                    capture_output=True, text=True)
            self.assertEqual(result.returncode, expect, result.stderr)
            if expect:
                return result.stderr
            # Inputs are never edited in place.
            self.assertEqual(json.loads((root / 'pkg.json').read_text())['contentHash'], self.package['contentHash'])
            return (json.loads((root / 'out/pkg.json').read_text()), json.loads((root / 'out/ctx.json').read_text()),
                    json.loads((root / 'out/review-provenance.json').read_text()))

    def test_applies_every_decision_with_provenance_and_rebinds_hashes(self):
        fairway = next(f for f in self.package['features'] if f['kind'] == 'fairway')
        bunker = next(f for f in self.package['features'] if f['kind'] == 'bunker')
        green = next(f for f in self.package['features'] if f['kind'] == 'green')
        zone = next(z for z in self.context['zones'] if z['basis'] == 'source')
        adjusted_green = shifted(green['geometryWgs84'])
        pkg, ctx, prov = self.run_tool([
            decision(fairway['id'], 'accepted'), decision(bunker['id'], 'reject'),
            decision(green['id'], 'adjust', adjusted_green), decision(zone['id'], 'reject'),
        ])
        by_id = {f['id']: f for f in pkg['features']}
        self.assertTrue(by_id[fairway['id']]['reviewed'])
        self.assertFalse(by_id[bunker['id']]['reviewed'])
        self.assertEqual(by_id[green['id']]['geometryWgs84'], adjusted_green)
        self.assertTrue(by_id[green['id']]['reviewed'])
        self.assertEqual(pkg['contentHash'], content_hash(pkg))
        self.assertNotEqual(pkg['contentHash'], self.package['contentHash'])
        zone_after = next(z for z in ctx['zones'] if z['id'] == zone['id'])
        self.assertEqual(zone_after['basis'], 'uncertain'); self.assertTrue(zone_after['reviewed'])
        self.assertEqual(ctx['packageHash'], pkg['contentHash'])
        self.assertEqual(ctx['contentHash'], content_hash(ctx))
        self.assertEqual(ctx['review']['status'], 'partial')
        self.assertEqual(prov['package'], {'name': 'pkg.json', 'before': self.package['contentHash'], 'after': pkg['contentHash']})
        self.assertEqual(prov['contextLayer']['before'], self.context['contentHash'])
        self.assertEqual(len(prov['decisions']), 4)
        green_entry = next(d for d in prov['decisions'] if d['featureId'] == green['id'])
        self.assertEqual(green_entry['geometrySha256Before'], sha(green['geometryWgs84']))
        self.assertEqual(green_entry['geometrySha256After'], sha(adjusted_green))
        self.assertEqual({d['decision'] for d in prov['decisions']}, {'accepted', 'reject', 'adjust'})
        self.assertTrue(all(d['reviewer'] == 'reviewer-a' for d in prov['decisions']))
        # Untouched features keep their geometry byte for byte.
        untouched = [f for f in self.package['features'] if f['id'] not in {fairway['id'], bunker['id'], green['id']}]
        self.assertTrue(all(by_id[f['id']] == f for f in untouched))

    def test_refuses_unknown_ids_missing_provenance_and_wrong_geometry_types(self):
        green = next(f for f in self.package['features'] if f['kind'] == 'green')
        errors = self.run_tool([decision('nope', 'accepted')], expect=2)
        self.assertIn('no package feature or context zone', errors)
        errors = self.run_tool([decision(green['id'], 'accepted', reviewer='')], expect=2)
        self.assertIn('reviewer is required', errors)
        errors = self.run_tool([decision(green['id'], 'adjust', {'type': 'LineString', 'coordinates': [[0, 0], [1, 1]]})], expect=2)
        self.assertIn('geometry must be a Polygon', errors)
        errors = self.run_tool([decision(green['id'], 'accepted'), decision(green['id'], 'reject')], expect=2)
        self.assertIn('more than one decision', errors)
        errors = self.run_tool([decision(green['id'], 'maybe')], expect=2)
        self.assertIn('decision must be one of', errors)

    def test_refuses_a_package_whose_hash_does_not_match_its_content(self):
        broken = copy.deepcopy(self.package)
        broken['name'] = 'tampered'
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'pkg.json').write_text(json.dumps(broken))
            (root / 'side.geojson').write_text(json.dumps({'type': 'FeatureCollection', 'features': [decision(self.package['features'][0]['id'], 'accepted')]}))
            result = subprocess.run(['python3', str(SCRIPT), str(root / 'pkg.json'), str(root / 'side.geojson'), str(root / 'out')], capture_output=True, text=True)
        self.assertEqual(result.returncode, 2)
        self.assertIn('does not match its content', result.stderr)


if __name__ == '__main__':
    unittest.main()
