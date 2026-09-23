#!/usr/bin/env python3
"""Detect tee-complex candidates directly from imagery + DEM (Phase 2 item
6 follow-up, round 2, item 4): for a course whose OSM extract has no
`golf=tee` ways at all -- The Cardinal (`sedgefield-country-club-dye-course`)
has zero -- `propose-routes.py` has no tee candidates to pair against greens.
This finds them independently of any hole assignment, the same way
`derive-surface-traces.py` finds fairway corridors: a whole-course scan, not
per-hole (there's no route line to anchor to yet).

A real tee complex is small, close to flat, and more tightly mown (brighter,
smoother) than the rough or even the fairway around it -- teeing grounds get
the shortest cut and the most levelling on the property. This looks for
connected patches that are simultaneously:
  * turf-range NDVI (same range `derive-surface-traces.py` uses for fairway,
    since a tee is also mown grass, not sand/water/pavement);
  * bright and smooth relative to the *whole-course* turf population (not a
    single hole's corridor median, since there's no corridor yet) -- reusing
    the same "brightness_smooth_m"-smoothed, multi-scale-texture recipe as
    the fairway/rough split, so mowing stripes don't fragment a tee deck the
    same way they don't fragment a fairway;
  * flat: DEM slope magnitude under `flat_slope_max` (a builder levels a
    teeing ground; a fairway or rough slope is not artificially flattened);
  * compact and right-sized: a single tee deck is roughly 8-55m on its long
    side, 4-30m on its short side, and reasonably rectangular (fill-ratio
    against its own bounding box above `min_compactness`) -- this is what
    tells a tee deck apart from a long, narrow fairway landing strip (which
    is also flat-ish and well-mown but has low fill-ratio against its
    bounding box) or a greens complex (round, usually near a green's own
    polygon and a cluster of bunkers, not tested for here directly).

This does not know which physical hole a detected complex belongs to, or
which end of it is "the tee" versus a mower turnaround at the corridor's
far edge -- `propose-routes.py`'s existing tee/green pairing, yardage cost,
and corridor-coverage bonus resolve that the same way they already do for
OSM-sourced tee candidates. Output candidates are meant to be passed to
`propose-routes.py` as `--extra-tees` (wired through its
`extra_tee_candidates` parameter).

Before trusting this on a course with no OSM tees to check against (The
Cardinal), validate it on a course that does have real OSM tees: hide them,
run detection over the whole property, and report precision/recall of
detected-complex centroids against the hidden true tee centroids at a
distance tolerance (see `validate()` / `--validate-course`).
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
from osgeo import osr
from shapely.geometry import Point, Polygon, mapping

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import course_raster as cr  # noqa: E402

TEXTURE_SCALES_PX = (3, 5, 9)

DEFAULTS = {
    'ndvi_min': 0.05,
    'ndvi_max': 0.95,          # wider than the fairway tracer's turf ceiling: whole-course scan sees
                                # brighter/greener tightly-mown turf types than a single fairway corridor does
    'brightness_smooth_m': 10.0,   # same mowing-stripe defeat as the fairway/rough split
    'brightness_percentile': 60.0,  # a tee must be at least this bright relative to *other turf* course-wide
    'flat_slope_max': 0.06,    # ~3.4 degrees; generous given the DEM's ~1m grid and unknown vertical accuracy
    'open_radius_m': 1.5,
    'min_area_m2': 60.0,       # roughly an 8x8m single tee marker
    'max_area_m2': 2600.0,     # roughly a 40x65m multi-deck complex picked up as one blob
    'min_long_side_m': 8.0,
    'max_long_side_m': 55.0,
    'min_short_side_m': 4.0,
    'max_short_side_m': 30.0,
    'min_compactness': 0.35,   # area / bounding-box area; excludes long thin fairway-strip-shaped blobs
    'confidence_min': 0.0,     # caller's floor; 0.0 keeps everything and lets the caller filter/report
}


def _slope_magnitude(dem, pixel_m):
    """Rise/run slope magnitude on the DEM's own grid (already resampled
    onto the NAIP grid by the caller, so `pixel_m` applies to both)."""
    dz_dy, dz_dx = np.gradient(dem, pixel_m[1], pixel_m[0])
    return np.sqrt(dz_dx ** 2 + dz_dy ** 2)


def _boundary_mask(naip, boundary_wgs84):
    """A True/False mask on the NAIP grid for whether each pixel center
    falls inside `boundary_wgs84` (a shapely Polygon/MultiPolygon in
    WGS84). Off-property ground -- neighbouring residential lawns, road
    medians, driveways -- is otherwise indistinguishable from a tee: also
    small, flat, bright and mown."""
    import shapely.vectorized
    boundary_xy = cr.wgs84_to_epsg(boundary_wgs84, naip.epsg)
    xs, ys = naip.xy_grid()
    return shapely.vectorized.contains(boundary_xy, xs, ys)


def detect(naip, dem, options=None, boundary_wgs84=None):
    """Whole-course tee-complex candidates. Returns a list of dicts:
    `{id, centroidWgs84: (lon, lat), geometryWgs84, areaM2, confidence,
    evidence}`. `naip` and `dem` are `course_raster.Raster`s already warped
    onto the same grid (see `_load_grid` / `derive-surface-traces.py`'s
    `_resolve_grid`, which this reuses). `boundary_wgs84`, when given (a
    course-boundary polygon, e.g. a facility's `aoi.json` `polygon`),
    restricts candidates to inside it -- see `_boundary_mask`."""
    options = dict(DEFAULTS, **(options or {}))
    if naip.array.shape[0] < 4:
        raise ValueError('NAIP raster needs 4 bands (red, green, blue, nir)')
    pixel_m = naip.pixel_size()
    red, green, blue, nir = naip.array[0], naip.array[1], naip.array[2], naip.array[3]
    with np.errstate(divide='ignore', invalid='ignore'):
        ndvi = np.where((nir + red) > 0, (nir - red) / (nir + red), 0.0)
    turf_mask = (ndvi >= options['ndvi_min']) & (ndvi <= options['ndvi_max'])

    brightness = (red + green + blue + nir) / 4.0
    smooth_px = max(1, int(round(options['brightness_smooth_m'] / max(pixel_m[0], 1e-6))))
    from scipy.ndimage import uniform_filter
    brightness_smooth = uniform_filter(brightness, size=smooth_px, mode='nearest')
    texture_multi = np.mean([cr.local_std(brightness, size) for size in TEXTURE_SCALES_PX], axis=0)

    turf_bright = brightness_smooth[turf_mask]
    turf_texture = texture_multi[turf_mask]
    if turf_bright.size < 100:
        return []
    bright_cut = np.percentile(turf_bright, options['brightness_percentile'])
    texture_cut = np.percentile(turf_texture, options['brightness_percentile'])  # smoother than most turf too
    bright_mask = turf_mask & (brightness_smooth >= bright_cut) & (texture_multi <= texture_cut)

    dem_grid = dem.array[0] if dem.array.ndim == 3 else dem.array
    slope = _slope_magnitude(dem_grid, dem.pixel_size())
    flat_mask = slope <= options['flat_slope_max']

    candidate_mask = bright_mask & flat_mask
    if boundary_wgs84 is not None:
        # ANDed into the final candidate mask, not the turf population used for the brightness/texture
        # percentiles above -- doing it there shifts those percentiles (a smaller, different reference
        # population) and can silently drop or admit candidates that have nothing to do with the
        # boundary; done here it can only ever remove off-property false positives.
        candidate_mask &= _boundary_mask(naip, boundary_wgs84)
    candidate_mask = cr.binary_opening(candidate_mask, options['open_radius_m'], pixel_m)

    from scipy.ndimage import label
    labeled, count = label(candidate_mask)
    pixel_area = pixel_m[0] * pixel_m[1]
    results = []
    for i in range(1, count + 1):
        component = labeled == i
        area_m2 = float(component.sum()) * pixel_area
        if not (options['min_area_m2'] <= area_m2 <= options['max_area_m2']):
            continue
        rows, cols = np.where(component)
        height_m = (rows.max() - rows.min() + 1) * pixel_m[1]
        width_m = (cols.max() - cols.min() + 1) * pixel_m[0]
        long_side, short_side = max(height_m, width_m), min(height_m, width_m)
        if not (options['min_long_side_m'] <= long_side <= options['max_long_side_m']):
            continue
        if not (options['min_short_side_m'] <= short_side <= options['max_short_side_m']):
            continue
        bbox_area = height_m * width_m
        compactness = area_m2 / bbox_area if bbox_area > 0 else 0.0
        if compactness < options['min_compactness']:
            continue

        polygon_xy = cr.polygonize_mask(component, naip.geotransform, naip.epsg)
        if polygon_xy is None or polygon_xy.is_empty:
            continue
        polygon_xy = cr.largest_polygon(polygon_xy)
        polygon_wgs84 = cr.epsg_to_wgs84(polygon_xy, naip.epsg)
        centroid_xy = polygon_xy.centroid
        centroid_wgs84 = cr.epsg_to_wgs84(centroid_xy, naip.epsg)

        mean_slope = float(slope[component].mean())
        mean_bright_z = float((brightness_smooth[component].mean() - turf_bright.mean()) / max(turf_bright.std(), 1e-6))
        flatness_score = max(0.0, 1.0 - mean_slope / max(options['flat_slope_max'], 1e-6))
        brightness_score = 1.0 / (1.0 + np.exp(-mean_bright_z))  # squash z-score to (0, 1)
        confidence = round(0.4 * flatness_score + 0.35 * brightness_score + 0.25 * compactness, 4)
        if confidence < options['confidence_min']:
            continue

        results.append({
            'id': f'detected-tee-{i:04d}',
            'centroidWgs84': (centroid_wgs84.x, centroid_wgs84.y),
            'geometryWgs84': mapping(polygon_wgs84),
            'areaM2': round(area_m2, 1),
            'confidence': confidence,
            'evidence': {
                'longSideM': round(long_side, 1), 'shortSideM': round(short_side, 1),
                'compactness': round(compactness, 3), 'meanSlope': round(mean_slope, 4),
                'meanBrightnessZ': round(mean_bright_z, 3),
            },
        })
    results.sort(key=lambda r: -r['confidence'])
    return results


def load_grid(naip_path, dem_path, epsg, pixel_m=1.0):
    """NAIP+DEM warped onto a common metric grid at `epsg`/`pixel_m`.

    `epsg` must be a metric CRS. The Cardinal's native ortho mosaic and DEM
    are both NAD83(2011) / North Carolina (ftUS) (EPSG:6543) -- US survey
    feet, not metres -- and every length/area/slope constant in `DEFAULTS`
    is in metres: reading that raster directly would silently make every
    length filter wrong by ~3.28x, every area filter by ~10.76x, and
    understate slope by ~3.28x (DEM heights are already metres per its
    export README; only the horizontal spacing is in feet). Always
    reproject through an explicit metric target (e.g.
    `course_crs.utm_epsg(*scorecard['originWgs84'])`) at an explicit
    metric pixel size instead of trusting whatever CRS the source raster
    happens to be in."""
    srs = osr.SpatialReference()
    srs.ImportFromEPSG(epsg)
    linear_unit = srs.GetLinearUnitsName().lower()
    if 'metre' not in linear_unit and 'meter' not in linear_unit:
        raise ValueError(f'load_grid target EPSG:{epsg} is not metric (linear unit: {linear_unit!r})')

    naip_native = cr.read_raster(naip_path)
    if naip_native.epsg is None:
        raise ValueError('NAIP raster has no readable CRS')
    bounds = cr.project_geometry(Polygon.from_bounds(*naip_native.bounds()), naip_native.epsg, epsg).bounds
    naip = cr.warp_to_grid(naip_path, epsg, bounds, (pixel_m, pixel_m), resample='bilinear')
    dem = cr.warp_to_grid(dem_path, epsg, naip.bounds(), naip.pixel_size(), resample='bilinear')
    got = naip.pixel_size()
    assert abs(got[0] - pixel_m) < 0.01 and abs(got[1] - pixel_m) < 0.01, f'unexpected pixel size after warp: {got}'
    return naip, dem


def candidates_to_tee_records(candidates):
    """Adapt `detect()` output to the `{'id','kind','centroidWgs84',
    'geometryWgs84','ref'}` shape `propose-routes.py`'s
    `collect_osm_candidates`/`collect_surface_candidates` produce, so these
    can be passed straight through as `extra_tee_candidates`."""
    return [{'id': c['id'], 'kind': 'tee', 'centroidWgs84': c['centroidWgs84'],
              'geometryWgs84': c['geometryWgs84'], 'ref': None, 'detectionConfidence': c['confidence']}
             for c in candidates]


def validate(true_tees_xy, detected_xy, tolerance_m=20.0):
    """Greedy nearest-neighbour matching of detected centroids to true tee
    centroids (both projected-CRS (x, y) tuples) within `tolerance_m`.
    Returns precision, recall and the unmatched lists for a report."""
    remaining_true = list(true_tees_xy)
    remaining_detected = list(detected_xy)
    matches = []
    pairs = []
    for ti, t in enumerate(true_tees_xy):
        for di, d in enumerate(detected_xy):
            dist = ((t[0] - d[0]) ** 2 + (t[1] - d[1]) ** 2) ** 0.5
            if dist <= tolerance_m:
                pairs.append((dist, ti, di))
    pairs.sort()
    used_true, used_detected = set(), set()
    for dist, ti, di in pairs:
        if ti in used_true or di in used_detected:
            continue
        used_true.add(ti)
        used_detected.add(di)
        matches.append((ti, di, round(dist, 1)))
    precision = len(matches) / len(detected_xy) if detected_xy else 0.0
    recall = len(matches) / len(true_tees_xy) if true_tees_xy else 0.0
    return {
        'truCount': len(true_tees_xy), 'detectedCount': len(detected_xy), 'matchedCount': len(matches),
        'precision': round(precision, 3), 'recall': round(recall, 3), 'matches': matches,
    }


def parse_args(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--naip', required=True, type=Path)
    parser.add_argument('--dem', required=True, type=Path)
    parser.add_argument('--out', required=True, type=Path)
    parser.add_argument('--epsg', required=True, type=int, help='Metric target CRS (e.g. a UTM zone)')
    parser.add_argument('--pixel-m', type=float, default=1.0)
    parser.add_argument('--aoi', type=Path, default=None,
                         help="A facility's aoi.json (its 'polygon' field, a [[lon,lat],...] ring, "
                              'restricts detection to on-property ground)')
    parser.add_argument('--confidence-min', type=float, default=DEFAULTS['confidence_min'])
    return parser.parse_args(argv)


def main(argv=None):
    args = parse_args(argv)
    naip, dem = load_grid(args.naip, args.dem, args.epsg, pixel_m=args.pixel_m)
    options = dict(DEFAULTS, confidence_min=args.confidence_min)
    boundary = None
    if args.aoi:
        aoi = json.loads(args.aoi.read_text())
        boundary = Polygon(aoi['polygon'])
    candidates = detect(naip, dem, options, boundary_wgs84=boundary)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps({'candidates': candidates, 'options': options}, indent=2) + '\n')
    print(f'{len(candidates)} tee-complex candidates -> {args.out}', file=sys.stderr)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
