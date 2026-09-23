"""Network-free tests for `sea_mask.py`'s coastline geometry and the fill it
authorizes. Synthetic coastlines cover both OSM directions, a headland, a
bay, and an island ring; a round-trip test through a real GeoTIFF proves the
chosen fill value survives `elevation_raster.read_elevation` and is never
re-counted as empty."""
import gzip
import json
import math
import tempfile
import unittest
from pathlib import Path

import numpy as np
import pyproj

import elevation_raster
import sea_mask


def way(way_id, node_ids, points):
    """One Overpass `out geom` coastline way: `points` are (lon, lat)."""
    return {'type': 'way', 'id': way_id, 'nodes': list(node_ids),
            'tags': {'natural': 'coastline'},
            'geometry': [{'lat': lat, 'lon': lon} for lon, lat in points]}


class MergeWaysTests(unittest.TestCase):
    def test_open_ways_sharing_endpoint_nodes_join_into_one_chain(self):
        a = way(1, [10, 11, 12], [(0, 0), (1, 0), (2, 0)])
        b = way(2, [12, 13, 14], [(2, 0), (3, 0), (4, 0)])
        chains, rings = sea_mask.merge_ways([a, b])
        self.assertEqual(rings, [])
        self.assertEqual(len(chains), 1)
        self.assertEqual(chains[0], [(0, 0), (1, 0), (2, 0), (3, 0), (4, 0)])

    def test_reversed_way_still_joins_by_shared_node_id(self):
        a = way(1, [10, 11, 12], [(0, 0), (1, 0), (2, 0)])
        # b runs the opposite direction but shares node 12 at its own start.
        b = way(2, [12, 13, 14], [(2, 0), (3, 0), (4, 0)])
        b['nodes'] = [14, 13, 12]
        b['geometry'] = [{'lat': lat, 'lon': lon} for lon, lat in [(4, 0), (3, 0), (2, 0)]]
        chains, rings = sea_mask.merge_ways([a, b])
        self.assertEqual(len(chains), 1)
        self.assertEqual(chains[0][0], (0, 0))
        self.assertEqual(chains[0][-1], (4, 0))

    def test_a_way_already_closed_is_a_ring_not_merged_with_others(self):
        ring = way(1, [20, 21, 22, 20], [(0, 0), (1, 0), (0, 1), (0, 0)])
        other = way(2, [20, 30], [(0, 0), (5, 5)])
        chains, rings = sea_mask.merge_ways([ring, other])
        self.assertEqual(len(rings), 1)
        self.assertEqual(len(chains), 1)  # `other` stays open, unmerged with the ring

    def test_disjoint_ways_never_merge(self):
        a = way(1, [1, 2], [(0, 0), (1, 0)])
        b = way(2, [3, 4], [(10, 10), (11, 10)])
        chains, rings = sea_mask.merge_ways([a, b])
        self.assertEqual(len(chains), 2)


class BuildMaskFromProjectedTests(unittest.TestCase):
    """Exercises the projection-agnostic core directly, in a flat local
    metric frame, so the coastline/land/sea geometry is exact and easy to
    reason about."""

    BBOX = (0.0, 0.0, 1000.0, 1000.0)

    def test_no_coastline_returns_none(self):
        self.assertIsNone(sea_mask.build_mask_from_projected([], [], self.BBOX))

    def test_straight_coastline_sea_on_the_right_of_travel_direction(self):
        # A chain running due east along y=500. OSM: land on the LEFT of
        # travel direction. Travelling +x, left is +y (north) -> land north,
        # sea south.
        chain = [(-500.0, 500.0), (1500.0, 500.0)]
        mask = sea_mask.build_mask_from_projected([chain], [], self.BBOX, tolerance_m=0)
        self.assertIsNotNone(mask)
        self.assertTrue(mask.contains(_pt(500, 100)))   # south of the line: sea
        self.assertFalse(mask.contains(_pt(500, 900)))  # north of the line: land

    def test_reversing_the_way_direction_flips_which_side_is_sea(self):
        chain = [(1500.0, 500.0), (-500.0, 500.0)]  # same line, opposite direction
        mask = sea_mask.build_mask_from_projected([chain], [], self.BBOX, tolerance_m=0)
        self.assertIsNotNone(mask)
        self.assertTrue(mask.contains(_pt(500, 900)))
        self.assertFalse(mask.contains(_pt(500, 100)))

    def test_headland_a_promontory_of_land_into_the_sea(self):
        # Base at y=700 (land north of it, sea south, by the same
        # left-of-travel rule as the straight-coastline case), with a
        # V dipping down to (500, 300): the dip is a spit of land reaching
        # south into what is otherwise open sea on both sides of it.
        chain = [(-500.0, 700.0), (400.0, 700.0), (500.0, 300.0), (600.0, 700.0), (1500.0, 700.0)]
        mask = sea_mask.build_mask_from_projected([chain], [], self.BBOX, tolerance_m=0)
        self.assertIsNotNone(mask)
        self.assertFalse(mask.contains(_pt(500, 500)))   # inside the spit: land
        self.assertTrue(mask.contains(_pt(500, 100)))    # south of everything: sea
        self.assertTrue(mask.contains(_pt(50, 500)))     # sea beside the spit, same latitude

    def test_bay_an_indentation_of_sea_into_the_land(self):
        # Mirror image of the headland: base at y=300 (land north, sea
        # south), with a V rising to (500, 700): the notch is sea reaching
        # north into what is otherwise land on both sides of it.
        chain = [(-500.0, 300.0), (400.0, 300.0), (500.0, 700.0), (600.0, 300.0), (1500.0, 300.0)]
        mask = sea_mask.build_mask_from_projected([chain], [], self.BBOX, tolerance_m=0)
        self.assertIsNotNone(mask)
        self.assertTrue(mask.contains(_pt(500, 500)))    # inside the notch: sea
        self.assertFalse(mask.contains(_pt(500, 900)))   # north of everything: land
        self.assertFalse(mask.contains(_pt(50, 500)))    # land beside the notch, same latitude

    def test_dangling_endpoint_inside_the_bbox_still_closes_a_face(self):
        # Both ends of this chain land strictly inside the bbox (not clipped
        # at an edge): a real, unmapped-further coastline end.
        chain = [(200.0, 500.0), (800.0, 500.0)]
        mask = sea_mask.build_mask_from_projected([chain], [], self.BBOX, tolerance_m=0)
        self.assertIsNotNone(mask)
        self.assertTrue(mask.contains(_pt(500, 100)))
        self.assertFalse(mask.contains(_pt(500, 900)))

    def test_island_ring_land_inside_sea_outside(self):
        # A small square ring wound counter-clockwise (in these x-right,
        # y-up coordinates): travelling that way keeps a simple polygon's
        # interior on the left, so land (interior) is on the left throughout.
        ring = [(400.0, 400.0), (600.0, 400.0), (600.0, 600.0), (400.0, 600.0), (400.0, 400.0)]
        mask = sea_mask.build_mask_from_projected([], [ring], self.BBOX, tolerance_m=0)
        self.assertIsNotNone(mask)
        self.assertFalse(mask.contains(_pt(500, 500)))   # inside the island: land
        self.assertTrue(mask.contains(_pt(50, 50)))       # open water elsewhere in bbox

    def test_probe_points_near_a_shared_vertex_still_classify_correctly(self):
        # A vertex shared by two segments at a shallow angle is exactly where
        # the nearest-segment side test could flip; probe right next to it.
        chain = [(-500.0, 500.0), (500.0, 500.0), (1500.0, 505.0)]
        mask = sea_mask.build_mask_from_projected([chain], [], self.BBOX, tolerance_m=0)
        self.assertIsNotNone(mask)
        self.assertTrue(mask.contains(_pt(499, 100)))
        self.assertTrue(mask.contains(_pt(501, 100)))
        self.assertFalse(mask.contains(_pt(499, 900)))
        self.assertFalse(mask.contains(_pt(501, 900)))

    def test_tolerance_buffers_the_sea_mask_outward(self):
        chain = [(-500.0, 500.0), (1500.0, 500.0)]
        tight = sea_mask.build_mask_from_projected([chain], [], self.BBOX, tolerance_m=0)
        buffered = sea_mask.build_mask_from_projected([chain], [], self.BBOX, tolerance_m=5.0)
        self.assertGreater(buffered.area, tight.area)


def _pt(x, y):
    from shapely.geometry import Point
    return Point(x, y)


class BuildSeaMaskProjectionTests(unittest.TestCase):
    """`build_sea_mask` end to end: WGS84 coastline -> projected mask."""

    def test_projects_wgs84_coastline_before_classifying(self):
        transformer = pyproj.Transformer.from_crs(4326, 32610, always_xy=True)
        # A short east-west coastline crossing a bbox near Monterey, CA.
        lon0, lat0 = -121.95, 36.60
        lon1, lat1 = -121.90, 36.60
        chain_way = way(99, [1, 2], [(lon0, lat0), (lon1, lat1)])
        x0, y0 = transformer.transform(lon0 - 0.01, lat0 - 0.002)
        x1, y1 = transformer.transform(lon1 + 0.01, lat0 + 0.002)
        bbox = (min(x0, x1), min(y0, y1), max(x0, x1), max(y0, y1))
        mask = sea_mask.build_sea_mask([chain_way], bbox, transformer, tolerance_m=0)
        self.assertIsNotNone(mask)


class CoastlineWaysFromSnapshotTests(unittest.TestCase):
    def test_reads_only_tagged_coastline_ways_with_geometry(self):
        doc = {'elements': [
            way(1, [1, 2], [(0, 0), (1, 0)]),
            {'type': 'way', 'id': 2, 'nodes': [3, 4], 'tags': {'building': 'yes'},
             'geometry': [{'lat': 0, 'lon': 0}, {'lat': 1, 'lon': 1}]},
            {'type': 'way', 'id': 3, 'nodes': [5, 6], 'tags': {'natural': 'coastline'}},  # no geometry
        ]}
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'overpass.json.gz'
            path.write_bytes(gzip.compress(json.dumps(doc).encode('utf-8')))
            ways, sha256 = sea_mask.coastline_ways_from_snapshot(path)
        self.assertEqual([w['id'] for w in ways], [1])
        self.assertEqual(len(sha256), 64)


class BasisAndDigestTests(unittest.TestCase):
    """`coastline_geometry_digest` (factory input) and `coastline_basis`
    (manifest evidence) answer different questions and must not collapse
    into the same value."""

    def test_geometry_digest_is_stable_across_snapshots_with_identical_ways(self):
        ways_a = [way(7, [1, 2], [(0, 0), (1, 1)])]
        ways_b = [way(7, [1, 2], [(0, 0), (1, 1)])]  # byte-identical geometry, different snapshot
        self.assertEqual(sea_mask.coastline_geometry_digest(ways_a), sea_mask.coastline_geometry_digest(ways_b))
        self.assertNotEqual(sea_mask.coastline_basis(ways_a, 'sha-a'), sea_mask.coastline_basis(ways_b, 'sha-b'))

    def test_geometry_digest_changes_when_coordinates_move_under_the_same_id(self):
        moved = [way(7, [1, 2], [(0, 0), (2, 2)])]
        original = [way(7, [1, 2], [(0, 0), (1, 1)])]
        self.assertNotEqual(sea_mask.coastline_geometry_digest(moved), sea_mask.coastline_geometry_digest(original))

    def test_basis_records_the_snapshot_sha_the_geometry_digest_does_not(self):
        ways = [way(7, [1, 2], [(0, 0), (1, 1)])]
        basis = sea_mask.coastline_basis(ways, 'abc123')
        digest = sea_mask.coastline_geometry_digest(ways)
        self.assertIn('snapshotSha256', basis)
        self.assertNotIn('snapshotSha256', digest)
        self.assertIn('coordinatesHash', digest)


class ClassifyAndFillTests(unittest.TestCase):
    def test_matches_todays_behavior_with_no_mask(self):
        decoded = np.array([[np.nan, 0.0], [1.0, 2.0]])
        filled, land_empty, sea_fill, total = sea_mask.classify_and_fill(decoded, {}, None)
        self.assertIs(filled, decoded)
        self.assertEqual((land_empty, sea_fill, total), (2, 0, 4))

    def test_non_square_non_unit_pixels_are_sampled_at_their_true_location(self):
        # A 2x4 grid (rows x cols) over a 20x10 extent: 5 units/col, 5 units/row.
        decoded = np.zeros((2, 4))
        decoded[:] = np.nan
        extent = {'xmin': 0.0, 'ymin': 0.0, 'xmax': 20.0, 'ymax': 10.0}
        # Sea covers the right half of the extent (x > 10).
        from shapely.geometry import box
        sea = box(10.0, 0.0, 20.0, 10.0)
        filled, land_empty, sea_fill, total = sea_mask.classify_and_fill(decoded, extent, sea)
        self.assertEqual(total, 8)
        # Columns 0,1 (x centers 2.5, 7.5) are land; columns 2,3 (12.5, 17.5) are sea.
        self.assertEqual(sea_fill, 4)
        self.assertEqual(land_empty, 4)
        self.assertTrue(np.all(np.isfinite(filled[:, 2:])))
        self.assertTrue(np.all(~np.isfinite(filled[:, :2])))

    def test_pixel_size_bug_regression_a_1x1_unit_extent_still_finds_the_right_column(self):
        # Regression for the pre-fix assumption of exactly 1 unit/pixel: a
        # coarse grid over a wide extent must not sample at integer offsets
        # from origin, or every pixel misclassifies.
        decoded = np.full((1, 2), np.nan)
        extent = {'xmin': 0.0, 'ymin': 0.0, 'xmax': 1000.0, 'ymax': 500.0}
        from shapely.geometry import box
        sea = box(500.0, 0.0, 1000.0, 500.0)  # right half only
        _filled, land_empty, sea_fill, _total = sea_mask.classify_and_fill(decoded, extent, sea)
        self.assertEqual(sea_fill, 1)
        self.assertEqual(land_empty, 1)


class RoundTripThroughARealGeoTiffTests(unittest.TestCase):
    """Proves the chosen `SEA_FILL_VALUE_M` survives `elevation_raster`'s own
    nodata handling: a fill value must never come back out as NaN, and must
    never be re-counted by `empty_fraction` after a write/read cycle."""

    def test_filled_cells_stay_finite_and_non_empty_after_a_tiff_round_trip(self):
        from osgeo import gdal
        gdal.UseExceptions()
        nodata = -9999.0
        raster = np.array([[nodata, nodata, 1.0], [2.0, 0.0, 3.0]], dtype=np.float32)
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'test.tiff'
            driver = gdal.GetDriverByName('GTiff')
            ds = driver.Create(str(path), raster.shape[1], raster.shape[0], 1, gdal.GDT_Float32)
            ds.SetGeoTransform([0.0, 1.0, 0.0, 2.0, 0.0, -1.0])
            band = ds.GetRasterBand(1)
            band.SetNoDataValue(nodata)
            band.WriteArray(raster)
            band, ds = None, None

            decoded, _nodata, _decoder = elevation_raster.read_elevation(path)
            self.assertTrue(math.isnan(decoded[0, 0]))
            extent = {'xmin': 0.0, 'ymin': 0.0, 'xmax': 3.0, 'ymax': 2.0}
            from shapely.geometry import box
            sea = box(0.0, 0.0, 3.0, 2.0)  # whole grid is sea
            filled, land_empty, sea_fill, _total = sea_mask.classify_and_fill(decoded, extent, sea)
            self.assertEqual(land_empty, 0)
            self.assertEqual(sea_fill, 3)  # the two NaN cells plus the literal-zero cell

            ds2 = driver.Create(str(Path(tmp) / 'filled.tiff'), raster.shape[1], raster.shape[0], 1, gdal.GDT_Float32)
            ds2.SetGeoTransform([0.0, 1.0, 0.0, 2.0, 0.0, -1.0])
            band2 = ds2.GetRasterBand(1)
            band2.SetNoDataValue(nodata)
            band2.WriteArray(filled.astype(np.float32))
            band2, ds2 = None, None

            reread, _nodata2, _decoder2 = elevation_raster.read_elevation(Path(tmp) / 'filled.tiff')
            self.assertTrue(np.all(np.isfinite(reread)))
            self.assertEqual(elevation_raster.empty_fraction(reread), 0.0)
            self.assertTrue(np.allclose(reread[np.isnan(decoded)], sea_mask.SEA_FILL_VALUE_M))


if __name__ == '__main__':
    unittest.main()
