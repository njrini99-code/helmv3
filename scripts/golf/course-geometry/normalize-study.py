"""Compile a bounded source study into canonical local metres for Blender and Three.

This does not promote a source candidate to a playable GolfHelm hole.  Every
input WGS84 coordinate survives in ``sourceGeometryWgs84`` and every derived
coordinate uses ``[eastM, elevationM, northM]`` with one world unit per metre.
"""
import argparse
import hashlib
import importlib.util
import json
import math
from pathlib import Path

import numpy as np
import pyproj
from physical_admission import load_review, review_input

_spec = importlib.util.spec_from_file_location('elevation_raster', Path(__file__).with_name('elevation_raster.py'))
elevation_raster = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(elevation_raster)

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


def local_enu(origin, point):
    """Project WGS84 into the package's canonical zero-altitude ENU frame.

    ``compile-course-terrain.py`` and the browser both use
    ``wgs84-local-enu-v1``. Keeping this conversion here byte-for-byte
    equivalent prevents a terrain grid and its semantic polygons drifting into
    different local frames at a source boundary.
    """
    def ecef(value):
        lon, lat = [v * math.pi / 180 for v in value]
        eccentricity_squared = 6.6943799901413165e-3
        radius = 6378137 / math.sqrt(1 - eccentricity_squared * math.sin(lat) ** 2)
        return [radius * math.cos(lat) * math.cos(lon), radius * math.cos(lat) * math.sin(lon),
                radius * (1 - eccentricity_squared) * math.sin(lat)]

    delta = [a - b for a, b in zip(ecef(point), ecef(origin))]
    lon, lat = [v * math.pi / 180 for v in origin]
    return (-math.sin(lon) * delta[0] + math.cos(lon) * delta[1],
            -math.sin(lat) * math.cos(lon) * delta[0] - math.sin(lat) * math.sin(lon) * delta[1] + math.cos(lat) * delta[2])


class Terrain:
    def __init__(self, directory):
        self.manifest = json.loads((directory / 'source-manifest.json').read_text())
        self.export = json.loads((directory / 'export.json').read_text())
        self.raster, _nodata, self.decoder = elevation_raster.read_elevation(directory / 'elevation.tiff')
        if self.raster.shape != (self.export['height'], self.export['width']):
            raise ValueError('LiDAR TIFF dimensions do not match immutable export metadata')
        # The NC study fetcher records `nativeResolutionMeters`; the USGS course
        # fetcher records `nativeResolutionM`. Read whichever is declared; never guess.
        self.native_resolution_m = self.manifest.get('nativeResolutionMeters', self.manifest.get('nativeResolutionM'))
        if self.native_resolution_m is None:
            raise ValueError('LiDAR source manifest omits its native resolution')
        declared_factor = self.manifest.get('verticalUnitToMeters')
        if declared_factor is None and self.manifest.get('renderingOnly') is True:
            declared_factor = self.manifest.get('visualVerticalUnitToMeters')
        factor = float(declared_factor) if declared_factor is not None else float('nan')
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
    parser.add_argument('imagery_directory', type=Path, nargs='?', default=None,
                        help='Optional orthophoto study directory; omit when no imagery source exists')
    parser.add_argument('output', type=Path)
    parser.add_argument('--physical-admission', type=Path, help='Immutable, human-reviewed admission sidecar; never generated approval')
    parser.add_argument('--terrain-step-m', type=float, default=1)
    parser.add_argument('--padding-m', type=float, default=None,
                        help='Crop the terrain grid to the study footprint plus this padding; omit to keep the whole raster')
    args = parser.parse_args()
    if not 0 < args.terrain_step_m <= 20 or (args.padding_m is not None and not 0 <= args.padding_m <= 500):
        raise ValueError('Terrain step must be 0–20m and padding 0–500m')
    package = json.loads(args.package.read_text())
    study = next((item for item in package['holes'] if item['key'] == args.study_key), None)
    if study is None:
        raise ValueError('Unknown physical study key')
    if package['status'] not in ('source_candidate', 'reviewed_draft'):
        raise ValueError('This compiler only handles source candidates or explicitly reviewed packages')
    lidar = Terrain(args.lidar_directory)
    terrain_rendering_only = bool(lidar.manifest.get('renderingOnly'))
    imagery = json.loads((args.imagery_directory / 'source-manifest.json').read_text()) if args.imagery_directory else None
    origin = package['originWgs84']
    features = {item['id']: item for item in package['features']}
    selected = [features[item] for item in study['featureIds']]
    def local_point(point):
        east, north = local_enu(origin, point)
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
                'boundaryAccuracyMeters': feature['accuracyMeters'], 'extraction': feature.get('provenance', {}).get('extraction', 'retained source geometry; not imagery-derived')},
            **({'truthClass': feature['truthClass']} if feature.get('truthClass') else {}),
        })
    # Use geographic projected X/Z bounds, not elevations, to form a compact grid.
    footprint = []
    for feature in selected:
        for point in points(feature['geometryWgs84']['coordinates']):
            footprint.append(local_enu(origin, point))
    # Preserve the LiDAR raster's own complete grid.  A locally projected
    # source grid is slightly rotated relative to an east/north frame, so a
    # fabricated axis-aligned grid would introduce coverage gaps at corners.
    # Decimating existing samples keeps every output height source-backed.
    extent = lidar.export['extent']
    source_to_wgs = pyproj.Transformer.from_crs(lidar.manifest['horizontalExportCrs'], 4326, always_xy=True)
    stride = max(1, round(args.terrain_step_m / float(lidar.native_resolution_m)))
    # Crop to the study footprint plus padding in the raster's own projected
    # frame. A whole-course raster far exceeds one hole's grid budget, and
    # decimating existing samples keeps every retained height source-backed.
    first_row, last_row, first_col, last_col = 0, lidar.raster.shape[0] - 1, 0, lidar.raster.shape[1] - 1
    if args.padding_m is not None:
        # Canopy groups are decoration that can reach far beyond the played
        # surfaces; they never size the metric grid.
        footprint_source = [lidar.to_source.transform(point[0], point[1]) for feature in selected
                            if feature['kind'] != 'woods' for point in points(feature['geometryWgs84']['coordinates'])]
        dx_native = (extent['xmax'] - extent['xmin']) / lidar.raster.shape[1]
        dy_native = (extent['ymax'] - extent['ymin']) / lidar.raster.shape[0]
        min_sx, max_sx = min(p[0] for p in footprint_source) - args.padding_m, max(p[0] for p in footprint_source) + args.padding_m
        min_sy, max_sy = min(p[1] for p in footprint_source) - args.padding_m, max(p[1] for p in footprint_source) + args.padding_m
        first_col = max(0, math.floor((min_sx - extent['xmin']) / dx_native))
        last_col = min(lidar.raster.shape[1] - 1, math.ceil((max_sx - extent['xmin']) / dx_native))
        first_row = max(0, math.floor((extent['ymax'] - max_sy) / dy_native))
        last_row = min(lidar.raster.shape[0] - 1, math.ceil((extent['ymax'] - min_sy) / dy_native))
    row_indices = list(range(first_row, last_row + 1, stride))
    col_indices = list(range(first_col, last_col + 1, stride))
    if row_indices[-1] != last_row:
        row_indices.append(last_row)
    if col_indices[-1] != last_col:
        col_indices.append(last_col)
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
            east, north = local_enu(origin, (lon, lat))
            positions.append([round(east, 5), round(float(raw_height), 5), round(north, 5)])
    result = {
        'schemaVersion': 1, 'kind': 'golfhelm-canonical-local-meter-study', 'version': 1,
        'siteId': package['siteId'], 'physicalStudyKey': args.study_key, 'status': 'source_candidate_partial' if package['status'] == 'source_candidate' else 'reviewed_draft',
        'packageHash': package['contentHash'], 'par': study['par'], 'scorecardYards': study.get('scorecardYards'),
        'holeDistanceGeometry': study.get('holeDistanceGeometry'),
        'admissionReview': review_input(load_review(args.physical_admission), args.study_key) if args.physical_admission else None,
        'origin': {'longitude': origin[0], 'latitude': origin[1], 'elevationMeters': round(lidar.sample(*origin), 5)},
        'coordinateSystem': {'units': 'meters', 'worldAxes': {'x': 'east', 'y': 'elevation_up', 'z': 'north'},
            'projection': 'wgs84-local-enu-v1', 'oneWorldUnitEqualsMeters': True},
        'features': compiled_features,
        'terrain': {'truthClass': 'visual_only' if terrain_rendering_only else 'derived',
                    'grid': {'width': width, 'height': height, 'positionsMeters': positions,
            'sampleStride': stride, 'nominalStepMeters': round(stride * float(lidar.native_resolution_m), 6)}, 'source': {
              'provider': lidar.manifest.get('provider', lidar.manifest.get('providerPolicyId', 'unknown')),
              'derivation': lidar.manifest.get('derivation', lidar.manifest.get('selectedTitle')),
              'nativeResolutionMeters': lidar.native_resolution_m,
              'sourceNativeResolutionMeters': lidar.manifest.get('sourceNativeResolutionM', lidar.native_resolution_m),
              'renderingOnly': terrain_rendering_only,
              'verticalDatum': lidar.manifest['verticalDatum'],
              'verticalDatumStatus': lidar.manifest.get('verticalDatumStatus', 'declared by source catalog metadata'), 'rasterSha256': sha256(args.lidar_directory / 'elevation.tiff')}},
        'sources': {'imagery': {'provider': imagery['provider'], 'selectedKind': imagery['selectedKind'], 'nativeResolutionMeters': imagery['nativeResolutionM'],
                      'analysisStatus': imagery['analysisStatus'], 'attribution': imagery['attribution']} if imagery else None,
                    'geometry': package['sources'], 'terrain': lidar.manifest},
        'confidence': {'terrain': 'rendering_only_derived_raster' if terrain_rendering_only else 'high_resolution_source_candidate', **{
            label: ('osm_source_candidate' if any(feature['kind'] == kind for feature in selected) else 'missing')
            for label, kind in (('green', 'green'), ('bunkers', 'bunker'), ('fairway', 'fairway'), ('teeBoxes', 'tee'), ('water', 'water'))},
            'trees': 'missing'},
        'limitations': [*study['gaps'],
                        *(['Terrain raster was resampled only to render a large facility context; it is not physical height authority.'] if terrain_rendering_only else []),
                        *(['The valid visual imagery fallback is RGB only; analysis RGB+NIR export was transparent and rejected.']
                          if imagery and imagery.get('analysisStatus') != 'analysis' else
                          ['No imagery source is bound to this study; boundaries are vector-source candidates only.'] if not imagery else []),
                        'No daily pin, tee-marker, observed ball coordinate, or historical GPS is present.'],
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
