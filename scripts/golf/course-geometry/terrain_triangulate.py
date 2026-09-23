"""Per-face constrained Delaunay triangulation for the terrain compiler.

Split out of `compile-course-terrain.py` so a change here (mesh output only)
does not also change the fingerprint of `layout.terrain.acquire` /
`layout.visual.terrain.acquire`, which only run source acquisition and never
reach this code path (`compile-course-terrain.py --acquire-only` returns
before any face is triangulated). See `factory/tasks/common.py`
(`TERRAIN_ACQUIRE_FILES` vs `TERRAIN_COMPILE_FILES`) for the impl_files
split this file exists to support, and `test_factory_impact.py` /
`test_factory_fingerprints.py` for the proof that acquire stays cached while
a hole's compile goes stale when only this module changes.
"""
from shapely import constrained_delaunay_triangles
from shapely.geometry import Polygon


def triangulate_faces(faces, ids, hole_key, feature_count, degenerate_area_m2):
    """Triangulate every noded face and return per-triangle xy/material rows
    plus each feature's accumulated triangulated area and triangle count.

    `faces` is `node_pieces`'s output: `(feature_index, material, face)`
    tuples whose face polygons already carry every node any adjacent face
    put on a shared edge (global planar arrangement noding). Each face is
    triangulated independently here, so a triangle this loop discards as
    "degenerate" on one side of a shared edge, while its mirror on the
    other side survives, reopens exactly the crack noding closed: the
    survivor's edge stays single-use in the combined mesh. `degenerate_area_m2`
    must stay far below the smallest legitimate sliver two materials or grid
    cells can leave at a near-tangent meeting (observed as low as ~1e-9 m^2
    in course-factory batches) and far above true GEOS overlay noise
    (~1e-15 m^2 or smaller); see `DEGENERATE_AREA_M2` in
    `compile-course-terrain.py`.
    """
    xy, triangle_features, triangle_materials = [], [], []
    area_by_feature, count_by_feature = [0.0] * feature_count, [0] * feature_count
    for feature_index, material, face in faces:
        ident = ids[feature_index]
        # GEOS's constrained triangulation can return a face-sized triangle
        # outside one part of a polygon with holes. Intersect that exceptional
        # result back to the exact face before adding it; do not loosen the
        # per-feature area conservation assertion.
        for raw_triangle in constrained_delaunay_triangles(face).geoms:
            clipped = raw_triangle if face.covers(raw_triangle) else raw_triangle.intersection(face)
            if clipped.is_empty:
                continue
            triangles = ([clipped] if clipped.geom_type == 'Polygon' and len(clipped.exterior.coords) == 4
                         else constrained_delaunay_triangles(clipped).geoms)
            for triangle in triangles:
                if triangle.area < degenerate_area_m2:
                    continue
                if not face.covers(triangle):
                    raise ValueError(f'Triangulation escaped source region: {hole_key} {ident}')
                points = list(triangle.exterior.coords)[:3]
                # Normals and heights are sampled at these SAME rounded XY
                # values, so coincident material/cell vertices cannot crease.
                points = [(round(px, 5), round(py, 5)) for px, py in points]
                if Polygon(points).area < degenerate_area_m2:
                    continue
                xy.extend(points); triangle_features.append(feature_index); triangle_materials.append(material)
                area_by_feature[feature_index] += triangle.area; count_by_feature[feature_index] += 1
    return xy, triangle_features, triangle_materials, area_by_feature, count_by_feature
