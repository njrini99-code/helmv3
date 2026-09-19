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
from shapely.ops import unary_union

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


def calibrate(ndvi, pkg, to_pixel, size):
    """Sample NDVI inside the package's OSM fairways and choose the gate.
    Everything sampled is recorded in the review's method."""
    image = Image.new('L', size, 0)
    draw = ImageDraw.Draw(image)
    for feature in pkg['features']:
        if feature['kind'] == 'fairway' and feature['geometryWgs84']['type'] == 'Polygon':
            draw.polygon([to_pixel(*p) for p in feature['geometryWgs84']['coordinates'][0]], fill=255)
    mask = np.array(image) > 0
    turf = class_median(ndvi, mask)
    ndvi_min, rule = calibrated_ndvi_min(turf)
    return {'ndviMin': ndvi_min, 'rule': rule, 'ceiling': NDVI_MIN, 'floor': NDVI_MIN_FLOOR, 'turfGap': TURF_NDVI_GAP,
            'turfNdviMedian': turf, 'turfPixels': int(mask.sum()), 'minSamplePx': MIN_SAMPLE_PX}


def classify(ndvi, texture, masked, ndvi_min):
    """Canopy pixels: vegetated by NDVI, textured by NIR, off every golf surface."""
    canopy = (ndvi > ndvi_min) & (texture > TEXTURE_MIN) & ~masked
    canopy = ndimage.binary_opening(canopy, structure=np.ones((3, 3)))
    canopy = ndimage.binary_closing(canopy, structure=np.ones((5, 5)))
    labels, count = ndimage.label(canopy)
    sizes = ndimage.sum(canopy, labels, range(1, count + 1))
    return np.isin(labels, np.nonzero(sizes >= MIN_GROUP_M2 * .625)[0] + 1)


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
    query = {'f': 'json', 'geometry': json.dumps({**extent, 'spatialReference': {'wkid': 32617}}),
             'geometryType': 'esriGeometryEnvelope', 'inSR': 32617, 'spatialRel': 'esriSpatialRelIntersects',
             'returnGeometry': 'false', 'outFields': 'OBJECTID,Name,Category', 'where': 'Category=1'}
    catalog = json.loads(read(NAIP + '/query?' + urllib.parse.urlencode(query), 2_000_000))
    tiles = sorted(row['attributes']['Name'] for row in catalog.get('features', []) if row['attributes']['Name'].startswith('m_'))
    params = {'f': 'image', 'bbox': f"{extent['xmin']},{extent['ymin']},{extent['xmax']},{extent['ymax']}",
              'bboxSR': 32617, 'imageSR': 32617, 'size': f'{size[0]},{size[1]}', 'format': 'tiff',
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


def polygonize(mask, transform):
    """Vectorize a boolean mask through GDAL; return shapely polygons in raster CRS."""
    driver = gdal.GetDriverByName('MEM')
    dataset = driver.Create('', mask.shape[1], mask.shape[0], 1, gdal.GDT_Byte)
    dataset.SetGeoTransform(transform)
    srs = osr.SpatialReference(); srs.ImportFromEPSG(32617); dataset.SetProjection(srs.ExportToWkt())
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
    args = parser.parse_args()

    pkg = json.loads(args.package.read_text())
    export = json.loads((args.terrain_source / 'export.json').read_text())
    extent, width, height = export['extent'], export['width'], export['height']
    manifest = acquire(args.naip_directory, extent, (width, height))
    bands = gdal.Open(str(args.naip_directory / 'naip.tif')).ReadAsArray().astype(float)
    red, nir = bands[0], bands[3]
    ndvi = (nir - red) / (nir + red + 1e-6)
    texture = ndimage.generic_filter(nir, np.std, size=7)

    project = pyproj.Transformer.from_crs(4326, 32617, always_xy=True)
    unproject = pyproj.Transformer.from_crs(32617, 4326, always_xy=True)
    px_x = (extent['xmax'] - extent['xmin']) / width
    px_y = (extent['ymax'] - extent['ymin']) / height

    def to_pixel(lon, lat):
        x, y = project.transform(lon, lat)
        return (x - extent['xmin']) / px_x, (extent['ymax'] - y) / px_y

    shapes = {}
    surface = Image.new('L', (width, height), 0)
    draw = ImageDraw.Draw(surface)
    for feature in pkg['features']:
        geometry = feature['geometryWgs84']
        if geometry['type'] == 'LineString':
            shapes[feature['id']] = LineString([project.transform(*p) for p in geometry['coordinates']])
            continue
        if feature['kind'] == 'woods':
            continue
        shapes[feature['id']] = Polygon([project.transform(*p) for p in geometry['coordinates'][0]])
        draw.polygon([to_pixel(*p) for p in geometry['coordinates'][0]], fill=255)
    masked = ndimage.binary_dilation(np.array(surface) > 0, iterations=SURFACE_BUFFER_PX)

    calibration = calibrate(ndvi, pkg, to_pixel, (width, height))
    canopy = classify(ndvi, texture, masked, calibration['ndviMin'])

    transform = (extent['xmin'], px_x, 0, extent['ymax'], 0, -px_y)
    groups = polygonize(canopy, transform)
    canopy_union = unary_union([g for g in groups if g.area >= MIN_GROUP_M2])

    regions = []
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
            ring = [list(unproject.transform(x, y)) for x, y in simple.exterior.coords]
            index += 1
            regions.append({'id': f"{hole['key']}-canopy-{index:03}", 'holeKey': hole['key'],
                            'areaM2': round(simple.area, 1), 'coordinatesWgs84': ring})
    review = {
        'schemaVersion': 1, 'kind': 'golfhelm-canopy-review-v1', 'siteId': pkg['siteId'], 'packageHash': pkg['contentHash'],
        'source': manifest['provider'], 'sourceUrl': manifest['service'], 'catalogTiles': manifest['catalogTiles'],
        'capturedAt': manifest['captureDates'], 'nativeResolutionM': manifest['nativeResolutionM'],
        'rasterSha256': manifest['rasterSha256'], 'retrievedAt': manifest['retrievedAt'], 'license': manifest['license'],
        'method': {'ndviMin': calibration['ndviMin'], 'ndviCalibration': calibration, 'nirTextureStdMin': TEXTURE_MIN, 'textureWindowPx': 7, 'surfaceBufferPx': SURFACE_BUFFER_PX,
                   'morphology': 'open 3x3, close 5x5', 'vectorClosingM': 6, 'vectorOpeningM': 2, 'minGroupM2': MIN_GROUP_M2, 'simplifyM': 2.0,
                   'contextMarginM': CONTEXT_MARGIN_M},
        'reviewedAt': datetime.now(timezone.utc).date().isoformat(),
        'reviewer': 'Claude visual comparison of the classification against the same NAIP export; independent course review pending',
        'meaning': 'Approximate canopy groups classified from leaf-on NAIP by NIR texture and NDVI, masked away from every OSM golf surface. '
                   'Group interiors bound crown artwork only; crown glyphs are illustrative, not surveyed trees. '
                   'No currentness, height or obstruction claim.',
        'stats': {'canopyShareOfExport': round(float(canopy.mean()), 4), 'groups': len(regions)},
        'regions': regions,
    }
    args.output.write_text(json.dumps(review, indent=2, ensure_ascii=False) + '\n')
    print(json.dumps({'groups': len(regions), 'canopyShare': review['stats']['canopyShareOfExport'],
                      'holes': len({r['holeKey'] for r in regions}), 'ndviMin': calibration['ndviMin'], 'ndviRule': calibration['rule']}))


if __name__ == '__main__':
    main()
