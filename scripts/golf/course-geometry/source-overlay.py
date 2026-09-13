"""Local NAIP comparison images; no tracing, warping, publication, or network.

python3 scripts/golf/course-geometry/source-overlay.py /path/to/cacapon-naip.jpg
Default: documented 2048px 2022 geographic export. Pass --canopy for the
2024 hole-7 export with dimensions/bbox recorded in cacapon-canopy-review.json.
Requires Pillow. Coordinates are overlaid in the export CRS, not used for metre calculations.
"""
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / 'output/course-geometry'
PKG = json.loads((ROOT / 'src/test/fixtures/course-geometry/cacapon.json').read_text())
BASE = Image.open(sys.argv[1]).convert('RGB')
CANOPY = '--canopy' in sys.argv
META = json.loads((ROOT / 'src/test/fixtures/course-geometry/cacapon-canopy-review.json').read_text()) if CANOPY else None
assert BASE.size == tuple(META['exportPixels'] if META else [2048, 2048]), 'Unexpected source export dimensions'
BBOX = META['bboxWgs84'] if META else (-78.308, 39.500, -78.283, 39.525)
COLORS = {'bunker': '#ffff00', 'green': '#00ffff', 'fairway': '#80ff80', 'route': '#ffffff', 'tee': '#ff80ff', 'water': '#8080ff', 'woods': '#ffa07a'}


def pixel(point):
    return ((point[0] - BBOX[0]) / (BBOX[2] - BBOX[0]) * BASE.width,
            (BBOX[3] - point[1]) / (BBOX[3] - BBOX[1]) * BASE.height)


sheets = []
for hole in PKG['holes']:
    if CANOPY and hole['ordinal'] != 7:
        continue
    features = [f for f in PKG['features'] if f['id'] in hole['featureIds']]
    overlay = BASE.copy()
    draw = ImageDraw.Draw(overlay)
    points = []
    for feature in features:
        geometry = feature['geometryWgs84']
        rings = [geometry['coordinates']] if geometry['type'] == 'LineString' else geometry['coordinates']
        for ring in rings:
            coords = [pixel(p) for p in ring]
            points.extend(coords)
            draw.line(coords, fill=COLORS[feature['kind']], width=1)
    bounds = (max(0, int(min(p[0] for p in points)) - 20), max(0, int(min(p[1] for p in points)) - 20),
              min(BASE.width, int(max(p[0] for p in points)) + 20), min(BASE.height, int(max(p[1] for p in points)) + 20))
    tile = Image.new('RGB', (640, 440), '#f6f3ed')
    for index, source in enumerate([BASE, overlay]):
        crop = source.crop(bounds)
        crop.thumbnail((310, 395))
        tile.paste(crop, (index * 320 + (320 - crop.width) // 2, 30))
    ImageDraw.Draw(tile).text((10, 8), f"Hole {hole['ordinal']} | NAIP {'2024' if CANOPY else '2022'} / vector overlay | north up", fill='#18251f')
    tile.save(OUT / f"{hole['key']}-{'canopy' if CANOPY else 'source'}-overlay.png")
    sheets.append(tile)
for start in ([] if CANOPY else range(0, 18, 6)):
    sheet = Image.new('RGB', (1280, 1320), '#f6f3ed')
    for offset, tile in enumerate(sheets[start:start + 6]):
        sheet.paste(tile, ((offset % 2) * 640, (offset // 2) * 440))
    sheet.save(OUT / f'source-sheet-{start + 1:02}.jpg', quality=92)
