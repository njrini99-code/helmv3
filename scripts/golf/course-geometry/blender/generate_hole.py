"""Deterministically compile canonical GolfHelm geometry into a static GLB.

Run headlessly:
  blender --background --python scripts/golf/course-geometry/blender/generate_hole.py -- \
    normalized.json elevation.tiff hole.glb validation.json

The canonical JSON remains authoritative.  This script deliberately has no
shot, ball, cup, analytics, or route-reconstruction input.
"""
import hashlib
import json
import math
import sys
from pathlib import Path

import bmesh
import bpy
from mathutils import Vector


def args_after_separator():
    values = sys.argv
    if '--' not in values:
        raise ValueError('Pass normalized JSON, LiDAR TIFF, GLB and report after --')
    return [Path(item) for item in values[values.index('--') + 1:]]


def material(name, color, roughness=.85):
    item = bpy.data.materials.new(name)
    item.diffuse_color = (*color, 1)
    item.use_nodes = True
    principled = item.node_tree.nodes.get('Principled BSDF')
    principled.inputs['Base Color'].default_value = (*color, 1)
    principled.inputs['Roughness'].default_value = roughness
    return item


def mesh_object(name, vertices, faces, mat):
    mesh = bpy.data.meshes.new(name + 'Mesh')
    mesh.from_pydata(vertices, [], faces)
    mesh.materials.append(mat)
    mesh.update()
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    return obj


def look_at(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat('-Z', 'Y').to_euler()


def triangulated_polygon(name, geometry, mat, surface_height, offset=.035):
    if geometry['type'] != 'Polygon' or len(geometry['coordinates']) != 1:
        raise ValueError(f'{name}: only simple source polygons are accepted by the spike compiler')
    ring = geometry['coordinates'][0]
    if len(ring) < 4 or ring[0] != ring[-1]:
        raise ValueError(f'{name}: invalid canonical ring')
    # A feature vertex's original LiDAR sample and the decimated terrain mesh
    # can differ between raster centers.  Attach decals to the *exported mesh*
    # instead of letting its triangles pierce the green/bunker surface.
    vertices = [(point[0], point[2], surface_height(point[0], point[2]) + offset) for point in ring[:-1]]
    mesh = bpy.data.meshes.new(name + 'Mesh')
    mesh.from_pydata(vertices, [], [list(range(len(vertices)))])
    mesh.materials.append(mat)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    return obj


def terrain_surface_sampler(grid):
    width, height, positions = grid['width'], grid['height'], grid['positionsMeters']
    origin, right, down = positions[0], positions[1], positions[width]
    rx, rz = right[0] - origin[0], right[2] - origin[2]
    dx, dz = down[0] - origin[0], down[2] - origin[2]
    determinant = rx * dz - rz * dx
    if abs(determinant) < 1e-9:
        raise ValueError('Canonical terrain grid is degenerate')
    def height_at(x, z):
        px, pz = x - origin[0], z - origin[2]
        u = (px * dz - pz * dx) / determinant
        v = (rx * pz - rz * px) / determinant
        col, row = math.floor(u), math.floor(v)
        if col < 0 or row < 0 or col >= width - 1 or row >= height - 1:
            raise ValueError('Feature polygon falls outside canonical terrain grid')
        u -= col
        v -= row
        a = positions[row * width + col][1]
        b = positions[row * width + col + 1][1]
        c = positions[(row + 1) * width + col][1]
        d = positions[(row + 1) * width + col + 1][1]
        return a * (1 - u) + b * (u - v) + d * v if v <= u else a * (1 - v) + d * u + c * (v - u)
    return height_at


def main():
    values = args_after_separator()
    if len(values) not in (4, 5):
        raise ValueError('Expected normalized JSON, LiDAR TIFF, GLB, report, and optional preview PNG')
    normalized_path, terrain_tif, glb_path, report_path = values[:4]
    preview_path = values[4] if len(values) == 5 else None
    data = json.loads(normalized_path.read_text())
    if data.get('kind') != 'golfhelm-canonical-local-meter-study' or not data['coordinateSystem'].get('oneWorldUnitEqualsMeters'):
        raise ValueError('Input is not a local-metre GolfHelm canonical study')
    expected_raster = data['terrain']['source']['rasterSha256']
    actual_raster = hashlib.sha256(terrain_tif.read_bytes()).hexdigest()
    if expected_raster != actual_raster:
        raise ValueError('Terrain TIFF does not match the canonical study source hash')
    grid = data['terrain']['grid']
    width, height, positions = grid['width'], grid['height'], grid['positionsMeters']
    if len(positions) != width * height:
        raise ValueError('Canonical terrain grid dimensions do not match positions')
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    terrain_material = material('GolfHelmTerrain', (.14, .28, .20))
    materials = {'green': material('GolfHelmGreen', (.48, .68, .34)), 'bunker': material('GolfHelmSand', (.72, .66, .49)),
                 'fairway': material('GolfHelmFairway', (.32, .53, .27)), 'water': material('GolfHelmWater', (.13, .34, .42))}
    terrain_vertices = [(point[0], point[2], point[1]) for point in positions]
    terrain_faces = []
    for row in range(height - 1):
        for col in range(width - 1):
            a = row * width + col
            terrain_faces.extend([(a, a + 1, a + width + 1), (a, a + width + 1, a + width)])
    terrain = mesh_object('GolfHelmTerrain', terrain_vertices, terrain_faces, terrain_material)
    terrain['golfhelm_role'] = 'source_backed_lidar_terrain'
    terrain['golfhelm_raster_sha256'] = actual_raster
    layers = [terrain]
    surface_height = terrain_surface_sampler(grid)
    for feature in data['features']:
        kind = feature['kind']
        if kind not in materials:
            continue
        layer = triangulated_polygon('GolfHelm' + kind.title() + '_' + feature['id'], feature['geometryMeters'], materials[kind], surface_height)
        layer['golfhelm_feature_id'] = feature['id']
        layer['golfhelm_source_backed'] = True
        layers.append(layer)
    frame = bpy.data.objects.new('GolfHelmCanonicalFrame', None)
    frame.empty_display_type = 'ARROWS'
    frame['golfhelm_axes_before_export'] = 'x=east,y=elevation,z=north'
    frame['golfhelm_units'] = 'meters'
    bpy.context.collection.objects.link(frame)
    min_x, max_x = min(item[0] for item in terrain_vertices), max(item[0] for item in terrain_vertices)
    min_y, max_y = min(item[1] for item in terrain_vertices), max(item[1] for item in terrain_vertices)
    min_z, max_z = min(item[2] for item in terrain_vertices), max(item[2] for item in terrain_vertices)
    span = max(max_x - min_x, max_y - min_y)
    rendered_points = [point for feature in data['features'] for ring in feature['geometryMeters'].get('coordinates', []) for point in ring]
    if rendered_points:
        feature_span = max(max(point[0] for point in rendered_points) - min(point[0] for point in rendered_points),
                           max(point[2] for point in rendered_points) - min(point[2] for point in rendered_points))
        target = (sum(point[0] for point in rendered_points) / len(rendered_points),
                  sum(point[2] for point in rendered_points) / len(rendered_points),
                  sum(point[1] for point in rendered_points) / len(rendered_points))
        camera_span = max(feature_span * 3.6, 55)
    else:
        target = ((min_x + max_x) / 2, (min_y + max_y) / 2, (min_z + max_z) / 2)
        camera_span = span * 1.25
    camera_data = bpy.data.cameras.new('GolfHelmCameraDefaults')
    camera_data.type = 'ORTHO'
    camera_data.ortho_scale = camera_span
    camera = bpy.data.objects.new('GolfHelmCameraDefaults', camera_data)
    camera.location = (target[0], target[1] - camera_span * .62, target[2] + camera_span * .9)
    look_at(camera, target)
    bpy.context.collection.objects.link(camera)
    bpy.context.scene.camera = camera
    sun_data = bpy.data.lights.new('GolfHelmLighting', type='SUN')
    sun_data.energy = 2.0
    sun = bpy.data.objects.new('GolfHelmLighting', sun_data)
    sun.rotation_euler = (.55, -.35, .65)
    bpy.context.collection.objects.link(sun)
    world = bpy.context.scene.world
    world.use_nodes = True
    background = world.node_tree.nodes.get('Background')
    background.inputs['Color'].default_value = (.08, .14, .105, 1)
    background.inputs['Strength'].default_value = .45
    glb_path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.wm.save_as_mainfile(filepath=str(glb_path.with_suffix('.blend')))
    bpy.ops.export_scene.gltf(filepath=str(glb_path), export_format='GLB', export_yup=True, export_apply=True, export_extras=True, export_cameras=True, export_lights=True)
    if preview_path:
        preview_path.parent.mkdir(parents=True, exist_ok=True)
        scene = bpy.context.scene
        scene.render.engine = 'BLENDER_EEVEE'
        scene.render.resolution_x = 900
        scene.render.resolution_y = 900
        scene.render.resolution_percentage = 100
        scene.render.image_settings.file_format = 'PNG'
        scene.render.filepath = str(preview_path)
        bpy.ops.render.render(write_still=True)
    report = {
        'schemaVersion': 1, 'inputCanonicalHash': data['contentHash'], 'terrainRasterSha256': actual_raster,
        'outputGlbSha256': hashlib.sha256(glb_path.read_bytes()).hexdigest(), 'objects': [item.name for item in layers],
        'worldUnitMeters': 1, 'canonicalAxes': 'x=east,y=elevation,z=north', 'glbAxes': 'glTF Y-up (Blender export_yup=true)',
        'staticOnly': True, 'previewPath': str(preview_path) if preview_path else None,
        'excludedDynamicData': ['shots', 'ball', 'cup', 'labels', 'analytics', 'flight paths'],
        'limitations': data['limitations'],
    }
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps({'glb': str(glb_path), 'objects': len(layers), 'bytes': glb_path.stat().st_size}))


if __name__ == '__main__':
    main()
