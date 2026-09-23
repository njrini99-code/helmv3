"""Bounded, network-free tests for prepare-context-layer.py: the projection
round trip and the 5 km local-frame clip that fixes Big Blue's overrun
stream/road (`prepare-context-layer.py:175-202` before this fix)."""
import gzip
import hashlib
import importlib.util
import io
import json
import math
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path

spec = importlib.util.spec_from_file_location('context_layer_script', Path(__file__).with_name('prepare-context-layer.py'))
script = importlib.util.module_from_spec(spec)
spec.loader.exec_module(script)


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False, allow_nan=False)


def digest(value):
    return hashlib.sha256(canonical(value).encode()).hexdigest()


class ProjectionRoundTripTests(unittest.TestCase):
    def test_inverse_recovers_the_forward_point_near_and_far_from_the_origin(self):
        origin = [-78.9511232, 35.9901551]
        local = script.make_local(origin)
        inverse = script.make_inverse(origin)
        for point in ([-78.9511232, 35.9901551], [-78.94, 35.995], [-78.80, 36.05], [-78.5, 36.3]):
            east, north = local(point)
            back = inverse([east, north])
            self.assertAlmostEqual(back[0], point[0], places=7)
            self.assertAlmostEqual(back[1], point[1], places=7)

    def test_flatten_positions_covers_every_geometry_shape(self):
        line = {'type': 'LineString', 'coordinates': [[0, 0], [1, 1]]}
        polygon = {'type': 'Polygon', 'coordinates': [[[0, 0], [1, 0], [1, 1], [0, 0]], [[.2, .2], [.3, .2], [.3, .3], [.2, .2]]]}
        multi = {'type': 'MultiPolygon', 'coordinates': [polygon['coordinates'], polygon['coordinates']]}
        self.assertEqual(len(script.flatten_positions(line)), 2)
        self.assertEqual(len(script.flatten_positions(polygon)), 8)
        self.assertEqual(len(script.flatten_positions(multi)), 16)


def build_fixture(tmp, far_offset_m):
    """A one-hole package plus retained OSM extracts, with a single stream
    way that runs from just off the course to `far_offset_m` metres away
    (Big Blue's real ctx-osm-way-258229088 reached 8.4 km; the fixture uses
    the same shape at a bounded scale)."""
    origin = [-2.0, 53.0]
    local = script.make_local(origin)
    inverse = script.make_inverse(origin)

    package = {'contentHash': 'a' * 64, 'siteId': 'osm-way-1', 'originWgs84': origin,
               'features': [{'id': 'fw', 'kind': 'fairway',
                             'geometryWgs84': {'type': 'Polygon', 'coordinates': [[inverse(p) for p in
                                              [(-40, -40), (40, -40), (40, 40), (-40, 40), (-40, -40)]]]}}],
               'holes': [{'key': 'fixture-01', 'ordinal': 1}]}
    package_path = tmp / 'fixture.json'
    package_path.write_text(json.dumps(package))

    compiled = tmp / 'compiled'
    compiled.mkdir()
    vertices = []
    for x, y in ((-50, -50), (50, -50), (50, 50), (-50, 50)):
        vertices += [x, y, 0]
    mesh = {'vertices': vertices}
    (compiled / 'fixture-01-terrain.json').write_text(json.dumps(mesh))
    (compiled / 'asset-manifest.json').write_text(json.dumps(
        {'geometryHash': package['contentHash'], 'holes': {'fixture-01': {'fileName': 'fixture-01-terrain.json'}}}))

    # A stream that starts just past the course bounds (well inside the clip
    # margin) and runs due east to `far_offset_m`. Only the near end should
    # survive the clip.
    stream_far = inverse((far_offset_m, 60))
    stream_near = inverse((60, 60))
    way = {'type': 'way', 'id': 258229088, 'tags': {'waterway': 'stream'},
           'geometry': [{'lon': stream_near[0], 'lat': stream_near[1]}, {'lon': stream_far[0], 'lat': stream_far[1]}]}
    extract = {'elements': [way]}
    raw = json.dumps(extract).encode()

    def write_extract(directory):
        directory.mkdir(parents=True, exist_ok=True)
        (directory / 'overpass.json.gz').write_bytes(gzip.compress(raw, mtime=0))
        (directory / 'manifest.json').write_text(json.dumps({'retrievedAt': '2026-09-01'}))
        return directory / 'overpass.json.gz'

    golf_extract = write_extract(tmp / 'golf')
    context_extract = write_extract(tmp / 'context')
    output = tmp / 'out'
    return package_path, golf_extract, context_extract, compiled, output


class ClipTests(unittest.TestCase):
    def run_script(self, far_offset_m):
        with tempfile.TemporaryDirectory() as directory:
            tmp = Path(directory)
            package_path, golf_extract, context_extract, compiled, output = build_fixture(tmp, far_offset_m)
            buf = io.StringIO()
            argv = [str(package_path), str(golf_extract), str(context_extract), str(compiled), str(output)]
            with redirect_stdout(buf):
                old_argv = sys.argv
                sys.argv = ['prepare-context-layer.py', *argv]
                try:
                    script.main()
                finally:
                    sys.argv = old_argv
            layer = json.loads((output / 'fixture-context.json').read_text())
            return layer, buf.getvalue()

    def test_a_way_reaching_kilometres_past_the_course_is_clipped_not_dropped(self):
        layer, _ = self.run_script(8400)
        self.assertEqual(len(layer['zones']), 1)
        zone = layer['zones'][0]
        self.assertEqual(zone['id'], 'ctx-osm-way-258229088')
        origin = layer['originWgs84']
        local = script.make_local(origin)
        distances = [math.hypot(*local(p)) for p in script.flatten_positions(zone['geometryWgs84'])]
        self.assertLess(max(distances), script.LOCAL_FRAME_RADIUS_M)
        # The clip is bounded by the course plus its fixed margin, not merely
        # "less than 5 km": nothing here is anywhere near the limit. The hole
        # mesh reaches +-50 m, +24 m hole margin, +250 m clip margin.
        self.assertLess(max(distances), math.hypot(50 + 24 + script.CONTEXT_CLIP_MARGIN_M, 60) + 1)

    def test_a_way_entirely_within_the_margin_is_unchanged_in_shape(self):
        layer, _ = self.run_script(200)
        zone = layer['zones'][0]
        self.assertEqual(zone['geometryWgs84']['type'], 'LineString')
        self.assertEqual(len(zone['geometryWgs84']['coordinates']), 2)


if __name__ == '__main__':
    unittest.main()
