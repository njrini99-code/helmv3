"""Hole-local rendering coverage without changing shared physical features.

A lake/rough/wood polygon may serve several holes. Its full extent is retained
as source evidence, but must not size a single hole's tactical sampling grid.
"""
import math

from shapely.geometry import Polygon, mapping, shape

PLAYED_SURFACE_KINDS = frozenset({'route', 'tee', 'fairway', 'green', 'bunker'})


def played_features(features):
    selected = [feature for feature in features if feature['kind'] in PLAYED_SURFACE_KINDS]
    if not selected:
        # A facility-only study has no asserted played corridor. Preserve its
        # existing bounded-context behavior instead of inventing one.
        selected = [feature for feature in features if feature['kind'] != 'woods']
    if not selected:
        raise ValueError('No source-backed study footprint is available')
    return selected


def clip_render_geometry(geometry, grid):
    """Return a separate exact XY display clip; never replace source geometry.

    Use the interior sampled grid, leaving one complete cell as a guard for
    reprojection curvature and the final (possibly shorter) decimation cell.
    Heights are read from the same rendered grid, with no invented elevation.
    """
    width, height, positions = grid['width'], grid['height'], grid['positionsMeters']
    if min(width, height) < 4:
        raise ValueError('Terrain crop is too small for a bounded display clip')
    origin, right, down = positions[0], positions[1], positions[width]
    rx, rz = right[0] - origin[0], right[2] - origin[2]
    dx, dz = down[0] - origin[0], down[2] - origin[2]
    determinant = rx * dz - rz * dx
    if abs(determinant) < 1e-9:
        raise ValueError('Canonical terrain grid is degenerate')
    # Use the renderer's affine cell coordinates, not an unrelated bbox.
    def plane(u, v):
        return (origin[0] + u * rx + v * dx, origin[2] + u * rz + v * dz)
    clip = Polygon([plane(1, 1), plane(width - 2, 1), plane(width - 2, height - 2), plane(1, height - 2)])
    def xy(value):
        if isinstance(value[0], (int, float)):
            return [value[0], value[2]]
        return [xy(child) for child in value]
    source = shape({'type': geometry['type'], 'coordinates': xy(geometry['coordinates'])})
    clipped = source.intersection(clip)
    polygons = [part for part in getattr(clipped, 'geoms', [clipped]) if part.geom_type == 'Polygon' and part.area > 0]
    if not polygons:
        return None, {'method': 'terrain_grid_interior_clip_v1', 'canonicalGeometryChanged': False, 'visibleAreaM2': 0}
    from shapely.geometry import MultiPolygon
    result = mapping(polygons[0] if len(polygons) == 1 else MultiPolygon(polygons))
    def xyz(value):
        if isinstance(value[0], (int, float)):
            x, z = value
            px, pz = x - origin[0], z - origin[2]
            u, v = (px * dz - pz * dx) / determinant, (rx * pz - rz * px) / determinant
            col, row = math.floor(u), math.floor(v)
            if not (0 <= col < width - 1 and 0 <= row < height - 1):
                raise ValueError('Display clip escaped sampled terrain')
            u, v = u - col, v - row
            a, b = positions[row * width + col][1], positions[row * width + col + 1][1]
            c, d = positions[(row + 1) * width + col][1], positions[(row + 1) * width + col + 1][1]
            y = a * (1 - u) + b * (u - v) + d * v if v <= u else a * (1 - v) + d * u + c * (v - u)
            return [x, y, z]
        return [xyz(child) for child in value]
    return {'type': result['type'], 'coordinates': xyz(result['coordinates'])}, {
        'method': 'terrain_grid_interior_clip_v1', 'canonicalGeometryChanged': False,
        'clipPolygonMetersXZ': [list(point) for point in clip.exterior.coords],
        'sourceAreaM2': source.area, 'visibleAreaM2': clipped.area,
        'authority': 'render_only_subset_of_retained_canonical_polygon',
    }
