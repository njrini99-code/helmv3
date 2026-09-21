"""Verify that a display-only route candidate GLB retained its hard contract."""
import hashlib
import json
import sys
from pathlib import Path

import bpy


REQUIRED_FALSE = (
    'mayEnterCanonicalPackage', 'mayEnterOneTap',
    'mayPublishAsPhysicalHoleWorld', 'canMeasure',
)
FORBIDDEN = ('physicalHoleId', 'holeKey', 'ordinal', 'routeWayId')


def main():
    if '--' not in sys.argv:
        raise ValueError('Pass compile input, GLB and validation report after --')
    values = [Path(value) for value in sys.argv[sys.argv.index('--') + 1:]]
    if len(values) != 3:
        raise ValueError('Expected compile input, GLB and validation report')
    input_path, glb_path, report_path = values
    data = json.loads(input_path.read_text())
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    bpy.ops.import_scene.gltf(filepath=str(glb_path))
    roots = [obj for obj in bpy.data.objects if obj.name == 'GolfHelmVisualRouteCandidateContract']
    failures = []
    if len(roots) != 1:
        failures.append('missing_or_duplicate_contract_root')
    else:
        root = roots[0]
        candidate = data['candidate']
        expected = {
            'golfhelm_visual_candidate_id': candidate['candidateId'],
            'golfhelm_plan_sha256': data['planSha256'],
            'golfhelm_source_sha256': data['sourceArtifact']['sha256'],
            'golfhelm_authority': 'visual_only',
        }
        for key, value in expected.items():
            if root.get(key) != value:
                failures.append('contract_mismatch:' + key)
        for key in REQUIRED_FALSE:
            if root.get('golfhelm_' + key) is not False:
                failures.append('authoritative_flag:' + key)
    for obj in bpy.data.objects:
        for key in FORBIDDEN:
            if key in obj.keys() or ('golfhelm_' + key) in obj.keys():
                failures.append('forbidden_identifier:' + key)
    report = {
        'schema': 'golfhelm-visual-route-candidate-validation-v1',
        'candidateId': data['candidate']['candidateId'],
        'planSha256': data['planSha256'],
        'sourceSha256': data['sourceArtifact']['sha256'],
        'glbSha256': hashlib.sha256(glb_path.read_bytes()).hexdigest(),
        'passed': not failures,
        'failures': failures,
        'renderingContract': data['renderingContract'],
    }
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, indent=2) + '\n')
    if failures:
        raise SystemExit('; '.join(failures))
    print(json.dumps({'candidateId': report['candidateId'], 'passed': True}))


if __name__ == '__main__':
    main()
