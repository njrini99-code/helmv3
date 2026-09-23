"""Derive per-hole canopy groups from USDA NAIP four-band imagery.

Canopy is decoration: the groups bound where crown artwork may render in the
2D card and the 3D landscape. Nothing here is a tree observation, an obstacle
height, or ball evidence. The classification is deliberately simple and fully
recorded so it can be re-run: NIR texture separates canopy from mowed turf,
NDVI removes roofs, roads, sand and water, and every reviewed golf surface is
masked out with a small buffer. Groups are clipped to each hole's compile
context and smoothed; the renderer spreads its crown budget over large groups.

The raster export is retained in ignored output with a manifest (request,
catalog tiles, hash); the derived review JSON is the fixture.

Usage:
  python3 scripts/golf/course-geometry/derive-canopy-naip.py \
    src/test/fixtures/course-geometry/peek-n-peak-upper.json \
    src/test/fixtures/course-geometry/sources/peek-n-peak-upper-terrain \
    output/course-geometry/peek-n-peak-upper-naip \
    src/test/fixtures/course-geometry/peek-n-peak-upper-canopy-review.json
"""
import argparse
import hashlib
import importlib.util
import json
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pyproj
from osgeo import gdal, ogr, osr
from PIL import Image, ImageDraw
from scipy import ndimage
from shapely import wkb
from shapely.geometry import LineString, Polygon, box
from shapely.ops import split, unary_union


def _sibling(name, filename):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(filename))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


course_crs = _sibling('course_crs', 'course_crs.py')

gdal.UseExceptions()
NAIP = 'https://apps.geo.fpac.usda.gov/geo-imagery/rest/services/naip/conus_naip/ImageServer'
CONTEXT_MARGIN_M = 160  # matches compile-course-terrain.py
MIN_GROUP_M2 = 400
# NDVI gate ceiling: the value the Peek'n Peak Upper and Winchester reviews
# were made with. Exports differ radiometrically (a bright or hazy capture
# compresses NDVI: Forsyth's forest sits at a median 0.32 where Winchester's
# sits at 0.50, its fairways at 0.12 against 0.37), so the gate is set per
# export a fixed gap above the median NDVI of the package's own OSM fairways,
# never above this ceiling and never below the floor. The candidate package
# carries no woods to sample (woods are what this pass produces). Texture
# (NIR std) separates turf from crowns by an order of magnitude on every
# export seen and stays fixed.
NDVI_MIN = 0.28
NDVI_MIN_FLOOR = 0.15
TURF_NDVI_GAP = 0.06
MIN_SAMPLE_PX = 200
TEXTURE_MIN = 10.5
SURFACE_BUFFER_PX = 3
MAX_BYTES = 60_000_000

# Automatic canopy sign-off (replaces the human visual review): a review
# outside these bounds blocks in `layout.canopy.derive` instead of merely
# noting it. Measured on the export's own raster share, and on the final
# vector regions after the closing/opening/simplify passes (never the raw
# classification mask: those passes can push a region back onto a surface).
CANOPY_SHARE_MIN = 0.02   # below this share, calibration is suspect before a tile is trusted treeless
CANOPY_SHARE_MAX = 0.85   # near-total tree cover across the export reads as a bad NDVI gate, not a wooded course
CANOPY_SURFACE_OVERLAP_MAX = 0.03  # final regions overlapping fairway/green/tee beyond this share means the vector step leaked onto a playing surface
CANOPY_GROUP_DENSITY_MAX_PER_HA = 2.0  # groups per hectare of the export; above this reads as classification speckle, not distinct tree masses


# Lidar canopy height (fetch-lidar-chm.py) outranks NAIP wherever it has
# returns: NDVI/texture on Golden Horseshoe's 2025 NAIP put 27% of its canopy
# on ground the 2013 3DEP CHM measures under 1 m and missed over half the
# trees the CHM sees. NAIP classifies only the cells lidar never reached.
CHM_TREE_MIN_M = 3.0
CHM_TREE_MAX_M = 60.0  # above any eastern canopy: birds, wires, unclassified noise -> treated as no return
LIDAR_COVERAGE_MIN = 0.5  # below this share of the export, lidar is a patchwork; NAIP alone, by name
CHM_NODATA = -9999.0

MIN_SPLIT_PART_M2 = 25  # a split piece this small is a seam sliver, not a tree mass
MIN_CLEARING_M2 = 200  # a gap smaller than this is between crowns, not a clearing anything plays through


def hole_free_parts(polygon):
    """Pieces of `polygon` with no interior rings, covering the same area.

    A region is written as one exterior ring (`coordinatesWgs84`), so a
    forest mass enclosing a clearing -- a fairway cut through woods, the
    normal shape on a wooded course -- used to be written without the
    clearing, and crown artwork filled the fairway (Golden Horseshoe: 70-77%
    of its play corridors). Cut through each interior ring with a vertical
    line until no piece has one."""
    if polygon.is_empty:
        return []
    clearings = [ring for ring in polygon.interiors if Polygon(ring).area >= MIN_CLEARING_M2]
    if len(clearings) != len(polygon.interiors):
        polygon = Polygon(polygon.exterior, clearings)
    if not polygon.interiors:
        return [polygon]
    minx, miny, maxx, maxy = polygon.bounds
    x = polygon.interiors[0].centroid.x
    cut = LineString([(x, miny - 1), (x, maxy + 1)])
    pieces = []
    for part in split(polygon, cut).geoms:
        if part.geom_type == 'Polygon' and part.area >= MIN_SPLIT_PART_M2:
            pieces.extend(hole_free_parts(part))
    return pieces


class NoFPACCoverage(RuntimeError):
    """FPAC conus_naip has no catalog tiles for this request; the caller may
    fall back to the facility's indexed NAIP Plus cache."""


def calibrated_ndvi_min(turf_median):
    """The NDVI gate for one export and the rule that chose it: the fairway
    median plus a fixed gap, or the reviewed ceiling when no fairway could be
    sampled. Clamped to [NDVI_MIN_FLOOR, NDVI_MIN]: calibration only ever
    loosens the gate on a compressed export, it never tightens the reviewed
    one."""
    if turf_median is None:
        return NDVI_MIN, 'fixed_ceiling'
    return round(max(NDVI_MIN_FLOOR, min(NDVI_MIN, turf_median + TURF_NDVI_GAP)), 3), 'turf_plus_gap'


def class_median(values, mask):
    return round(float(np.median(values[mask])), 3) if int(mask.sum()) >= MIN_SAMPLE_PX else None


def calibrate(ndvi, pkg, to_pixel, size, valid=None):
    """Sample NDVI inside the package's OSM fairways and choose the gate.
    Everything sampled is recorded in the review's method."""
    image = Image.new('L', size, 0)
    draw = ImageDraw.Draw(image)
    for feature in pkg['features']:
        if feature['kind'] == 'fairway' and feature['geometryWgs84']['type'] == 'Polygon':
            draw.polygon([to_pixel(*p) for p in feature['geometryWgs84']['coordinates'][0]], fill=255)
    mask = np.array(image) > 0
    if valid is not None:
        mask &= valid
    turf = class_median(ndvi, mask)
    ndvi_min, rule = calibrated_ndvi_min(turf)
    return {'ndviMin': ndvi_min, 'rule': rule, 'ceiling': NDVI_MIN, 'floor': NDVI_MIN_FLOOR, 'turfGap': TURF_NDVI_GAP,
            'turfNdviMedian': turf, 'turfPixels': int(mask.sum()), 'minSamplePx': MIN_SAMPLE_PX}


def classify(ndvi, texture, masked, ndvi_min):
    """Canopy pixels: vegetated by NDVI, textured by NIR, off every golf surface."""
    return clean((ndvi > ndvi_min) & (texture > TEXTURE_MIN) & ~masked, masked)


def clean(canopy, masked):
    """Drop speckle, close crown gaps, keep off surfaces, keep groups."""
    canopy = canopy & ~masked
    canopy = ndimage.binary_opening(canopy, structure=np.ones((3, 3)))
    canopy = ndimage.binary_closing(canopy, structure=np.ones((5, 5)))
    canopy &= ~masked
    labels, count = ndimage.label(canopy)
    sizes = ndimage.sum(canopy, labels, range(1, count + 1))
    return np.isin(labels, np.nonzero(sizes >= MIN_GROUP_M2 * .625)[0] + 1)


def load_lidar(directory, export_path, width, height):
    """`(chm, source)` from a fetch-lidar-chm.py directory, or `(None,
    source)` naming why lidar is not used. A CHM for another export is an
    error, never silently NAIP."""
    if directory is None:
        return None, {'kind': 'naip', 'lidar': None, 'reason': 'no lidar acquisition for this layout'}
    manifest = json.loads((directory / 'manifest.json').read_text())
    if manifest.get('terrainExportSha256') != hashlib.sha256(export_path.read_bytes()).hexdigest():
        raise SystemExit('LIDAR_EXPORT_MISMATCH: the lidar CHM was cut for another terrain export')
    if manifest.get('status') != 'covered':
        return None, {'kind': 'naip', 'lidar': {'status': manifest.get('status')}, 'reason': 'LIDAR_NO_COVERAGE: no 3DEP point cloud verified over the export'}
    chm_path = directory / 'chm.tif'
    if hashlib.sha256(chm_path.read_bytes()).hexdigest() != manifest.get('chmSha256'):
        raise SystemExit('LIDAR_CHM_HASH_MISMATCH: chm.tif is not the raster its manifest records')
    dataset = gdal.Open(str(chm_path))
    chm = dataset.GetRasterBand(1).ReadAsArray().astype(float)
    if chm.shape != (height, width):
        raise SystemExit(f'LIDAR_GRID_MISMATCH: CHM {chm.shape} vs export {(height, width)}')
    project = manifest.get('project') or {}
    lidar = {'status': 'covered', 'project': project.get('name'), 'eptUrl': project.get('url'), 'eptJsonSha256': project.get('eptJsonSha256'),
             'acquisitionYearInferred': project.get('acquisitionYearInferred'), 'chmSha256': manifest['chmSha256'],
             'treeHeightMinM': CHM_TREE_MIN_M, 'treeHeightMaxM': CHM_TREE_MAX_M}
    return chm, {'kind': 'lidar_chm+naip', 'lidar': lidar, 'reason': None}


def merge_lidar(chm, naip_canopy, masked):
    """Lidar decides every cell it has a plausible return for; NAIP the
    rest. Returns `(canopy, lidarCellShare)`; `canopy` is None when lidar
    covers too little of the export to lead."""
    covered = (chm != CHM_NODATA) & (chm <= CHM_TREE_MAX_M)
    share = float(covered.mean())
    if share < LIDAR_COVERAGE_MIN:
        return None, share
    merged = np.where(covered, chm >= CHM_TREE_MIN_M, naip_canopy)
    return clean(merged, masked), share


def nir_texture(nir):
    """Same population std/reflect boundary as generic_filter, in linear time."""
    values = np.asarray(nir, dtype=np.float64)
    mean = ndimage.uniform_filter(values, size=7, mode='reflect')
    variance = ndimage.uniform_filter(values * values, size=7, mode='reflect') - mean * mean
    return np.sqrt(np.maximum(variance, 0))


def read(url, limit):
    with urllib.request.urlopen(url, timeout=300) as response:
        data = response.read(limit + 1)
    if len(data) > limit:
        raise ValueError('Response exceeds the fixed byte cap')
    return data


def acquire(directory, extent, size):
    """Retain one NAIP export aligned to the terrain export grid, or reuse it."""
    manifest_path = directory / 'manifest.json'
    if manifest_path.exists():
        manifest = json.loads(manifest_path.read_text())
        if hashlib.sha256((directory / 'naip.tif').read_bytes()).hexdigest() != manifest['rasterSha256']:
            raise ValueError('Retained NAIP export does not match its manifest hash')
        return manifest
    directory.mkdir(parents=True, exist_ok=True)
    crs = course_crs.export_epsg({'extent': extent})
    query = {'f': 'json', 'geometry': json.dumps({**extent, 'spatialReference': {'wkid': crs}}),
             'geometryType': 'esriGeometryEnvelope', 'inSR': crs, 'spatialRel': 'esriSpatialRelIntersects',
             'returnGeometry': 'false', 'outFields': 'OBJECTID,Name,Category', 'where': 'Category=1'}
    catalog = json.loads(read(NAIP + '/query?' + urllib.parse.urlencode(query), 2_000_000))
    tiles = sorted(row['attributes']['Name'] for row in catalog.get('features', []) if row['attributes']['Name'].startswith('m_'))
    if not tiles:
        raise NoFPACCoverage(f'no FPAC conus_naip tiles intersect bounds {extent}')
    params = {'f': 'image', 'bbox': f"{extent['xmin']},{extent['ymin']},{extent['xmax']},{extent['ymax']}",
              'bboxSR': crs, 'imageSR': crs, 'size': f'{size[0]},{size[1]}', 'format': 'tiff',
              'pixelType': 'U8', 'bandIds': '0,1,2,3', 'interpolation': 'RSP_NearestNeighbor'}
    raster = read(NAIP + '/exportImage?' + urllib.parse.urlencode(params), MAX_BYTES)
    (directory / 'naip.tif').write_bytes(raster)
    dataset = gdal.Open(str(directory / 'naip.tif'))
    if (dataset.RasterXSize, dataset.RasterYSize, dataset.RasterCount) != (size[0], size[1], 4):
        raise ValueError('NAIP export shape differs from the terrain export grid')
    dates = sorted({name.split('_')[-1] for name in tiles})
    manifest = {'schemaVersion': 1, 'provider': 'USDA NAIP via FPAC conus_naip ImageServer', 'service': NAIP,
                'request': params, 'catalogTiles': tiles, 'captureDates': dates,
                'nativeResolutionM': 0.6, 'exportPixelM': 1.0, 'bands': ['red', 'green', 'blue', 'nir'],
                'retrievedAt': datetime.now(timezone.utc).date().isoformat(),
                'license': 'US public domain (USDA NAIP); attribution retained',
                'rasterSha256': hashlib.sha256(raster).hexdigest(), 'rasterBytes': len(raster)}
    manifest_path.write_text(json.dumps(manifest, indent=2) + '\n')
    return manifest


def select_imagery(naip_directory, extent, size, epsg, imagery_index):
    """FPAC conus_naip leaf-on first; the facility's indexed NAIP Plus cache
    only when FPAC has no coverage at this site. A retained cache is reused
    from whichever provider produced it, never re-decided mid-course."""
    manifest_path = naip_directory / 'manifest.json'
    if manifest_path.exists():
        retained_provider = 'naip_plus' if json.loads(manifest_path.read_text()).get('provider', '').startswith('USGS NAIP Plus') else 'fpac_conus_naip'
        if retained_provider == 'naip_plus':
            import indexed_naip
            return indexed_naip.acquire(imagery_index, naip_directory, extent, size, epsg), retained_provider, 'retained cache'
        return acquire(naip_directory, extent, size), retained_provider, 'retained cache'
    try:
        return acquire(naip_directory, extent, size), 'fpac_conus_naip', 'FPAC conus_naip has coverage at this site'
    except NoFPACCoverage as exc:
        if not imagery_index:
            raise SystemExit(f'FPAC conus_naip has no coverage and no --imagery-index fallback was supplied: {exc}') from exc
        import indexed_naip
        return (indexed_naip.acquire(imagery_index, naip_directory, extent, size, epsg), 'naip_plus',
                f'FPAC conus_naip has no coverage at this site: {exc}')


def auto_review_record(canopy_share, group_count, final_region_shapes, playing_surfaces, course_area_ha):
    """The automatic canopy sign-off: NDVI share of the export, the final
    vector regions' overlap with fairway/green/tee (never the raw
    classification mask — the closing/opening/simplify passes above can push
    a region back onto a surface), and group density per hectare of the
    export. Each measurement is checked against an explicit, fixed bound;
    only an out-of-bounds measurement may block downstream (§ eval_canopy_derive)."""
    final_union = unary_union(final_region_shapes) if final_region_shapes else None
    overlap_share = 0.0
    if (final_union is not None and not final_union.is_empty and final_union.area
            and playing_surfaces is not None and not playing_surfaces.is_empty):
        overlap_share = round(final_union.intersection(playing_surfaces).area / final_union.area, 4)
    density_per_ha = round(group_count / course_area_ha, 4) if course_area_ha else None
    within_bounds = (CANOPY_SHARE_MIN <= canopy_share <= CANOPY_SHARE_MAX and overlap_share <= CANOPY_SURFACE_OVERLAP_MAX
                     and (density_per_ha is None or density_per_ha <= CANOPY_GROUP_DENSITY_MAX_PER_HA))
    return {
        'reviewer': 'auto-canopy-review-v1',
        'bounds': {'canopyShareOfExport': [CANOPY_SHARE_MIN, CANOPY_SHARE_MAX],
                   'surfaceOverlapShare': [0.0, CANOPY_SURFACE_OVERLAP_MAX],
                   'groupDensityPerHectare': [0.0, CANOPY_GROUP_DENSITY_MAX_PER_HA]},
        'measurements': {'canopyShareOfExport': canopy_share, 'surfaceOverlapShare': overlap_share,
                         'groupDensityPerHectare': density_per_ha, 'courseAreaHectares': round(course_area_ha, 2)},
        'withinBounds': within_bounds,
    }


def polygonize(mask, transform, epsg=course_crs.LEGACY_EPSG):
    """Vectorize a boolean mask through GDAL; return shapely polygons in raster CRS."""
    driver = gdal.GetDriverByName('MEM')
    dataset = driver.Create('', mask.shape[1], mask.shape[0], 1, gdal.GDT_Byte)
    dataset.SetGeoTransform(transform)
    srs = osr.SpatialReference(); srs.ImportFromEPSG(epsg); dataset.SetProjection(srs.ExportToWkt())
    band = dataset.GetRasterBand(1); band.WriteArray(mask.astype(np.uint8))
    memory = ogr.GetDriverByName('MEM').CreateDataSource('')
    layer = memory.CreateLayer('canopy', srs, ogr.wkbPolygon)
    layer.CreateField(ogr.FieldDefn('value', ogr.OFTInteger))
    gdal.Polygonize(band, band, layer, 0)
    shapes = []
    for feature in layer:
        if feature.GetField('value') != 1:
            continue
        shape = wkb.loads(bytes(feature.GetGeometryRef().ExportToWkb()))
        if not shape.is_valid:
            shape = shape.buffer(0)
        shapes.append(shape)
    return shapes


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('package', type=Path)
    parser.add_argument('terrain_source', type=Path)
    parser.add_argument('naip_directory', type=Path)
    parser.add_argument('output', type=Path)
    parser.add_argument('--imagery-index', type=Path)
    parser.add_argument('--lidar-chm', type=Path, help='fetch-lidar-chm.py output directory for this export')
    args = parser.parse_args()

    pkg = json.loads(args.package.read_text())
    export = json.loads((args.terrain_source / 'export.json').read_text())
    extent, width, height = export['extent'], export['width'], export['height']
    manifest, provider, provider_reason = select_imagery(args.naip_directory, extent, (width, height), course_crs.export_epsg(export), args.imagery_index)
    bands = gdal.Open(str(args.naip_directory / 'naip.tif')).ReadAsArray().astype(float)
    valid = np.any(bands != 0, axis=0)
    red, nir = bands[0], bands[3]
    ndvi = (nir - red) / (nir + red + 1e-6)
    texture = nir_texture(nir)

    # The terrain export's CRS, whichever zone it was cut in.
    crs = course_crs.export_epsg(export)
    project = pyproj.Transformer.from_crs(4326, crs, always_xy=True)
    unproject = pyproj.Transformer.from_crs(crs, 4326, always_xy=True)
    px_x = (extent['xmax'] - extent['xmin']) / width
    px_y = (extent['ymax'] - extent['ymin']) / height

    def to_pixel(lon, lat):
        x, y = project.transform(lon, lat)
        return (x - extent['xmin']) / px_x, (extent['ymax'] - y) / px_y

    shapes = {}
    kind_by_id = {}
    surface = Image.new('L', (width, height), 0)
    draw = ImageDraw.Draw(surface)
    for feature in pkg['features']:
        geometry = feature['geometryWgs84']
        kind_by_id[feature['id']] = feature['kind']
        if geometry['type'] == 'LineString':
            shapes[feature['id']] = LineString([project.transform(*p) for p in geometry['coordinates']])
            continue
        if feature['kind'] == 'woods':
            continue
        shapes[feature['id']] = Polygon([project.transform(*p) for p in geometry['coordinates'][0]])
        draw.polygon([to_pixel(*p) for p in geometry['coordinates'][0]], fill=255)
    # The playing surfaces a region must not (re-)cover, in the same local
    # metres frame as the final vector regions below.
    surface_shapes = [shapes[i] for i, kind in kind_by_id.items() if kind in ('fairway', 'green', 'tee') and i in shapes]
    playing_surfaces = unary_union(surface_shapes) if surface_shapes else None
    masked = ndimage.binary_dilation(np.array(surface) > 0, iterations=SURFACE_BUFFER_PX)
    # Exclude the entire texture neighborhood of unknown pixels as well as
    # the pixels themselves: a no-data edge cannot become a tree candidate.
    masked |= ndimage.binary_dilation(~valid, iterations=3)

    calibration = calibrate(ndvi, pkg, to_pixel, (width, height), valid)
    canopy = classify(ndvi, texture, masked, calibration['ndviMin'])
    chm, canopy_source = load_lidar(args.lidar_chm, args.terrain_source / 'export.json', width, height)
    if chm is not None:
        merged, lidar_share = merge_lidar(chm, canopy, masked)
        canopy_source['lidar']['cellShare'] = round(lidar_share, 4)
        if merged is None:
            canopy_source = {**canopy_source, 'kind': 'naip',
                             'reason': f'LIDAR_COVERAGE_PARTIAL: returns over {lidar_share:.0%} of the export, under {LIDAR_COVERAGE_MIN:.0%}'}
        else:
            canopy = merged

    transform = (extent['xmin'], px_x, 0, extent['ymax'], 0, -px_y)
    groups = polygonize(canopy, transform, crs)
    canopy_union = unary_union([g for g in groups if g.area >= MIN_GROUP_M2])

    regions = []
    final_region_shapes = []
    masses = 0  # canopy groups before clearing splits: the density bound measures speckle, not seams
    for hole in pkg['holes']:
        own = [shapes[i] for i in hole['featureIds'] if i in shapes]
        minx, miny, maxx, maxy = unary_union(own).bounds
        context = box(minx - CONTEXT_MARGIN_M, miny - CONTEXT_MARGIN_M, maxx + CONTEXT_MARGIN_M, maxy + CONTEXT_MARGIN_M)
        # Whole groups per hole: round the raster stair-steps, then simplify.
        # Tiling would leave straight seams through a forest; the renderer
        # spreads its crown budget across large groups by adaptive spacing.
        # Close crown gaps under 12m and drop strands under 4m wide so the group
        # reads as one forest mass rather than a classification speckle.
        clipped = canopy_union.intersection(context).buffer(6, join_style='round').buffer(-8, join_style='round').buffer(2, join_style='round')
        index = 0
        for part in sorted(getattr(clipped, 'geoms', [clipped]), key=lambda g: -g.area):
            if part.is_empty or part.geom_type != 'Polygon' or part.area < MIN_GROUP_M2:
                continue
            simple = part.simplify(2.0, preserve_topology=True)
            if len(simple.exterior.coords) > 400:
                simple = part.simplify(4.0, preserve_topology=True)
            if simple.is_empty or not simple.is_valid or simple.area < MIN_GROUP_M2:
                continue
            masses += 1
            # Only an exterior ring is written, so a region is split until it
            # has no clearings; the auto-review below measures these exact
            # written shapes, never the in-memory polygon with its holes.
            for piece in hole_free_parts(simple):
                ring = [list(unproject.transform(x, y)) for x, y in piece.exterior.coords]
                index += 1
                regions.append({'id': f"{hole['key']}-canopy-{index:03}", 'holeKey': hole['key'],
                                'areaM2': round(piece.area, 1), 'coordinatesWgs84': ring})
                final_region_shapes.append(Polygon(piece.exterior))

    # Automatic sign-off (replaces the human visual review): NDVI share,
    # overlap with the final regions against fairway/green/tee, and group
    # density over the export area, each against an explicit bound.
    canopy_share = round(float(canopy.mean()), 4)
    course_area_ha = (extent['xmax'] - extent['xmin']) * (extent['ymax'] - extent['ymin']) / 10_000
    auto_review = auto_review_record(canopy_share, masses, final_region_shapes, playing_surfaces, course_area_ha)
    within_bounds = auto_review['withinBounds']
    review = {
        'schemaVersion': 1, 'kind': 'golfhelm-canopy-review-v1', 'siteId': pkg['siteId'], 'packageHash': pkg['contentHash'],
        'source': manifest['provider'], 'sourceUrl': manifest['service'], 'catalogTiles': manifest['catalogTiles'],
        'capturedAt': manifest['captureDates'], 'nativeResolutionM': manifest['nativeResolutionM'],
        'rasterSha256': manifest['rasterSha256'], 'retrievedAt': manifest['retrievedAt'], 'license': manifest['license'],
        'sourceIdentity': manifest.get('sourceIdentity'), 'truthClass': 'derived',
        'sourceSelection': {'provider': provider, 'reason': provider_reason},
        'reviewStatus': 'auto_reviewed' if within_bounds else 'out_of_bounds', 'canMeasurePhysicalGeometry': False,
        'autoReview': auto_review,
        'canopySource': canopy_source,
        'method': {'ndviMin': calibration['ndviMin'], 'ndviCalibration': calibration, 'nirTextureStdMin': TEXTURE_MIN, 'textureWindowPx': 7, 'surfaceBufferPx': SURFACE_BUFFER_PX,
                   'morphology': 'open 3x3, close 5x5', 'vectorClosingM': 6, 'vectorOpeningM': 2, 'minGroupM2': MIN_GROUP_M2, 'simplifyM': 2.0,
                   'contextMarginM': CONTEXT_MARGIN_M},
        'reviewedAt': datetime.now(timezone.utc).date().isoformat(),
        'reviewer': auto_review['reviewer'],
        'meaning': ('Approximate canopy groups: lidar canopy height >= 3 m wherever the recorded 3DEP project has returns, leaf-on NAIP NIR texture and NDVI elsewhere, '
                    if canopy_source['kind'] != 'naip' else 'Approximate canopy groups classified from leaf-on NAIP by NIR texture and NDVI, ')
                   + 'masked away from every OSM golf surface. '
                   'Group interiors bound crown artwork only; crown glyphs are illustrative, not surveyed trees. '
                   'No currentness, height or obstruction claim.',
        'stats': {'canopyShareOfExport': canopy_share, 'validImageryShare': float(valid.mean()), 'groups': len(regions)},
        'regions': regions,
    }
    args.output.write_text(json.dumps(review, indent=2, ensure_ascii=False) + '\n')
    print(json.dumps({'groups': len(regions), 'canopyShare': canopy_share, 'provider': provider, 'withinBounds': within_bounds,
                      'holes': len({r['holeKey'] for r in regions}), 'ndviMin': calibration['ndviMin'], 'ndviRule': calibration['rule'],
                      'canopySource': canopy_source['kind']}))


if __name__ == '__main__':
    main()
