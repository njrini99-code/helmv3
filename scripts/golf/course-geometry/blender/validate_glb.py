"""Round-trip validation for the offline GolfHelm GLB compiler.

Run inside Blender after generation.  It imports the exported GLB into a new
scene and compares its world spans against canonical metres.  It intentionally
does not validate a player position because static GLBs contain none.
"""
import json
import math
import sys
from pathlib import Path

import bpy


def values():
    if '--' not in sys.argv:
        raise ValueError('Pass normalized JSON, GLB and report after --')
    return [Path(item) for item in sys.argv[sys.argv.index('--') + 1:]]


def bounds(vertices):
    return [[min(point[index] for point in vertices), max(point[index] for point in vertices)] for index in range(3)]


def main():
    normalized_path, glb_path, report_path = values()
    source = json.loads(normalized_path.read_text())
    if not source['coordinateSystem']['oneWorldUnitEqualsMeters']:
        raise ValueError('Canonical source is not metre-scaled')
    expected = bounds(source['terrain']['grid']['positionsMeters'])
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    bpy.ops.import_scene.gltf(filepath=str(glb_path))
    terrain = bpy.data.objects.get('GolfHelmTerrain')
    if terrain is None:
        raise ValueError('GLB has no canonical terrain object')
    actual_vertices = [terrain.matrix_world @ vertex.co for vertex in terrain.data.vertices]
    actual = [[min(vertex[index] for vertex in actual_vertices), max(vertex[index] for vertex in actual_vertices)] for index in range(3)]
    # Blender's importer restores Z-up: canonical (east, elevation, north)
    # becomes Blender (east, north, elevation).
    expected_spans = [expected[0][1] - expected[0][0], expected[2][1] - expected[2][0], expected[1][1] - expected[1][0]]
    actual_spans = [axis[1] - axis[0] for axis in actual]
    errors = [abs(a - b) for a, b in zip(actual_spans, expected_spans)]
    if any(error > .02 for error in errors):
        raise ValueError('GLB unit/axis round trip differs from canonical metres: ' + str(errors))
    report = {
        'schemaVersion': 1, 'passed': True, 'worldUnitMeters': 1,
        'canonicalAxes': 'x=east,y=elevation,z=north', 'importedBlenderAxes': 'x=east,y=north,z=elevation',
        'expectedSpansMeters': expected_spans, 'importedSpansMeters': actual_spans, 'absoluteErrorMeters': errors,
        'verifiedObjects': sorted(item.name for item in bpy.context.scene.objects if item.type == 'MESH'),
        'dynamicShotDataPresent': False,
    }
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report, sort_keys=True))


if __name__ == '__main__':
    main()
