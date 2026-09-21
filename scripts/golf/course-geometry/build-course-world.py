"""Run the metric-truth chain for every played hole of a whole-course package.

For each hole: canonical local-metre study -> physical world -> course truth
gate -> Blender GLB -> GLB round-trip validation. Every stage is an existing
script; this driver only sequences them and writes one course manifest with
the content hashes, gate verdicts and artifact hashes. Failing the truth gate
is expected for unreviewed source candidates and does not stop the visual
build; a Blender or round-trip failure does.

Usage:
  python3 scripts/golf/course-geometry/build-course-world.py \
    src/test/fixtures/course-geometry/peek-n-peak-upper.json \
    src/test/fixtures/course-geometry/sources/peek-n-peak-upper-terrain \
    output/course-geometry/peek-n-peak-upper-world [--holes 1,2] [--skip-blender]
"""
import argparse
import hashlib
import json
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent


def run(command, **kwargs):
    result = subprocess.run(command, check=False, capture_output=True, text=True, **kwargs)
    if result.returncode != 0:
        sys.stderr.write(result.stdout[-4000:] + result.stderr[-4000:])
        raise SystemExit(f'Stage failed ({result.returncode}): {" ".join(map(str, command[:4]))} …')
    return result


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def blender_python_command(blender, script, script_args):
    """Run Blender Python with a nonzero exit status for compiler errors.

    Blender otherwise reports a successful process for many uncaught Python
    exceptions, which can leave a partial world directory looking valid.
    """
    return [str(blender), '--background', '--python-exit-code', '1', '--python', str(script), '--',
            *[str(value) for value in script_args]]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('package', type=Path)
    parser.add_argument('terrain_source', type=Path)
    parser.add_argument('output', type=Path)
    parser.add_argument('--physical-admission', type=Path, help='Human-reviewed per-hole admission evidence')
    parser.add_argument('--holes', default='all')
    parser.add_argument('--terrain-step-m', type=float, default=2)
    parser.add_argument('--padding-m', type=float, default=60)
    parser.add_argument('--skip-blender', action='store_true')
    parser.add_argument('--blender', default=shutil.which('blender') or 'blender')
    args = parser.parse_args()
    package = json.loads(args.package.read_text())
    wanted = None if args.holes == 'all' else {int(n) for n in args.holes.split(',')}
    raster = args.terrain_source / 'elevation.tiff'
    terrain_source_manifest = args.terrain_source / 'source-manifest.json'
    if not terrain_source_manifest.is_file():
        raise SystemExit('Terrain source manifest is required to compile a world')
    manifest = {'schemaVersion': 1, 'kind': 'golfhelm-course-world-manifest-v1', 'siteId': package['siteId'], 'course': package['name'],
                'packageHash': package['contentHash'], 'terrainRasterSha256': sha256(raster),
                'terrainSourceManifestSha256': sha256(terrain_source_manifest), 'builtAt': datetime.now(timezone.utc).isoformat(),
                'terrainStepMeters': args.terrain_step_m, 'paddingMeters': args.padding_m, 'holes': [], 'truthGatePassed': None,
                'publicationRule': 'No hole below passes the course truth gate unless its row says so; GLBs are visual review products only.'}
    for hole in package['holes']:
        if wanted is not None and hole['ordinal'] not in wanted:
            continue
        key = hole['key']
        directory = args.output / 'holes' / key
        (directory / 'validation').mkdir(parents=True, exist_ok=True)
        (directory / 'rendering').mkdir(parents=True, exist_ok=True)
        study = directory / 'study.json'
        run(['python3', str(HERE / 'normalize-study.py'), str(args.package), key, str(args.terrain_source), str(study),
             '--terrain-step-m', str(args.terrain_step_m), '--padding-m', str(args.padding_m),
             *(['--physical-admission', str(args.physical_admission)] if args.physical_admission else [])])
        world = directory / 'physical' / 'world.json'
        run(['python3', str(HERE / 'compile-physical-world.py'), str(study), str(world)])
        gate_json, gate_md = directory / 'validation' / 'course-truth.json', directory / 'validation' / 'course-truth.md'
        run(['python3', str(HERE / 'course-truth-gate.py'), str(study), str(gate_json), str(gate_md)])
        gate = json.loads(gate_json.read_text())
        record = {'key': key, 'ordinal': hole['ordinal'], 'par': hole['par'], 'scorecardYards': hole.get('scorecardYards'),
                  'studyHash': json.loads(study.read_text())['contentHash'], 'physicalWorldHash': json.loads(world.read_text())['contentHash'],
                  'truthGatePassed': gate['passed'], 'admission': gate['holes'][0]['admission'], 'terrainGrid': json.loads(study.with_name('study-validation.json').read_text())['terrainGrid']}
        if not args.skip_blender:
            glb = directory / 'rendering' / f'{key}.glb'
            preview = directory / 'rendering' / f'{key}-preview.png'
            export_report = directory / 'validation' / 'blender-export.json'
            run(blender_python_command(args.blender, HERE / 'blender' / 'generate_hole.py',
                                       [world, raster, glb, export_report, preview]))
            roundtrip = directory / 'validation' / 'glb-roundtrip.json'
            run(blender_python_command(args.blender, HERE / 'blender' / 'validate_glb.py', [world, glb, roundtrip]))
            trip = json.loads(roundtrip.read_text())
            if not trip['passed']:
                raise SystemExit(f'{key}: GLB round trip failed')
            record.update({'glb': glb.name, 'glbSha256': sha256(glb), 'glbBytes': glb.stat().st_size,
                           'roundTripAbsoluteErrorMeters': trip['absoluteErrorMeters'], 'preview': preview.name})
        manifest['holes'].append(record)
        print(json.dumps({k: record[k] for k in record if k in ('key', 'truthGatePassed', 'glbBytes', 'terrainGrid')}), flush=True)
    manifest['truthGatePassed'] = all(item['truthGatePassed'] for item in manifest['holes']) if manifest['holes'] else None
    (args.output / 'course-world-manifest.json').write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + '\n')
    print(json.dumps({'holes': len(manifest['holes']), 'truthGatePassed': manifest['truthGatePassed']}))


if __name__ == '__main__':
    main()
