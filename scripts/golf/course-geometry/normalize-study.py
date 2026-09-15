"""Compile a bounded source study into canonical local metres for Blender and Three.

This does not promote a source candidate to a playable GolfHelm hole.  Every
input WGS84 coordinate survives in ``sourceGeometryWgs84`` and every derived
coordinate uses ``[eastM, elevationM, northM]`` with one world unit per metre.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path

import numpy as np
import pyproj
from PIL import Image

ROOT = Path(__file__).resolve().parents[3]
US_SURVEY_FOOT_TO_METERS = 0.3048006096012192


def write_json(path, value):
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False, allow_nan=False) + '\n')


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def points(value):
    if isinstance(value[0], (float, int)):
        yield value
    else:
        for child in value:
            yield from points(child)


class Terrain:
    def __init__(self, directory):
        self.manifest = json.loads((directory / 'source-manifest.json').read_text())
        self.export = json.loads((directory / 'export.json').read_text())
        with Image.open(directory / 'elevation.tiff') as image:
            self.raster = np.asarray(image, dtype=float)
            nodata = image.tag_v2.get(42113)
        if nodata is not None:
            self.raster[self.raster == float(str(nodata).strip('\x00'))] = np.nan
        if self.raster.shape != (self.export['height'], self.export['width']):
            raise ValueError('LiDAR TIFF dimensions do not match immutable export metadata')
        factor = float(self.manifest.get('verticalUnitToMeters', float('nan')))
        if not math.isfinite(factor) or factor <= 0:
            raise ValueError('LiDAR source omits an explicit vertical metres conversion')
        self.raster *= factor
        self.to_source = pyproj.Transformer.from_crs(4326, self.manifest['horizontalExportCrs'], always_xy=True)

    def sample(self, lon, lat):
        x, y = self.to_source.transform(lon, lat)
        extent = self.export['extent']
        px = (x - extent['xmin']) / (extent['xmax'] - extent['xmin']) * self.raster.shape[1] - .5
        py = (extent['ymax'] - y) / (extent['ymax'] - extent['ymin']) * self.raster.shape[0] - .5
        ix, iy = math.floor(px), math.floor(py)
        if ix < 0 or iy < 0 or ix >= self.raster.shape[1] - 1 or iy >= self.raster.shape[0] - 1:
            return None
        values = self.raster[iy:iy + 2, ix:ix + 2]
        if not np.isfinite(values).all():
            return None
        fx, fy = px - ix, py - iy
        return float(values[0, 0] * (1 - fx) * (1 - fy) + values[0, 1] * fx * (1 - fy) + values[1, 0] * (1 - fx) * fy + values[1, 1] * fx * fy)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('package', type=Path)
    parser.add_argument('study_key')
    parser.add_argument('lidar_directory', type=Path)
    parser.add_argument('imagery_directory', type=Path)
    parser.add_argument('output', type=Path)
    parser.add_argument('--terrain-step-m', type=float, default=1)
    parser.add_argument('--padding-m', type=float, default=80)
    args = parser.parse_args()
    if not 0 < args.terrain_step_m <= 10 or not 0 <= args.padding_m <= 500:
        raise ValueError('Terrain step must be 0–10m and padding 0–500m')
    package = json.loads(args.package.read_text())
    study = next((item for item in package['holes'] if item['key'] == args.study_key), None)
    if study is None:
        raise ValueError('Unknown physical study key')
    if study['completeness'] != 'partial' or package['status'] != 'source_candidate':
        raise ValueError('This compiler only handles unpromoted source studies')
    lidar = Terrain(args.lidar_directory)
    imagery = json.loads((args.imagery_directory / 'source-manifest.json').read_text())
    origin = package['originWgs84']
    local = pyproj.Transformer.from_crs(4326, f'+proj=aeqd +lat_0={origin[1]} +lon_0={origin[0]} +datum=WGS84 +units=m +no_defs', always_xy=True)
    inverse = pyproj.Transformer.from_crs(f'+proj=aeqd +lat_0={origin[1]} +lon_0={origin[0]} +datum=WGS84 +units=m +no_defs', 4326, always_xy=True)
    features = {item['id']: item for item in package['features']}
    selected = [features[item] for item in study['featureIds']]
    def local_point(point):
        east, north = local.transform(point[0], point[1])
        elevation = lidar.sample(point[0], point[1])
        if elevation is None:
            raise ValueError('Source feature lies outside LiDAR coverage; no fabricated elevation')
        return [round(east, 5), round(elevation, 5), round(north, 5)]
    compiled_features = []
    for feature in selected:
        source = feature['geometryWgs84']
        if source['type'] == 'Polygon':
            local_geometry = [[local_point(point) for point in ring] for ring in source['coordinates']]
        elif source['type'] == 'MultiPolygon':
            local_geometry = [[[local_point(point) for point in ring] for ring in polygon] for polygon in source['coordinates']]
        else:
            local_geometry = [local_point(point) for point in source['coordinates']]
        compiled_features.append({
            'id': feature['id'], 'kind': feature['kind'], 'geometryMeters': {'type': source['type'], 'coordinates': local_geometry},
            'sourceGeometryWgs84': source, 'provenance': {'sourceIds': feature['sourceIds'], 'humanReviewed': feature['reviewed'],
                'boundaryAccuracyMeters': feature['accuracyMeters'], 'extraction': 'OSM source candidate; not imagery-derived'},
        })
    # Use geographic projected X/Z bounds, not elevations, to form a compact grid.
    footprint = []
    for feature in selected:
        for point in points(feature['geometryWgs84']['coordinates']):
            footprint.append(local.transform(point[0], point[1]))
    # Preserve the LiDAR raster's own complete grid.  A locally projected
    # source grid is slightly rotated relative to an east/north frame, so a
    # fabricated axis-aligned grid would introduce coverage gaps at corners.
    # Decimating existing samples keeps every output height source-backed.
    extent = lidar.export['extent']
    source_to_wgs = pyproj.Transformer.from_crs(lidar.manifest['horizontalExportCrs'], 4326, always_xy=True)
    stride = max(1, round(args.terrain_step_m / float(lidar.manifest['nativeResolutionM'])))
    row_indices = list(range(0, lidar.raster.shape[0], stride))
    col_indices = list(range(0, lidar.raster.shape[1], stride))
    if row_indices[-1] != lidar.raster.shape[0] - 1:
        row_indices.append(lidar.raster.shape[0] - 1)
    if col_indices[-1] != lidar.raster.shape[1] - 1:
        col_indices.append(lidar.raster.shape[1] - 1)
    width, height = len(col_indices), len(row_indices)
    if width * height > 150_000:
        raise ValueError('Terrain grid would exceed source-study budget')
    positions = []
    dx = (extent['xmax'] - extent['xmin']) / lidar.raster.shape[1]
    dy = (extent['ymax'] - extent['ymin']) / lidar.raster.shape[0]
    for row in row_indices:
        for col in col_indices:
            raw_height = lidar.raster[row, col]
            if not math.isfinite(raw_height):
                raise ValueError('LiDAR source contains nodata in requested study grid; no fill is permitted')
            sx, sy = extent['xmin'] + (col + .5) * dx, extent['ymax'] - (row + .5) * dy
            lon, lat = source_to_wgs.transform(sx, sy)
            east, north = local.transform(lon, lat)
            positions.append([round(east, 5), round(float(raw_height), 5), round(north, 5)])
    result = {
        'schemaVersion': 1, 'kind': 'golfhelm-canonical-local-meter-study', 'version': 1,
        'siteId': package['siteId'], 'physicalStudyKey': args.study_key, 'status': 'source_candidate_partial',
        'origin': {'longitude': origin[0], 'latitude': origin[1], 'elevationMeters': round(lidar.sample(*origin), 5)},
        'coordinateSystem': {'units': 'meters', 'worldAxes': {'x': 'east', 'y': 'elevation_up', 'z': 'north'},
            'projection': 'local-azimuthal-equidistant-wgs84', 'oneWorldUnitEqualsMeters': True},
        'features': compiled_features,
        'terrain': {'grid': {'width': width, 'height': height, 'positionsMeters': positions,
            'sampleStride': stride, 'nominalStepMeters': round(stride * float(lidar.manifest['nativeResolutionM']), 6)}, 'source': {
              'provider': lidar.manifest['provider'], 'derivation': lidar.manifest['derivation'],
              'nativeResolutionMeters': lidar.manifest['nativeResolutionM'], 'verticalDatum': lidar.manifest['verticalDatum'],
              'verticalDatumStatus': lidar.manifest['verticalDatumStatus'], 'rasterSha256': sha256(args.lidar_directory / 'elevation.tiff')}},
        'sources': {'imagery': {'provider': imagery['provider'], 'selectedKind': imagery['selectedKind'], 'nativeResolutionMeters': imagery['nativeResolutionM'],
                      'analysisStatus': imagery['analysisStatus'], 'attribution': imagery['attribution']},
                    'geometry': package['sources'], 'terrain': lidar.manifest},
        'confidence': {'terrain': 'high_resolution_source_candidate', 'green': 'osm_source_candidate', 'bunkers': 'osm_source_candidate',
                       'fairway': 'missing', 'teeBoxes': 'missing', 'water': 'missing', 'trees': 'missing'},
        'limitations': [*study['gaps'], 'The valid visual imagery fallback is RGB only; analysis RGB+NIR export was transparent and rejected.',
                        'This source candidate is a green complex, not Cardinal Hole 1 or any playable-hole binding.',
                        'No daily pin, tee-marker, observed ball coordinate, fairway route, or historical GPS is present.'],
    }
    result['contentHash'] = hashlib.sha256(json.dumps(result, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    write_json(args.output, result)
    report = {'contentHash': result['contentHash'], 'worldUnitMeters': 1, 'featureCount': len(compiled_features),
              'terrainGrid': {'width': width, 'height': height, 'stepMeters': args.terrain_step_m}, 'limitations': result['limitations']}
    write_json(args.output.with_name(args.output.stem + '-validation.json'), report)
    print(json.dumps(report, sort_keys=True))


if __name__ == '__main__':
    main()
