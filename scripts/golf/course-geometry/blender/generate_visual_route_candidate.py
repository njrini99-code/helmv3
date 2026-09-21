"""Compile one explicitly non-authoritative route candidate into a review GLB.

This is deliberately separate from ``generate_hole.py``.  It consumes only a
compiler-produced display input whose source extract and plan hashes have
already been verified.  It has no canonical package, physical-world, route
identity, scorecard, One Tap, player, or terrain-measurement input.
"""
import hashlib
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector
from mathutils.geometry import tessellate_polygon


REQUIRED_FALSE = (
    'mayEnterCanonicalPackage', 'mayEnterOneTap',
    'mayPublishAsPhysicalHoleWorld', 'canMeasure',
)


def args_after_separator():
    if '--' not in sys.argv:
        raise ValueError('Pass compile input, GLB, preview and export report after --')
    return [Path(value) for value in sys.argv[sys.argv.index('--') + 1:]]


def material(name, color, roughness=.85):
    item = bpy.data.materials.new(name)
    item.diffuse_color = (*color, 1)
    item.use_nodes = True
    bsdf = item.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Roughness'].default_value = roughness
    return item


def look_at(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat('-Z', 'Y').to_euler()


def mesh(name, vertices, faces, mat):
    value = bpy.data.meshes.new(name + 'Mesh')
    value.from_pydata(vertices, [], faces)
    value.materials.append(mat)
    value.update()
    for face in value.polygons:
        face.use_smooth = True
    obj = bpy.data.objects.new(name, value)
    bpy.context.collection.objects.link(obj)
    return obj


def local_projector(origin):
    """A display projection, retained as an estimate instead of geography.

    This converts only a small candidate scene to Blender coordinates.  It is
    not a local coordinate system for analytics, and output metadata states
    that no distance/elevation calculation is permitted from it.
    """
    lon0, lat0 = origin
    x_scale = 111_320 * math.cos(math.radians(lat0))
    z_scale = 110_574

    def project(point):
        return ((point[0] - lon0) * x_scale, (point[1] - lat0) * z_scale)
    return project


def polygon_layer(name, source, project, mat, height):
    geometry = source['geometryWgs84']
    if geometry.get('type') != 'Polygon' or len(geometry.get('coordinates') or []) != 1:
        raise ValueError(f'{name}: review compiler accepts a single retained OSM polygon only')
    ring = geometry['coordinates'][0]
    if len(ring) < 4 or ring[0] != ring[-1]:
        raise ValueError(f'{name}: retained source ring is not closed')
    planar = [Vector((*project(point), 0)) for point in ring[:-1]]
    triangles = tessellate_polygon([planar])
    vertices = [(point.x, height, point.y) for point in planar]
    faces = [tuple(face) for face in triangles]
    obj = mesh(name, vertices, faces, mat)
    obj['golfhelm_source_way_id'] = source['wayId']
    obj['golfhelm_source_kind'] = source['kind']
    obj['golfhelm_truth_class'] = 'derived'
    obj['golfhelm_measurement_authority'] = False
    return obj, vertices


def line_layer(name, points, project, mat):
    projected = [project(point) for point in points]
    curve = bpy.data.curves.new(name + 'Curve', 'CURVE')
    curve.dimensions = '3D'
    curve.bevel_depth = .6
    curve.bevel_resolution = 2
    spline = curve.splines.new('POLY')
    spline.points.add(len(projected) - 1)
    for point, (x, z) in zip(spline.points, projected):
        point.co = (x, .25, z, 1)
    curve.materials.append(mat)
    obj = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(obj)
    obj['golfhelm_truth_class'] = 'estimated'
    obj['golfhelm_measurement_authority'] = False
    obj['golfhelm_estimated_display_line'] = True
    return obj, projected


def main():
    values = args_after_separator()
    if len(values) != 4:
        raise ValueError('Expected compile input, GLB, preview PNG and export report')
    input_path, glb_path, preview_path, report_path = values
    data = json.loads(input_path.read_text())
    if data.get('schema') != 'golfhelm-visual-route-candidate-compile-input-v1':
        raise ValueError('Input is not a visual route candidate compile input')
    contract = data.get('renderingContract') or {}
    if any(contract.get(key) is not False for key in REQUIRED_FALSE):
        raise ValueError('Visual route candidate contract would permit authoritative use')
    candidate = data.get('candidate') or {}
    if any(key in candidate for key in ('physicalHoleId', 'holeKey', 'ordinal', 'routeWayId')):
        raise ValueError('Anonymous visual candidate includes a canonical hole/route identifier')
    if candidate.get('authority') != 'visual_only' or candidate.get('truthClass') not in {'estimated', 'derived'}:
        raise ValueError('Visual route candidate is not explicitly visual-only')
    sources = data.get('sourceFeatures') or []
    if not sources:
        raise ValueError('No source feature geometry was retained for this display candidate')

    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    root = bpy.data.objects.new('GolfHelmVisualRouteCandidateContract', None)
    root.empty_display_type = 'ARROWS'
    root['golfhelm_visual_candidate_id'] = candidate['candidateId']
    root['golfhelm_plan_sha256'] = data['planSha256']
    root['golfhelm_source_sha256'] = data['sourceArtifact']['sha256']
    root['golfhelm_truth_class'] = candidate['truthClass']
    root['golfhelm_authority'] = 'visual_only'
    for key in REQUIRED_FALSE:
        root['golfhelm_' + key] = False
    root['golfhelm_no_physical_hole_id'] = True
    root['golfhelm_no_scorecard_ordinal'] = True
    root['golfhelm_no_route_identity'] = True
    bpy.context.collection.objects.link(root)

    green = next((item for item in sources if item['kind'] == 'green'), None)
    if not green:
        raise ValueError('A visual candidate requires a retained source green polygon')
    origin = green['centerWgs84']
    project = local_projector(origin)
    materials = {
        'ground': material('GolfHelmVisualOnlyGround', (.055, .11, .07)),
        'green': material('GolfHelmSourceGreen', (.26, .78, .16)),
        'tee': material('GolfHelmSourceTee', (.12, .52, .72)),
        'fairway': material('GolfHelmSourceFairway', (.42, .66, .18)),
        'corridor': material('GolfHelmEstimatedDisplayCorridor', (.92, .76, .20), .5),
    }
    all_points, layers = [], []
    heights = {'fairway': .02, 'tee': .04, 'green': .06}
    for source in sources:
        obj, vertices = polygon_layer('GolfHelmSource' + source['kind'].title() + '_' + str(source['wayId']), source,
                                      project, materials[source['kind']], heights[source['kind']])
        layers.append(obj)
        all_points.extend((x, z) for x, _y, z in vertices)
    line = candidate.get('visualCorridorWgs84')
    if line:
        obj, points = line_layer('GolfHelmEstimatedVisualCorridor', line['coordinates'], project, materials['corridor'])
        layers.append(obj)
        all_points.extend(points)
    min_x, max_x = min(x for x, _ in all_points), max(x for x, _ in all_points)
    min_z, max_z = min(z for _, z in all_points), max(z for _, z in all_points)
    padding = max(35, max(max_x - min_x, max_z - min_z) * .16)
    ground = mesh('GolfHelmVisualOnlyGround', [
        (min_x - padding, 0, min_z - padding), (max_x + padding, 0, min_z - padding),
        (max_x + padding, 0, max_z + padding), (min_x - padding, 0, max_z + padding),
    ], [(0, 1, 2), (0, 2, 3)], materials['ground'])
    ground['golfhelm_truth_class'] = 'visual_only'
    ground['golfhelm_measurement_authority'] = False
    layers.append(ground)

    span = max(max_x - min_x, max_z - min_z, 60)
    camera_data = bpy.data.cameras.new('GolfHelmReviewCamera')
    camera_data.type = 'ORTHO'
    camera_data.ortho_scale = span * 1.18
    camera_data.clip_end = 5000
    camera = bpy.data.objects.new('GolfHelmReviewCamera', camera_data)
    target = ((min_x + max_x) / 2, 0, (min_z + max_z) / 2)
    # Blender is Y-up: place the review camera above the display plane, with
    # a modest northward offset so the source polygons remain legible.
    camera.location = (target[0], span * 1.08, target[2] - span * .56)
    look_at(camera, target)
    bpy.context.collection.objects.link(camera)
    bpy.context.scene.camera = camera
    sun_data = bpy.data.lights.new('GolfHelmReviewLighting', type='SUN')
    sun_data.energy = 2.0
    sun = bpy.data.objects.new('GolfHelmReviewLighting', sun_data)
    sun.rotation_euler = (.55, -.35, .65)
    bpy.context.collection.objects.link(sun)
    bpy.context.scene.world.use_nodes = True
    background = bpy.context.scene.world.node_tree.nodes.get('Background')
    background.inputs['Color'].default_value = (.07, .12, .085, 1)
    background.inputs['Strength'].default_value = .5

    glb_path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.gltf(filepath=str(glb_path), export_format='GLB', export_yup=True,
                              export_apply=True, export_extras=True, export_cameras=True, export_lights=True)
    preview_path.parent.mkdir(parents=True, exist_ok=True)
    scene = bpy.context.scene
    # Blender 5.2 still exposes the EEVEE renderer under this stable enum.
    scene.render.engine = 'BLENDER_EEVEE'
    scene.render.resolution_x = 720
    scene.render.resolution_y = 720
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.filepath = str(preview_path)
    bpy.ops.render.render(write_still=True)
    report = {
        'schema': 'golfhelm-visual-route-candidate-export-v1',
        'inputSha256': hashlib.sha256(input_path.read_bytes()).hexdigest(),
        'planSha256': data['planSha256'],
        'sourceSha256': data['sourceArtifact']['sha256'],
        'candidateId': candidate['candidateId'],
        'outputGlbSha256': hashlib.sha256(glb_path.read_bytes()).hexdigest(),
        'objects': [item.name for item in layers],
        'renderingContract': contract,
        'limitations': candidate['limitations'],
        'coordinateSystem': 'candidate-local-display-projection; visual-only, no measurement authority',
    }
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps({'candidateId': candidate['candidateId'], 'glbBytes': glb_path.stat().st_size}))


if __name__ == '__main__':
    main()
