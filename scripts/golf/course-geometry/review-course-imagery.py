"""Per-hole imagery review dossier: OSM outlines over the retained NAIP export.

Plan sections 6.3, 6.4 and 13.7 ask for a source-overlay image per hole, a
contact sheet, and bunker/hazard validation at a scale where boundaries are
discernible. This script produces those review products from evidence already
retained by derive-canopy-naip.py: it draws every package feature over the
NAIP export, measures how much of each bunker polygon reads as visible sand
(bright, low-NDVI pixels) and how much sand sits just outside it, and records
the numbers per hole. The numbers support a human review; they never pass a
gate, move a polygon or classify a hazard.

Usage:
  python3 scripts/golf/course-geometry/review-course-imagery.py \
    src/test/fixtures/course-geometry/peek-n-peak-upper.json \
    output/course-geometry/peek-n-peak-upper-naip \
    output/course-geometry/peek-n-peak-upper-imagery-review \
    src/test/fixtures/course-geometry/peek-n-peak-upper-imagery-review.json
"""
import argparse
import hashlib
import importlib.util
import json
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pyproj
from osgeo import gdal
from PIL import Image, ImageDraw
from scipy import ndimage
from shapely.geometry import LineString, Polygon
from shapely.ops import unary_union

from factory.ship import TRACE_SOURCE_PREFIXES


def _sibling(name, filename):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(filename))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


course_crs = _sibling('course_crs', 'course_crs.py')

gdal.UseExceptions()
MARGIN_PX = 50
SCALE = 3
SAND_BRIGHTNESS_MIN = 140
SAND_NDVI_MAX = 0.12
SAND_WARMTH_MIN = 12  # red minus blue, 8-bit; calibrated on the OSM bunker set (median 24) against pavement (median 8)
OUTSIDE_RING_PX = 6
LOW_SAND_SHARE = 0.35  # below this, shadow, grass-faced or mis-traced: review
COLORS = {'fairway': (150, 255, 150), 'green': (255, 255, 130), 'bunker': (255, 170, 70), 'tee': (140, 210, 255),
          'water': (100, 170, 255), 'route': (255, 255, 255), 'woods': (205, 140, 255)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('package', type=Path)
    parser.add_argument('naip_directory', type=Path)
    parser.add_argument('output_directory', type=Path)
    parser.add_argument('summary', type=Path)
    args = parser.parse_args()
    pkg = json.loads(args.package.read_text())
    manifest = json.loads((args.naip_directory / 'manifest.json').read_text())
    raster = (args.naip_directory / 'naip.tif').read_bytes()
    if hashlib.sha256(raster).hexdigest() != manifest['rasterSha256']:
        raise ValueError('Retained NAIP export does not match its manifest hash')
    dataset = gdal.Open(str(args.naip_directory / 'naip.tif'))
    gt = dataset.GetGeoTransform()
    bands = dataset.ReadAsArray().astype(float)
    rgb = np.transpose(bands[:3], (1, 2, 0)).astype(np.uint8)
    red, nir = bands[0], bands[3]
    ndvi = (nir - red) / (nir + red + 1e-6)
    brightness = bands[:3].mean(axis=0)
    # Warmth separates sand from grey pavement and roofs, which are equally bright and low-NDVI.
    sand = (brightness > SAND_BRIGHTNESS_MIN) & (ndvi < SAND_NDVI_MAX) & (bands[0] - bands[2] > SAND_WARMTH_MIN)
    # The export's own CRS: the request that cut it names the zone.
    crs = int((manifest.get('request') or {}).get('imageSR') or course_crs.LEGACY_EPSG)
    project = pyproj.Transformer.from_crs(4326, crs, always_xy=True)

    def to_pixel(lon, lat):
        x, y = project.transform(lon, lat)
        return (x - gt[0]) / gt[1], (y - gt[3]) / gt[5]

    args.output_directory.mkdir(parents=True, exist_ok=True)
    features = {f['id']: f for f in pkg['features']}
    rows, cells = [], []
    for hole in pkg['holes']:
        own = [features[i] for i in hole['featureIds'] if i in features]
        rings = []
        for f in own:
            g = f['geometryWgs84']
            for ring in ([g['coordinates']] if g['type'] == 'LineString' else g['coordinates']):
                rings.append((f, [to_pixel(*p) for p in ring]))
        played = [p for f, ring in rings if f['kind'] != 'woods' for p in ring]
        xs, ys = zip(*played)
        x0, y0 = max(0, int(min(xs) - MARGIN_PX)), max(0, int(min(ys) - MARGIN_PX))
        x1, y1 = min(rgb.shape[1], int(max(xs) + MARGIN_PX)), min(rgb.shape[0], int(max(ys) + MARGIN_PX))
        image = Image.fromarray(rgb[y0:y1, x0:x1]).resize(((x1 - x0) * SCALE, (y1 - y0) * SCALE), Image.LANCZOS)
        draw = ImageDraw.Draw(image)
        for f, ring in rings:
            draw.line([((x - x0) * SCALE, (y - y0) * SCALE) for x, y in ring] + ([((ring[0][0] - x0) * SCALE, (ring[0][1] - y0) * SCALE)] if f['kind'] != 'route' else []),
                      fill=COLORS[f['kind']], width=1 if f['kind'] == 'woods' else 2)
        bunkers = []
        for f, ring in rings:
            if f['kind'] != 'bunker':
                continue
            mask = Image.new('L', (rgb.shape[1], rgb.shape[0]), 0)
            ImageDraw.Draw(mask).polygon(ring, fill=1)
            inside = np.array(mask, dtype=bool)
            outside = ndimage.binary_dilation(inside, iterations=OUTSIDE_RING_PX) & ~inside
            area = int(inside.sum())
            sand_inside = float(sand[inside].mean()) if area else 0.0
            sand_outside = float(sand[outside].mean()) if outside.any() else 0.0
            bunkers.append({'featureId': f['id'], 'areaM2': area, 'sandShareInside': round(sand_inside, 3),
                            'sandShareOutsideRing': round(sand_outside, 3)})
        # Sand that no bunker of this hole claims, inside the hole's own extent.
        own_mask = Image.new('L', (rgb.shape[1], rgb.shape[0]), 0)
        for f, ring in rings:
            if f['kind'] == 'bunker':
                ImageDraw.Draw(own_mask).polygon(ring, fill=1)
        claimed = ndimage.binary_dilation(np.array(own_mask, dtype=bool), iterations=OUTSIDE_RING_PX)
        window = np.zeros_like(sand); window[y0:y1, x0:x1] = True
        unclaimed = sand & window & ~claimed
        unclaimed = ndimage.binary_opening(unclaimed, structure=np.ones((3, 3)))
        labels, count = ndimage.label(unclaimed)
        sizes = ndimage.sum(unclaimed, labels, range(1, count + 1)) if count else []
        blobs = sorted((int(s) for s in sizes if s >= 25), reverse=True)
        for index in np.nonzero(np.array(sizes) >= 25)[0] if count else []:
            ys_, xs_ = np.nonzero(labels == index + 1)
            cx, cy = (xs_.mean() - x0) * SCALE, (ys_.mean() - y0) * SCALE
            draw.ellipse([cx - 9, cy - 9, cx + 9, cy + 9], outline=(255, 60, 60), width=2)
        # How much of the played route crosses a mapped tee, fairway or green:
        # a low share means OSM leaves most of the corridor unmapped (plan 6.4
        # route/scorecard comparison), not that the ground is rough.
        route_line = next((LineString(ring) for f, ring in rings if f['kind'] == 'route'), None)
        mapped = unary_union([Polygon(ring) for f, ring in rings if f['kind'] in ('tee', 'fairway', 'green') and len(ring) >= 4])
        route_cover = round(route_line.intersection(mapped).length / route_line.length, 3) if route_line is not None and route_line.length else None
        label = f"{hole['key']} · hole {hole['ordinal']} · par {hole['par']} · {pkg['contentHash'][:8]}"
        draw.rectangle([0, 0, 8 + 7 * len(label), 18], fill=(0, 0, 0))
        draw.text((4, 3), label, fill=(255, 255, 255))
        path = args.output_directory / f"{hole['key']}-naip-overlay.png"
        image.save(path)
        cells.append(image)
        rows.append({'holeKey': hole['key'], 'ordinal': hole['ordinal'], 'completeness': hole['completeness'],
                     'features': {kind: sum(1 for f in own if f['kind'] == kind) for kind in COLORS if any(f['kind'] == kind for f in own)},
                     'bunkers': bunkers, 'routeShareInsideMappedSurfaces': route_cover,
                     'traced': [f['id'] for f in own if any(s.startswith(TRACE_SOURCE_PREFIXES) for s in f['sourceIds'])],
                     'unclaimedSandBlobsM2': blobs[:12], 'overlay': path.name})
        print(json.dumps({'hole': hole['key'], 'bunkers': len(bunkers), 'lowSand': [b['featureId'] for b in bunkers if b['sandShareInside'] < LOW_SAND_SHARE],
                          'unclaimedSand': blobs[:5]}), flush=True)
    # Contact sheet: six per row at a common cell size.
    cell_w, cell_h = 420, 520
    columns = 6
    sheet = Image.new('RGB', (columns * cell_w, ((len(cells) + columns - 1) // columns) * cell_h), (20, 20, 20))
    for index, image in enumerate(cells):
        thumb = image.copy(); thumb.thumbnail((cell_w - 8, cell_h - 8))
        sheet.paste(thumb, ((index % columns) * cell_w + 4, (index // columns) * cell_h + 4))
    sheet.save(args.output_directory / 'contact-sheet.png')
    summary = {
        'schemaVersion': 1, 'kind': 'golfhelm-imagery-review-v1', 'siteId': pkg['siteId'], 'packageHash': pkg['contentHash'],
        'imagery': {'provider': manifest['provider'], 'catalogTiles': manifest['catalogTiles'], 'capturedAt': manifest['captureDates'],
                    'rasterSha256': manifest['rasterSha256'], 'nativeResolutionM': manifest['nativeResolutionM']},
        'method': {'sandBrightnessMin': SAND_BRIGHTNESS_MIN, 'sandNdviMax': SAND_NDVI_MAX, 'sandWarmthMin': SAND_WARMTH_MIN, 'outsideRingPx': OUTSIDE_RING_PX, 'lowSandShare': LOW_SAND_SHARE,
                   'overlayScale': SCALE, 'marginPx': MARGIN_PX},
        'meaning': 'Sand shares compare each OSM bunker polygon with bright low-NDVI pixels in leaf-on NAIP. '
                   'A low inside share or a large unclaimed blob flags a polygon for human review; '
                   'shadow, canopy, dry turf and roofs also read as bright or dark. Nothing here moves a polygon, '
                   'passes a truth gate, or classifies a rules penalty area.',
        'generatedAt': datetime.now(timezone.utc).date().isoformat(), 'holes': rows,
    }
    args.summary.write_text(json.dumps(summary, indent=2) + '\n')
    flagged = [(r['holeKey'], b['featureId']) for r in rows for b in r['bunkers'] if b['sandShareInside'] < LOW_SAND_SHARE]
    print(json.dumps({'holes': len(rows), 'bunkers': sum(len(r['bunkers']) for r in rows), 'lowSandBunkers': len(flagged)}))


if __name__ == '__main__':
    main()
