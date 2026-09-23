#!/usr/bin/env python3
"""Whole-course surface detection for a facility whose OSM extract has no
usable `golf=green`/`golf=tee` ways at all (Landfall's six layouts, Danville,
Lakeview, The Manor, Hendersonville's cart-paths-only extract) or has one but
not the other at anything like the count its layouts' hole totals need (The
Cardinal: 20 greens, 0 tees; Boonsboro: 6 greens, 25 tees). There is no route
line to anchor to -- unlike `derive-surface-traces.py`'s per-hole fairway
tracer, or `propose-routes.py` which needs candidates before it can even
attempt a route -- so every detector here scans the full property at once,
the same way `detect-tee-complexes.py` (whose tee detector this module
reuses unmodified) already does for tees.

Three detectors, in this order because each later one uses the earlier one's
output as evidence:

  1. **bunkers** -- the highest-contrast feature (bright sand, very low
     NDVI, distinguishable from both turf and water) and needs no other
     detector's output.
  2. **greens** -- compact, very smooth, brightly-turfed patches, usually
     slightly crowned, usually ringed by bunkers. Bunker proximity from step
     1 is folded into green confidence.
  3. **tees** -- `detect-tee-complexes.py`'s existing whole-course tee
     detector (imported, not copied: that algorithm is already validated
     separately and this module must not fork it).

**The lidar CHM does not discriminate turf types.** A green is mown to
~3-4mm, a fairway to ~15-20mm, rough taller still -- all of those differences
are far below a 3DEP lidar CHM's practical vertical resolution once it is
differenced against a 1m bare-earth DEM (typical noise floor well over
10cm). Treating CHM as a turf-height signal would be fitting noise. What the
CHM *does* reliably tell apart is tree canopy (several metres) from anything
else, and unlike NAIP reflectance it is unaffected by dormant turf color or
autumn shadow -- the two causes the round-2 NAIP-only tracer's write-up
names for its held-out failures. So every detector here uses the CHM only as
an **exclusion gate** (reject a candidate sitting under tree canopy) plus a
small confirmatory "open ground" confidence term, never as a brightness- or
smoothness-equivalent feature. A course outside 3DEP coverage (`no_coverage`,
`failed`, or no lidar directory at all) runs the same detectors with that
gate simply absent -- `load_grid` returns `chm=None` and every function below
treats that as "no opinion", not as a zero.

Physical priors (see the task brief this module was built against):
  * green: 300-1,200 sqm, compact/round, very smooth and uniformly bright
    turf, slight positive local relief (a crown), usually near 1+ bunkers.
  * tee: 8-55m long side, 4-30m short side, flat, bright/smooth turf --
    `detect-tee-complexes.py`'s existing recipe.
  * bunker: bright sand (low NDVI, high visible+NIR reflectance, unlike
    water which is dark in NIR), 10-3,000 sqm, not required to be compact
    (bunkers are often irregular), never on a paved/roofed footprint.

Validate before wiring into the factory DAG: `eval-course-surfaces.py`.
"""
from __future__ import annotations

import argparse
import gzip
import importlib.util as _ilu
import json
import sys
from pathlib import Path

import numpy as np
from osgeo import osr
from shapely.geometry import Polygon, mapping

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import course_raster as cr  # noqa: E402


def _load_module(name, filename):
    spec = _ilu.spec_from_file_location(name, str(HERE / filename))
    module = _ilu.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


# `detect-tee-complexes.py`'s tee detector is reused unmodified (see the
# module docstring): it is already validated on its own, and this module
# must not fork or re-derive it. `propose-routes.py`'s `cluster_tee_complexes`
# is reused read-only too, for the green-distance gate below -- neither file
# is edited by this module (both are owned by other workers on this task).
dtc = _load_module('detect_tee_complexes', 'detect-tee-complexes.py')
pr = _load_module('propose_routes', 'propose-routes.py')

TEE_GREEN_MIN_M = 90.0    # "a tee complex should lie 90-600m from some green"
TEE_GREEN_MAX_M = 600.0
TEE_GREEN_EXCLUDE_M = 40.0  # "and not within 40m of a green" -- a green's own apron/surrounds, not a tee

CHM_NODATA = -9999.0
CHM_TREE_MIN_M = 3.0     # matches derive-canopy-naip.py's own tree floor
CHM_TREE_MAX_M = 60.0    # above this: unclassified noise, not ground truth either way

TEXTURE_SCALES_PX = (3, 5, 9)

GREEN_DEFAULTS = {
    'ndvi_min': 0.10,
    'ndvi_max': 0.90,
    'brightness_smooth_m': 6.0,        # tighter than the tee detector's 10m: a green is smaller
    'texture_scales_m': (3.0, 5.0, 9.0),
    'local_context_m': 55.0,           # local-population window size: a hole's worth of fairway+rough+green
    'slope_max': 0.14,                 # looser than a tee's flat cut: a green can be gently domed
    'open_radius_m': 1.5,
    'seed_percentile': 92.0,           # strict: only a pixel this confidently green-like can start a candidate
    'grow_percentile': 65.0,           # permissive: a seed is grown out to the full extent of this weaker band
    'min_area_m2': 150.0,              # a little under the 300 prior: small/older greens exist
    'max_area_m2': 1800.0,             # a little over the 1200 prior: double greens, big modern greens
    'split_area_m2': 1800.0,           # a component larger than this is probably green+approach merged
    'min_roundness': 0.30,             # 4*pi*area/perimeter^2; a fused green+fairway blob fails this
    'min_compactness': 0.35,           # area / own-bbox area, the fallback shape gate
    'peak_spacing_m': 22.0,            # minimum separation between two split seeds inside one big blob
    'bunker_bonus_radius_m': 30.0,     # "most greens have >=1 bunker within 30m"
    'bunker_bonus_weight': 0.20,
    'planarity_ring_m': 30.0,          # the annulus a candidate's own DEM planarity is compared against
    'planarity_ring_margin_m': 4.0,    # gap between the candidate's own footprint and the ring, so the
                                        # ring doesn't sample the candidate's own gentle apron transition
    'planarity_scale_m': 0.15,         # RMS-residual-improvement (metres) that saturates the planarity term
    'confidence_min': 0.0,
}

BUNKER_DEFAULTS = {
    'ndvi_max': 0.15,               # sand is barely vegetated
    'brightness_min': 120.0,        # sand is bright in the visible bands (0-255 NAIP bytes)
    'nir_min': 90.0,                # excludes water (dark in NIR); sand still reflects NIR
    'open_radius_m': 1.0,
    'close_radius_m': 1.5,
    'min_area_m2': 8.0,
    'max_area_m2': 3200.0,
    'min_solidity': 0.45,           # area / convex-hull area; screens out thin cart-path slivers
    'max_long_short_ratio': 7.0,
    'confidence_min': 0.0,
}


# ---------------------------------------------------------------------------
# Grid loading


def load_grid(naip_path, dem_path, epsg, chm_path=None, pixel_m=1.0):
    """NAIP + DEM (+ optional lidar CHM) warped onto one shared metric grid
    at `epsg`/`pixel_m`. Mirrors `detect-tee-complexes.py`'s `load_grid`
    (see its docstring for why the target CRS must be explicitly metric --
    NC exports are natively US survey feet) and additionally warps the CHM,
    when given, onto the identical grid so every array below is pixel-for-
    pixel aligned.

    The CHM is resampled nearest-neighbour, not bilinear: it carries a
    sentinel nodata value (-9999) at every cell 3DEP didn't cover, and
    bilinear resampling would smear that sentinel into real ground returns
    at the boundary. Returns `(naip, dem, chm_or_None)`; `chm.array` is a
    single-band float array with `CHM_NODATA` preserved at uncovered cells.
    """
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

    chm = None
    if chm_path is not None and Path(chm_path).is_file():
        chm = cr.warp_to_grid(chm_path, epsg, naip.bounds(), naip.pixel_size(), resample='near')
    return naip, dem, chm


def chm_open_mask(chm):
    """`(valid, open_ground)` boolean grids from a warped CHM raster, or
    `(None, None)` when there is no CHM (no 3DEP coverage): `valid` is where
    3DEP actually returned a plausible height, `open_ground` is the subset
    of that below the tree floor -- see the module docstring for why this
    is an exclusion gate, not a turf-height feature."""
    if chm is None:
        return None, None
    grid = chm.array[0] if chm.array.ndim == 3 else chm.array
    valid = (grid != CHM_NODATA) & np.isfinite(grid) & (grid <= CHM_TREE_MAX_M)
    open_ground = valid & (grid < CHM_TREE_MIN_M)
    return valid, open_ground


# ---------------------------------------------------------------------------
# OSM-context exclusion (buildings, parking, roads, water): reduces the
# false positives round 2 attributed to indistinguishable-from-turf bright,
# flat, off-property ground -- a roof, a parking lot, a road shoulder.


def context_exclusion_mask(naip, context_extract, epsg):
    """True where a pixel sits on a building, parking lot, road, or mapped
    water body from a `facility.context.snapshot` extract -- ground that can
    look like a tee/green/bunker in NDVI+brightness+flatness but never is
    one. `context_extract` may be `None` (no context snapshot retained
    yet); returns an all-False mask in that case, never an error, since this
    is a defense-in-depth filter, not a required input."""
    xs, ys = naip.xy_grid()
    if not context_extract:
        return np.zeros(xs.shape, dtype=bool)
    from shapely.ops import unary_union
    import shapely.vectorized
    from factory import osm as osmlib

    polys = []
    EXCLUDE_TAGS = {
        'building': lambda v: True,
        'amenity': lambda v: v == 'parking',
        'natural': lambda v: v == 'water',
        'landuse': lambda v: v in ('residential', 'commercial', 'industrial'),
    }
    LINE_TAGS = {'highway': lambda v: True, 'waterway': lambda v: True}
    for element in context_extract.get('elements', []):
        if element.get('type') != 'way':
            continue
        tags = element.get('tags') or {}
        points = osmlib.way_points(element)
        if len(points) < 2:
            continue
        matched_area = any(pred(tags.get(key)) for key, pred in EXCLUDE_TAGS.items() if key in tags)
        matched_line = any(pred(tags.get(key)) for key, pred in LINE_TAGS.items() if key in tags)
        if matched_area and len(points) >= 4 and points[0] == points[-1]:
            polygon = Polygon(points)
            if polygon.is_valid and not polygon.is_empty and polygon.area > 0:
                polys.append(polygon)
        elif matched_line:
            from shapely.geometry import LineString
            line = LineString(points)
            if not line.is_empty:
                polys.append(line.buffer(0.00003))  # ~3m at these latitudes, in degrees
    if not polys:
        return np.zeros(xs.shape, dtype=bool)
    union_wgs84 = unary_union(polys)
    union_xy = cr.wgs84_to_epsg(union_wgs84, epsg)
    return shapely.vectorized.contains(union_xy, xs, ys)


# ---------------------------------------------------------------------------
# Shared per-course raster features


def _ndvi(naip):
    red, nir = naip.array[0], naip.array[3]
    with np.errstate(divide='ignore', invalid='ignore'):
        return np.where((nir + red) > 0, (nir - red) / (nir + red), 0.0)


def _brightness(naip):
    red, green, blue, nir = naip.array[0], naip.array[1], naip.array[2], naip.array[3]
    return (red + green + blue + nir) / 4.0


def _texture(brightness, scales_px):
    return np.mean([cr.local_std(brightness, size) for size in scales_px], axis=0)


def _px(meters, pixel_m):
    return max(1, int(round(meters / max(pixel_m[0], 1e-6))))


def _local_stats(value, weight_mask, size_px, global_mean, global_std):
    """Mean/std of `value` within a `size_px` window, counting only
    `weight_mask` pixels (turf, typically) -- a green a few percentiles
    above the *whole-property* turf population still reads as merely
    average against its own hole's fairway+rough, and a whole-course
    percentile cut therefore keeps far too much ordinary fairway (see the
    module's committed diagnosis against winchester-country-club's real
    OSM truth). Comparing each pixel against its own local neighbourhood
    instead directly encodes "distinctly better-mown than what's right
    around it", not merely "in the property's top decile somewhere".
    Falls back to the given global mean/std where a window has too little
    turf coverage to trust locally (e.g. right at the property edge)."""
    from scipy.ndimage import uniform_filter
    weight = weight_mask.astype(np.float64)
    count = uniform_filter(weight, size=size_px, mode='nearest')
    sum_v = uniform_filter(value * weight, size=size_px, mode='nearest')
    sum_v2 = uniform_filter((value ** 2) * weight, size=size_px, mode='nearest')
    enough = count > 0.15  # at least ~15% local turf coverage to trust the local stat
    with np.errstate(invalid='ignore', divide='ignore'):
        local_mean = np.where(enough, sum_v / np.where(count > 0, count, 1), global_mean)
        local_var = np.where(enough, sum_v2 / np.where(count > 0, count, 1) - local_mean ** 2, global_std ** 2)
    local_std = np.sqrt(np.clip(local_var, 1e-6, None))
    return local_mean, local_std


# ---------------------------------------------------------------------------
# Bunkers


def detect_bunkers(naip, chm=None, options=None, boundary_wgs84=None, exclusion_mask=None):
    """Whole-course bunker candidates: bright, low-NDVI sand, not water
    (dark in NIR), not a roof/road/parking lot (`exclusion_mask`), not under
    tree canopy when lidar covers the course. Returns the same
    `{id, centroidWgs84, geometryWgs84, areaM2, confidence, evidence}` shape
    `detect-tee-complexes.py.detect()` uses."""
    options = dict(BUNKER_DEFAULTS, **(options or {}))
    pixel_m = naip.pixel_size()
    red, green, blue, nir = naip.array[0], naip.array[1], naip.array[2], naip.array[3]
    ndvi = _ndvi(naip)
    brightness = (red + green + blue) / 3.0  # visible only: sand's NIR is high but lower than turf's

    sand_mask = (ndvi <= options['ndvi_max']) & (brightness >= options['brightness_min']) & (nir >= options['nir_min'])
    if exclusion_mask is not None:
        sand_mask &= ~exclusion_mask
    if boundary_wgs84 is not None:
        sand_mask &= _boundary_mask(naip, boundary_wgs84)
    _, open_ground = chm_open_mask(chm)
    if open_ground is not None:
        sand_mask &= open_ground

    sand_mask = cr.binary_opening(sand_mask, options['open_radius_m'], pixel_m)
    sand_mask = cr.binary_closing(sand_mask, options['close_radius_m'], pixel_m)

    from scipy.ndimage import label
    labeled, count = label(sand_mask)
    pixel_area = pixel_m[0] * pixel_m[1]
    results = []
    for i in range(1, count + 1):
        component = labeled == i
        area_m2 = float(component.sum()) * pixel_area
        if not (options['min_area_m2'] <= area_m2 <= options['max_area_m2']):
            continue
        polygon_xy = cr.polygonize_mask(component, naip.geotransform, naip.epsg)
        if polygon_xy is None or polygon_xy.is_empty:
            continue
        polygon_xy = cr.largest_polygon(polygon_xy).buffer(0)
        if polygon_xy.is_empty:
            continue
        hull = polygon_xy.convex_hull
        solidity = polygon_xy.area / hull.area if hull.area > 0 else 0.0
        if solidity < options['min_solidity']:
            continue
        minx, miny, maxx, maxy = polygon_xy.bounds
        long_side, short_side = max(maxx - minx, maxy - miny), max(1e-6, min(maxx - minx, maxy - miny))
        if long_side / short_side > options['max_long_short_ratio']:
            continue

        polygon_wgs84 = cr.epsg_to_wgs84(polygon_xy, naip.epsg)
        centroid_xy = polygon_xy.centroid
        centroid_wgs84 = cr.epsg_to_wgs84(centroid_xy, naip.epsg)

        mean_ndvi = float(ndvi[component].mean())
        mean_bright = float(brightness[component].mean())
        ndvi_score = max(0.0, min(1.0, (options['ndvi_max'] - mean_ndvi) / max(options['ndvi_max'], 1e-6)))
        bright_score = max(0.0, min(1.0, (mean_bright - options['brightness_min']) / 80.0))
        open_share = float(open_ground[component].mean()) if open_ground is not None else None
        confidence = round(max(0.0, min(1.0, 0.40 * ndvi_score + 0.30 * bright_score + 0.30 * solidity
                                         + (0.10 * (open_share or 0.0) if open_share is not None else 0.0))), 4)
        if confidence < options['confidence_min']:
            continue
        results.append({
            'id': f'detect-bunker-{i:04d}', 'kind': 'bunker',
            'centroidWgs84': (centroid_wgs84.x, centroid_wgs84.y),
            'geometryWgs84': mapping(polygon_wgs84), 'areaM2': round(area_m2, 1), 'confidence': confidence,
            'evidence': {'meanNdvi': round(mean_ndvi, 4), 'meanBrightness': round(mean_bright, 1),
                         'solidity': round(solidity, 3), 'chmOpenShare': round(open_share, 3) if open_share is not None else None},
        })
    results.sort(key=lambda r: -r['confidence'])
    return results


def _boundary_mask(naip, boundary_wgs84):
    import shapely.vectorized
    boundary_xy = cr.wgs84_to_epsg(boundary_wgs84, naip.epsg)
    xs, ys = naip.xy_grid()
    return shapely.vectorized.contains(boundary_xy, xs, ys)


# ---------------------------------------------------------------------------
# Greens


def _split_oversized_component(component, score, pixel_m, peak_spacing_m, max_area_m2):
    """A connected blob bigger than a plausible single green is almost
    always a green fused to its approach or a neighbouring fairway through
    a mown corridor (the same failure mode a naive turf-brightness threshold
    hits in `derive-surface-traces.py`'s round-2 write-up). Rather than
    reject it outright, pick local maxima of `score` at least
    `peak_spacing_m` apart inside the blob, then assign every blob pixel to
    its nearest peak (a Voronoi partition restricted to the blob) --
    approximates a watershed split without an extra dependency. Yields one
    boolean mask per peak."""
    from scipy.ndimage import distance_transform_edt, maximum_filter

    masked_score = np.where(component, score, -np.inf)
    spacing_px = max(1, int(round(peak_spacing_m / max(pixel_m[0], 1e-6))))
    local_max = maximum_filter(masked_score, size=2 * spacing_px + 1) == masked_score
    peak_mask = local_max & component & np.isfinite(masked_score)
    ys, xs = np.where(peak_mask)
    if len(ys) < 2:
        yield component
        return
    # De-duplicate peaks that survived within one spacing radius of a
    # stronger peak (maximum_filter ties on plateaus).
    order = np.argsort(-masked_score[ys, xs])
    kept_y, kept_x = [], []
    for idx in order:
        y, x = ys[idx], xs[idx]
        if all((y - ky) ** 2 + (x - kx) ** 2 >= spacing_px ** 2 for ky, kx in zip(kept_y, kept_x)):
            kept_y.append(y)
            kept_x.append(x)
    if len(kept_y) < 2:
        yield component
        return
    labels = np.zeros(component.shape, dtype=np.int32)
    for n, (y, x) in enumerate(zip(kept_y, kept_x), start=1):
        labels[y, x] = n
    _, (iy, ix) = distance_transform_edt(labels == 0, return_indices=True)
    nearest_label = labels[iy, ix]
    for n in range(1, len(kept_y) + 1):
        region = (nearest_label == n) & component
        if region.any():
            yield region


def _plane_residual(dem_grid, mask, pixel_m):
    """RMS residual (metres) of the best-fit plane through `dem_grid` at
    `mask`'s True cells. A green's own surface, even gently contoured, sits
    much closer to a single fitted plane than a 30m ring of ordinary
    terrain around it does (a mound, a swale, a fairway's camber) -- a
    planarity-*comparison*, not a raw crown height, which is why this is
    computed per-candidate against its own surrounding ring rather than as
    a fixed-radius per-pixel filter (a 1m bare-earth DEM's noise floor
    swamps a fixed few-centimetre crown threshold; comparing two windows'
    residuals cancels most of that noise). Returns `None` when `mask` has
    too few cells to fit a plane."""
    rows, cols = np.where(mask)
    if rows.size < 6:
        return None
    z = dem_grid[rows, cols]
    x = cols.astype(np.float64) * pixel_m[0]
    y = rows.astype(np.float64) * pixel_m[1]
    design = np.column_stack([x, y, np.ones_like(x)])
    coeffs, *_ = np.linalg.lstsq(design, z, rcond=None)
    residual = z - design @ coeffs
    return float(np.sqrt(np.mean(residual ** 2)))


def _planarity_score(dem_grid, region, pixel_m, ring_m, ring_margin_m, scale_m):
    """`clip((ring_residual - region_residual) / scale_m, 0, 1)` -- how much
    smoother/flatter `region`'s own DEM is than the annulus `ring_margin_m`
    to `ring_margin_m + ring_m` beyond its boundary. `None` (never a gate)
    when either fit has too few points to be meaningful. Crops to a local
    window first -- a whole-raster distance transform per candidate would
    be wasteful when a course can carry dozens of candidates."""
    from scipy.ndimage import distance_transform_edt
    region_residual = _plane_residual(dem_grid, region, pixel_m)
    if region_residual is None:
        return None
    pad_px = int(round((ring_margin_m + ring_m) / max(pixel_m[0], 1e-6))) + 2
    rows, cols = np.where(region)
    r0, r1 = max(0, rows.min() - pad_px), min(region.shape[0], rows.max() + pad_px + 1)
    c0, c1 = max(0, cols.min() - pad_px), min(region.shape[1], cols.max() + pad_px + 1)
    local_region = region[r0:r1, c0:c1]
    local_dem = dem_grid[r0:r1, c0:c1]
    dist_px = distance_transform_edt(~local_region) * max(pixel_m[0], 1e-6)
    ring_mask_local = (dist_px > ring_margin_m) & (dist_px <= ring_margin_m + ring_m)
    ring_residual = _plane_residual(local_dem, ring_mask_local, pixel_m)
    if ring_residual is None:
        return None
    return float(np.clip((ring_residual - region_residual) / max(scale_m, 1e-6), 0.0, 1.0))


def detect_greens(naip, dem, chm=None, options=None, boundary_wgs84=None, exclusion_mask=None, bunker_candidates=None):
    """Whole-course green candidates. See the module docstring for the
    scoring recipe (bright+smooth turf, high NDVI, flat-ish, optionally
    confirmed open by lidar) plus a per-candidate planarity comparison
    against its own surrounding ring (`_planarity_score`) and
    `_split_oversized_component` for how a green fused to its approach in
    the raw mask gets separated back out. `bunker_candidates`, when given,
    folds "is a detected bunker within `bunker_bonus_radius_m`" into
    confidence -- greens are usually ringed by bunkers; this is evidence,
    never a gate, so a green with no nearby bunker is still reported."""
    options = dict(GREEN_DEFAULTS, **(options or {}))
    pixel_m = naip.pixel_size()
    ndvi = _ndvi(naip)
    brightness = _brightness(naip)
    turf_mask = (ndvi >= options['ndvi_min']) & (ndvi <= options['ndvi_max'])

    from scipy.ndimage import uniform_filter
    smooth_px = _px(options['brightness_smooth_m'], pixel_m)
    brightness_smooth = uniform_filter(brightness, size=smooth_px, mode='nearest')
    texture_scales_px = [_px(m, pixel_m) for m in options['texture_scales_m']]
    texture_multi = _texture(brightness, texture_scales_px)

    dem_grid = dem.array[0] if dem.array.ndim == 3 else dem.array
    slope = dtc._slope_magnitude(dem_grid, dem.pixel_size())
    ndvi_smooth = uniform_filter(ndvi, size=smooth_px, mode='nearest')

    turf_bright = brightness_smooth[turf_mask]
    turf_texture = texture_multi[turf_mask]
    turf_ndvi = ndvi_smooth[turf_mask]
    if turf_bright.size < 100:
        return []
    bright_mean, bright_std = turf_bright.mean(), max(turf_bright.std(), 1e-6)
    texture_mean, texture_std = turf_texture.mean(), max(turf_texture.std(), 1e-6)
    ndvi_mean, ndvi_std = turf_ndvi.mean(), max(turf_ndvi.std(), 1e-6)

    # Local, not whole-course, population: see `_local_stats`. The window is
    # sized to span a hole (fairway + rough + green together), not a green
    # alone -- otherwise the "local" mean would just be the green again.
    local_px = _px(options['local_context_m'], pixel_m)
    local_bright_mean, local_bright_std = _local_stats(brightness_smooth, turf_mask, local_px, bright_mean, bright_std)
    local_texture_mean, local_texture_std = _local_stats(texture_multi, turf_mask, local_px, texture_mean, texture_std)
    local_ndvi_mean, local_ndvi_std = _local_stats(ndvi_smooth, turf_mask, local_px, ndvi_mean, ndvi_std)
    bright_z = (brightness_smooth - local_bright_mean) / local_bright_std
    texture_z = (texture_multi - local_texture_mean) / local_texture_std
    ndvi_z = (ndvi_smooth - local_ndvi_mean) / local_ndvi_std

    # "Greens are the highest-NDVI, lowest-texture compact blobs on the
    # property" -- NDVI vigour and mowing-smoothness are weighted about
    # equally; brightness alone (round 2's signal) is kept but downweighted,
    # since dormant/shadowed turf makes brightness the least reliable of the
    # three across seasons and courses.
    _, open_ground = chm_open_mask(chm)
    chm_term = open_ground.astype(np.float64) if open_ground is not None else np.zeros_like(brightness)
    chm_weight = 0.10 if open_ground is not None else 0.0
    score_weight_sum = 0.30 + 0.35 + 0.25 + chm_weight
    score = (0.30 * np.clip(bright_z, -3, 3) / 3 + 0.35 * np.clip(ndvi_z, -3, 3) / 3
             + 0.25 * np.clip(-texture_z, -3, 3) / 3 + chm_weight * chm_term) / score_weight_sum

    flat_mask = turf_mask & (slope <= options['slope_max'])
    if exclusion_mask is not None:
        flat_mask = flat_mask & ~exclusion_mask
    if boundary_wgs84 is not None:
        flat_mask = flat_mask & _boundary_mask(naip, boundary_wgs84)
    if open_ground is not None:
        flat_mask = flat_mask & open_ground

    # Hysteresis, the same idea Canny edge detection uses: a single hard
    # percentile cut either (a) high enough to keep fairway out, in which
    # case a real green with slightly uneven illumination only has *part*
    # of its own surface cross the bar and gets reported as a too-small
    # fragment (or dropped outright by the area gate), or (b) low enough to
    # recover a green's full extent, in which case it also recovers a lot
    # of fairway. A `seed_mask` pixel is confident enough on its own to
    # anchor a candidate; a `grow_mask` pixel is only accepted as part of a
    # region that already has a seed -- unseeded fairway never becomes a
    # candidate no matter how much of it clears the permissive bar.
    turf_scores = score[turf_mask]
    seed_mask = flat_mask & (score >= np.percentile(turf_scores, options['seed_percentile']))
    grow_mask = flat_mask & (score >= np.percentile(turf_scores, options['grow_percentile']))
    seed_mask = cr.binary_opening(seed_mask, options['open_radius_m'], pixel_m)

    from scipy.ndimage import label
    seed_labeled, seed_count = label(seed_mask)
    grow_labeled, grow_count = label(grow_mask)
    pixel_area = pixel_m[0] * pixel_m[1]

    seeded_grow_ids = set(np.unique(grow_labeled[seed_mask])) - {0}
    core_components = [(grow_labeled == g) for g in seeded_grow_ids]

    bunker_xy = []
    if bunker_candidates:
        for b in bunker_candidates:
            point = cr.wgs84_to_epsg(cr.to_shapely({'type': 'Point', 'coordinates': b['centroidWgs84']}), naip.epsg)
            bunker_xy.append((point.x, point.y))

    results = []
    seq = 0
    for component in core_components:
        area_m2 = float(component.sum()) * pixel_area
        if area_m2 < options['min_area_m2']:
            continue
        regions = ([component] if area_m2 <= options['split_area_m2']
                   else list(_split_oversized_component(component, score, pixel_m, options['peak_spacing_m'], options['max_area_m2'])))
        for region in regions:
            region_area_m2 = float(region.sum()) * pixel_area
            if not (options['min_area_m2'] <= region_area_m2 <= options['max_area_m2']):
                continue
            polygon_xy = cr.polygonize_mask(region, naip.geotransform, naip.epsg)
            if polygon_xy is None or polygon_xy.is_empty:
                continue
            polygon_xy = cr.largest_polygon(polygon_xy).buffer(0)
            if polygon_xy.is_empty:
                continue
            perimeter = polygon_xy.length
            roundness = (4 * np.pi * polygon_xy.area) / (perimeter ** 2) if perimeter > 0 else 0.0
            minx, miny, maxx, maxy = polygon_xy.bounds
            bbox_area = (maxx - minx) * (maxy - miny)
            compactness = polygon_xy.area / bbox_area if bbox_area > 0 else 0.0
            if roundness < options['min_roundness'] and compactness < options['min_compactness']:
                continue

            polygon_wgs84 = cr.epsg_to_wgs84(polygon_xy, naip.epsg)
            centroid_xy = polygon_xy.centroid
            centroid_wgs84 = cr.epsg_to_wgs84(centroid_xy, naip.epsg)

            region_score = float(score[region].mean())
            planarity = _planarity_score(dem_grid, region, pixel_m, options['planarity_ring_m'],
                                          options['planarity_ring_margin_m'], options['planarity_scale_m'])
            nearest_bunker_m = min((((centroid_xy.x - bx) ** 2 + (centroid_xy.y - by) ** 2) ** 0.5 for bx, by in bunker_xy), default=None)
            bunker_bonus = 0.0
            if nearest_bunker_m is not None and nearest_bunker_m <= options['bunker_bonus_radius_m']:
                bunker_bonus = options['bunker_bonus_weight'] * (1.0 - nearest_bunker_m / options['bunker_bonus_radius_m'])
            shape_score = max(roundness, compactness)
            planarity_term = 0.15 * (planarity if planarity is not None else 0.5)  # 0.5: neutral, not a penalty, when it can't be fit
            confidence = round(max(0.0, min(1.0, 0.45 * region_score + 0.20 * shape_score + planarity_term + bunker_bonus)), 4)
            if confidence < options['confidence_min']:
                continue
            seq += 1
            results.append({
                'id': f'detect-green-{seq:04d}', 'kind': 'green',
                'centroidWgs84': (centroid_wgs84.x, centroid_wgs84.y),
                'geometryWgs84': mapping(polygon_wgs84), 'areaM2': round(region_area_m2, 1), 'confidence': confidence,
                'evidence': {'score': round(region_score, 4), 'roundness': round(roundness, 3), 'compactness': round(compactness, 3),
                             'planarity': round(planarity, 3) if planarity is not None else None,
                             'nearestBunkerM': round(nearest_bunker_m, 1) if nearest_bunker_m is not None else None},
            })
    results.sort(key=lambda r: -r['confidence'])
    return _suppress_overlaps(results)


def _suppress_overlaps(results, iou_max=0.3):
    """Non-max suppression across candidates of one kind: the Voronoi split
    in `_split_oversized_component` and a raw whole-blob candidate can both
    survive the earlier filters and overlap heavily. Keeps the higher-
    confidence one of any pair whose polygons overlap past `iou_max`."""
    kept = []
    for candidate in results:  # already confidence-sorted, descending
        poly = cr.to_shapely(candidate['geometryWgs84'])
        if any(cr.iou(poly, cr.to_shapely(k['geometryWgs84'])) > iou_max for k in kept):
            continue
        kept.append(candidate)
    return kept


# ---------------------------------------------------------------------------
# Orchestration


def gate_tees_by_green_distance(tee_candidates, green_candidates, epsg, min_m=TEE_GREEN_MIN_M,
                                 max_m=TEE_GREEN_MAX_M, exclude_within_m=TEE_GREEN_EXCLUDE_M,
                                 complex_radius_m=pr.DEFAULT_TEE_COMPLEX_RADIUS_M):
    """Tees are reused unmodified from `detect-tee-complexes.py`, whose own
    precision (validated separately) is poor when nothing else on the
    property is known yet -- a flat bright mown patch with no route to
    check against is cheap to false-positive on. Once greens exist, a real
    tee complex is never right next to a green (that is the green's own
    apron/surrounds -- `exclude_within_m`) and is never absurdly close or
    absurdly far from every green on the property either
    (`min_m`/`max_m`) -- gated at *complex* level (clustered the same way
    `propose-routes.py` clusters real tee markers into one hole's complex),
    since a single member of a real complex can sit closer or farther from
    a green than the complex as a whole. A course with zero detected greens
    gates nothing -- there is no distance to measure, and it would be worse
    to drop every tee candidate than to pass all of them through
    unfiltered."""
    if not green_candidates:
        return list(tee_candidates)
    green_xy = [cr.wgs84_to_epsg(cr.to_shapely({'type': 'Point', 'coordinates': g['centroidWgs84']}), epsg).coords[0]
                for g in green_candidates]
    clustered = pr.cluster_tee_complexes([dict(t) for t in tee_candidates], epsg, radius_m=complex_radius_m)
    groups = {}
    for original, clustered_t in zip(tee_candidates, clustered):
        groups.setdefault(clustered_t['complexId'], []).append((original, clustered_t['xy']))

    kept = []
    for members in groups.values():
        best = min((((mx - gx) ** 2 + (my - gy) ** 2) ** 0.5 for _, (mx, my) in members for gx, gy in green_xy), default=None)
        if best is None or best < exclude_within_m or best > max_m:
            continue
        if best < min_m:
            continue
        kept.extend(original for original, _ in members)
    return kept


def detect_all(naip, dem, chm=None, boundary_wgs84=None, context_extract=None,
                green_options=None, tee_options=None, bunker_options=None, gate_tees=True):
    """Bunkers, then greens (using bunker proximity), then tees (via
    `detect-tee-complexes.py`, unmodified) -- gated by distance to a
    detected green (`gate_tees_by_green_distance`) unless `gate_tees` is
    False (the eval harness turns this off to score the raw tee detector on
    its own merits alongside the gated pipeline). Returns
    `{'bunkers': [...], 'greens': [...], 'tees': [...]}`, each in the shared
    `{id, kind, centroidWgs84, geometryWgs84, areaM2, confidence, evidence}`
    shape."""
    exclusion = context_exclusion_mask(naip, context_extract, naip.epsg)
    bunkers = detect_bunkers(naip, chm=chm, options=bunker_options, boundary_wgs84=boundary_wgs84, exclusion_mask=exclusion)
    greens = detect_greens(naip, dem, chm=chm, options=green_options, boundary_wgs84=boundary_wgs84,
                            exclusion_mask=exclusion, bunker_candidates=bunkers)
    tee_candidates = dtc.detect(naip, dem, options=tee_options, boundary_wgs84=boundary_wgs84)
    for t in tee_candidates:
        t['kind'] = 'tee'
    if gate_tees:
        tee_candidates = gate_tees_by_green_distance(tee_candidates, greens, naip.epsg)
    return {'bunkers': bunkers, 'greens': greens, 'tees': tee_candidates}


def to_surface_document(detections, source_note=''):
    """The `{'features': [...]}` shape `propose-routes.py`'s
    `collect_surface_candidates` reads (see its source -- not edited by this
    module, per this task's file ownership): each feature is `{id, kind,
    coordinatesWgs84}` where `coordinatesWgs84` is a closed flat WGS84 ring,
    exactly what `derive-surface-traces.py`'s own trace features carry.
    Bunkers are included too even though `collect_surface_candidates` only
    reads `tee`/`green` kinds today -- harmless extra data, and it is what
    lets a human or a later `--bunkers` consumer see them without a second
    detector run."""
    features = []
    for kind in ('greens', 'tees', 'bunkers'):
        for det in detections.get(kind, []):
            geometry = det['geometryWgs84']
            ring = geometry['coordinates'][0] if geometry['type'] == 'Polygon' else geometry['coordinates']
            ring = [[round(x, 7), round(y, 7)] for x, y in ring]
            if ring[0] != ring[-1]:
                ring.append(list(ring[0]))
            features.append({
                'id': det['id'], 'kind': det['kind'], 'coordinatesWgs84': ring,
                'confidence': det['confidence'], 'areaM2': det.get('areaM2'),
                'producer': 'detect-course-surfaces-v1', 'reviewed': False, 'evidence': det.get('evidence'),
            })
    return {
        'schemaVersion': 1, 'kind': 'golfhelm-course-surface-detections-v1',
        'producer': 'detect-course-surfaces-v1',
        'meaning': 'Unreviewed whole-course surface candidates detected from NAIP + DEM (+ lidar CHM where covered), '
                   'independent of any route. Never counts as reviewed geometry or as OSM truth.',
        'note': source_note, 'features': features,
        'counts': {kind: len(detections.get(kind, [])) for kind in ('greens', 'tees', 'bunkers')},
    }


def load_osm_context(path):
    if path is None or not Path(path).is_file():
        return None
    raw = Path(path).read_bytes()
    if str(path).endswith('.gz'):
        raw = gzip.decompress(raw)
    return json.loads(raw)


def parse_args(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--naip', required=True, type=Path)
    parser.add_argument('--dem', required=True, type=Path)
    parser.add_argument('--chm', default=None, type=Path, help='Optional fetch-lidar-chm.py chm.tif, on the terrain export grid')
    parser.add_argument('--out', required=True, type=Path)
    parser.add_argument('--epsg', required=True, type=int, help='Metric target CRS (e.g. a UTM zone)')
    parser.add_argument('--pixel-m', type=float, default=1.0)
    parser.add_argument('--aoi', type=Path, default=None, help="A facility's aoi.json ('polygon' restricts detection to on-property ground)")
    parser.add_argument('--context', type=Path, default=None, help='facility.context.snapshot overpass.json(.gz) for building/road/parking exclusion')
    parser.add_argument('--overlay', type=Path, default=None)
    return parser.parse_args(argv)


def main(argv=None):
    args = parse_args(argv)
    naip, dem, chm = load_grid(args.naip, args.dem, args.epsg, chm_path=args.chm, pixel_m=args.pixel_m)
    boundary = None
    if args.aoi:
        aoi = json.loads(args.aoi.read_text())
        boundary = Polygon(aoi['polygon'])
    context = load_osm_context(args.context)
    detections = detect_all(naip, dem, chm=chm, boundary_wgs84=boundary, context_extract=context)
    note = f'naip={args.naip} dem={args.dem} chm={args.chm or "none"}'
    doc = to_surface_document(detections, source_note=note)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(doc, indent=2) + '\n')
    print(f"{doc['counts']} -> {args.out}", file=sys.stderr)
    if args.overlay:
        from overlay_png import render_trace_overlay
        pseudo_features = [{'coordinatesWgs84': f['coordinatesWgs84']} for f in doc['features']]
        render_trace_overlay(naip, args.epsg, pseudo_features, {}, args.overlay)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
