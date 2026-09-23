"""`propose-routes.py`'s shared-physical-nines mechanism (Phase D1 item 2:
CC of Landfall). Several 18-hole "combo" layouts at one facility can be
assembled from a smaller set of physical 9-hole courses; solving each nine
once and composing every layout that plays it from that one solve is
required, not an optimization, because a naive per-layout solve can let two
combos claim the same green for two different holes."""
import importlib.util
import json
import os
import subprocess
import sys
import tempfile
import unittest

from shapely.geometry import Point, box

HERE = os.path.dirname(os.path.abspath(__file__))


def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, os.path.join(HERE, filename))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


pr = load('propose_routes_facility_nines', 'propose-routes.py')
cr = load('course_raster_facility_nines', 'course_raster.py')

EPSG = 32617
ORIGIN = [-79.74, 42.055]


def utm_to_wgs84(x, y):
    return list(cr.epsg_to_wgs84(Point(x, y), EPSG).coords[0])


def way_ring(center_xy, size=6.0):
    poly = box(center_xy[0] - size, center_xy[1] - size, center_xy[0] + size, center_xy[1] + size)
    return [utm_to_wgs84(x, y) for x, y in poly.exterior.coords]


def way_element(way_id, golf_kind, center_xy):
    return {'type': 'way', 'id': way_id, 'tags': {'golf': golf_kind},
            'geometry': [{'lon': lon, 'lat': lat} for lon, lat in way_ring(center_xy)]}


def make_nine(prefix, way_id_start, x_offset, base_yards_m, par=4):
    """9 tee/green way elements at `x_offset`, each hole a clean straight
    line of `base_yards_m + i*20` metres so the beam search's true pairing
    is unambiguous -- and each nine at its own large `x_offset` so a
    tee/green from one nine is never a plausible distance match for
    another nine's holes. Returns `(elements, hole_keys, pars, scorecard_yards)`."""
    elements, hole_keys, pars, yards = [], [], [], []
    for i in range(9):
        way_id = way_id_start + i * 2
        length_m = base_yards_m + i * 20
        elements.append(way_element(way_id, 'tee', (x_offset, i * 2000.0)))
        elements.append(way_element(way_id + 1, 'green', (x_offset, i * 2000.0 + length_m)))
        hole_keys.append(f'{prefix}-{i + 1:02d}')
        pars.append(par)
        yards.append(round(length_m / pr.YARD_TO_M))
    return elements, hole_keys, pars, yards


def make_scorecard(site_id, facility_id, segments):
    """`segments`: list of `(hole_keys, pars, yards)` to concatenate into one
    18- (or 9-, or 27-) hole scorecard."""
    hole_order, pars, yards = [], [], []
    for seg_hole_keys, seg_pars, seg_yards in segments:
        hole_order += seg_hole_keys
        pars += seg_pars
        yards += seg_yards
    return {'siteId': site_id, 'facilityId': facility_id, 'originWgs84': ORIGIN,
            'holeOrder': hole_order, 'pars': pars, 'scorecardYards': yards, 'bboxWgs84': None}


class SharedNinesTests(unittest.TestCase):
    def setUp(self):
        # Three physical nines, far enough apart in X that no cross-nine
        # tee/green pair is ever yardage-plausible.
        self.elements_a, self.hole_keys_a, self.pars_a, self.yards_a = make_nine('nine-a', 100, 0.0, 300.0)
        self.elements_b, self.hole_keys_b, self.pars_b, self.yards_b = make_nine('nine-b', 200, 100_000.0, 400.0)
        self.elements_c, self.hole_keys_c, self.pars_c, self.yards_c = make_nine('nine-c', 300, 200_000.0, 200.0)
        self.extract = {'elements': self.elements_a + self.elements_b + self.elements_c}
        tmp = tempfile.NamedTemporaryFile(suffix='.json', delete=False)
        tmp.write(b'{}')
        tmp.close()
        self.addCleanup(os.unlink, tmp.name)
        self.osm_path = tmp.name

        # combo1 = A + B (like "Nick M/O"); combo2 = B + C (like "Nick O/P");
        # standalone9 = a lone nine-A layout (like "Marsh 9" on its own).
        self.combo1 = make_scorecard('combo1', 'landfall', [
            (self.hole_keys_a, self.pars_a, self.yards_a), (self.hole_keys_b, self.pars_b, self.yards_b)])
        self.combo2 = make_scorecard('combo2', 'landfall', [
            (self.hole_keys_b, self.pars_b, self.yards_b), (self.hole_keys_c, self.pars_c, self.yards_c)])
        self.standalone9 = make_scorecard('standalone9', 'landfall', [(self.hole_keys_a, self.pars_a, self.yards_a)])
        self.scorecards = {'combo1': self.combo1, 'combo2': self.combo2, 'standalone9': self.standalone9}

    def test_three_physical_nines_are_recognized_across_three_layouts(self):
        groups = pr.group_facility_nines(self.scorecards)
        self.assertEqual(len(groups), 3)
        sig_a = (tuple(self.pars_a), tuple(self.yards_a))
        members_a = {m['layoutId'] for m in groups[sig_a]}
        self.assertEqual(members_a, {'combo1', 'standalone9'})
        sig_b = (tuple(self.pars_b), tuple(self.yards_b))
        self.assertEqual({m['layoutId'] for m in groups[sig_b]}, {'combo1', 'combo2'})

    def test_a_shared_nine_gets_byte_identical_tee_green_assignment_in_every_combo(self):
        results = pr.propose_facility(self.scorecards, self.extract, None, 'landfall', self.osm_path)
        self.assertIsNotNone(results['combo1'])
        self.assertIsNotNone(results['combo2'])
        self.assertIsNotNone(results['standalone9'])
        doc1, _ = results['combo1']
        doc2, _ = results['combo2']
        doc_solo, _ = results['standalone9']

        # combo1's holes 10-18 (nine B) vs combo2's holes 1-9 (also nine B):
        # identical tee/green ids hole-for-hole, not just a permutation of the
        # same set -- two combos must never disagree about which physical
        # green is which hole's green just because they number it differently.
        b_in_combo1 = [r for r in doc1['report'] if r['ordinal'] > 9]
        b_in_combo2 = [r for r in doc2['report'] if r['ordinal'] <= 9]
        self.assertEqual(len(b_in_combo1), 9)
        self.assertEqual([r['teeId'] for r in b_in_combo1], [r['teeId'] for r in b_in_combo2])
        self.assertEqual([r['greenId'] for r in b_in_combo1], [r['greenId'] for r in b_in_combo2])

        # combo1's holes 1-9 (nine A) vs the standalone nine-A layout: same
        # invariant for a lone nine that also happens to feed a combo.
        a_in_combo1 = [r for r in doc1['report'] if r['ordinal'] <= 9]
        a_in_solo = doc_solo['report']
        self.assertEqual([r['teeId'] for r in a_in_combo1], [r['teeId'] for r in a_in_solo])
        self.assertEqual([r['greenId'] for r in a_in_combo1], [r['greenId'] for r in a_in_solo])

        # Every hole across every layout proposed (no course of this test's
        # construction should ever leave a slot unassigned).
        for doc in (doc1, doc2, doc_solo):
            self.assertTrue(all(r['decision'] == 'proposed' for r in doc['report']))

    def test_no_green_is_claimed_by_two_different_physical_nines(self):
        results = pr.propose_facility(self.scorecards, self.extract, None, 'landfall', self.osm_path)
        # Union every (signature, greenId) pair actually assigned, across the
        # facility's whole solve; if the same greenId appears under two
        # different nine signatures, two different physical nines both
        # claimed it, which must never happen (see propose_facility's
        # exclusivity tracking).
        green_owner = {}
        groups = pr.group_facility_nines(self.scorecards)
        for signature, members in groups.items():
            m = members[0]
            doc, _ = results[m['layoutId']]
            rows = [r for r in doc['report'] if m['start'] < r['ordinal'] <= m['end']]
            for row in rows:
                prior = green_owner.get(row['greenId'])
                self.assertTrue(prior is None or prior == signature,
                                 f"green {row['greenId']} claimed by both {prior} and {signature}")
                green_owner[row['greenId']] = signature

    def test_a_non_nine_shaped_scorecard_gets_its_own_unshared_group_not_a_false_match(self):
        # 5 holes is not nine-shaped, so `layout_nine_segments` treats it as
        # one opaque segment rather than splitting it -- it must land in its
        # own private group (never accidentally merged with nine A just
        # because it happens to reuse nine A's first 5 holes' par/yardage).
        odd = make_scorecard('odd', 'landfall', [(self.hole_keys_a[:5], self.pars_a[:5], self.yards_a[:5])])
        scorecards = dict(self.scorecards, odd=odd)
        groups = pr.group_facility_nines(scorecards)
        odd_signature = (tuple(self.pars_a[:5]), tuple(self.yards_a[:5]))
        self.assertEqual({m['layoutId'] for m in groups[odd_signature]}, {'odd'})
        sig_a = (tuple(self.pars_a), tuple(self.yards_a))
        self.assertEqual({m['layoutId'] for m in groups[sig_a]}, {'combo1', 'standalone9'})  # unaffected by 'odd'


class FacilityManifestCliTests(unittest.TestCase):
    """`--facility-manifest` (the CLI surface `factory/adapters.py`'s
    `_facility_shared_nines_attempt` actually shells out to, mirroring every
    other task's "wraps the script unchanged" contract) end to end as a real
    subprocess -- the pure-function `propose_facility` tests above never
    exercise argument parsing, the manifest file format, or where the
    per-layout output files land."""

    def test_two_layouts_sharing_one_nine_get_byte_identical_files_via_the_cli(self):
        elements, hole_keys, pars, yards = make_nine('nine', 100, 0.0, 300.0)
        with tempfile.TemporaryDirectory() as tmp:
            osm_path = os.path.join(tmp, 'osm.json')
            with open(osm_path, 'w') as f:
                json.dump({'elements': elements}, f)
            scorecard = make_scorecard('site1', 'fac1', [(hole_keys, pars, yards)])
            card_a = os.path.join(tmp, 'card-a.json')
            card_b = os.path.join(tmp, 'card-b.json')
            for path in (card_a, card_b):
                with open(path, 'w') as f:
                    json.dump(scorecard, f)
            out_dir = os.path.join(tmp, 'out')
            manifest_path = os.path.join(tmp, 'manifest.json')
            with open(manifest_path, 'w') as f:
                json.dump({'facilityId': 'fac1', 'scorecards': {'layoutA': card_a, 'layoutB': card_b}, 'outDir': out_dir}, f)

            result = subprocess.run(
                [sys.executable, os.path.join(HERE, 'propose-routes.py'), '--facility-manifest', manifest_path,
                 '--osm', osm_path, '--allow-numbered-osm'],
                capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            with open(os.path.join(out_dir, 'layoutA.json')) as f:
                doc_a = json.load(f)
            with open(os.path.join(out_dir, 'layoutB.json')) as f:
                doc_b = json.load(f)
            self.assertEqual([r['teeId'] for r in doc_a['report']], [r['teeId'] for r in doc_b['report']])
            self.assertEqual([r['greenId'] for r in doc_a['report']], [r['greenId'] for r in doc_b['report']])
            self.assertTrue(all(r['decision'] == 'proposed' for r in doc_a['report']))


if __name__ == '__main__':
    unittest.main()
