"""Exact planar depth comparisons for static SVG exports of projected triangles.

The shared TS camera/material supplies screen XYZ. For each triangle, subtract
only the overlapping region where another triangle's depth plane is nearer.
Unlike centroid painter sorting this handles partial occlusion at low pitch.
Shapely/NumPy, bounded pilot only; no raster imagery is embedded in the SVG.
"""
import html
import json
import sys
from pathlib import Path

import numpy as np
from shapely.geometry import Polygon
from shapely.ops import unary_union
from shapely.strtree import STRtree


def closer_part(polygon, delta):
    points = list(polygon.exterior.coords)[:-1]
    out = []
    for a, b in zip(points, points[1:] + points[:1]):
        da, db = np.dot(delta, [*a, 1]), np.dot(delta, [*b, 1])
        ina, inb = da < -1e-7, db < -1e-7
        if ina:
            out.append(a)
        if ina != inb:
            t = (-1e-7 - da) / (db - da)
            out.append((a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t))
    return Polygon(out) if len(out) >= 3 else Polygon()


def path_commands(shape):
    components = [shape] if shape.geom_type == 'Polygon' else list(shape.geoms)
    commands = []
    for polygon in components:
        if polygon.geom_type != 'Polygon' or polygon.area < 1e-6:
            continue
        for ring in [polygon.exterior, *polygon.interiors]:
            commands.append('M' + ' L'.join(f'{x:.4f},{y:.4f}' for x, y in list(ring.coords)[:-1]) + ' Z')
    return ' '.join(commands)


def main():
    directory = Path(sys.argv[1])
    for name in ['top', 'terrain', 'side']:
        data = json.loads((directory / f'{name}.json').read_text())
        polygons, planes, triangles = [], [], []
        for t in data['triangles']:
            p = Polygon([(v[0], v[1]) for v in t['points']])
            if p.area < 1e-6:
                continue
            planes.append(np.linalg.solve(np.array([[v[0], v[1], 1] for v in t['points']]), np.array([v[2] for v in t['points']])))
            polygons.append(p)
            triangles.append(t)
        index = STRtree(polygons)
        paths = []
        surfaces = {}
        hidden = 0
        for i, polygon in enumerate(polygons):
            occluders = []
            for j in index.query(polygon, predicate='intersects'):
                if i == j:
                    continue
                overlap = polygon.intersection(polygons[j])
                if overlap.geom_type != 'Polygon' or overlap.area < 1e-6:
                    continue
                nearer = closer_part(overlap, planes[j] - planes[i])
                if not nearer.is_empty:
                    occluders.append(nearer)
            visible = polygon.difference(unary_union(occluders)) if occluders else polygon
            if visible.is_empty:
                hidden += 1
                continue
            commands = path_commands(visible)
            if commands:
                t = triangles[i]
                surface = surfaces.setdefault((t['featureId'], t['material']), {'shapes': [], 'color': t['baseColor']})
                surface['shapes'].append(visible)
                paths.append(f'<path data-feature-id="{html.escape(t["featureId"])}" fill="{t["color"]}" fill-rule="evenodd" d="{commands}"/>')
        # One underpaint per VISIBLE surface prevents adjacent antialiased
        # triangles from exposing dark ground seams. No expanded stroke or
        # hidden geometry is painted; the union retains holes and components.
        underpaint = []
        for surface in surfaces.values():
            commands = path_commands(unary_union(surface['shapes']))
            underpaint.append(f'<path fill="{surface["color"]}" fill-rule="evenodd" d="{commands}"/>')
        metadata = {k: data[k] for k in ['geometryHash', 'terrainHash', 'preset', 'camera']}
        svg = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {data["width"]} {data["height"]}" width="{data["width"]}" height="{data["height"]}" role="img">'
        svg += '<title>Cacapon 7 terrain source study</title><desc>2021 USGS DEM. Pin and ball positions unknown. No putting-break or bunker-lip accuracy claim.</desc>'
        svg += f'<metadata>{html.escape(json.dumps(metadata))}</metadata><rect width="100%" height="100%" fill="{data["background"]}"/>'
        # This annotation fragment is produced by the shared React component
        # from validated numeric geometry, not copied from a source SVG.
        svg += ''.join(underpaint) + ''.join(paths) + data['annotations'] + '</svg>\n'
        (directory / f'cacapon-07-{name}.svg').write_text(svg)
        print(name, 'visible vector paths', len(paths), 'fully hidden triangles', hidden)


if __name__ == '__main__':
    main()
