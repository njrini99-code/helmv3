"""Compare triangle-averaged normals with the same immutable source DEM gradient.

Writes diagnostic data only; never changes terrain positions or source files.
Usage: python3 audit-terrain-normals.py mesh.json source-directory output.json
"""
import importlib.util
import json
import math
import sys
from functools import lru_cache
from pathlib import Path

import numpy as np
from PIL import Image

spec = importlib.util.spec_from_file_location('pilot', Path(__file__).with_name('prepare-pilot.py'))
pilot = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pilot)
mesh_path, source_path, output_path = map(Path, sys.argv[1:])
mesh = json.loads(mesh_path.read_text())
pilot.ORIGIN = mesh['originWgs84']
export = json.loads((source_path / 'export.json').read_text())
extent = export['extent']
raster = np.asarray(Image.open(source_path / 'elevation.tiff'))


@lru_cache(maxsize=100000)
def elevation(x, y):
    """Bilinear source sample with explicit four-sample support."""
    lon, lat = pilot.ORIGIN[0] + x / 85800, pilot.ORIGIN[1] + y / 111000
    for _ in range(4):
        east, north = pilot.local([lon, lat])
        lon += (x - east) / 85800
        lat += (y - north) / 111000
    px = (lon - extent['xmin']) / (extent['xmax'] - extent['xmin']) * raster.shape[1] - .5
    py = (extent['ymax'] - lat) / (extent['ymax'] - extent['ymin']) * raster.shape[0] - .5
    ix, iy = math.floor(px), math.floor(py)
    if not 0 <= ix < raster.shape[1] - 1 or not 0 <= iy < raster.shape[0] - 1:
        raise ValueError('Gradient crosses source support')
    samples = raster[iy:iy + 2, ix:ix + 2].astype(float)
    if not (np.isfinite(samples).all() and (samples > -1000).all() and (samples < 9000).all()):
        raise ValueError('Unsupported DEM gradient')
    fx, fy = px - ix, py - iy
    return float(samples[0, 0] * (1-fx) * (1-fy) + samples[0, 1] * fx * (1-fy)
                 + samples[1, 0] * (1-fx) * fy + samples[1, 1] * fx * fy)


@lru_cache(maxsize=30000)
def normal(x, y):
    """Two-meter central gradients; one terrain normal for each source XY."""
    dx = (elevation(x + 2, y) - elevation(x - 2, y)) / 4
    dy = (elevation(x, y + 2) - elevation(x, y - 2)) / 4
    length = math.sqrt(dx*dx + dy*dy + 1)
    return [-dx/length, -dy/length, 1/length]


vertices = np.array(mesh['vertices']).reshape(-1, 3)
source_normals = np.array([normal(float(p[0]), float(p[1])) for p in vertices])
# Match the existing renderer's area-weighted coincident-vertex calculation.
summed = {}
for triangle in vertices.reshape(-1, 3, 3):
    face = np.cross(triangle[1] - triangle[0], triangle[2] - triangle[0])
    if face[2] < 0:
        face *= -1
    for p in triangle:
        key = tuple(np.round(p, 4))
        summed[key] = summed.get(key, np.zeros(3)) + face
old = np.array([summed[tuple(np.round(p, 4))] for p in vertices])
old /= np.linalg.norm(old, axis=1)[:, None]
angles = np.degrees(np.arccos(np.clip((old*source_normals).sum(axis=1), -1, 1)))
result = {'terrainHash': mesh['contentHash'], 'positionsChanged': False,
          'normalBasis': 'same-source DEM central gradient at 2m',
          'sourceNormals': source_normals.round(7).reshape(-1).tolist(),
          'normalDifferenceDegrees': {'median': float(np.median(angles)),
              'p95': float(np.quantile(angles, .95)), 'p99': float(np.quantile(angles, .99)),
              'max': float(angles.max())},
          'verticesAbove10Degrees': int((angles > 10).sum())}
output_path.write_text(json.dumps(result, separators=(',', ':')) + '\n')
print(json.dumps({k: v for k, v in result.items() if k != 'sourceNormals'}, indent=2))
