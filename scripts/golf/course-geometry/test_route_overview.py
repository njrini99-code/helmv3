"""Synthetic-data tests for `route-overview.py`: the OSM-route synthesizer
(`synthesize_doc_from_osm`) and the renderer (`render_overview`), covering
both the NAIP-backed map and the raster-less fallback used when a facility
has no retained NAIP export (e.g. Bryan Park Champs)."""
import importlib.util
import os
import tempfile
import unittest

import numpy as np
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))


def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, os.path.join(HERE, filename))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


ro = load('route_overview', 'route-overview.py')

ORIGIN = [-79.74, 42.055]


def _way(way_id, ref, points, par=None):
    return {'type': 'way', 'id': way_id, 'tags': {'golf': 'hole', 'ref': str(ref), **({'par': str(par)} if par else {})},
            'geometry': [{'lon': p[0], 'lat': p[1]} for p in points]}


def _closed_way(way_id, golf, points):
    ring = points + [points[0]]
    return {'type': 'way', 'id': way_id, 'tags': {'golf': golf}, 'geometry': [{'lon': p[0], 'lat': p[1]} for p in ring]}


class SynthesizeFromOsmTests(unittest.TestCase):
    def test_route_lines_use_the_way_first_and_last_point_in_routeWayIds_order(self):
        extract = {'elements': [
            _way(101, 1, [ORIGIN, [ORIGIN[0] + 0.001, ORIGIN[1] + 0.001], [ORIGIN[0] + 0.002, ORIGIN[1] + 0.002]]),
            _way(102, 2, [[ORIGIN[0] + 0.002, ORIGIN[1] + 0.002], [ORIGIN[0] + 0.003, ORIGIN[1] + 0.003]]),
        ]}
        routes_doc = {'source': 'osm_ref_unique', 'routeWayIds': [101, 102]}
        scorecard = {'holes': [{'hole': 1, 'par': 4, 'yards': 400}, {'hole': 2, 'par': 3, 'yards': 150}]}
        doc = ro.synthesize_doc_from_osm(routes_doc, extract, scorecard, layout_name='Test Course')
        self.assertEqual(len(doc['features']), 2)
        self.assertEqual(len(doc['report']), 2)
        route1 = next(f for f in doc['features'] if f['id'] == 'hole-1-route')
        self.assertEqual(route1['geometryWgs84']['coordinates'][0], list(ORIGIN))
        self.assertEqual(route1['geometryWgs84']['coordinates'][1], [ORIGIN[0] + 0.002, ORIGIN[1] + 0.002])
        row1 = doc['report'][0]
        self.assertEqual(row1['decision'], 'proposed')
        self.assertEqual(row1['par'], 4)
        self.assertEqual(row1['scorecardYards'], 400)
        self.assertIsNotNone(row1['straightLineYards'])
        self.assertGreater(row1['straightLineYards'], 0)
        self.assertEqual(row1['confidenceLabel'], 'osm_ref_unique (resolved)')
        self.assertEqual(row1['wayId'], 101)

    def test_a_way_id_with_no_matching_element_is_unassigned_not_a_crash(self):
        extract = {'elements': [_way(101, 1, [ORIGIN, [ORIGIN[0] + 0.001, ORIGIN[1]]])]}
        routes_doc = {'source': 'osm_ref_unique', 'routeWayIds': [101, 999]}
        doc = ro.synthesize_doc_from_osm(routes_doc, extract, None)
        self.assertEqual(doc['report'][0]['decision'], 'proposed')
        self.assertEqual(doc['report'][1]['decision'], 'unassigned')
        self.assertEqual(doc['report'][1]['ordinal'], 2)

    def test_flat_scorecard_shape_is_accepted_like_the_holes_list_shape(self):
        extract = {'elements': [_way(101, 1, [ORIGIN, [ORIGIN[0] + 0.001, ORIGIN[1] + 0.001]])]}
        routes_doc = {'source': 'catalog', 'routeWayIds': [101]}
        flat_scorecard = {'pars': [5], 'scorecardYards': [520]}
        doc = ro.synthesize_doc_from_osm(routes_doc, extract, flat_scorecard)
        self.assertEqual(doc['report'][0]['par'], 5)
        self.assertEqual(doc['report'][0]['scorecardYards'], 520)


class FaintOsmPolygonsTests(unittest.TestCase):
    def test_collects_only_closed_tee_and_green_ways(self):
        square = [ORIGIN, [ORIGIN[0] + 0.0002, ORIGIN[1]], [ORIGIN[0] + 0.0002, ORIGIN[1] + 0.0002], [ORIGIN[0], ORIGIN[1] + 0.0002]]
        extract = {'elements': [
            _closed_way(1, 'tee', square),
            _closed_way(2, 'green', square),
            _way(3, 1, [ORIGIN, [ORIGIN[0] + 0.001, ORIGIN[1]]]),  # golf=hole, not tee/green -- excluded
            {'type': 'way', 'id': 4, 'tags': {'golf': 'tee'},  # open ring -- excluded
             'geometry': [{'lon': p[0], 'lat': p[1]} for p in square]},
        ]}
        polygons = ro._faint_osm_polygons(extract)
        kinds = sorted(kind for kind, _ in polygons)
        self.assertEqual(kinds, ['green', 'tee'])

    def test_none_extract_yields_no_polygons(self):
        self.assertEqual(ro._faint_osm_polygons(None), [])


class RenderOverviewTests(unittest.TestCase):
    def _doc(self):
        return {'features': [
            {'id': 'hole-1-route', 'kind': 'route',
             'geometryWgs84': {'type': 'LineString', 'coordinates': [list(ORIGIN), [ORIGIN[0] + 0.002, ORIGIN[1] + 0.002]]}},
        ], 'report': [
            {'ordinal': 1, 'holeKey': 'hole-1', 'decision': 'proposed', 'par': 4, 'scorecardYards': 400.0,
             'straightLineYards': 395.0, 'yardageDeltaYards': -5.0, 'confidence': 0.87},
            {'ordinal': 2, 'holeKey': 'hole-2', 'decision': 'unassigned'},
        ]}

    def test_fallback_render_with_no_naip_produces_a_readable_png(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = os.path.join(tmp, 'overview.png')
            result = ro.render_overview(self._doc(), out, layout_name='Fallback Course', caption='2 holes, 1 unassigned')
            self.assertEqual(result, out)
            with Image.open(out) as image:
                self.assertEqual(image.format, 'PNG')
                self.assertGreater(image.width, 0)
                self.assertGreater(image.height, 0)

    def test_naip_backed_render_produces_a_png_at_least_as_tall_as_the_raster(self):
        array = np.random.randint(0, 255, size=(4, 40, 40), dtype=np.uint8).astype(float)
        # A simple north-up geotransform covering roughly the two hole points.
        geotransform = (ORIGIN[0] - 0.001, 0.0001, 0.0, ORIGIN[1] + 0.004, 0.0, -0.0001)
        naip = ro.cr.Raster(array, geotransform, 4326, None)
        with tempfile.TemporaryDirectory() as tmp:
            out = os.path.join(tmp, 'overview.png')
            ro.render_overview(self._doc(), out, naip=naip, naip_epsg=4326, layout_name='NAIP Course')
            with Image.open(out) as image:
                self.assertEqual(image.format, 'PNG')
                self.assertGreaterEqual(image.height, 40)

    def test_an_all_unassigned_doc_with_no_naip_raises_instead_of_rendering_nothing(self):
        doc = {'features': [], 'report': [{'ordinal': 1, 'holeKey': 'hole-1', 'decision': 'unassigned'}]}
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaises(ValueError):
                ro.render_overview(doc, os.path.join(tmp, 'overview.png'))

    def test_fallback_render_titles_the_footer_with_no_imagery_naip_backed_does_not(self):
        from unittest import mock
        array = np.random.randint(0, 255, size=(4, 40, 40), dtype=np.uint8).astype(float)
        geotransform = (ORIGIN[0] - 0.001, 0.0001, 0.0, ORIGIN[1] + 0.004, 0.0, -0.0001)
        naip = ro.cr.Raster(array, geotransform, 4326, None)
        with tempfile.TemporaryDirectory() as tmp:
            footer_texts = []
            real_multiline_text = ImageDraw.ImageDraw.multiline_text

            def spy(self_draw, xy, text, **kwargs):
                footer_texts.append(text)
                return real_multiline_text(self_draw, xy, text, **kwargs)

            with mock.patch.object(ImageDraw.ImageDraw, 'multiline_text', spy):
                ro.render_overview(self._doc(), os.path.join(tmp, 'fallback.png'), layout_name='Course')
                ro.render_overview(self._doc(), os.path.join(tmp, 'naip.png'), naip=naip, naip_epsg=4326, layout_name='Course')
            fallback_footer, naip_footer = footer_texts
            self.assertTrue(fallback_footer.startswith('NO NAIP IMAGERY RETAINED'))
            self.assertFalse(naip_footer.startswith('NO NAIP IMAGERY RETAINED'))
            self.assertTrue(naip_footer.startswith('Course'))

    def test_render_with_extract_draws_faint_tee_green_polygons_without_crashing(self):
        square = [ORIGIN, [ORIGIN[0] + 0.0002, ORIGIN[1]], [ORIGIN[0] + 0.0002, ORIGIN[1] + 0.0002], [ORIGIN[0], ORIGIN[1] + 0.0002]]
        extract = {'elements': [_closed_way(1, 'tee', square), _closed_way(2, 'green', square)]}
        with tempfile.TemporaryDirectory() as tmp:
            out = os.path.join(tmp, 'overview.png')
            result = ro.render_overview(self._doc(), out, extract=extract, layout_name='With OSM overlay')
            self.assertEqual(result, out)
            with Image.open(out) as image:
                self.assertEqual(image.format, 'PNG')

    def test_the_faint_polygon_overlay_is_actually_blended_not_opaque(self):
        # Regression: drawing straight onto map_image stores each pixel's
        # raw (unblended) fill alpha, which comes out fully opaque -- an
        # opaque cyan blob over a real NAIP green -- the moment map_image is
        # later flattened to RGB. Renders the SAME seeded raster with and
        # without the extract overlay and checks the one pixel changed by
        # exactly the "over" alpha-composite formula for the fill's alpha
        # (60/255), not by being stamped opaque.
        rng = np.random.RandomState(7)
        array = rng.randint(0, 255, size=(4, 40, 40)).astype(float)
        geotransform = (ORIGIN[0] - 0.001, 0.0001, 0.0, ORIGIN[1] + 0.004, 0.0, -0.0001)
        naip = ro.cr.Raster(array, geotransform, 4326, None)
        # A polygon far larger than the raster's own footprint, so every
        # raster pixel -- including the top-left corner sampled below --
        # falls inside it.
        square = [[ORIGIN[0] - 1, ORIGIN[1] - 1], [ORIGIN[0] + 1, ORIGIN[1] - 1],
                  [ORIGIN[0] + 1, ORIGIN[1] + 1], [ORIGIN[0] - 1, ORIGIN[1] + 1]]
        extract = {'elements': [_closed_way(1, 'green', square)]}
        fill_rgb, fill_a = (0, 200, 210), 60 / 255
        # Not `self._doc()`: it has an unassigned hole, which (with no
        # layout_name/caption either) is the only footer line -- present or
        # not, that would push the map down by a footer strip and put the
        # (0, 0) sample in the wrong place. This doc has no footer at all.
        doc = {'features': [{'id': 'hole-1-route', 'kind': 'route',
                             'geometryWgs84': {'type': 'LineString', 'coordinates': [list(ORIGIN), [ORIGIN[0] + 0.002, ORIGIN[1] + 0.002]]}}],
               'report': [{'ordinal': 1, 'holeKey': 'hole-1', 'decision': 'proposed', 'par': 4,
                          'scorecardYards': 400.0, 'straightLineYards': 395.0, 'yardageDeltaYards': -5.0, 'confidence': 0.87}]}
        with tempfile.TemporaryDirectory() as tmp:
            plain_out = os.path.join(tmp, 'plain.png')
            overlaid_out = os.path.join(tmp, 'overlaid.png')
            ro.render_overview(doc, plain_out, naip=naip, naip_epsg=4326)
            ro.render_overview(doc, overlaid_out, naip=naip, naip_epsg=4326, extract=extract)
            with Image.open(plain_out) as image:
                base_pixel = image.convert('RGB').getpixel((0, 0))
            with Image.open(overlaid_out) as image:
                overlaid_pixel = image.convert('RGB').getpixel((0, 0))
        expected = tuple(round(f * fill_a + b * (1 - fill_a)) for f, b in zip(fill_rgb, base_pixel))
        for got, want in zip(overlaid_pixel, expected):
            self.assertLessEqual(abs(got - want), 2)  # rounding/JPEG-free PNG tolerance
        self.assertNotEqual(overlaid_pixel, base_pixel)


class BuildOverviewTests(unittest.TestCase):
    def test_a_proposal_doc_is_used_as_is_without_needing_an_osm_extract(self):
        proposal_doc = {'features': [
            {'id': 'hole-1-route', 'kind': 'route',
             'geometryWgs84': {'type': 'LineString', 'coordinates': [list(ORIGIN), [ORIGIN[0] + 0.001, ORIGIN[1] + 0.001]]}},
        ], 'report': [{'ordinal': 1, 'holeKey': 'hole-1', 'decision': 'proposed', 'par': 4,
                       'scorecardYards': 400.0, 'straightLineYards': 390.0, 'yardageDeltaYards': -10.0, 'confidence': 0.9}]}
        with tempfile.TemporaryDirectory() as tmp:
            out = os.path.join(tmp, 'overview.png')
            ro.build_overview({'source': 'auto-route-v1'}, out, proposal_doc=proposal_doc)
            self.assertTrue(os.path.isfile(out))

    def test_neither_a_proposal_nor_routeWayIds_plus_extract_raises(self):
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaises(ValueError):
                ro.build_overview({'source': None, 'routeWayIds': None}, os.path.join(tmp, 'overview.png'))

    def test_extract_reaches_render_overview_even_with_a_proposal_doc(self):
        # Regression: build_overview used to drop `extract` on the floor
        # whenever a proposal_doc was given, so the auto-route-v1 path never
        # got the faint tee/green polygon overlay even when an OSM snapshot
        # was passed alongside the proposal.
        from unittest import mock
        proposal_doc = {'features': [], 'report': []}
        sentinel_extract = {'elements': []}
        with tempfile.TemporaryDirectory() as tmp:
            with mock.patch.object(ro, 'render_overview', return_value='out') as spy:
                ro.build_overview({'source': 'auto-route-v1'}, os.path.join(tmp, 'overview.png'),
                                  proposal_doc=proposal_doc, extract=sentinel_extract)
            self.assertIs(spy.call_args.kwargs['extract'], sentinel_extract)


if __name__ == '__main__':
    unittest.main()
