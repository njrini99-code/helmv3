"""Render a local orthophoto plus canonical-source overlay for human review.

This produces a review artifact only. It never converts a visual match into a
reviewed feature and never edits the canonical package.
"""
import argparse
import json
from pathlib import Path

import pyproj
from PIL import Image, ImageDraw, ImageFont

COLORS = {'green': '#8ee384', 'bunker': '#f8d276', 'fairway': '#77c886', 'tee': '#ff9ccf', 'water': '#6bb7ff', 'woods': '#c8a177'}


def rings(geometry):
    if geometry['type'] == 'LineString':
        return [geometry['coordinates']]
    if geometry['type'] == 'Polygon':
        return geometry['coordinates']
    return [ring for polygon in geometry['coordinates'] for ring in polygon]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('package', type=Path)
    parser.add_argument('study_key')
    parser.add_argument('imagery_directory', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    package = json.loads(args.package.read_text())
    study = next((item for item in package['holes'] if item['key'] == args.study_key), None)
    if study is None:
        raise ValueError('Unknown study key')
    imagery = json.loads((args.imagery_directory / 'source-manifest.json').read_text())
    exported = json.loads((args.imagery_directory / ('analysis-export.json' if imagery['selectedKind'] == 'analysis_rgb_nir' else 'visual-export.json')).read_text())
    image = Image.open(args.imagery_directory / 'ortho.png').convert('RGB')
    overlay = image.copy()
    draw = ImageDraw.Draw(overlay)
    to_source = pyproj.Transformer.from_crs(4326, imagery['sourceCrs'], always_xy=True)
    extent = exported['extent']
    def pixel(point):
        x, y = to_source.transform(point[0], point[1])
        return ((x - extent['xmin']) / (extent['xmax'] - extent['xmin']) * image.width,
                (extent['ymax'] - y) / (extent['ymax'] - extent['ymin']) * image.height)
    features = {item['id']: item for item in package['features']}
    for ident in study['featureIds']:
        feature = features[ident]
        color = COLORS.get(feature['kind'], '#ffffff')
        for ring in rings(feature['geometryWgs84']):
            coords = [pixel(point) for point in ring]
            draw.line(coords, fill=color, width=max(2, image.width // 420), joint='curve')
    scale = min(1000 / image.width, 1000 / image.height, 1)
    preview = overlay.resize((round(image.width * scale), round(image.height * scale)), Image.Resampling.LANCZOS)
    band = 56
    result = Image.new('RGB', (preview.width, preview.height + band), '#102c21')
    result.paste(preview, (0, band))
    text = f"{package['name']}  |  0.1524m NC OneMap {imagery['selectedKind']}  |  OSM candidate overlay — review required"
    ImageDraw.Draw(result).text((16, 18), text, fill='#f6f2e8')
    args.output.parent.mkdir(parents=True, exist_ok=True)
    result.save(args.output)
    print(json.dumps({'output': str(args.output), 'pixels': list(result.size), 'reviewStatus': package['status']}))


if __name__ == '__main__':
    main()
