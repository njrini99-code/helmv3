"""Compile the existing Cacapon package into deterministic per-hole terrain.

python3 scripts/golf/course-geometry/compile-course-terrain.py --holes 7
python3 scripts/golf/course-geometry/compile-course-terrain.py --holes all

Source acquisition is one bounded, immutable, native-1m USGS export locked to
one catalog tile. No production client, source geometry edits, or guessed woods.
Requires the existing terrain requirements plus pyproj (tested 3.7.2).
"""
import argparse
import bisect
import gzip
import hashlib
import importlib.util
import json
import math
import re
import subprocess
import sys
import tempfile
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pyproj
import shapely
from hole_footprint import played_features
from shapely.geometry import LineString, MultiPolygon, Polygon, box
from shapely.ops import polygonize, unary_union
from terrain_source_rule import SourceRejected, order_by_recency, select_first_survivor
from terrain_triangulate import triangulate_faces

ROOT = Path(__file__).resolve().parents[3]
FIXTURES = ROOT / 'src/test/fixtures/course-geometry'
COMPILER_VERSION = 'course-terrain-v5'
SOURCE_COVERAGE_METHOD = 'perimeter-v1'
SOURCE_COVERAGE_PADDING_METERS = 8
NODING_GRID_M = 1e-6
# Degenerate-geometry gate for pieces/faces/triangles, in m^2. A genuine
# GEOS overlay artifact (a collinear sliver from a buffer/difference chain)
# is ~1e-15 m^2 or smaller. A legitimate sliver from two materials or cells
# meeting at a near-tangent angle can be a real, non-degenerate ~1e-9 to
# 1e-8 m^2 triangle: node_pieces already gives it and its neighbor the same
# noded boundary, so it is on both sides of a shared edge. The pre-v5
# threshold (1e-8) sat inside that legitimate range and discarded such a
# sliver on one side only, leaving the neighbor's matching edge unpaired
# (a T-junction). 1e-10 stays far above the true noise floor while passing
# every legitimate sliver observed in course-factory batches to date.
DEGENERATE_AREA_M2 = 1e-10
STYLE_VERSION = 'narrow-surround-v1'
CONTEXT_MARGIN_M = 160
METRIC_STEP_M = 2
TACTICAL_STEP_M = 4
DETAIL_STEP_M = 2
MAX_CONTEXT_RENDER_STEP_M = 64
BUNKER_TACTICAL_BUFFER_M = 4
ORIGINAL_TRIANGLE_ENVELOPE = 20000
# Deliberately reviewed for expanded source-backed neighboring context. Do not
# simplify source boundaries merely to fit the earlier single-hole envelope.
MAX_TRIANGLES = 40000
MAX_METRIC_CELLS = 1000000
SOURCE_CRS = 32617  # the CRS exports were cut in before zone parameterisation; new exports use the course's UTM zone (course_crs)
US_SURVEY_FOOT_TO_METERS = 0.3048006096012192
# Ground ribbons from the reviewed context layer become breaklines: the mesh
# gets vertices exactly along each ribbon edge (heights still sampled from the
# source raster, never edited) and 4 m cells along the ribbon near the played
# hole so a display cut/fill bank has vertices to shape. Lines that are not
# ground (lift lines, fences) and every polygon zone stay out of the mesh.
RIBBON_CLASSES = ('cart_path', 'service_path', 'road')
RIBBON_BAND_M = 4
RIBBON_REFINE_REACH_M = 60


def module(name, filename):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(filename))
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


pilot = module('pilot', 'prepare-pilot.py')
fetch = module('fetch', 'fetch-terrain-pilot.py')
elevation_raster = module('elevation_raster', 'elevation_raster.py')
course_crs = module('course_crs', 'course_crs.py')
# Read-only reuse of the S1M research spike's bounded, retried TNM Access
# fetch (`fetch_json`) and ScienceBase item reader (`item_provenance`).
# research-s1m-coverage.py is not edited; only its request code is reused.
s1m_research = module('s1m_research', 'research-s1m-coverage.py')


def canonical_json(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False, allow_nan=False)


def digest(value):
    return hashlib.sha256(canonical_json(value).encode()).hexdigest()


def source_identity(manifest):
    """What makes a terrain source the same source for compiled outputs: its
    files, request bounds and CRS. The manifest also lists every package the
    raster has served, which changes without one height changing."""
    return digest({'fileHashes': manifest.get('fileHashes'), 'bounds': manifest.get('requestedLocalBoundsM'), 'crs': manifest.get('horizontalExportCrs'),
                   'renderingOnly': bool(manifest.get('renderingOnly')), 'sourceNativeResolutionM': manifest.get('sourceNativeResolutionM')})


def write_json(path, value, pretty=False):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text((json.dumps(value, indent=2, ensure_ascii=False, allow_nan=False) if pretty else canonical_json(value)) + '\n')


def write_asset(directory, hole, result):
    """Gzip is the versioned artifact; expanded JSON is a reproducible cache."""
    payload = (canonical_json(result)+'\n').encode()
    compressed = gzip.compress(payload, mtime=0)
    filename = hole['key']+'-terrain.json.gz'
    directory.mkdir(parents=True, exist_ok=True)
    (directory/filename).write_bytes(compressed)
    (directory/(hole['key']+'-terrain.json')).write_bytes(payload)
    return {'ordinal': hole['ordinal'], 'fileName': filename, 'encoding': 'gzip',
            'compressedBytes': len(compressed), 'uncompressedBytes': len(payload),
            'sha256': hashlib.sha256(compressed).hexdigest(),
            'uncompressedSha256': hashlib.sha256(payload).hexdigest(), 'contentHash': result['contentHash']}


def coordinates(value):
    if isinstance(value[0], (int, float)):
        yield value
    else:
        for child in value:
            yield from coordinates(child)


def local_geometry(feature):
    raw = feature['geometryWgs84']
    if raw['type'] == 'LineString':
        return LineString([pilot.local(p) for p in raw['coordinates']])
    parts = [raw['coordinates']] if raw['type'] == 'Polygon' else raw['coordinates']
    result = unary_union([Polygon([pilot.local(p) for p in rings[0]],
                                 [[pilot.local(p) for p in ring] for ring in rings[1:]]) for rings in parts])
    if result.is_empty or not result.is_valid:
        raise ValueError('Invalid canonical source shape: ' + feature['id'])
    return result


def context_ribbons(path, pkg):
    """Ribbon polygons (line buffered by its source width) per hole key."""
    if path is None:
        return {}, None
    layer = json.loads(Path(path).read_text())
    if layer.get('packageHash') != pkg['contentHash']:
        raise ValueError('Context layer belongs to another package')
    shapes = {}
    for zone in layer['zones']:
        raw = zone['geometryWgs84']
        if zone['class'] not in RIBBON_CLASSES or raw['type'] != 'LineString':
            continue
        width = (zone.get('attributes') or {}).get('widthM')
        if not width:
            raise ValueError('Context ribbon without a width: ' + zone['id'])
        shape = LineString([pilot.local(p) for p in raw['coordinates']]).buffer(width/2, quad_segs=2)
        for key in zone['holeKeys']:
            shapes.setdefault(key, []).append(shape)
    return {key: unary_union(parts) for key, parts in shapes.items()}, layer['contentHash']


def split_by_ribbons(regions, ribbons):
    """Constrain every region with the ribbon edges; materials are unchanged."""
    if ribbons.is_empty:
        return regions
    result = []
    for material, region in regions:
        result.append((material, region.difference(ribbons)))
        result.append((material, region.intersection(ribbons)))
    return result


def geographic(x, y):
    """Invert the package's existing zero-altitude WGS84→local-EN math."""
    x, y = np.asarray(x, dtype=float), np.asarray(y, dtype=float)
    lon0, lat0 = np.radians(pilot.ORIGIN)
    e2 = 6.6943799901413165e-3
    n0 = 6378137 / math.sqrt(1 - e2 * math.sin(lat0) ** 2)
    origin = [n0 * math.cos(lat0) * math.cos(lon0), n0 * math.cos(lat0) * math.sin(lon0), n0 * (1-e2) * math.sin(lat0)]
    lon = pilot.ORIGIN[0] + x / (111320 * math.cos(lat0))
    lat = pilot.ORIGIN[1] + y / 111000
    for _ in range(5):
        la, ph = np.radians(lon), np.radians(lat)
        n = 6378137 / np.sqrt(1 - e2 * np.sin(ph) ** 2)
        dx = n * np.cos(ph) * np.cos(la) - origin[0]
        dy = n * np.cos(ph) * np.sin(la) - origin[1]
        dz = n * (1-e2) * np.sin(ph) - origin[2]
        east = -math.sin(lon0) * dx + math.cos(lon0) * dy
        north = -math.sin(lat0) * math.cos(lon0) * dx - math.sin(lat0) * math.sin(lon0) * dy + math.cos(lat0) * dz
        lon += (x-east) / (111320 * math.cos(lat0))
        lat += (y-north) / 111000
    return lon, lat


def snap_bounds(bounds, padding=0, step=16):
    a, b, c, d = bounds
    return [math.floor((a-padding)/step)*step, math.floor((b-padding)/step)*step,
            math.ceil((c+padding)/step)*step, math.ceil((d+padding)/step)*step]


def local_bounds_perimeter(bounds, samples_per_edge=32):
    """Return a closed local-ENU rectangle boundary with sampled edges.

    A local ENU rectangle maps to curved edges in an acquisition CRS. Sampling
    only its four corners can crop a legitimate feature that lies along a
    bowed edge. This request helper preserves the physical requested bounds;
    it only makes the source coverage conservative.
    """
    west, south, east, north = bounds
    if samples_per_edge < 1 or west > east or south > north:
        raise ValueError('Invalid local bounds perimeter request')
    fractions = [index / samples_per_edge for index in range(samples_per_edge + 1)]
    return ([(west + (east - west) * t, south) for t in fractions]
            + [(east, south + (north - south) * t) for t in fractions[1:]]
            + [(east - (east - west) * t, north) for t in fractions[1:]]
            + [(west, north - (north - south) * t) for t in fractions[1:-1]])


def hole_bounds(hole, raw_shapes, raw_features, played_only=False):
    # Facility acquisition keeps its established full source envelope. A
    # single-hole display/refinement footprint excludes shared lakes/rough;
    # those exact source polygons still render where they intersect context.
    features = [raw_features[i] for i in hole['featureIds']]
    features = played_features(features) if played_only else [f for f in features if f['kind'] != 'woods']
    shapes = [raw_shapes[f['id']] for f in features]
    tactical = snap_bounds(unary_union(shapes).bounds, 12, 4)
    return tactical, snap_bounds(tactical, CONTEXT_MARGIN_M, 32)


def date_text(value):
    if value is None:
        raise ValueError('Missing source acquisition date requires review')
    text = str(value)
    if len(text) == 8 and text.isdigit():
        return datetime.strptime(text, '%Y%m%d').replace(tzinfo=timezone.utc).date().isoformat()
    if len(text) == 4 and text.isdigit():
        return text
    return datetime.fromtimestamp(float(value)/1000, timezone.utc).date().isoformat()


MAX_EMPTY_EXPORT_FRACTION = 0.001
AREA_CONSERVATION_ABSOLUTE_M2 = .002
# This accounts only for floating point summation after a source polygon has
# been split into tens of thousands of exactly-covered faces. It does not
# permit a boundary move: every face is still required to be covered by its
# original source region. One part per million is deliberately much smaller
# than source-resolution uncertainty and keeps large context meshes from
# failing on numerical residue alone.
AREA_CONSERVATION_RELATIVE = 1e-6
USGS_3DEP_PROVIDER = 'usgs_3dep_project_1m'
NC_ONEMAP_PROVIDER = 'nc_onemap_dem03'
CHARLESTON_COUNTY_DEM_2025_PROVIDER = 'charleston_county_dem_2025'
CHARLESTON_COUNTY_DEM_2025_BASE = 'https://gisccimg.charlestoncounty.org/arcgis/rest/services/LiDAR/DEM_2025/ImageServer'
CHARLESTON_COUNTY_DEM_2025_CRS = 'EPSG:6570'  # NAD83(2011) / South Carolina (ft)
CHARLESTON_COUNTY_DEM_2025_PIXEL_FEET = 2.0
INTERNATIONAL_FOOT_TO_METERS = 0.3048
USGS_3DEP_SOURCE_CONTRACT = 'usgs-3dep-native-grid-v1'
NC_ONEMAP_SOURCE_CONTRACT = 'nc-dem03-native-frame-v2'
CHARLESTON_COUNTY_DEM_2025_SOURCE_CONTRACT = 'charleston-county-dem-2025-v1'
# TNM Access is a second, independently-updated USGS 3DEP catalog for the
# same one-meter DEM product line the ImageServer indexes; it carries a
# newly published project sooner. Used only as a fallback when the
# ImageServer's own catalog finds nothing -- never blended with an
# ImageServer candidate, so a course the ImageServer already resolves is
# never re-decided by a newer TNM project.
TNM_PRODUCTS_URL = 'https://tnmaccess.nationalmap.gov/api/v1/products'
TNM_1M_DATASET = 'Digital Elevation Model (DEM) 1 meter'
TNM_ALLOWED_DOWNLOAD_HOSTS = ('prd-tnm.s3.amazonaws.com',)
MAX_TNM_CATALOG_BYTES = 2_000_000
MAX_TNM_METADATA_BYTES = 2_000_000


def _positive_source_number(value, field):
    """Read a numeric source assertion without silently coercing it."""
    try:
        number = float(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f'Source manifest has invalid {field}') from exc
    if not math.isfinite(number) or number <= 0:
        raise ValueError(f'Source manifest has invalid {field}')
    return number


def source_manifest_contract(manifest):
    """Validate immutable terrain metadata before sampling a retained raster.

    This validates an acquired source's *claims*, not its golf geometry. A
    legacy source is preserved as evidence, but never upgraded merely because
    this compiler was installed later. New sources below stamp the expected
    provider contract. Horizontal feet never imply vertical feet.
    """
    provider = manifest.get('providerPolicyId', USGS_3DEP_PROVIDER)
    expected = {
        USGS_3DEP_PROVIDER: USGS_3DEP_SOURCE_CONTRACT,
        NC_ONEMAP_PROVIDER: NC_ONEMAP_SOURCE_CONTRACT,
        CHARLESTON_COUNTY_DEM_2025_PROVIDER: CHARLESTON_COUNTY_DEM_2025_SOURCE_CONTRACT,
    }.get(provider)
    if expected is None:
        raise ValueError(f'Immutable source cache has unsupported terrain provider {provider!r}')

    bounds = manifest.get('requestedLocalBoundsM')
    if not isinstance(bounds, list) or len(bounds) != 4:
        raise ValueError('Source manifest omits four requestedLocalBoundsM values')
    try:
        west, south, east, north = [float(value) for value in bounds]
    except (TypeError, ValueError) as exc:
        raise ValueError('Source manifest has invalid requestedLocalBoundsM values') from exc
    if not all(math.isfinite(value) for value in (west, south, east, north)) or not west < east or not south < north:
        raise ValueError('Source manifest has invalid requestedLocalBoundsM ordering')

    try:
        horizontal = pyproj.CRS.from_user_input(manifest.get('horizontalExportCrs'))
    except pyproj.exceptions.CRSError as exc:
        raise ValueError('Source manifest has missing or invalid horizontalExportCrs') from exc
    if not horizontal.is_projected or len(horizontal.axis_info) < 2:
        raise ValueError('Source manifest horizontalExportCrs is not a projected two-axis frame')

    source_native = _positive_source_number(
        manifest.get('sourceNativeResolutionM', manifest.get('nativeResolutionM')),
        'sourceNativeResolutionM',
    )
    pixels = manifest.get('exportPixelM')
    if not isinstance(pixels, list) or len(pixels) != 2:
        raise ValueError('Source manifest omits two exportPixelM values')
    output = [_positive_source_number(value, 'exportPixelM') for value in pixels]
    if min(output) + 1e-9 < source_native:
        raise ValueError('Source manifest exports a grid finer than its declared native source resolution')
    if not manifest.get('renderingOnly') and any(
        not math.isclose(value, source_native, rel_tol=0, abs_tol=1e-6) for value in output
    ):
        raise ValueError('Physical terrain source export differs from its declared native source grid')

    if not manifest.get('renderingOnly'):
        _positive_source_number(manifest.get('verticalUnitToMeters'), 'verticalUnitToMeters')
        if not manifest.get('verticalDatum') or not manifest.get('rawVerticalUnit'):
            raise ValueError('Physical terrain source omits vertical datum or raw unit evidence')

    declared = manifest.get('sourceFrameContract')
    if declared is not None and declared != expected:
        raise ValueError('SOURCE_FRAME_UNVERIFIED: source manifest frame contract differs from the provider contract; retain it and acquire a new source revision')
    return {
        'providerPolicyId': provider,
        'expectedSourceContract': expected,
        'declaredSourceContract': declared,
        'legacyContract': declared is None,
        'sourceNativeResolutionM': source_native,
        'renderingOnly': bool(manifest.get('renderingOnly')),
    }
NC_ONEMAP_BASE = 'https://services.nconemap.gov/secure/rest/services/Elevation/DEM03/ImageServer'
NC_ONEMAP_HOST = 'services.nconemap.gov'
NC_ONEMAP_SOURCE_PATH = '/secure/rest/services/Elevation/DEM03/ImageServer'
NC_ONEMAP_EXPORT_PATH = '/secure/rest/directories/arcgisoutput/Elevation/DEM03_ImageServer/'
NC_ONEMAP_CRS = 'EPSG:6543'  # NAD83(2011) / North Carolina (ftUS)
NC_ONEMAP_NATIVE_PIXEL_US_FEET = 3.125


def area_conservation_tolerance(source_area_m2):
    """Return the strict accounting tolerance for a triangulated source area.

    This controls arithmetic accumulation only. Source geometry remains
    protected by the per-face ``covers`` assertion during triangulation.
    """
    return max(AREA_CONSERVATION_ABSOLUTE_M2, abs(source_area_m2) * AREA_CONSERVATION_RELATIVE)
MAX_NC_ONEMAP_PIXELS = 8_000_000


def is_native_1m_title(title):
    """3DEP names its 1m products both 'USGS 1 Meter ...' and 'USGS one meter ...'."""
    return str(title).lower().startswith(('usgs 1 meter ', 'usgs one meter '))


def catalog_resolution_m(attrs, latitude):
    """Conservatively express the catalog's horizontal source spacing in m.

    The USGS index reports its national arc-second products in degrees.  A
    render-only fallback may use one only when the requested render grid is
    no finer than that source.  The physical compiler never calls this path:
    it still requires a native 1 m project product.
    """
    if is_native_1m_title(attrs.get('title')):
        return 1.0
    try:
        spacing = abs(float(attrs.get('Resolution_X')))
    except (TypeError, ValueError):
        return None
    if not math.isfinite(spacing) or spacing <= 0:
        return None
    # Values below one hundredth are angular degrees in the 3DEP index.
    if spacing < 0.01:
        return spacing * 111_320.0
    return spacing


def tile_project(title):
    """The lidar project a 1m tile belongs to: everything after its x..y..
    grid token ('USGS 1 Meter 17 x74y435 VA_NorthernShenandoah_2020_D20' →
    'VA_NorthernShenandoah_2020_D20')."""
    parts = str(title).split()
    for i, part in enumerate(parts):
        if re.fullmatch(r'x\d+y\d+', part.lower()):
            return ' '.join(parts[i + 1:]) or str(title)
    return str(title)


def covering_tile_sets(rows, extent_wgs84):
    """Candidate tile sets, best first: one native-1m tile that covers the
    whole context, else the tiles of one lidar project and acquisition end
    date whose union covers it (the 10 km tile grid splits a course near a
    tile edge; the same collection on both sides is one source, not a mosaic
    of sources). Mixed projects, dates or resolutions are never combined."""
    singles, groups = [], {}
    for row in rows:
        attrs = row['attributes']
        footprint = Polygon(row['geometry']['rings'][0], row['geometry']['rings'][1:])
        if not footprint.is_valid:
            continue
        if footprint.covers(extent_wgs84):
            singles.append([row])
        # An undated tile cannot prove it belongs to the same collection as
        # its neighbour, so it is never paired; alone it still reaches the
        # acquisition-date review gate below.
        if attrs.get('EndDate') is not None:
            groups.setdefault((tile_project(attrs['title']), date_text(attrs['EndDate'])), []).append((row, footprint))
    pairs = []
    for members in groups.values():
        if len(members) > 1 and unary_union([f for _, f in members]).covers(extent_wgs84):
            pairs.append([row for row, _ in sorted(members, key=lambda m: m[0]['attributes']['title'])])
    def newest_first(tiles):
        end = tiles[0]['attributes'].get('EndDate')
        return (date_text(end) if end is not None else '', tiles[0]['attributes']['title'])
    return sorted(singles, key=newest_first, reverse=True) + sorted(pairs, key=newest_first, reverse=True)


def existing_source_manifest(directory, pkg, bounds, rendering_only=False):
    """Return a verified immutable source cache, or None when none exists.

    Both terrain providers use this contract.  A revised package may cite the
    same byte-identical raster, but a partial cache is never overwritten.
    """
    names = ['catalog.json', 'export.json', 'elevation.tiff', 'source-manifest.json']
    existing = [(directory / name).exists() for name in names]
    if all(existing):
        manifest = json.loads((directory / 'source-manifest.json').read_text())
        if manifest['requestedLocalBoundsM'] != bounds:
            raise ValueError('Immutable source cache belongs to another context; choose a new directory')
        if bool(manifest.get('renderingOnly')) != bool(rendering_only):
            raise ValueError('Immutable source cache has a different physical/render-only contract; choose a new directory')
        hashes = manifest.get('fileHashes')
        if not isinstance(hashes, dict) or not hashes:
            raise ValueError('Immutable source cache has no file hashes')
        for name, expected_hash in hashes.items():
            # Manifest paths are source evidence. Still reject a malformed
            # retained manifest before it can make a hash check read outside
            # the immutable source directory.
            if Path(name).name != name:
                raise ValueError('Immutable source cache contains an unsafe artifact name')
            path = directory / name
            if not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest() != expected_hash:
                raise ValueError('Immutable source cache hash mismatch: ' + name)
        source_manifest_contract(manifest)
        if manifest['packageHash'] != pkg['contentHash']:
            # Same request bounds and byte-identical evidence serve a revised
            # package (for example added traces). The raster is never replaced;
            # the manifest records every package it has served.
            manifest['previousPackageHashes'] = manifest.get('previousPackageHashes', []) + [manifest['packageHash']]
            manifest['packageHash'] = pkg['contentHash']
            (directory / 'source-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
        return manifest
    if any(existing):
        raise ValueError('Incomplete source cache; preserve evidence and choose a new directory')
    return None


def resolve_source_provider(directory, requested_provider, acquire_only=False):
    """Use the immutable cache's provider when compiling an acquired source.

    The factory acquires a course-level source once, then invokes this compiler
    for each hole.  Compilation must retain the provider that produced that
    evidence; a CLI default must never reinterpret an NC raster as USGS.
    An explicit acquire request may not switch a directory between providers.
    """
    manifest_path = directory / 'source-manifest.json'
    if not manifest_path.is_file():
        return requested_provider
    manifest = json.loads(manifest_path.read_text())
    provider = manifest.get('providerPolicyId', USGS_3DEP_PROVIDER)
    if provider not in (USGS_3DEP_PROVIDER, NC_ONEMAP_PROVIDER, CHARLESTON_COUNTY_DEM_2025_PROVIDER):
        raise ValueError(f'Immutable source cache has unsupported terrain provider {provider!r}')
    # A retained fallback (`fallbackFrom`) is a directory whose requested
    # provider fell through to a different one on acquisition; the caller
    # still passes the originally requested provider on every later
    # compile call, so that must resolve too, not just the acquire run
    # that produced it.
    if acquire_only and provider != requested_provider and manifest.get('fallbackFrom') != requested_provider:
        raise ValueError('Immutable source cache belongs to another terrain provider')
    return provider


def usgs_rendering_only_grid_size(width_m, height_m, resolution_m):
    """Bounded derived output size for a source-native 1 m USGS request."""
    if not math.isfinite(resolution_m) or resolution_m <= 1:
        raise ValueError('USGS render-only resolution must be coarser than the native source grid')
    width, height = math.ceil(width_m / resolution_m), math.ceil(height_m / resolution_m)
    if width <= 1 or height <= 1 or width * height > 8_000_000 or max(width, height) > 8000:
        raise ValueError('Bounded course render-only export exceeds the fixed 8M pixel cap')
    return [width, height]


def terrain_export_windows(bounds, width, height):
    """Partition one grid without changing resolution, origin or request caps."""
    if min(width, height) < 1 or width * height > 32_000_000 or max(width, height) > 16000:
        raise ValueError('Terrain acquisition exceeds the bounded 32M-pixel tiled-work budget')
    a, b, c, d = bounds
    xstep, ystep = (c - a) / width, (d - b) / height
    if width * height <= 8_000_000 and max(width, height) <= 8000:
        return [{'bounds': list(bounds), 'pixels': [width, height]}]
    edge = 2000
    return [{'bounds': [a + x * xstep, b + y * ystep,
                         a + min(x + edge, width) * xstep, b + min(y + edge, height) * ystep],
             'pixels': [min(edge, width - x), min(edge, height - y)]}
            for y in range(0, height, edge) for x in range(0, width, edge)]


def export_usgs_grid(directory, bounds, width, height, crs, object_ids):
    """Retain original locked exports and stitch their exact pixel grid.

    The 8M-pixel/40MB per-request limits remain unchanged. Large layouts use
    several smaller exports from the same admitted project and datum. The
    mosaic has no extra interpolation or invented values.
    """
    windows = terrain_export_windows(bounds, width, height)
    parts = []
    for number, window in enumerate(windows):
        a, b, c, d = window['bounds']
        w, h = window['pixels']
        request = {'bbox': f'{a},{b},{c},{d}', 'bboxSR': crs, 'imageSR': crs,
                   'size': f'{w},{h}', 'format': 'tiff', 'pixelType': 'F32',
                   'interpolation': 'RSP_BilinearInterpolation', 'adjustAspectRatio': 'false',
                   'renderingRule': json.dumps({'rasterFunction': 'None'}),
                   'mosaicRule': json.dumps({'mosaicMethod': 'esriMosaicLockRaster', 'lockRasterIds': object_ids})}
        exported = fetch.request('exportImage', request)
        if (exported.get('width'), exported.get('height')) != (w, h):
            raise ValueError('Export dimensions changed; source resampling requires review')
        extent = exported.get('extent') or {}
        if any(not math.isclose(float(extent.get(key, math.nan)), value, abs_tol=1e-6, rel_tol=0)
               for key, value in zip(('xmin', 'ymin', 'xmax', 'ymax'), window['bounds'])):
            raise ValueError('Terrain tile export changed the requested grid extent')
        raw = fetch.read(exported['href'], 40_000_000)
        parts.append({'name': f'source-part-{number:03d}.tiff', 'raster': raw,
                      'export': {**exported, 'request': request}})
    if len(parts) == 1:
        return parts[0]['export'], parts[0]['raster'], []
    from osgeo import gdal
    gdal.UseExceptions()
    with tempfile.TemporaryDirectory(prefix='.terrain-exports-', dir=directory) as tmp:
        root = Path(tmp)
        paths = []
        for part, window in zip(parts, windows):
            path = root / part['name']; path.write_bytes(part['raster']); paths.append(str(path))
            ds = gdal.Open(str(path))
            if ds.RasterCount != 1 or [ds.RasterXSize, ds.RasterYSize] != window['pixels']:
                raise ValueError('Terrain tile TIFF has the wrong pixel grid')
            if not pyproj.CRS.from_wkt(ds.GetProjectionRef()).equals(pyproj.CRS.from_epsg(crs)):
                raise ValueError('Terrain tile TIFF CRS differs from its locked request')
            west, south, east, north = window['bounds']; w, h = window['pixels']
            expected = [west, (east - west) / w, 0, north, 0, -(north - south) / h]
            if not np.allclose(ds.GetGeoTransform(), expected, atol=1e-7, rtol=0):
                raise ValueError('Terrain tile TIFF grid differs from its locked request')
            ds = None
            values, _nodata, _decoder = elevation_raster.read_elevation(path)
            if elevation_raster.empty_fraction(values) > MAX_EMPTY_EXPORT_FRACTION:
                raise ValueError('A locked terrain tile contains unsupported empty fill')
        vrt = gdal.BuildVRT(str(root / 'mosaic.vrt'), paths)
        merged = gdal.Translate(str(root / 'mosaic.tiff'), vrt,
                                creationOptions=['COMPRESS=DEFLATE', 'PREDICTOR=3', 'TILED=YES'])
        if [merged.RasterXSize, merged.RasterYSize] != [width, height]:
            raise ValueError('Terrain mosaic did not preserve the original grid dimensions')
        expected = [bounds[0], (bounds[2] - bounds[0]) / width, 0, bounds[3], 0, -(bounds[3] - bounds[1]) / height]
        if not np.allclose(merged.GetGeoTransform(), expected, atol=1e-7, rtol=0):
            raise ValueError('Terrain mosaic grid changed during assembly')
        merged = vrt = None
        raster = (root / 'mosaic.tiff').read_bytes()
    document = {'width': width, 'height': height,
                'extent': dict(zip(('xmin', 'ymin', 'xmax', 'ymax'), bounds), spatialReference={'wkid': crs}),
                'assembly': 'exact_aligned_grid_mosaic_no_resampling',
                'parts': [{'file': part['name'], 'sha256': hashlib.sha256(part['raster']).hexdigest(),
                           **part['export']} for part in parts]}
    return document, raster, parts


def tnm_1m_products(bbox_wgs84):
    """Every native one-meter DEM GeoTIFF TNM Access lists over a WGS84 bbox.

    Reuses research-s1m-coverage.py's bounded, retried fetch. Refuses a
    truncated response rather than silently acting on a partial catalog
    (the same posture as the ImageServer's own `exceededTransferLimit`
    check); drops a listed item whose declared download host is not the
    fixed USGS bucket this compiler is willing to acquire from, and any
    non-GeoTIFF product (a LAZ point cloud can share this dataset's bbox).
    """
    query = {'datasets': TNM_1M_DATASET, 'bbox': ','.join(f'{v:.7f}' for v in bbox_wgs84),
             'prodFormats': 'GeoTIFF', 'outputFormat': 'JSON', 'max': 50}
    doc = s1m_research.fetch_json(TNM_PRODUCTS_URL + '?' + urllib.parse.urlencode(query), MAX_TNM_CATALOG_BYTES)
    items = doc.get('items') or []
    if doc.get('total') and doc['total'] > len(items):
        raise ValueError('Truncated TNM product list requires bounded pagination review')
    seen, tiles = set(), []
    for item in items:
        title = item.get('title')
        if item.get('format') != 'GeoTIFF' or not is_native_1m_title(title) or title in seen:
            continue
        url = item.get('downloadURL') or ''
        if urllib.parse.urlparse(url).netloc not in TNM_ALLOWED_DOWNLOAD_HOSTS:
            continue
        bbox = item.get('boundingBox') or {}
        if not all(k in bbox for k in ('minX', 'minY', 'maxX', 'maxY')):
            continue
        seen.add(title)
        tiles.append({'title': title, 'downloadURL': url, 'sizeInBytes': item.get('sizeInBytes'),
                      'boundingBoxWgs84': [bbox['minX'], bbox['minY'], bbox['maxX'], bbox['maxY']],
                      'publicationDate': item.get('publicationDate'), 'metaUrl': item.get('metaUrl')})
    return tiles


def tnm_item_metadata(meta_url):
    """The tile's own ScienceBase record: its real flight window (`dates`)
    and its declared vertical datum text. Best-effort: a metadata outage
    must not hide a coverage decision, so this returns {} rather than
    raising, and the caller treats a missing datum declaration as
    unverified, never as verified by omission."""
    if not meta_url:
        return {}
    try:
        return s1m_research.fetch_json(meta_url + '?format=json&fields=dates,body,summary,purpose', MAX_TNM_METADATA_BYTES)
    except Exception:
        return {}


def tnm_metadata_dates(meta_doc):
    dates = {d.get('type'): d.get('dateString') for d in (meta_doc or {}).get('dates') or []}
    return dates.get('Start'), dates.get('End')


def tnm_metadata_vertical_evidence(meta_doc):
    """3DEP one-meter GeoTIFFs carry no compound vertical CRS (checked in
    `tnm_tile_vertical_evidence` first); this is the fallback the owner
    named for that case: the product's own declared datum statement, read
    from this exact item's ScienceBase record over the network, never
    assumed from the dataset's name alone."""
    text = ' '.join(str((meta_doc or {}).get(k) or '') for k in ('body', 'summary', 'purpose'))
    if 'North American Vertical Datum of 1988' in text or 'NAVD88' in text or 'NAVD 88' in text:
        return {'verticalDatum': 'North American Vertical Datum of 1988', 'rawVerticalUnit': 'meter',
                'verticalUnitToMeters': 1, 'verticalUnitStatus': 'declared_by_product_metadata_record'}
    return None


def tnm_tile_vertical_evidence(tile, meta_doc):
    """The tile's own compound CRS first (authoritative when present);
    3DEP one-meter GeoTIFFs typically embed only the horizontal CRS, so
    this falls back to the item's declared product metadata."""
    from osgeo import gdal
    gdal.UseExceptions()
    ds = gdal.Open('/vsicurl/' + tile['downloadURL'])
    srs = ds.GetSpatialRef()
    ds = None
    if srs is not None and srs.IsCompound():
        crs = pyproj.CRS.from_wkt(srs.ExportToWkt())
        vertical = crs.sub_crs_list[1] if len(crs.sub_crs_list) > 1 else None
        if vertical is not None and ('NAVD88' in vertical.name or 'North American Vertical Datum of 1988' in vertical.name):
            return {'verticalDatum': vertical.name, 'rawVerticalUnit': 'meter', 'verticalUnitToMeters': 1,
                    'verticalUnitStatus': 'verified_from_locked_raster_vcs'}
        return None
    return tnm_metadata_vertical_evidence(meta_doc)


def tnm_warp_grid(directory, tiles, out_bounds, width, height, crs):
    """One VRT over every intersecting tile's `/vsicurl/` source, warped in
    a single pass to the exact requested grid (bilinear, matching every
    other physical export in this file). GDAL range-reads only the bytes
    the warp touches -- never the whole ~100-400 MB tile -- but every
    source host was already checked against the fixed allowlist in
    `tnm_1m_products`, since GDAL's own network stack does not consult it.
    """
    from osgeo import gdal
    gdal.UseExceptions()
    for key, value in (('GDAL_DISABLE_READDIR_ON_OPEN', 'EMPTY_DIR'), ('CPL_VSIL_CURL_ALLOWED_EXTENSIONS', '.tif'),
                       ('GDAL_HTTP_TIMEOUT', '120'), ('GDAL_HTTP_MAX_RETRY', '2'), ('GDAL_HTTP_RETRY_DELAY', '5')):
        gdal.SetConfigOption(key, value)
    sources = ['/vsicurl/' + t['downloadURL'] for t in tiles]
    first = gdal.Open(sources[0])
    nodata = first.GetRasterBand(1).GetNoDataValue()
    first = None
    if nodata is None:
        raise SourceRejected('source_nodata_undeclared')
    a, b, c, d = out_bounds
    with tempfile.TemporaryDirectory(prefix='.terrain-tnm-', dir=directory) as tmp:
        vrt_path = str(Path(tmp) / 'mosaic.vrt')
        gdal.BuildVRT(vrt_path, sources)
        out_path = Path(tmp) / 'warped.tiff'
        warped = gdal.Warp(str(out_path), vrt_path, dstSRS=f'EPSG:{crs}', outputBounds=(a, b, c, d),
                           xRes=1, yRes=1, resampleAlg='bilinear', srcNodata=nodata, dstNodata=nodata,
                           outputType=gdal.GDT_Float32, creationOptions=['COMPRESS=DEFLATE', 'PREDICTOR=3', 'TILED=YES'])
        if warped is None or [warped.RasterXSize, warped.RasterYSize] != [width, height]:
            warped = None
            raise ValueError('TNM terrain mosaic did not produce the expected pixel grid')
        gt = warped.GetGeoTransform()
        if not np.allclose(gt, [a, 1.0, 0.0, d, 0.0, -1.0], atol=1e-7, rtol=0):
            warped = None
            raise ValueError('TNM terrain mosaic grid changed during assembly')
        warped = None
        decoded, _nodata, decoder = elevation_raster.read_elevation(out_path)
        empty = elevation_raster.empty_fraction(decoded)
        raster = out_path.read_bytes()
    return raster, empty, decoder


def attempt_tnm_1m_fallback(directory, pkg, bounds, west, south, east, north, extent_wgs84):
    """The ImageServer's native-1m catalog found nothing here. TNM Access
    is a second, independently-updated catalog for the same USGS 3DEP
    one-meter product line; apply the same source rule (one project, full
    AOI coverage, native 1 m, verified NAVD88, newest acquisition) to
    whatever it lists. Returns (manifest_or_None, rejectedCandidates);
    never raises for an ordinary rejection -- only a hard, unexpected
    failure (a malformed mosaic, a truncated catalog) propagates.
    """
    tiles = tnm_1m_products([west, south, east, north])
    if not tiles:
        return None, []
    projects = {}
    for tile in tiles:
        projects.setdefault(tile_project(tile['title']), []).append(tile)
    ordered = order_by_recency(list(projects.items()), lambda item: item[0], lambda item: item[0])

    crs = course_crs.origin_epsg(pkg)
    local_perimeter = local_bounds_perimeter(bounds)
    x, y = zip(*local_perimeter)
    lon, lat = geographic(x, y)
    project = pyproj.Transformer.from_crs(4326, crs, always_xy=True)
    source_x, source_y = project.transform(lon, lat)
    a, b, c, d = snap_bounds([min(source_x), min(source_y), max(source_x), max(source_y)], SOURCE_COVERAGE_PADDING_METERS, 1)
    width, height = int(c - a), int(d - b)
    # The same bounded-budget guard `export_usgs_grid` enforces per request;
    # a single `gdal.Warp` call has no per-request pixel cap to tile around,
    # so only the guard is reused here, not the request partitioning.
    terrain_export_windows([a, b, c, d], width, height)

    def evaluate(item):
        project_name, project_tiles = item
        footprint = unary_union([box(*t['boundingBoxWgs84']) for t in project_tiles])
        if not footprint.covers(extent_wgs84):
            # A catalog footprint is a claim, not evidence, per the existing
            # ImageServer path -- the real gate is the empty-fraction check
            # on the warped output below. This coverage check only screens
            # out a project that cannot possibly reach the whole AOI.
            raise SourceRejected('coverage_gap')
        intersecting = [t for t in project_tiles if box(*t['boundingBoxWgs84']).intersects(extent_wgs84)]
        vertical, meta_doc = None, {}
        for tile in intersecting:
            meta_doc = tnm_item_metadata(tile.get('metaUrl'))
            vertical = tnm_tile_vertical_evidence(tile, meta_doc)
            if vertical is not None:
                break
        if vertical is None:
            raise SourceRejected('vertical_datum_unverified')
        raster, empty, decoder = tnm_warp_grid(directory, intersecting, [a, b, c, d], width, height, crs)
        if empty > MAX_EMPTY_EXPORT_FRACTION:
            raise SourceRejected('export_empty_fraction_exceeds_threshold', emptyFraction=empty)
        starts, ends = zip(*(tnm_metadata_dates(tnm_item_metadata(t.get('metaUrl'))) for t in intersecting))
        starts, ends = [s for s in starts if s], [e for e in ends if e]
        return {'tiles': intersecting, 'vertical': vertical, 'raster': raster, 'empty': empty, 'decoder': decoder,
                'acquisitionStart': min(starts) if starts else None, 'acquisitionEnd': max(ends) if ends else None}

    winner, extra, rejected = select_first_survivor(ordered, evaluate)
    if winner is None:
        return None, [{'project': r['candidate'][0], 'reason': r['reason'],
                       **{k: v for k, v in r.items() if k not in ('candidate', 'reason')}} for r in rejected]
    project_name, _project_tiles = winner
    tiles = extra['tiles']
    title = tiles[0]['title'] if len(tiles) == 1 else f"{tiles[0]['title']} (+{len(tiles) - 1} adjacent {project_name} tile{'s' if len(tiles) > 2 else ''})"
    (directory / 'elevation.tiff').write_bytes(extra['raster'])
    exported = {'width': width, 'height': height,
                'extent': dict(zip(('xmin', 'ymin', 'xmax', 'ymax'), (a, b, c, d)), spatialReference={'wkid': crs}),
                'assembly': 'tnm_access_single_pass_warp_bilinear', 'sourceTiles': [t['title'] for t in tiles]}
    write_json(directory / 'catalog.json', {'schema': 'golfhelm-tnm-1m-products-v1', 'dataset': TNM_1M_DATASET,
                                            'bboxWgs84': [west, south, east, north], 'tiles': tiles}, True)
    write_json(directory / 'export.json', exported, True)
    vertical = extra['vertical']
    manifest = {'schemaVersion': 1, 'providerPolicyId': USGS_3DEP_PROVIDER, 'packageHash': pkg['contentHash'],
                'requestedLocalBoundsM': bounds, 'selectedTitle': title, 'selectedObjectId': None, 'selectedObjectIds': [],
                'selectedTiles': [t['title'] for t in tiles], 'sourceUrl': tiles[0]['downloadURL'],
                'acquisitionStart': extra['acquisitionStart'], 'acquisitionEnd': extra['acquisitionEnd'],
                'nativeResolutionM': 1.0, 'sourceNativeResolutionM': 1.0, 'exportPixelM': [1.0, 1.0],
                'horizontalExportCrs': f'EPSG:{crs}', 'verticalDatum': vertical['verticalDatum'],
                'rawVerticalUnit': vertical['rawVerticalUnit'], 'verticalUnitToMeters': vertical['verticalUnitToMeters'],
                'sourceFrameContract': USGS_3DEP_SOURCE_CONTRACT, 'verticalUnitStatus': vertical['verticalUnitStatus'],
                'retrievedAt': datetime.now(timezone.utc).date().isoformat(),
                'discoveryPath': 'tnm_access', 'imageServerCandidates': 0,
                'sourceSelection': ('tnm_access_single_native_1m_tile' if len(tiles) == 1
                                    else 'tnm_access_same_project_adjacent_native_1m_tiles'),
                'renderingOnly': False, 'renderingOnlyResolutionM': None,
                'coverageMethod': SOURCE_COVERAGE_METHOD, 'coveragePaddingMeters': SOURCE_COVERAGE_PADDING_METERS,
                'exportEmptyFraction': extra['empty'], 'decoder': extra['decoder'], 'rejectedCandidates': [],
                'licenseUrl': 'https://www.usgs.gov/3d-elevation-program/about-3dep-products-services',
                'exportRequestCount': 1,
                'fileHashes': {name: hashlib.sha256((directory / name).read_bytes()).hexdigest()
                               for name in ('catalog.json', 'export.json', 'elevation.tiff')}}
    write_json(directory / 'source-manifest.json', manifest, True)
    return manifest, []


def acquire_usgs_source(directory, pkg, bounds, rendering_only_resolution_m=None):
    manifest = existing_source_manifest(directory, pkg, bounds, rendering_only=rendering_only_resolution_m is not None)
    if manifest is not None:
        if manifest.get('providerPolicyId', USGS_3DEP_PROVIDER) != USGS_3DEP_PROVIDER:
            raise ValueError('Immutable source cache belongs to another terrain provider')
        return manifest
    names = ['catalog.json', 'export.json', 'elevation.tiff', 'source-manifest.json']
    directory.mkdir(parents=True, exist_ok=True)
    # Query every projected edge of the entire future course context, not
    # merely its four ENU corners.
    local_perimeter = local_bounds_perimeter(bounds)
    x, y = zip(*local_perimeter)
    lon, lat = geographic(x, y)
    west, south, east, north = float(min(lon)), float(min(lat)), float(max(lon)), float(max(lat))
    query = {'where': 'Category=1', 'geometryType': 'esriGeometryEnvelope', 'inSR': 4326, 'outSR': 4326,
             'geometry': json.dumps({'xmin': west, 'ymin': south, 'xmax': east, 'ymax': north,
                                     'spatialReference': {'wkid': 4326}}),
             'spatialRel': 'esriSpatialRelIntersects', 'returnGeometry': 'true',
             'outFields': 'OBJECTID,Name,title,URL,StartDate,EndDate,Resolution_X,VerticalDatum'}
    catalog = fetch.request('query', query)
    if catalog.get('exceededTransferLimit'):
        raise ValueError('Truncated source catalog requires bounded pagination review')
    extent_wgs84 = box(west, south, east, north)
    native = [row for row in catalog.get('features', [])
              if is_native_1m_title(row['attributes']['title'])
              and row['attributes']['VerticalDatum'] in ('NAVD88', 'North American Vertical Datum of 1988 (NAVD 88)')]
    candidates = covering_tile_sets(native, extent_wgs84)
    lower_resolution_visual_fallback = False
    if not candidates and rendering_only_resolution_m is not None:
        # A facility context world can retain a lower-resolution, current
        # public 3DEP export only after declaring it render-only.  It cannot
        # become a physical height field, slope source, or route constraint.
        # Do not magnify the source: restrict candidates to grids no coarser
        # than the requested visual raster.
        visual = [row for row in catalog.get('features', [])
                  if row['attributes'].get('VerticalDatum') in ('NAVD88', 'North American Vertical Datum of 1988 (NAVD 88)')
                  and (catalog_resolution_m(row['attributes'], (south + north) / 2) or math.inf) <= rendering_only_resolution_m]
        candidates = covering_tile_sets(visual, extent_wgs84)
        lower_resolution_visual_fallback = bool(candidates)
    if not candidates:
        tnm_rejected = []
        if rendering_only_resolution_m is None:
            # A second, independently-updated USGS catalog for the same
            # one-meter DEM product line; never blended with an ImageServer
            # candidate, so a course the ImageServer already resolves above
            # cannot have its choice changed by a newer TNM project.
            tnm_manifest, tnm_rejected = attempt_tnm_1m_fallback(directory, pkg, bounds, west, south, east, north, extent_wgs84)
            if tnm_manifest is not None:
                return tnm_manifest
        report = {'state': 'needs_source_review', 'reason': 'No native-1m tile set covers the full bounded course context',
                  'packageHash': pkg['contentHash'], 'bboxWgs84': [west, south, east, north],
                  'policy': 'No mixed-date or lower-resolution fallback is imported automatically', 'catalog': catalog,
                  'tnmRejectedCandidates': tnm_rejected}
        write_json(directory / 'coverage-exception.json', report, True)
        raise ValueError(report['reason'])
    # Horizontal reprojection only, in the course's own UTM zone; NAVD88 Z retained.
    crs = course_crs.origin_epsg(pkg)
    project = pyproj.Transformer.from_crs(4326, crs, always_xy=True)
    source_x, source_y = project.transform(lon, lat)
    # Snap projected output pixels to a 1m grid. Never describe render grid
    # density or image enlargement as additional source resolution.
    a, b, c, d = snap_bounds([min(source_x), min(source_y), max(source_x), max(source_y)], SOURCE_COVERAGE_PADDING_METERS, 1)
    native_width, native_height = int(c-a), int(d-b)
    if rendering_only_resolution_m is None:
        width, height = native_width, native_height
        terrain_export_windows([a, b, c, d], width, height)
    else:
        width, height = usgs_rendering_only_grid_size(native_width, native_height, rendering_only_resolution_m)
    inverse = pyproj.Transformer.from_crs(crs, 4326, always_xy=True)
    # Newest tile first. A catalog footprint is a claim, not evidence: a
    # project tile clipped at a state line still advertises its full square,
    # so every export is checked for empty fill before it is retained.
    rejected = []
    for tiles in candidates:
        attrs = tiles[0]['attributes']
        source_native_resolution_m = max(catalog_resolution_m(row['attributes'], (south + north) / 2) or math.inf for row in tiles)
        if source_native_resolution_m > width and source_native_resolution_m > height:
            raise ValueError('Source native resolution exceeds the bounded visual export dimensions')
        if lower_resolution_visual_fallback and rendering_only_resolution_m < source_native_resolution_m:
            raise ValueError('Render-only request would magnify the lower-resolution source grid')
        object_ids = [row['attributes']['OBJECTID'] for row in tiles]
        try:
            exported, raster, source_parts = export_usgs_grid(directory, [a, b, c, d], width, height, crs, object_ids)
        except ValueError as error:
            if 'unsupported empty fill' not in str(error):
                raise
            rejected.append({'title': attrs['title'], 'objectIds': object_ids, 'reason': str(error)})
            continue
        if (exported['width'], exported['height']) != (width, height):
            raise ValueError('Export dimensions changed; source resampling requires review')
        ex = exported['extent']
        elon, elat = inverse.transform([ex['xmin'], ex['xmax'], ex['xmax'], ex['xmin']],
                                      [ex['ymin'], ex['ymin'], ex['ymax'], ex['ymax']])
        footprint = unary_union([Polygon(row['geometry']['rings'][0], row['geometry']['rings'][1:]) for row in tiles])
        if not footprint.covers(Polygon(zip(elon, elat))):
            raise ValueError('Returned export exceeds the selected tile footprint')
        scratch = directory/'elevation.tiff'
        scratch.write_bytes(raster)
        decoded, _nodata, decoder = elevation_raster.read_elevation(scratch)
        empty = elevation_raster.empty_fraction(decoded)
        if empty <= MAX_EMPTY_EXPORT_FRACTION:
            break
        scratch.unlink()
        rejected.append({'title': attrs['title'], 'objectId': attrs['OBJECTID'], 'objectIds': object_ids, 'emptyFraction': empty,
                         'reason': 'Catalog footprint covers the context but the locked export is empty fill there'})
    else:
        report = {'state': 'needs_source_review', 'reason': 'Every covering terrain tile exported empty fill over the course context',
                  'packageHash': pkg['contentHash'], 'bboxWgs84': [west, south, east, north],
                  'rejectedCandidates': rejected, 'catalog': catalog}
        write_json(directory / 'coverage-exception.json', report, True)
        raise ValueError(report['reason'])
    exported.update(selectedObjectId=attrs['OBJECTID'], selectedObjectIds=object_ids, retrievedAt=datetime.now(timezone.utc).date().isoformat(),
                    sourceProjection=f'EPSG:{crs}', requestedLocalBoundsM=bounds)
    write_json(directory/'catalog.json', catalog, True)
    write_json(directory/'export.json', exported, True)
    for part in source_parts:
        (directory / part['name']).write_bytes(part['raster'])
    title = attrs['title'] if len(tiles) == 1 else f"{attrs['title']} (+{len(tiles) - 1} adjacent {tile_project(attrs['title'])} tile{'s' if len(tiles) > 2 else ''})"
    manifest = {'schemaVersion': 1, 'providerPolicyId': USGS_3DEP_PROVIDER, 'packageHash': pkg['contentHash'], 'requestedLocalBoundsM': bounds,
                'selectedTitle': title, 'selectedObjectId': attrs['OBJECTID'], 'selectedObjectIds': object_ids,
                'selectedTiles': [row['attributes']['title'] for row in tiles], 'sourceUrl': attrs['URL'],
                'acquisitionStart': date_text(attrs['StartDate']), 'acquisitionEnd': date_text(attrs['EndDate']),
                'nativeResolutionM': max((ex['xmax']-ex['xmin'])/width, (ex['ymax']-ex['ymin'])/height),
                'sourceNativeResolutionM': source_native_resolution_m, 'exportPixelM': [(ex['xmax']-ex['xmin'])/width, (ex['ymax']-ex['ymin'])/height],
                'horizontalExportCrs': f'EPSG:{crs}', 'verticalDatum': 'NAVD88',
                'rawVerticalUnit': 'meter', 'verticalUnitToMeters': 1,
                'sourceFrameContract': USGS_3DEP_SOURCE_CONTRACT,
                'verticalUnitStatus': 'declared_by_locked_usgs_3dep_catalog',
                'retrievedAt': exported['retrievedAt'],
                'sourceSelection': ('bounded_rendering_only_lower_resolution_export' if lower_resolution_visual_fallback else
                                    'bounded_rendering_only_resampled_export' if rendering_only_resolution_m is not None else
                                    'single_full_coverage_native_1m_tile' if len(tiles) == 1 else 'same_project_adjacent_native_1m_tiles'),
                'renderingOnly': rendering_only_resolution_m is not None,
                'renderingOnlyResolutionM': rendering_only_resolution_m,
                'coverageMethod': SOURCE_COVERAGE_METHOD, 'coveragePaddingMeters': SOURCE_COVERAGE_PADDING_METERS,
                'exportEmptyFraction': empty, 'decoder': decoder, 'rejectedCandidates': rejected,
                'licenseUrl': 'https://www.usgs.gov/3d-elevation-program/about-3dep-products-services',
                'exportRequestCount': max(1, len(source_parts)),
                'fileHashes': {name: hashlib.sha256((directory/name).read_bytes()).hexdigest()
                               for name in [*names[:-1], *(part['name'] for part in source_parts)]}}
    write_json(directory/'source-manifest.json', manifest, True)
    print(json.dumps({'source': title, 'pixels': [width, height], 'bytes': len(raster)}), flush=True)
    return manifest


def nc_onemap_read(url, limit):
    """Read only the DEM03 service or its export directory.

    The export URL comes from a public ArcGIS response, so it still gets an
    explicit host/path check before this pipeline follows it.
    """
    parsed = urllib.parse.urlparse(url)
    allowed = (parsed.scheme == 'https' and parsed.netloc == NC_ONEMAP_HOST and
               (parsed.path == NC_ONEMAP_SOURCE_PATH or parsed.path.startswith(NC_ONEMAP_SOURCE_PATH + '/') or
                parsed.path.startswith(NC_ONEMAP_EXPORT_PATH)))
    if not allowed:
        raise ValueError('NC OneMap URL outside the DEM03 allowlist')
    request = urllib.request.Request(url, headers={'User-Agent': 'GolfHelm course-geometry source compiler'})
    with urllib.request.urlopen(request, timeout=120) as response:
        data = response.read(limit + 1)
    if len(data) > limit:
        raise ValueError('NC OneMap DEM03 response exceeds bounded acquisition cap')
    return data


def nc_onemap_request(operation, values):
    payload = urllib.parse.urlencode({'f': 'json', **values})
    response = json.loads(nc_onemap_read(f'{NC_ONEMAP_BASE}/{operation}?{payload}', 2_000_000))
    if response.get('error'):
        raise ValueError('NC OneMap DEM03 request failed: ' + str(response['error']))
    return response


def validate_nc_onemap_service(service):
    if service.get('pixelType') != 'F32' or service.get('serviceDataType') != 'esriImageServiceDataTypeElevation':
        raise ValueError('NC OneMap DEM03 service type changed; source review required')
    x, y = float(service.get('pixelSizeX', 0)), float(service.get('pixelSizeY', 0))
    if not math.isclose(x, NC_ONEMAP_NATIVE_PIXEL_US_FEET, rel_tol=0, abs_tol=1e-9) or not math.isclose(y, NC_ONEMAP_NATIVE_PIXEL_US_FEET, rel_tol=0, abs_tol=1e-9):
        raise ValueError('NC OneMap DEM03 native resolution changed; source review required')
    validate_nc_horizontal_crs(service.get('spatialReference') or {})


def validate_nc_horizontal_crs(reference):
    try:
        source = pyproj.CRS.from_user_input(reference.get('wkt') or reference.get('latestWkid') or reference.get('wkid'))
    except pyproj.exceptions.CRSError as exc:
        raise ValueError('NC OneMap source CRS is missing or invalid') from exc
    if not source.equals(pyproj.CRS(NC_ONEMAP_CRS)):
        raise ValueError('NC OneMap source CRS differs from NAD83(2011) NC ftUS; retain as a new source revision')
    return source


def nc_vertical_evidence(info):
    """Horizontal ftUS is never evidence of Z units. Read the raster VCS."""
    reference = (info.get('extent') or {}).get('spatialReference') or {}
    code = reference.get('latestVcsWkid')
    if not code:
        return None
    vertical = pyproj.CRS.from_epsg(code)
    if not vertical.is_vertical or len(vertical.axis_info) != 1:
        raise ValueError('NC vertical CRS is not a one-axis vertical reference')
    axis = vertical.axis_info[0]
    return {'verticalCrs': f'EPSG:{code}', 'verticalWkt': vertical.to_wkt(),
            'verticalDatum': vertical.datum.name, 'rawVerticalUnit': axis.unit_name,
            'verticalUnitToMeters': axis.unit_conversion_factor,
            'verticalUnitStatus': 'verified_from_locked_raster_vcs', 'geoidModel': None}


def nc_source_grid_bounds(bounds, extent):
    """Snap a request extent to the native NC DEM03 source grid."""
    west, south, east, north = bounds
    step = NC_ONEMAP_NATIVE_PIXEL_US_FEET
    origin_x, origin_y = float(extent['xmin']), float(extent['ymin'])
    left = origin_x + math.floor((west - origin_x) / step) * step
    bottom = origin_y + math.floor((south - origin_y) / step) * step
    right = origin_x + math.ceil((east - origin_x) / step) * step
    top = origin_y + math.ceil((north - origin_y) / step) * step
    width, height = round((right - left) / step), round((top - bottom) / step)
    return [left, bottom, right, top], [width, height]


def nc_native_grid_bounds(bounds, extent):
    """Snap a requested NC DEM03 crop to the source grid, never to display pixels."""
    requested, size = nc_source_grid_bounds(bounds, extent)
    width, height = size
    if width <= 1 or height <= 1 or width * height > MAX_NC_ONEMAP_PIXELS:
        raise ValueError('NC OneMap DEM03 native-grid request violates the fixed acquisition pixel cap')
    return requested, size


def nc_rendering_only_grid_bounds(bounds, extent, resolution_m):
    """Return a bounded *derived* render raster request for a large facility.

    This deliberately preserves the source-grid-aligned extent but requests a
    coarser output from the provider. Callers must mark the resulting raster
    render-only; it is never a substitute for native terrain evidence.
    """
    source_m = NC_ONEMAP_NATIVE_PIXEL_US_FEET * US_SURVEY_FOOT_TO_METERS
    if not math.isfinite(resolution_m) or resolution_m <= source_m:
        raise ValueError('NC OneMap render-only resolution must be coarser than the native source grid')
    requested, _native_size = nc_source_grid_bounds(bounds, extent)
    step = resolution_m / US_SURVEY_FOOT_TO_METERS
    width = math.ceil((requested[2] - requested[0]) / step)
    height = math.ceil((requested[3] - requested[1]) / step)
    if width <= 1 or height <= 1 or width * height > MAX_NC_ONEMAP_PIXELS:
        raise ValueError('NC OneMap render-only request violates the fixed acquisition pixel cap')
    pixel_m = [(requested[2] - requested[0]) / width * US_SURVEY_FOOT_TO_METERS,
               (requested[3] - requested[1]) / height * US_SURVEY_FOOT_TO_METERS]
    return requested, [width, height], pixel_m


def nc_native_covering_rasters(catalog, footprint):
    """Return only full-covering native DEM03 rasters from an item query.

    The service marks both county source rasters and 500--8000 ft overview
    pyramids as ``category=1``.  An overview has an item-level ``lowps`` that
    differs from the service's locked 3.125 US-foot native grid.  It cannot
    participate in physical source selection, even when its large envelope
    covers the request.  Missing/unparseable item spacing fails closed.
    """
    result = []
    for row in catalog.get('features', []):
        geometry = row.get('geometry') or {}
        rings = geometry.get('rings') or []
        try:
            spacing = float((row.get('attributes') or {}).get('lowps'))
        except (TypeError, ValueError):
            continue
        if (not rings or not math.isclose(spacing, NC_ONEMAP_NATIVE_PIXEL_US_FEET,
                                          rel_tol=0, abs_tol=1e-9)):
            continue
        try:
            polygon = Polygon(rings[0], rings[1:])
        except (IndexError, TypeError, ValueError):
            continue
        if polygon.is_valid and polygon.covers(footprint):
            result.append(row)
    return result


def nc_select_covering_raster(catalog, footprint, rendering_only_resolution_m=None):
    """Select a locked NC raster without blurring physical and visual truth.

    A physical acquisition needs exactly one full-coverage native item. Some
    course envelopes straddle overlapping county products; their Z lineage is
    not an authority conflict a compiler may resolve.  A *rendering-only*
    export may instead choose the lowest stable object id and retain every
    candidate id and that rule in provenance.  It is deliberately forbidden
    to use that selection for physical terrain or measurements.
    """
    if catalog.get('exceededTransferLimit'):
        raise ValueError('NC_SOURCE_SELECTION_UNRESOLVED: item query was truncated; no raster may be selected')
    covering = nc_native_covering_rasters(catalog, footprint)
    object_id_field = catalog.get('objectIdFieldName', 'objectid')
    if len(covering) == 1:
        selected = covering[0]
        object_id = selected.get('attributes', {}).get(object_id_field)
        return selected, [object_id], 'unique_native_coverage'
    if not covering:
        raise ValueError('NC_SOURCE_SELECTION_UNRESOLVED: no full-coverage native county raster')
    if rendering_only_resolution_m is None:
        raise ValueError('NC_SOURCE_SELECTION_UNRESOLVED: select one full-coverage county raster; never blend unknown vertical references')
    # The source is used only to form a decorative height field.  Locking a
    # stable item prevents a changing ArcGIS mosaic from silently changing a
    # scene, while preserving the unresolved source choice in the manifest.
    try:
        ordered = sorted(covering, key=lambda row: int(row['attributes'][object_id_field]))
    except (KeyError, TypeError, ValueError) as error:
        raise ValueError('NC_SOURCE_SELECTION_UNRESOLVED: overlapping visual candidates have no stable object ids') from error
    candidate_ids = [row['attributes'][object_id_field] for row in ordered]
    return ordered[0], candidate_ids, 'visual_only_lowest_object_id_among_overlapping_native_coverage'


def nc_selection_dossier(directory, service, catalog, footprint, request_bounds, reason):
    """Retain a reviewable NC DEM03 source-selection refusal.

    The ImageServer can return more than one native county raster whose
    footprint covers a facility.  A stable OBJECTID is sufficient to lock a
    *visual* export, but is not authority to choose a physical elevation
    source.  Retain the exact catalog response, per-candidate raster-frame
    metadata, and the requested bounds so a reviewer can make that decision
    without re-querying a moving mosaic or guessing why the factory stopped.

    This dossier deliberately contains no selected physical raster and grants
    no measurement capability.  It is diagnostic evidence for a subsequent,
    explicit source-selection review only.
    """
    object_id_field = catalog.get('objectIdFieldName', 'objectid')
    candidates = []
    for row in nc_native_covering_rasters(catalog, footprint):
        attrs = row.get('attributes') or {}
        object_id = attrs.get(object_id_field)
        candidate = {
            'objectId': object_id,
            'title': attrs.get('name'),
            'nativePixelSpacingUSSurveyFeet': attrs.get('lowps'),
            'catalogAttributes': attrs,
            'catalogGeometry': row.get('geometry'),
            'itemInfoStatus': 'not_retrieved',
        }
        if object_id is None:
            candidate['itemInfoStatus'] = 'missing_stable_object_id'
        else:
            try:
                info = nc_onemap_request(f'{object_id}/info', {})
                horizontal = (info.get('extent') or {}).get('spatialReference') or {}
                validate_nc_horizontal_crs(horizontal)
                vertical = nc_vertical_evidence(info)
                candidate.update({
                    'itemInfoStatus': 'retrieved',
                    'itemInfoSha256': hashlib.sha256(
                        json.dumps(info, sort_keys=True, separators=(',', ':')).encode('utf-8')
                    ).hexdigest(),
                    'itemExtent': info.get('extent'),
                    'itemPixelSizeUSSurveyFeet': [info.get('pixelSizeX'), info.get('pixelSizeY')],
                    'verticalEvidence': vertical or {
                        'verticalDatum': None,
                        'rawVerticalUnit': None,
                        'verticalUnitToMeters': None,
                        'verticalUnitStatus': 'unknown',
                    },
                })
            except Exception as error:  # The source refusal must remain visible even during a metadata outage.
                candidate.update({'itemInfoStatus': 'unavailable', 'itemInfoError': str(error)})
        candidates.append(candidate)
    candidate_ids = [candidate['objectId'] for candidate in candidates]
    document = {
        'schema': 'golfhelm-nc-dem03-source-selection-dossier-v1',
        'providerPolicyId': NC_ONEMAP_PROVIDER,
        'sourceFrameContract': NC_ONEMAP_SOURCE_CONTRACT,
        'truthClass': 'unknown',
        'physicalTerrainAllowed': False,
        'renderingOnlySelectionAllowed': True,
        'selectionStatus': reason,
        'requestedBoundsEPSG6543': request_bounds,
        'candidateObjectIds': candidate_ids,
        'catalogResponseSha256': hashlib.sha256(
            json.dumps(catalog, sort_keys=True, separators=(',', ':')).encode('utf-8')
        ).hexdigest(),
        'serviceHorizontalWkt': (service.get('spatialReference') or {}).get('wkt'),
        'candidates': candidates,
        'requiredRemediation': {
            'action': 'approve one candidate raster or a separately validated source product for this facility revision',
            'requiredEvidence': [
                'stable source object identifier and retained item metadata',
                'horizontal and vertical frame compatibility',
                'source date/lineage and registration review for the facility',
                'reviewer decision scoped to this requested bounds and source revision',
            ],
            'forbiddenShortcuts': [
                'lowest object id is not physical source authority',
                'do not blend overlapping county rasters',
                'do not infer vertical units from horizontal US survey feet',
            ],
        },
    }
    write_json(directory / 'source-selection-dossier.json', document, True)
    return document


def summarize_nc_rejected_candidates(rejected, object_id_field):
    """A compact, JSON-safe record of an NC OneMap rejection walk: just
    enough (object id, title, reason, and whatever evidence the rejection
    carried) to explain a fallback decision, without repeating the full
    catalog/metadata detail the source-selection dossier already retains."""
    summary = []
    for entry in rejected:
        attrs = (entry['candidate'].get('attributes') or {})
        item = {'objectId': attrs.get(object_id_field), 'title': attrs.get('name'), 'reason': entry['reason']}
        item.update({k: v for k, v in entry.items() if k not in ('candidate', 'reason')})
        summary.append(item)
    return summary


def attempt_usgs_3dep_terrain_fallback(directory, pkg, bounds, rendering_only_resolution_m, fallback_reason, rejected_nc_candidates):
    """Every NC OneMap candidate was rejected (most often: none carries a
    verified NAVD88 vertical reference). USGS 3DEP is NAVD88 by definition,
    so fall through to it rather than leaving the course permanently
    blocked -- the shared source rule (terrain_source_rule.py) still governs
    which 3DEP project is chosen; a 3DEP failure here (no coverage, empty
    fill) propagates unchanged, since the factory already classifies those
    messages. The NC rejection stays on record so the fallback is never
    silent about why NC OneMap was skipped."""
    manifest = acquire_usgs_source(directory, pkg, bounds, rendering_only_resolution_m)
    manifest['fallbackFrom'] = NC_ONEMAP_PROVIDER
    manifest['fallbackReason'] = fallback_reason
    manifest['fallbackRejectedCandidates'] = rejected_nc_candidates
    write_json(directory / 'source-manifest.json', manifest, True)
    return manifest


def acquire_nc_onemap_source(directory, pkg, bounds, rendering_only_resolution_m=None):
    manifest = existing_source_manifest(directory, pkg, bounds, rendering_only=rendering_only_resolution_m is not None)
    if manifest is not None:
        if manifest.get('providerPolicyId') == USGS_3DEP_PROVIDER and manifest.get('fallbackFrom') == NC_ONEMAP_PROVIDER:
            # A retained 3DEP fallback is itself the immutable source now;
            # NC OneMap is not re-queried behind an already-approved cache.
            return manifest
        if manifest.get('providerPolicyId') != NC_ONEMAP_PROVIDER:
            raise ValueError('Immutable source cache belongs to another terrain provider')
        if manifest.get('sourceFrameContract') != NC_ONEMAP_SOURCE_CONTRACT:
            raise ValueError('SOURCE_FRAME_UNVERIFIED: NC_SOURCE_FRAME_UNVERIFIED: retain the old source and acquire into a new source directory')
        return manifest
    directory.mkdir(parents=True, exist_ok=True)
    # Local ENU is the canonical world frame.  Its conversion is used only to
    # request the grid in NC's declared projected CRS; every sampled vertex is
    # transformed from WGS84 through that exact CRS at read time.
    local_perimeter = local_bounds_perimeter(bounds)
    local_x, local_y = zip(*local_perimeter)
    lon, lat = geographic(local_x, local_y)
    project = pyproj.Transformer.from_crs(4326, NC_ONEMAP_CRS, always_xy=True)
    source_x, source_y = project.transform(lon, lat)
    service = json.loads(nc_onemap_read(NC_ONEMAP_BASE + '?f=json', 2_000_000))
    validate_nc_onemap_service(service)
    source_padding = SOURCE_COVERAGE_PADDING_METERS / US_SURVEY_FOOT_TO_METERS
    request_bounds = [min(source_x) - source_padding, min(source_y) - source_padding,
                      max(source_x) + source_padding, max(source_y) + source_padding]
    catalog = nc_onemap_request('query', {
        'where': 'category=1', 'geometry': ','.join(map(str, request_bounds)),
        'geometryType': 'esriGeometryEnvelope', 'inSR': 6543, 'outSR': 6543,
        'spatialRel': 'esriSpatialRelIntersects', 'outFields': '*', 'returnGeometry': 'true',
    })
    footprint = box(*request_bounds)
    object_id_field = catalog.get('objectIdFieldName', 'objectid')
    rejected_candidates = []
    already_resolved = False
    try:
        selected, candidate_object_ids, selection_method = nc_select_covering_raster(
            catalog, footprint, rendering_only_resolution_m,
        )
    except ValueError as error:
        if 'NC_SOURCE_SELECTION_UNRESOLVED' not in str(error) or rendering_only_resolution_m is not None:
            raise
        # More than one native, full-coverage county raster: apply the same
        # source rule every provider uses (single project/source, full
        # coverage, native resolution -- both already established -- a
        # verified NAVD88 vertical reference, newest acquisition wins) rather
        # than refusing outright. Walk candidates newest-titled first; the
        # first one whose vertical reference and locked export both hold up
        # is the source. Every other candidate is recorded with its reason.
        covering = nc_native_covering_rasters(catalog, footprint)
        if not covering:
            nc_selection_dossier(directory, service, catalog, footprint, request_bounds, 'no_full_coverage_native_candidate')
            raise
        ordered = order_by_recency(covering, lambda row: row['attributes'].get('name'), lambda row: row['attributes'][object_id_field])

        def evaluate(row):
            candidate_id = row['attributes'][object_id_field]
            candidate_info = nc_onemap_request(f'{candidate_id}/info', {})
            try:
                validate_nc_horizontal_crs((candidate_info.get('extent') or {}).get('spatialReference') or {})
            except ValueError as exc:
                raise SourceRejected('horizontal_crs_mismatch', detail=str(exc)) from exc
            if any(not math.isclose(float(candidate_info.get(k, 0)), NC_ONEMAP_NATIVE_PIXEL_US_FEET, abs_tol=1e-9)
                   for k in ('pixelSizeX', 'pixelSizeY')):
                raise SourceRejected('native_grid_mismatch')
            candidate_vertical = nc_vertical_evidence(candidate_info)
            if candidate_vertical is None:
                raise SourceRejected('vertical_datum_unverified')
            candidate_origin = candidate_info['origin']
            candidate_requested, candidate_size = nc_native_grid_bounds(
                request_bounds, {'xmin': candidate_origin['x'], 'ymin': candidate_origin['y']})
            candidate_export = nc_onemap_request('exportImage', {
                'bbox': ','.join(map(str, candidate_requested)), 'bboxSR': 6543, 'imageSR': 6543,
                'size': ','.join(map(str, candidate_size)), 'format': 'tiff', 'pixelType': 'F32',
                'interpolation': 'RSP_BilinearInterpolation', 'renderingRule': json.dumps({'rasterFunction': 'None'}),
                'mosaicRule': json.dumps({'mosaicMethod': 'esriMosaicLockRaster', 'lockRasterIds': [candidate_id], 'mosaicOperation': 'MT_FIRST'}),
            })
            try:
                validate_nc_horizontal_crs((candidate_export.get('extent') or {}).get('spatialReference') or {})
            except ValueError as exc:
                raise SourceRejected('horizontal_crs_mismatch', detail=str(exc)) from exc
            if [candidate_export.get('width'), candidate_export.get('height')] != candidate_size:
                raise SourceRejected('export_dimensions_changed')
            candidate_actual = candidate_export.get('extent') or {}
            candidate_actual_values = [float(candidate_actual.get(field, math.nan)) for field in ('xmin', 'ymin', 'xmax', 'ymax')]
            if any(not math.isclose(value, expected, rel_tol=0, abs_tol=1e-6)
                   for value, expected in zip(candidate_actual_values, candidate_requested)):
                raise SourceRejected('export_extent_changed')
            candidate_raster = nc_onemap_read(candidate_export['href'], 80_000_000)
            probe_path = directory / f'probe-{candidate_id}.tiff'
            probe_path.write_bytes(candidate_raster)
            try:
                candidate_decoded, _nodata, candidate_decoder = elevation_raster.read_elevation(probe_path)
                candidate_empty = elevation_raster.empty_fraction(candidate_decoded)
            finally:
                probe_path.unlink(missing_ok=True)
            if candidate_empty > MAX_EMPTY_EXPORT_FRACTION:
                raise SourceRejected('export_empty_fraction_exceeds_threshold', emptyFraction=candidate_empty)
            return {'info': candidate_info, 'vertical': candidate_vertical, 'requested': candidate_requested,
                    'size': candidate_size, 'exported': candidate_export, 'raster': candidate_raster,
                    'empty': candidate_empty, 'decoder': candidate_decoder, 'origin': candidate_origin}

        winner, extra, rejected_candidates = select_first_survivor(ordered, evaluate)
        if winner is None:
            all_vertical_unknown = bool(rejected_candidates) and all(
                r['reason'] == 'vertical_datum_unverified' for r in rejected_candidates)
            nc_selection_dossier(directory, service, catalog, footprint, request_bounds,
                                 'all_candidates_lack_verified_vertical_reference' if all_vertical_unknown
                                 else 'no_candidate_satisfies_the_source_rule')
            if all_vertical_unknown:
                # USGS 3DEP is NAVD88 by definition, so a course whose NC
                # OneMap candidates are all otherwise valid but carry no
                # verified vertical reference is not stuck: fall through
                # to 3DEP rather than raising VERTICAL_UNIT_UNKNOWN. The NC
                # rejection stays on record via `fallbackRejectedCandidates`.
                return attempt_usgs_3dep_terrain_fallback(
                    directory, pkg, bounds, rendering_only_resolution_m,
                    'all_candidates_lack_verified_vertical_reference',
                    summarize_nc_rejected_candidates(rejected_candidates, object_id_field))
            # Raised `from None`: the caught ValueError above is the *ambiguous
            # multi-candidate* signal that sent us into this walk, not the
            # actual diagnosis. Left chained, Python's default traceback
            # prints both messages, and the factory's blocker classifier
            # (which only greps the tail of that text) would always match
            # the earlier generic NC_SOURCE_SELECTION_UNRESOLVED marker
            # before ever reaching the specific one decided here.
            raise ValueError('NC_SOURCE_SELECTION_UNRESOLVED: no full-coverage native county raster satisfies '
                             'the source rule (single project, full coverage, native resolution, verified NAVD88, '
                             'newest acquisition); see the retained dossier') from None
        selected = winner
        object_id = selected['attributes'][object_id_field]
        candidate_object_ids = [row['attributes'][object_id_field] for row in ordered]
        selection_method = 'single_native_full_coverage_raster_newest_acquisition_v1'
        info, vertical = extra['info'], extra['vertical']
        requested, size, exported = extra['requested'], extra['size'], extra['exported']
        raster, empty, decoder, origin = extra['raster'], extra['empty'], extra['decoder'], extra['origin']
        already_resolved = True

    if not already_resolved:
        object_id = selected['attributes'][object_id_field]
        info = nc_onemap_request(f'{object_id}/info', {})
        validate_nc_horizontal_crs((info.get('extent') or {}).get('spatialReference') or {})
        if any(not math.isclose(float(info.get(k, 0)), NC_ONEMAP_NATIVE_PIXEL_US_FEET, abs_tol=1e-9) for k in ('pixelSizeX', 'pixelSizeY')):
            raise ValueError('NC selected raster grid differs from declared native spacing')
        vertical = nc_vertical_evidence(info)
        if vertical is None and rendering_only_resolution_m is None:
            # Only one covering candidate existed and it lacks a verified
            # vertical reference: the same "every candidate rejected" case
            # as the ambiguous walk above, just with one candidate instead
            # of several. Same fallback, same record-keeping.
            return attempt_usgs_3dep_terrain_fallback(
                directory, pkg, bounds, rendering_only_resolution_m,
                'all_candidates_lack_verified_vertical_reference',
                summarize_nc_rejected_candidates(
                    [{'candidate': selected, 'reason': 'vertical_datum_unverified'}], object_id_field))
        origin = info['origin']
        grid_extent = {'xmin': origin['x'], 'ymin': origin['y']}
        if rendering_only_resolution_m is None:
            requested, size = nc_native_grid_bounds(request_bounds, grid_extent)
            output_pixel_m = [NC_ONEMAP_NATIVE_PIXEL_US_FEET * US_SURVEY_FOOT_TO_METERS] * 2
        else:
            requested, size, output_pixel_m = nc_rendering_only_grid_bounds(request_bounds, grid_extent, rendering_only_resolution_m)
        exported = nc_onemap_request('exportImage', {
            'bbox': ','.join(map(str, requested)), 'bboxSR': 6543, 'imageSR': 6543,
            'size': ','.join(map(str, size)), 'format': 'tiff', 'pixelType': 'F32',
            'interpolation': 'RSP_BilinearInterpolation', 'renderingRule': json.dumps({'rasterFunction': 'None'}),
            'mosaicRule': json.dumps({'mosaicMethod': 'esriMosaicLockRaster', 'lockRasterIds': [object_id], 'mosaicOperation': 'MT_FIRST'}),
        })
        validate_nc_horizontal_crs((exported.get('extent') or {}).get('spatialReference') or {})
        if [exported.get('width'), exported.get('height')] != size:
            raise ValueError('NC OneMap DEM03 export dimensions changed; source resampling requires review')
        actual = exported.get('extent') or {}
        actual_values = [float(actual.get(field, math.nan)) for field in ('xmin', 'ymin', 'xmax', 'ymax')]
        if rendering_only_resolution_m is None:
            if any(not math.isclose(value, expected, rel_tol=0, abs_tol=1e-6)
                   for value, expected in zip(actual_values, requested)):
                raise ValueError('NC OneMap DEM03 export extent changed; native-grid alignment requires review')
        else:
            # ArcGIS may expand a resampled export by part of one output cell so
            # it preserves all requested samples. The returned extent has to cover
            # the requested source-aligned perimeter, and cannot grow by more than
            # one declared visual pixel. This remains a rendering-only contract.
            output_step_ft = rendering_only_resolution_m / US_SURVEY_FOOT_TO_METERS
            left, bottom, right, top = actual_values
            if (not (left <= requested[0] <= requested[2] <= right and bottom <= requested[1] <= requested[3] <= top)
                    or left < requested[0] - output_step_ft - 1e-6 or bottom < requested[1] - output_step_ft - 1e-6
                    or right > requested[2] + output_step_ft + 1e-6 or top > requested[3] + output_step_ft + 1e-6):
                raise ValueError('NC OneMap DEM03 rendering-only export does not preserve bounded source coverage')
            output_pixel_m = [(right - left) / size[0] * US_SURVEY_FOOT_TO_METERS,
                              (top - bottom) / size[1] * US_SURVEY_FOOT_TO_METERS]
        raster = nc_onemap_read(exported['href'], 80_000_000)
        (directory / 'elevation.tiff').write_bytes(raster)
        decoded, _nodata, decoder = elevation_raster.read_elevation(directory / 'elevation.tiff')
        empty = elevation_raster.empty_fraction(decoded)
        if empty > MAX_EMPTY_EXPORT_FRACTION:
            raise ValueError(f'NC OneMap DEM03 export contains {empty:.3%} empty fill; source coverage review required')
    else:
        output_pixel_m = [NC_ONEMAP_NATIVE_PIXEL_US_FEET * US_SURVEY_FOOT_TO_METERS] * 2
        (directory / 'elevation.tiff').write_bytes(raster)
    # Preserve metadata even when measurement is blocked. Existing visual assets
    # remain usable; an explicitly requested visual export may declare an assumption.
    write_json(directory / 'selected-raster.json', {'catalog': catalog, 'rasterInfo': info}, True)
    retrieved = datetime.now(timezone.utc).date().isoformat()
    exported.update(retrievedAt=retrieved, requestedNativeBoundsUSFeet=requested, sourceCrs=NC_ONEMAP_CRS,
                    requestedLocalBoundsM=bounds)
    write_json(directory / 'catalog.json', service, True)
    write_json(directory / 'export.json', exported, True)
    manifest = {
        'schemaVersion': 1, 'providerPolicyId': NC_ONEMAP_PROVIDER, 'packageHash': pkg['contentHash'],
        'requestedLocalBoundsM': bounds, 'selectedTitle': selected['attributes'].get('name', 'NC OneMap DEM03'), 'selectedObjectId': object_id,
        'selectedObjectIds': [object_id], 'candidateObjectIds': candidate_object_ids,
        'selectionMethod': selection_method, 'selectedTiles': [selected['attributes']], 'sourceUrl': NC_ONEMAP_BASE,
        'acquisitionStart': None, 'acquisitionEnd': None, 'nativeResolutionM': max(output_pixel_m),
        'sourceNativeResolutionM': NC_ONEMAP_NATIVE_PIXEL_US_FEET * US_SURVEY_FOOT_TO_METERS,
        'exportPixelM': output_pixel_m,
        'horizontalExportCrs': NC_ONEMAP_CRS, 'horizontalSourceWkt': service['spatialReference']['wkt'],
        'sourceFrameContract': NC_ONEMAP_SOURCE_CONTRACT, 'sourceGridOrigin': origin,
        **(vertical or {'verticalDatum': None, 'rawVerticalUnit': None, 'verticalUnitToMeters': None,
                       'verticalUnitStatus': 'unknown', 'visualVerticalUnitToMeters': US_SURVEY_FOOT_TO_METERS,
                       'visualElevationAssumption': 'US survey feet assumed for visual-only rendering; unavailable for measurements'}),
        'retrievedAt': retrieved,
        'sourceSelection': (
            'single_native_full_coverage_raster_newest_acquisition_v1'
            if selection_method == 'single_native_full_coverage_raster_newest_acquisition_v1'
            else 'bounded_rendering_only_ambiguous_native_selection'
            if rendering_only_resolution_m is not None and len(candidate_object_ids) > 1
            else 'bounded_rendering_only_resampled_service_export'
            if rendering_only_resolution_m is not None
            else 'bounded_native_grid_locked_county_export'
        ),
        'rejectedCandidates': [
            {'objectId': row['candidate']['attributes'].get(object_id_field), 'title': row['candidate']['attributes'].get('name'),
             'reason': row['reason'], **{k: v for k, v in row.items() if k not in ('candidate', 'reason')}}
            for row in rejected_candidates
        ],
        'renderingOnly': rendering_only_resolution_m is not None,
        'renderingOnlyResolutionM': rendering_only_resolution_m,
        'coverageMethod': SOURCE_COVERAGE_METHOD, 'coveragePaddingMeters': SOURCE_COVERAGE_PADDING_METERS,
        'exportEmptyFraction': empty, 'decoder': decoder,
        'licenseUrl': None, 'licenseStatus': 'not supplied by the DEM03 service metadata; review before redistribution',
        'fileHashes': {name: hashlib.sha256((directory / name).read_bytes()).hexdigest() for name in ('catalog.json', 'export.json', 'elevation.tiff', 'selected-raster.json')},
    }
    write_json(directory / 'source-manifest.json', manifest, True)
    print(json.dumps({'source': manifest['selectedTitle'], 'pixels': size, 'bytes': len(raster)}), flush=True)
    return manifest


def charleston_county_request(operation, params):
    """Request the county's public 2025 LiDAR ImageServer with explicit JSON.

    This service is deliberately a named provider rather than a generic URL:
    its horizontal grid and published vertical-unit evidence form part of the
    immutable source contract.  A different county service needs its own
    adapter and review, rather than inheriting these assumptions.
    """
    query = urllib.parse.urlencode({**params, 'f': 'json'})
    request = urllib.request.Request(f'{CHARLESTON_COUNTY_DEM_2025_BASE}/{operation}?{query}',
                                     headers={'User-Agent': 'GolfHelm course-geometry source compiler'})
    with urllib.request.urlopen(request, timeout=120) as response:
        payload = json.load(response)
    if payload.get('error'):
        raise ValueError('Charleston County DEM service error: ' + str(payload['error']))
    return payload


def charleston_county_read(url, limit):
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme != 'https' or parsed.netloc != 'gisccimg.charlestoncounty.org':
        raise ValueError('Charleston County DEM export URL is outside the public service host')
    with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'GolfHelm course-geometry source compiler'}), timeout=120) as response:
        raw = response.read(limit + 1)
    if len(raw) > limit:
        raise ValueError('Charleston County DEM export exceeds bounded acquisition cap')
    return raw


def export_charleston_county_grid(directory, bounds, width, height):
    """Export and, if needed, stitch an exact grid from the 2025 county DEM.

    The service limits image height to 4,100 pixels.  Splitting preserves the
    requested source grid and rejects every shifted extent before a raster is
    retained.  It is the same no-resampling contract used by the USGS path.
    """
    windows = terrain_export_windows(bounds, width, height)
    parts = []
    for number, window in enumerate(windows):
        west, south, east, north = window['bounds']; w, h = window['pixels']
        request = {
            'bbox': f'{west},{south},{east},{north}', 'bboxSR': 6570, 'imageSR': 6570,
            'size': f'{w},{h}', 'format': 'tiff', 'pixelType': 'F32',
            'interpolation': 'RSP_BilinearInterpolation', 'adjustAspectRatio': 'false',
            'renderingRule': json.dumps({'rasterFunction': 'None'}),
        }
        exported = charleston_county_request('exportImage', request)
        if (exported.get('width'), exported.get('height')) != (w, h):
            raise ValueError('Charleston County DEM export dimensions changed; source resampling requires review')
        extent = exported.get('extent') or {}
        if any(not math.isclose(float(extent.get(key, math.nan)), value, abs_tol=1e-6, rel_tol=0)
               for key, value in zip(('xmin', 'ymin', 'xmax', 'ymax'), window['bounds'])):
            raise ValueError('Charleston County DEM export changed the requested grid extent')
        parts.append({'name': f'source-part-{number:03d}.tiff',
                      'raster': charleston_county_read(exported['href'], 40_000_000),
                      'export': {**exported, 'request': request}})
    if len(parts) == 1:
        return parts[0]['export'], parts[0]['raster'], []
    from osgeo import gdal
    gdal.UseExceptions()
    with tempfile.TemporaryDirectory(prefix='.charleston-terrain-', dir=directory) as tmp:
        root = Path(tmp); paths = []
        for part, window in zip(parts, windows):
            path = root / part['name']; path.write_bytes(part['raster']); paths.append(str(path))
            ds = gdal.Open(str(path))
            if ds.RasterCount != 1 or [ds.RasterXSize, ds.RasterYSize] != window['pixels']:
                raise ValueError('Charleston County DEM TIFF has the wrong pixel grid')
            if not pyproj.CRS.from_wkt(ds.GetProjectionRef()).equals(pyproj.CRS.from_epsg(6570)):
                raise ValueError('Charleston County DEM TIFF CRS differs from the locked request')
            west, south, east, north = window['bounds']; w, h = window['pixels']
            expected = [west, (east-west)/w, 0, north, 0, -(north-south)/h]
            if not np.allclose(ds.GetGeoTransform(), expected, atol=1e-7, rtol=0):
                raise ValueError('Charleston County DEM TIFF grid differs from its locked request')
            values, _nodata, _decoder = elevation_raster.read_elevation(path)
            if elevation_raster.empty_fraction(values) > MAX_EMPTY_EXPORT_FRACTION:
                raise ValueError('Charleston County DEM export contains unsupported empty fill')
            ds = None
        vrt = gdal.BuildVRT(str(root/'mosaic.vrt'), paths)
        merged = gdal.Translate(str(root/'mosaic.tiff'), vrt,
                                creationOptions=['COMPRESS=DEFLATE', 'PREDICTOR=3', 'TILED=YES'])
        if [merged.RasterXSize, merged.RasterYSize] != [width, height]:
            raise ValueError('Charleston County DEM mosaic did not preserve the original grid dimensions')
        expected = [bounds[0], (bounds[2]-bounds[0])/width, 0, bounds[3], 0, -(bounds[3]-bounds[1])/height]
        if not np.allclose(merged.GetGeoTransform(), expected, atol=1e-7, rtol=0):
            raise ValueError('Charleston County DEM mosaic grid changed during assembly')
        merged = vrt = None
        raster = (root/'mosaic.tiff').read_bytes()
    document = {'width': width, 'height': height,
                'extent': dict(zip(('xmin', 'ymin', 'xmax', 'ymax'), bounds), spatialReference={'wkid': 6570}),
                'assembly': 'exact_aligned_grid_mosaic_no_resampling',
                'parts': [{'file': part['name'], 'sha256': hashlib.sha256(part['raster']).hexdigest(), **part['export']} for part in parts]}
    return document, raster, parts


def acquire_charleston_county_dem_2025_source(directory, pkg, bounds, rendering_only_resolution_m=None):
    manifest = existing_source_manifest(directory, pkg, bounds, rendering_only=rendering_only_resolution_m is not None)
    if manifest is not None:
        if manifest.get('providerPolicyId') != CHARLESTON_COUNTY_DEM_2025_PROVIDER:
            raise ValueError('Immutable source cache belongs to another terrain provider')
        return manifest
    directory.mkdir(parents=True, exist_ok=True)
    metadata = charleston_county_request('', {})
    if metadata.get('pixelSizeX') != CHARLESTON_COUNTY_DEM_2025_PIXEL_FEET or metadata.get('pixelSizeY') != CHARLESTON_COUNTY_DEM_2025_PIXEL_FEET:
        raise ValueError('Charleston County DEM source grid changed; review the provider contract')
    if metadata.get('bandCount') != 1 or metadata.get('pixelType') != 'F32' or not metadata.get('allowCopy'):
        raise ValueError('Charleston County DEM metadata does not satisfy the immutable raster contract')
    local_perimeter = local_bounds_perimeter(bounds)
    east, north = zip(*local_perimeter)
    lon, lat = geographic(east, north)
    project = pyproj.Transformer.from_crs(4326, 6570, always_xy=True)
    source_x, source_y = project.transform(lon, lat)
    padding_ft = SOURCE_COVERAGE_PADDING_METERS / INTERNATIONAL_FOOT_TO_METERS
    raw = [min(source_x)-padding_ft, min(source_y)-padding_ft, max(source_x)+padding_ft, max(source_y)+padding_ft]
    spacing_ft = CHARLESTON_COUNTY_DEM_2025_PIXEL_FEET if rendering_only_resolution_m is None else max(
        CHARLESTON_COUNTY_DEM_2025_PIXEL_FEET,
        math.ceil((rendering_only_resolution_m / INTERNATIONAL_FOOT_TO_METERS) / CHARLESTON_COUNTY_DEM_2025_PIXEL_FEET) * CHARLESTON_COUNTY_DEM_2025_PIXEL_FEET,
    )
    a = math.floor(raw[0] / spacing_ft) * spacing_ft
    b = math.floor(raw[1] / spacing_ft) * spacing_ft
    c = math.ceil(raw[2] / spacing_ft) * spacing_ft
    d = math.ceil(raw[3] / spacing_ft) * spacing_ft
    width, height = int(round((c-a)/spacing_ft)), int(round((d-b)/spacing_ft))
    terrain_export_windows([a, b, c, d], width, height)
    service_extent = metadata.get('extent') or {}
    if not (service_extent.get('xmin', math.inf) <= a <= c <= service_extent.get('xmax', -math.inf)
            and service_extent.get('ymin', math.inf) <= b <= d <= service_extent.get('ymax', -math.inf)):
        raise ValueError('Charleston County DEM does not cover the full bounded course context')
    exported, raster, source_parts = export_charleston_county_grid(directory, [a, b, c, d], width, height)
    scratch = directory/'elevation.tiff'; scratch.write_bytes(raster)
    values, _nodata, decoder = elevation_raster.read_elevation(scratch)
    empty = elevation_raster.empty_fraction(values)
    if empty > MAX_EMPTY_EXPORT_FRACTION:
        scratch.unlink(missing_ok=True)
        raise ValueError('Charleston County DEM export contains unsupported empty fill')
    write_json(directory/'catalog.json', metadata, True)
    write_json(directory/'export.json', exported, True)
    for part in source_parts:
        (directory / part['name']).write_bytes(part['raster'])
    manifest = {
        'schemaVersion': 1, 'providerPolicyId': CHARLESTON_COUNTY_DEM_2025_PROVIDER,
        'packageHash': pkg['contentHash'], 'requestedLocalBoundsM': bounds,
        'selectedTitle': 'Charleston County LiDAR DEM 2025', 'selectedObjectId': None,
        'selectedObjectIds': [], 'selectedTiles': [], 'sourceUrl': CHARLESTON_COUNTY_DEM_2025_BASE,
        'acquisitionStart': '2025', 'acquisitionEnd': '2025',
        'nativeResolutionM': spacing_ft * INTERNATIONAL_FOOT_TO_METERS,
        'sourceNativeResolutionM': CHARLESTON_COUNTY_DEM_2025_PIXEL_FEET * INTERNATIONAL_FOOT_TO_METERS,
        'exportPixelM': [spacing_ft * INTERNATIONAL_FOOT_TO_METERS, spacing_ft * INTERNATIONAL_FOOT_TO_METERS],
        'horizontalExportCrs': CHARLESTON_COUNTY_DEM_2025_CRS,
        'horizontalSourceWkid': metadata.get('spatialReference', {}).get('latestWkid'),
        'horizontalSourceWkt': pyproj.CRS.from_epsg(6570).to_wkt(),
        'verticalDatum': 'NAVD88 (Geoid 18)', 'rawVerticalUnit': 'international_foot',
        'verticalUnitToMeters': INTERNATIONAL_FOOT_TO_METERS,
        'sourceFrameContract': CHARLESTON_COUNTY_DEM_2025_SOURCE_CONTRACT,
        'verticalUnitStatus': 'published_project_vertical_metadata',
        'verticalDatumEvidenceUrl': 'https://www.fisheries.noaa.gov/inport/item/77722',
        'retrievedAt': datetime.now(timezone.utc).date().isoformat(),
        'sourceSelection': 'charleston_county_2025_lidar_dem',
        'renderingOnly': rendering_only_resolution_m is not None,
        'renderingOnlyResolutionM': rendering_only_resolution_m,
        'coverageMethod': SOURCE_COVERAGE_METHOD, 'coveragePaddingMeters': SOURCE_COVERAGE_PADDING_METERS,
        'exportEmptyFraction': empty, 'decoder': decoder,
        'licenseUrl': 'https://www.dnr.sc.gov/GIS/lidar.html',
        'exportRequestCount': max(1, len(source_parts)),
        'fileHashes': {name: hashlib.sha256((directory/name).read_bytes()).hexdigest()
                       for name in ['catalog.json', 'export.json', 'elevation.tiff', *(part['name'] for part in source_parts)]},
    }
    write_json(directory/'source-manifest.json', manifest, True)
    print(json.dumps({'source': manifest['selectedTitle'], 'pixels': [width, height], 'bytes': len(raster)}), flush=True)
    return manifest


def acquire_source(directory, pkg, bounds, provider=USGS_3DEP_PROVIDER, rendering_only_resolution_m=None):
    if provider == USGS_3DEP_PROVIDER:
        return acquire_usgs_source(directory, pkg, bounds, rendering_only_resolution_m)
    if provider == NC_ONEMAP_PROVIDER:
        return acquire_nc_onemap_source(directory, pkg, bounds, rendering_only_resolution_m)
    if provider == CHARLESTON_COUNTY_DEM_2025_PROVIDER:
        return acquire_charleston_county_dem_2025_source(directory, pkg, bounds, rendering_only_resolution_m)
    raise ValueError(f'No terrain source adapter for provider {provider!r}')


def vertical_unit_to_meters(manifest):
    """Return the declared source Z conversion without guessing source units."""
    if manifest.get('providerPolicyId') == NC_ONEMAP_PROVIDER:
        if manifest.get('sourceFrameContract') != NC_ONEMAP_SOURCE_CONTRACT:
            raise ValueError('NC_SOURCE_FRAME_UNVERIFIED: retain legacy artifact; acquire a new native-frame revision')
        if manifest.get('verticalUnitStatus') != 'verified_from_locked_raster_vcs':
            if manifest.get('renderingOnly') and manifest.get('visualVerticalUnitToMeters') == US_SURVEY_FOOT_TO_METERS:
                return US_SURVEY_FOOT_TO_METERS
            raise ValueError('VERTICAL_UNIT_UNKNOWN: horizontal units cannot establish source Z')
    factor = manifest.get('verticalUnitToMeters')
    if factor is None:
        # Pre-v2 locked USGS cache manifests contain a well-known meters-only
        # source identity.  Any other source must state its conversion.
        if is_native_1m_title(manifest.get('selectedTitle', '')):
            return 1.0
        raise ValueError('Source manifest omits verticalUnitToMeters; do not assume raw elevations are meters')
    factor = float(factor)
    if not math.isfinite(factor) or factor <= 0 or factor > 10:
        raise ValueError('Invalid verticalUnitToMeters in source manifest')
    return factor


class ElevationSource:
    def __init__(self, directory, manifest):
        exported = json.loads((directory/'export.json').read_text())
        self.extent = exported['extent']
        self.raster, _nodata, self.decoder = elevation_raster.read_elevation(directory/'elevation.tiff')
        if self.raster.shape != (exported['height'], exported['width']):
            raise ValueError('Raster shape does not match immutable export metadata')
        self.raster *= vertical_unit_to_meters(manifest)
        horizontal_crs = manifest.get('horizontalExportCrs', f'EPSG:{SOURCE_CRS}')
        self.project = pyproj.Transformer.from_crs(4326, horizontal_crs, always_xy=True)
        self.manifest = manifest

    def sample(self, x, y):
        """Bilinear native export samples: any missing support stays unknown."""
        lon, lat = geographic(x, y)
        sx, sy = self.project.transform(lon, lat)
        ex, raster = self.extent, self.raster
        px = (np.asarray(sx)-ex['xmin'])/(ex['xmax']-ex['xmin'])*raster.shape[1]-.5
        py = (ex['ymax']-np.asarray(sy))/(ex['ymax']-ex['ymin'])*raster.shape[0]-.5
        ix, iy = np.floor(px).astype(int), np.floor(py).astype(int)
        inside = (ix >= 0) & (ix < raster.shape[1]-1) & (iy >= 0) & (iy < raster.shape[0]-1)
        cx, cy = np.clip(ix, 0, raster.shape[1]-2), np.clip(iy, 0, raster.shape[0]-2)
        support = np.array([raster[cy, cx], raster[cy, cx+1], raster[cy+1, cx], raster[cy+1, cx+1]])
        valid = inside & np.all(np.isfinite(support) & (support > -1000) & (support < 9000), axis=0)
        fx, fy = px-ix, py-iy
        value = support[0]*(1-fx)*(1-fy)+support[1]*fx*(1-fy)+support[2]*(1-fx)*fy+support[3]*fx*fy
        return np.where(valid, value, np.nan)


def display_surfaces(pkg_path, pkg, source):
    """Use the exact TypeScript display-outline compiler, including bounds QA."""
    surfaces = {}
    reports = {}
    for hole in pkg['holes']:
        directory = source / 'display' / hole['key']
        directory.mkdir(parents=True, exist_ok=True)
        subprocess.run([str(ROOT/'node_modules/.bin/tsx'), str(Path(__file__).with_name('prepare-terrain-surfaces.ts')),
                        str(directory), str(pkg_path), hole['key']], cwd=ROOT, check=True, capture_output=True, text=True)
        manifest = json.loads((directory/'display-surfaces.json').read_text())
        if manifest['geometryHash'] != pkg['contentHash']:
            raise ValueError('Display geometry hash mismatch')
        for f in manifest['surfaces']:
            shape = unary_union([Polygon(rings[0], rings[1:]) for rings in f['parts']])
            original = unary_union([Polygon(rings[0], rings[1:]) for rings in f['canonicalParts']])
            displacement = shape.boundary.hausdorff_distance(original.boundary)
            if not shape.is_valid or displacement > manifest['maxBoundaryDisplacementM'] or abs(shape.area/original.area-1) > .015:
                raise ValueError('Display boundary review failed: ' + f['id'])
            if len(f['parts']) != len(f['canonicalParts']) or [len(p) for p in f['parts']] != [len(p) for p in f['canonicalParts']]:
                raise ValueError('Display topology changed: ' + f['id'])
            surfaces[f['id']] = (f, shape)
            reports[f['id']] = {'id': f['id'], 'boundaryDisplacementM': round(displacement, 6),
                                'areaChangePercent': round(100*(shape.area/original.area-1), 6)}
    return surfaces, reports


def leaf_cells(bounds, tactical, detail, outer_step):
    """Conforming local refinement: shared edges retain every T-junction node."""
    cells = []
    def split(x, y, step):
        cell = box(x, y, x+step, y+step)
        target = DETAIL_STEP_M if cell.intersects(detail) else TACTICAL_STEP_M if cell.intersects(tactical) else outer_step
        if step > target:
            half = step/2
            for dx, dy in [(0, 0), (half, 0), (half, half), (0, half)]:
                split(x+dx, y+dy, half)
        else:
            cells.append((x, y, step))
    for x in np.arange(bounds[0], bounds[2], outer_step):
        for y in np.arange(bounds[1], bounds[3], outer_step):
            split(float(x), float(y), outer_step)
    vertical, horizontal = {}, {}
    for x, y, step in cells:
        for px, py in [(x, y), (x+step, y), (x+step, y+step), (x, y+step)]:
            vertical.setdefault(px, set()).add(py)
            horizontal.setdefault(py, set()).add(px)
    vertical = {x: sorted(ys) for x, ys in vertical.items()}
    horizontal = {y: sorted(xs) for y, xs in horizontal.items()}
    result = []
    for x, y, step in cells:
        def between(values, low, high):
            return values[bisect.bisect_left(values, low):bisect.bisect_left(values, high)]
        points = [(px, y) for px in between(horizontal[y], x, x+step)]
        points += [(x+step, py) for py in between(vertical[x+step], y, y+step)]
        points += [(px, y+step) for px in reversed(between(horizontal[y+step], x, x+step)+[x+step]) if px > x]
        points += [(x, py) for py in reversed(between(vertical[x], y, y+step)+[y+step]) if py > y]
        result.append((Polygon(points), step))
    return result


def metric_grid(source, bounds):
    a, b, c, d = snap_bounds(bounds, 2, METRIC_STEP_M)
    columns, rows = int((c-a)/METRIC_STEP_M)+1, int((d-b)/METRIC_STEP_M)+1
    if columns*rows > MAX_METRIC_CELLS:
        raise ValueError('Metric grid exceeds the 1M sample cap')
    x, y = np.meshgrid(a+np.arange(columns)*METRIC_STEP_M, b+np.arange(rows)*METRIC_STEP_M)
    values = source.sample(x, y).reshape(-1)
    return {'originM': [a, b], 'spacingM': METRIC_STEP_M, 'columns': columns, 'rows': rows,
            'heightsM': [round(float(value), 4) if np.isfinite(value) else None for value in values]}, values


def duplicate_vertex_report(vertices, normals=None):
    seen = {}
    agree, height_agree, duplicates = True, True, 0
    for i in range(0, len(vertices), 3):
        xy = tuple(vertices[i:i+2])
        normal = tuple(normals[i:i+3]) if normals is not None else None
        if xy in seen:
            duplicates += 1
            previous_z, previous_normal = seen[xy]
            agree &= normal == previous_normal
            height_agree &= vertices[i+2] == previous_z
        else:
            seen[xy] = (vertices[i+2], normal)
    report = {'duplicateVertexCount': duplicates, 'sourceHeightDuplicatesAgree': height_agree}
    if normals is not None:
        report['sourceNormalDuplicatesAgree'] = agree
    return report


def parts_inside_region(region, cut):
    """Reject overlay output that GEOS placed outside the region.

    Buffer/difference chains can leave a collinear sliver (area ~1e-15) as a
    separate part of a region.  GEOS's float overlay of that sliver against a
    cell can return the *whole cell* (or the cell minus a triangular hole)
    instead of nothing, so the cut sum would exceed the region and fail area
    conservation.  Point-in-polygon predicates do not share that failure: a
    genuine cut part always has an interior point covered by the region, while
    the bogus part does not.  Legitimate cuts pass through untouched, so the
    compiled artifact is unchanged wherever the failure did not occur.
    """
    parts = [part for part in getattr(cut, 'geoms', [cut]) if part.geom_type == 'Polygon' and not part.is_empty]
    kept = [part for part in parts if region.covers(part.representative_point())]
    if len(kept) == len(parts):
        return cut
    return kept[0] if len(kept) == 1 else MultiPolygon(kept) if kept else Polygon()

def node_pieces(pieces):
    """Global noding so adjacent pieces share exactly the same boundary vertices.

    Every material piece (region x cell) is cut by its own overlay chain, so a
    node that one overlay creates on a shared edge (rough minus woods puts a
    vertex where the rough outline crosses the woods outline) is missing from
    the other side (the woods piece never saw the rough).  Triangulating the
    pieces separately then leaves T-junctions: the two sides of the edge are
    the same line in exact arithmetic but not on the GPU, and hairline cracks
    show the sky through the terrain along feature and cell borders.  Union
    every piece boundary into one noded linework, re-polygonize it, and hand
    each face back to the piece that contains it: the faces of a planar
    arrangement carry every node on every side.  Heights are still sampled
    afterwards at the (shared) vertices, so nothing about the surface changes.
    """
    if not pieces:
        return [], {'faces': 0, 'unassignedFaces': 0}
    # Snap-rounded union: a vertex that float error leaves a hair off the line
    # it touches is still a node (the 5-decimal vertex rounding below is coarser).
    linework = shapely.unary_union([piece.boundary for _, _, piece in pieces], grid_size=NODING_GRID_M)
    tree = shapely.STRtree([piece for _, _, piece in pieces])
    faces, unassigned = [], 0
    for face in polygonize(linework):
        if face.area < DEGENERATE_AREA_M2:
            continue
        point = face.representative_point()
        owners = [i for i in tree.query(point, predicate='intersects').tolist() if pieces[i][2].covers(point)]
        if not owners:
            unassigned += 1
            continue
        feature_index, material, _ = pieces[min(owners)]
        faces.append((feature_index, material, face))
    return faces, {'faces': len(faces), 'unassignedFaces': unassigned}


def t_junction_report(xy, bounds):
    """Count mesh cracks: vertices lying strictly inside an edge that only one
    triangle uses, away from the context boundary (the hull is open by design)."""
    key = lambda p: (round(p[0], 4), round(p[1], 4))
    edges, unique = {}, set()
    for t in range(0, len(xy), 3):
        corners = [key(p) for p in xy[t:t+3]]
        unique.update(corners)
        for u, v in ((0, 1), (1, 2), (2, 0)):
            edge = (corners[u], corners[v]) if corners[u] < corners[v] else (corners[v], corners[u])
            edges[edge] = edges.get(edge, 0)+1
    def interior(p):
        return bounds[0]+1e-6 < p[0] < bounds[2]-1e-6 and bounds[1]+1e-6 < p[1] < bounds[3]-1e-6
    single = [e for e, n in edges.items() if n == 1 and (interior(e[0]) or interior(e[1]))]
    cell, grid = 8.0, {}
    for e in single:
        (x1, y1), (x2, y2) = e
        for cx in range(math.floor(min(x1, x2)/cell), math.floor(max(x1, x2)/cell)+1):
            for cy in range(math.floor(min(y1, y2)/cell), math.floor(max(y1, y2)/cell)+1):
                grid.setdefault((cx, cy), []).append(e)
    junctions = 0
    for x, y in unique:
        for e in grid.get((math.floor(x/cell), math.floor(y/cell)), []):
            (x1, y1), (x2, y2) = e
            if (x, y) in e:
                continue
            dx, dy = x2-x1, y2-y1
            length = math.hypot(dx, dy)
            if length < 1e-9:
                continue
            t = ((x-x1)*dx+(y-y1)*dy)/(length*length)
            if t <= 1e-6 or t >= 1-1e-6 or abs((x-x1)*dy-(y-y1)*dx)/length >= 1e-3:
                continue
            junctions += 1
            break
    return {'tJunctionVertices': junctions, 'interiorSingleEdges': len(single)}


def compile_hole(hole, pkg, raw_shapes, raw_features, displays, outline_reports, source, outer_step=16, ribbons=None,
                 source_normals=False, decorative_bands=True):
    """course-terrain-v4: the per-vertex `sourceNormals` array is opt-in. The
    renderer shades every fragment from the metric grid's slope (the same
    DEM gradient, sampled per pixel), so the array only duplicated 37 % of
    the gzipped hole payload; legacy packages that still carry it are read
    unchanged."""
    tactical_bounds, context_bounds = hole_bounds(hole, raw_shapes, raw_features, played_only=True)
    context = box(*context_bounds)
    ribbons = (ribbons if ribbons is not None else Polygon()).intersection(context)
    selected = [f for f in pkg['features'] if f['kind'] != 'route' and raw_shapes[f['id']].intersects(context)]
    order = ['woods', 'rough', 'fairway', 'tee', 'green', 'bunker', 'water']
    selected.sort(key=lambda f: (order.index(f['kind']), f['id']))
    surfaces = [(f['id'], f['kind'], displays[f['id']][1].intersection(context)) for f in selected]
    visible, covered = [], Polygon()
    for ident, kind, shape in reversed(surfaces):
        accepted = shape.difference(covered)
        visible.append((ident, kind, accepted))
        covered = covered.union(shape)
    visible.append(('terrain-context', 'ground', context.difference(covered)))
    visible.reverse()
    # Only the played hole receives fine terrain sampling. Neighbor surfaces
    # remain actual polygons, rendered in context without changing ownership.
    own = [raw_shapes[f['id']] for f in played_features([raw_features[i] for i in hole['featureIds']])]
    # A dense bunker field should retain every source-backed boundary without
    # forcing 4 m render cells across a 12 m halo around every small hazard.
    # Fairway, green and tee surfaces retain the broad tactical halo; bunkers
    # receive a smaller display-only halo. The canonical package, source DEM,
    # metric grid and all bunker coordinates remain unchanged.
    tactical_surfaces = [raw_shapes[i] for i in hole['featureIds']
                         if raw_features[i]['kind'] in ('fairway', 'green', 'tee')]
    bunker_surfaces = [raw_shapes[i] for i in hole['featureIds'] if raw_features[i]['kind'] == 'bunker']
    tactical = unary_union(tactical_surfaces).buffer(12)
    if bunker_surfaces:
        tactical = tactical.union(unary_union(bunker_surfaces).buffer(BUNKER_TACTICAL_BUFFER_M))
    tactical = tactical.intersection(context)
    if not ribbons.is_empty:
        tactical = tactical.union(ribbons.buffer(RIBBON_BAND_M).intersection(unary_union(own).buffer(RIBBON_REFINE_REACH_M)).intersection(context))
    # Greens and tee surfaces receive 2 m visual cells. Bunker footprints stay
    # exact, but use the 4 m tactical mesh above: public macro DEM evidence is
    # not a license to invent putting-grade bunker lips, and a crowded bunker
    # field must not consume the active-hole mobile budget.
    detail = unary_union([raw_shapes[i] for i in hole['featureIds']
                          if raw_features[i]['kind'] in ('green', 'tee')]).buffer(3)
    cells = leaf_cells(context_bounds, tactical, detail, outer_step)
    cell_shapes = [cell for cell, _ in cells]
    tree = shapely.STRtree(cell_shapes)
    fairways = unary_union([shape for ident, kind, shape in surfaces if kind == 'fairway' and ident in hole['featureIds']])
    greens = unary_union([shape for ident, kind, shape in surfaces if kind == 'green' and ident in hole['featureIds']])
    # These tiny visual bands are not source boundaries. A low arc subdivision
    # count avoids spending most of the mesh budget on neighboring decoration.
    surround = fairways.buffer(.6, quad_segs=2).difference(fairways)
    collar = greens.buffer(.45, quad_segs=2).difference(greens)
    xy, triangle_features, triangle_materials, ids, kinds, reports = [], [], [], [], [], []
    pieces = []
    for ident, kind, shape in visible:
        feature_index = len(ids)
        ids.append(ident); kinds.append(kind)
        regions = [(0, shape)]
        if kind == 'ground' and decorative_bands:
            regions = [(0, shape.difference(surround).difference(collar)), (3, shape.intersection(surround).difference(collar)), (4, shape.intersection(collar))]
        widths = {'green': (.2, .35), 'bunker': (.2, .35)}
        if kind in widths and ident in hole['featureIds'] and decorative_bands:
            edge, light = widths[kind]
            inset, interior = shape.buffer(-edge, quad_segs=2), shape.buffer(-edge-light, quad_segs=2)
            regions = [(1, shape.difference(inset)), (2, inset.difference(interior)), (0, interior)]
        regions = split_by_ribbons(regions, ribbons)
        for material, region in regions:
            if region.is_empty:
                continue
            for cell_index in sorted(tree.query(region, predicate='intersects').tolist()):
                cut = parts_inside_region(region, region.intersection(cell_shapes[cell_index]))
                for part in getattr(cut, 'geoms', [cut]):
                    if part.geom_type == 'Polygon' and not part.is_empty and part.area >= DEGENERATE_AREA_M2:
                        pieces.append((feature_index, material, part))
    faces, noding = node_pieces(pieces)
    tri_xy, tri_features, tri_materials, area_by_feature, count_by_feature = triangulate_faces(
        faces, ids, hole['key'], len(visible), DEGENERATE_AREA_M2)
    xy.extend(tri_xy); triangle_features.extend(tri_features); triangle_materials.extend(tri_materials)
    for feature_index, (ident, kind, shape) in enumerate(visible):
        area, count = area_by_feature[feature_index], count_by_feature[feature_index]
        area_delta = area-shape.area
        area_tolerance = area_conservation_tolerance(shape.area)
        if abs(area_delta) > area_tolerance:
            raise ValueError(f'Triangulation area mismatch: {hole["key"]} {ident}: {area_delta} (tolerance {area_tolerance})')
        reports.append({'id': ident, 'kind': kind, 'triangles': count, 'areaM2': round(area, 4),
                        'sourceAreaM2': round(shape.area, 4),
                        'areaDeltaM2': round(area_delta, 8),
                        'areaConservationToleranceM2': round(area_tolerance, 8),
                        'rendererContextOnly': ident not in hole['featureIds'] and ident != 'terrain-context'})
    if len(triangle_features) > MAX_TRIANGLES:
        if outer_step == 16:
            return compile_hole(hole, pkg, raw_shapes, raw_features, displays, outline_reports, source, 32, ribbons, source_normals, decorative_bands)
        if decorative_bands:
            # Drop only illustrative material subdivisions before considering
            # less terrain detail. Canonical boundaries, source heights, the
            # metric grid and tactical/detail spacing remain unchanged.
            return compile_hole(hole, pkg, raw_shapes, raw_features, displays, outline_reports, source, outer_step, ribbons, source_normals, False)
        if outer_step < MAX_CONTEXT_RENDER_STEP_M:
            # A dense source-backed boundary can make the remote context exceed
            # the mobile triangle budget even after visual bands are removed.
            # Coarsen only the renderer's context cells. The canonical source
            # polygons, tactical/detail cells, metric grid and sampled heights
            # remain unchanged, and the report records the selected display LOD.
            return compile_hole(hole, pkg, raw_shapes, raw_features, displays, outline_reports, source,
                                min(outer_step * 2, MAX_CONTEXT_RENDER_STEP_M), ribbons, source_normals, False)
        raise ValueError(f'{hole["key"]}: {len(triangle_features)} triangles exceeds {MAX_TRIANGLES}; explicit LOD review required')
    unique = np.array(sorted(set(xy)), dtype=float)
    heights = source.sample(unique[:, 0], unique[:, 1])
    east = source.sample(unique[:, 0]+1, unique[:, 1]); west = source.sample(unique[:, 0]-1, unique[:, 1])
    north = source.sample(unique[:, 0], unique[:, 1]+1); south = source.sample(unique[:, 0], unique[:, 1]-1)
    dzdx, dzdy = (east-west)/2, (north-south)/2
    normals = np.column_stack((-dzdx, -dzdy, np.ones(len(unique))))
    normals /= np.linalg.norm(normals, axis=1)[:, None]
    valid = np.isfinite(heights) & np.isfinite(normals).all(axis=1)
    lookup = {tuple(point): i for i, point in enumerate(unique)}
    vertices, vertex_normals, kept_features, kept_materials, kept_xy = [], [], [], [], []
    omitted, omitted_area = 0, 0
    for t, feature_index in enumerate(triangle_features):
        indices = [lookup[p] for p in xy[t*3:t*3+3]]
        if not valid[indices].all():
            omitted += 1
            omitted_area += Polygon(xy[t*3:t*3+3]).area
            continue
        for i in indices:
            vertices.extend([*unique[i].tolist(), round(float(heights[i]), 4)])
            vertex_normals.extend(np.round(normals[i], 7).tolist())
        kept_features.append(feature_index); kept_materials.append(triangle_materials[t]); kept_xy.extend(xy[t*3:t*3+3])
    if not kept_features:
        raise ValueError(hole['key'] + ': terrain unavailable from the locked source')
    grid, grid_values = metric_grid(source, context_bounds)
    tee = [f for f in selected if f['id'] in hole['featureIds'] and f['kind'] == 'tee']
    own_canopy = any(f['id'] in hole['featureIds'] and f['kind'] == 'woods' and f['reviewed'] for f in selected)
    context_ids = [f['id'] for f in selected if f['id'] not in hole['featureIds']]
    limitations = ['Source candidate; independent registration, renovation and boundary review pending',
                  'Macro terrain only; no putting-break or bunker-lip accuracy claim',
                  'Daily tee markers, actual cup, ball positions and tree heights are unknown',
                  'Neutral ground is not classified rough; outward surrounds are illustrative and at most 0.6m',
                  'Neighbor features are renderer-only context, not reassigned played-hole surfaces',
                  f"Terrain acquisition {source.manifest.get('acquisitionStart') or 'date unknown'} to {source.manifest.get('acquisitionEnd') or 'date unknown'} may predate current surfaces; currentness remains unverified"]
    if not tee:
        limitations.append('Played-hole tee geometry missing; no tee shape synthesized')
    if not own_canopy:
        limitations.append('No reviewed canopy for this played hole; no tree groups synthesized')
    if omitted or not np.isfinite(grid_values).all():
        limitations.append('Source nodata remains unknown; unsupported triangles omitted')
    profile = {'compilerVersion': COMPILER_VERSION, 'styleVersion': STYLE_VERSION,
               'decorativeEdgeBands': decorative_bands,
               'tacticalBoundsM': tactical_bounds, 'contextBoundsM': context_bounds, 'terrainAvailable': True,
               'contextCoverage': 'partial' if omitted or not np.isfinite(grid_values).all() else 'complete',
               'teeGeometry': 'approximate' if tee else 'missing', 'treeEvidence': 'canopy_only' if own_canopy else 'none',
               'limitations': limitations}
    meta = source.manifest
    source_meta = {'provider': meta.get('providerPolicyId', 'USGS 3DEP'), 'title': meta['selectedTitle'], 'url': meta['sourceUrl'],
                   'catalogObjectId': meta['selectedObjectId'], 'acquisitionStart': meta['acquisitionStart'], 'acquisitionEnd': meta['acquisitionEnd'],
                   'retrievedAt': meta['retrievedAt'], 'nativeResolutionM': meta.get('nativeResolutionM'), 'verticalAccuracyM': None, 'registrationResidualM': None,
                   'licenseUrl': meta['licenseUrl'], 'rasterSha256': meta['fileHashes']['elevation.tiff'],
                   'licenseStatus': meta.get('licenseStatus'), 'verticalDatum': meta.get('verticalDatum'),
                   'verticalDatumStatus': meta.get('verticalDatumStatus'), 'horizontalExportCrs': meta['horizontalExportCrs'], 'exportPixelM': meta['exportPixelM'],
                   'renderSamplingM': {'tactical': TACTICAL_STEP_M, 'detail': DETAIL_STEP_M, 'context': outer_step},
                   'metricSamplingM': METRIC_STEP_M, 'normalGradientStepM': 1}
    result = {'schemaVersion': 1, 'physicalHoleKey': hole['key'], 'geometryHash': pkg['contentHash'],
              'displayRevision': 'bounded-outline-v1', 'surfaceManifestHash': digest([displays[f['id']][0] for f in selected]),
              'status': 'source_candidate', 'horizontalFrame': 'wgs84-local-enu-v1', 'originWgs84': pkg['originWgs84'],
              'verticalDatum': meta.get('verticalDatum'), 'verticalUnits': 'meters', 'referenceElevationM': round(float(np.min(heights[valid])), 4),
              'vertices': vertices, 'triangleFeatures': kept_features, 'triangleMaterials': kept_materials,
              'featureIds': ids, 'featureKinds': kinds, 'contextFeatureIds': context_ids, 'metricGrid': grid,
              'renderProfile': profile, 'source': source_meta, 'limitations': limitations}
    if source_normals:
        result['sourceNormals'] = vertex_normals
    result['contentHash'] = digest(result)
    slopes = np.degrees(np.arctan(np.hypot(dzdx[valid], dzdy[valid])))
    report = {'physicalHoleKey': hole['key'], 'contentHash': result['contentHash'], 'geometryHash': pkg['contentHash'],
              'configuredBudget': MAX_TRIANGLES, 'originalEnvelope': ORIGINAL_TRIANGLE_ENVELOPE,
              'triangles': len(kept_features), 'uniqueVertices': len(unique), 'omittedTriangles': omitted,
              'metricCells': len(grid_values), 'metricNodataCells': int(np.count_nonzero(~np.isfinite(grid_values))),
              **duplicate_vertex_report(vertices, vertex_normals if source_normals else None),
              'sourceNormals': 'per_vertex' if source_normals else 'metric_grid_slope',
              'sourceNormalUnitMaxError': float(np.max(np.abs(np.linalg.norm(np.array(vertex_normals).reshape(-1, 3), axis=1)-1))),
              'slopesDegrees': {'max': float(max(slopes)), 'p95': float(np.percentile(slopes, 95)), 'p50': float(np.median(slopes))},
              'elevationRangeM': [float(min(heights[valid])), float(max(heights[valid]))],
              'contextAreaM2': context.area, 'triangulatedAreaM2': sum(f['areaM2'] for f in reports)-omitted_area,
              'omittedAreaM2': omitted_area,
              'breaklines': {'basis': 'context_ribbons' if not ribbons.is_empty else 'none', 'ribbonAreaM2': round(ribbons.area, 2),
                             'ribbonClasses': list(RIBBON_CLASSES), 'refineBandM': RIBBON_BAND_M, 'refineReachM': RIBBON_REFINE_REACH_M},
              'noding': {'basis': 'global_planar_arrangement', **noding, **t_junction_report(kept_xy, context_bounds)},
              'contextClippedFeatureIds': [f['id'] for f in selected if not context.covers(displays[f['id']][1])],
              'tacticalDistanceToContextEdgeM': [tactical_bounds[0]-context_bounds[0], tactical_bounds[1]-context_bounds[1],
                                                 context_bounds[2]-tactical_bounds[2], context_bounds[3]-tactical_bounds[3]],
              'features': reports, 'contextFeatureIds': context_ids,
              'displayOutlines': [outline_reports[f['id']] for f in selected], 'renderProfile': profile, 'source': source_meta,
              'compressedBytes': len(gzip.compress((canonical_json(result)+'\n').encode(), mtime=0))}
    return result, report


def source_readme(pkg, manifest):
    native = manifest.get('nativeResolutionM')
    resolution = f'{native:g}m' if isinstance(native, (int, float)) else 'the provider-declared native grid'
    source_native = manifest.get('sourceNativeResolutionM')
    vertical = manifest.get('verticalDatum') or 'not verified'
    license_line = f"Source terms: {manifest['licenseUrl']}." if manifest.get('licenseUrl') else f"Source terms: {manifest.get('licenseStatus', 'not recorded')}."
    return f"""# {pkg['name']} whole-course terrain source

One immutable provider export: **{manifest['selectedTitle']}** ({manifest.get('providerPolicyId', 'legacy source')}).
Acquisition: {manifest.get('acquisitionStart') or 'unknown'} to {manifest.get('acquisitionEnd') or 'unknown'}.
Retrieved: {manifest['retrievedAt']}. Immutable hashes and exact projected bounds
are in source-manifest.json and export.json. Do not replace the cached raster.

The {manifest.get('horizontalExportCrs', f'EPSG:{SOURCE_CRS}')} export is sampled at {resolution}; the 2m canonical
metric grid, 4m tactical mesh, 2m detail cells and coarser outer cells are separate
render/query choices, not claims of finer source resolution. Heights are converted
to meters from the declared source unit. Vertical datum: **{vertical}**. Registration
residual and source vertical accuracy are unknown.

{'This is a derived **render-only** raster at ' + resolution + ' from the provider native ' + (f'{source_native:g}m' if isinstance(source_native, (int, float)) else 'grid') + '. It may supply visual terrain context only; it must not be used for physical height, slope, route, or shot claims.' if manifest.get('renderingOnly') else 'This is a source-native acquisition and may be evaluated only under the separate physical validation contract.'}

Neighbor source features are renderer-only context. No cart paths, rough
classification, additional tree areas, daily tee markers or cup positions are
created. Canopy evidence is limited to explicitly reviewed groups, if any.

{license_line}
Source geometry attribution remains © OpenStreetMap contributors, ODbL1.0.
"""


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--holes', default='7', help='all or comma-separated played hole ordinals')
    parser.add_argument('--package', type=Path, default=FIXTURES/'cacapon.json')
    parser.add_argument('--source', type=Path, default=FIXTURES/'sources/cacapon-course-terrain')
    parser.add_argument('--output', type=Path, default=FIXTURES/'compiled-cacapon')
    parser.add_argument('--context', type=Path, default=None, help='reviewed context layer whose ground ribbons become breaklines')
    parser.add_argument('--source-normals', action='store_true',
                        help='also emit the per-vertex sourceNormals array (legacy; the renderer shades from the metric grid)')
    parser.add_argument('--provider', choices=(USGS_3DEP_PROVIDER, NC_ONEMAP_PROVIDER, CHARLESTON_COUNTY_DEM_2025_PROVIDER), default=USGS_3DEP_PROVIDER,
                        help='terrain adapter selected by the facility provider policy')
    parser.add_argument('--acquire-only', action='store_true',
                        help='lock the terrain source for this package and stop before compiling any hole (the course factory acquires once, compiles per hole)')
    parser.add_argument('--rendering-only-resolution-m', type=float, default=None,
                        help='request a coarser derived raster for a facility visual scene; never supplies physical terrain truth')
    args = parser.parse_args()
    pkg = json.loads(args.package.read_text())
    pilot.ORIGIN = pkg['originWgs84']
    raw_features = {f['id']: f for f in pkg['features']}
    raw_shapes = {i: local_geometry(f) for i, f in raw_features.items()}
    extents = [hole_bounds(hole, raw_shapes, raw_features)[1] for hole in pkg['holes']]
    bounds = [min(b[0] for b in extents)-8, min(b[1] for b in extents)-8,
              max(b[2] for b in extents)+8, max(b[3] for b in extents)+8]
    provider = resolve_source_provider(args.source, args.provider, acquire_only=args.acquire_only)
    if args.rendering_only_resolution_m is not None and not args.acquire_only:
        raise ValueError('rendering-only terrain may only be acquired; it cannot compile physical hole terrain')
    manifest = acquire_source(args.source, pkg, bounds, provider, args.rendering_only_resolution_m)
    if args.acquire_only:
        (args.source/'README.md').write_text(source_readme(pkg, manifest))
        print(json.dumps({'source': manifest['selectedTitle'], 'sourceManifestHash': digest(manifest), 'requestedLocalBoundsM': bounds}), flush=True)
        return
    source = ElevationSource(args.source, manifest)
    displays, outlines = display_surfaces(args.package, pkg, args.source)
    ribbons, context_hash = context_ribbons(args.context, pkg)
    wanted = {hole['ordinal'] for hole in pkg['holes']} if args.holes == 'all' else {int(n) for n in args.holes.split(',')}
    unknown = wanted.difference(hole['ordinal'] for hole in pkg['holes'])
    if unknown:
        raise ValueError('Unknown hole ordinals: ' + str(sorted(unknown)))
    reports, assets = [], {}
    asset_path = args.output/'asset-manifest.json'
    if asset_path.exists():
        previous = json.loads(asset_path.read_text())
        same_source = previous['sourceIdentity'] == source_identity(manifest) if previous.get('sourceIdentity') else previous['sourceManifestHash'] == digest(manifest)
        if previous['geometryHash'] != pkg['contentHash'] or not same_source:
            raise ValueError('Output manifest belongs to a different package/source; choose a new directory')
        assets = previous['holes']
    for hole in pkg['holes']:
        if hole['ordinal'] not in wanted:
            continue
        result, report = compile_hole(hole, pkg, raw_shapes, raw_features, displays, outlines, source, ribbons=ribbons.get(hole['key']),
                                      source_normals=args.source_normals)
        asset = write_asset(args.output, hole, result)
        assets[hole['key']] = asset
        report['asset'] = asset
        write_json(args.output/(hole['key']+'-report.json'), report, True)
        reports.append(report)
        print(json.dumps({'hole': hole['key'], 'triangles': report['triangles'], 'metricCells': report['metricCells'],
                          'contextFeatures': len(report['contextFeatureIds']), 'tee': report['renderProfile']['teeGeometry'],
                          'hash': report['contentHash']}), flush=True)
    summary = {'compilerVersion': COMPILER_VERSION, 'styleVersion': STYLE_VERSION, 'packageHash': pkg['contentHash'],
               'sourceManifestHash': digest(manifest), 'source': manifest, 'contextLayerHash': context_hash,
               'requestedOrdinals': sorted(wanted), 'compiledHoleCount': len(reports),
               'runtimeVersions': {'python': sys.version.split()[0], 'numpy': np.__version__, 'shapely': shapely.__version__, 'pyproj': pyproj.__version__},
               'holes': reports, 'limitations': ['All artifacts are local source candidates; no production publication or geographic acceptance implied',
               'Metric grid is independent of display mesh; a query requires all four bilinear supports to be valid',
               'contextCoverage describes DEM support, not completeness of fairway/rough/tree mapping']}
    write_json(args.output/'compilation-report.json', summary, True)
    write_json(asset_path, {'schemaVersion': 1, 'compilerVersion': COMPILER_VERSION,
                          'geometryHash': pkg['contentHash'], 'sourceManifestHash': digest(manifest), 'sourceIdentity': source_identity(manifest),
                          'holes': dict(sorted(assets.items()))}, True)
    (args.source/'README.md').write_text(source_readme(pkg, manifest))


if __name__ == '__main__':
    main()
