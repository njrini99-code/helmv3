"""Hole-scoped tasks (Factory v2 §8.3). Each takes its hole's subhashes,
never the whole package hash, so one hole's edit stays one hole's rebuild."""
import os

from ..fingerprints import digest
from ..model import TaskSpec
from .common import artifact, dep_input, evaluation, exists, script

TERRAIN_COMPILER = 'course-terrain-v4'
TERRAIN_STYLE = 'narrow-surround-v1'
RENDERER_FILES = ('src/lib/golf/course-geometry/three-renderer.ts', 'src/lib/golf/course-geometry/terrain-material.ts',
                  'src/lib/golf/course-geometry/ground-shader-v2.ts', 'src/lib/golf/course-geometry/visual-style.ts',
                  'src/lib/golf/course-geometry/render-quality.ts')


def _sub(ctx, node, name):
    sub = ctx.hole_subhashes(node.scope.layout_id, node.scope.ordinal)
    return sub.get(name) if sub else None


def eval_terrain_compile(node, ctx):
    layout = ctx.layout(node.scope.layout_id) or {}
    context = ctx.context_layer(node.scope.layout_id)
    terrain_dir = ctx.retained(ctx.facility(node.scope.facility_id), 'terrain')
    source_manifest = ctx.json(os.path.join(terrain_dir, 'source-manifest.json')) if terrain_dir else None
    # The terrain source identity is the compiler's `sourceManifestHash`: the
    # acquire node's output when built, else the retained manifest itself.
    source_identity = dep_input(ctx, node, 'facility.terrain.acquire') or (digest(source_manifest) if source_manifest else None)
    inputs = {'terrainSource': source_identity, 'holeTerrainInputHash': _sub(ctx, node, 'holeTerrainInputHash'),
              'holeContextHash': _sub(ctx, node, 'holeContextHash'), 'contextLayer': (context or {}).get('contentHash')}
    folder = ctx.retained(layout, 'compiled')
    nn = node.scope.nn
    report_path = os.path.join(folder, f'{node.scope.layout_id}-{nn}-report.json') if folder else None
    terrain_path = os.path.join(folder, f'{node.scope.layout_id}-{nn}-terrain.json') if folder else None
    if not (ctx.can_adopt(report_path) and exists(report_path)):
        return evaluation(inputs)
    report = ctx.json(report_path)
    compilation = ctx.json(os.path.join(folder, 'compilation-report.json')) or {}
    notes, adoptable = [], exists(terrain_path)
    checks = {
        'package': report.get('geometryHash') == ctx.package_hash(node.scope.layout_id),
        'terrain source': bool(source_manifest) and compilation.get('sourceManifestHash') == digest(source_manifest),
        'context layer': compilation.get('contextLayerHash') == (context or {}).get('contentHash'),
        'compiler': compilation.get('compilerVersion') == TERRAIN_COMPILER,
    }
    for name, ok in checks.items():
        if not ok:
            adoptable = False
            notes.append(f'compiled {name} differs from the current input')
    if adoptable:
        notes.append(f'compiled terrain {report.get("contentHash", "")[:12]}, {report.get("triangles")} triangles')
    return evaluation(inputs, [], [artifact('terrain', terrain_path, 'C'), artifact('terrain-report', report_path, 'C')], adoptable, notes, output=report.get('contentHash'))


def _world_eval(stage, hash_field):
    def evaluate(node, ctx):
        layout = ctx.layout(node.scope.layout_id) or {}
        inputs = {'terrain': dep_input(ctx, node, 'hole.terrain.compile'), 'holeDisplayInputHash': _sub(ctx, node, 'holeDisplayInputHash')}
        if stage != 'normalize':
            inputs['previous'] = dep_input(ctx, node, PREVIOUS[stage])
        folder = ctx.retained(layout, 'world')
        manifest_path = os.path.join(folder, 'course-world-manifest.json') if folder else None
        manifest = ctx.json(manifest_path) if ctx.can_adopt(manifest_path) else None
        if not manifest:
            return evaluation(inputs)
        hole = next((h for h in manifest.get('holes', []) if h.get('ordinal') == node.scope.ordinal), None)
        if not hole or manifest.get('packageHash') != ctx.package_hash(node.scope.layout_id):
            return evaluation(inputs, [], [], False, ['retained world build is for another package'] if hole else [])
        value = hole.get(hash_field)
        if value is None:
            return evaluation(inputs, [], [], False, [f'world manifest carries no {hash_field}'])
        ref = artifact(f'world-{stage}', manifest_path, 'C')
        ref.sha256 = value if isinstance(value, str) else digest(value)
        return evaluation(inputs, [], [ref], True, [f'retained world build ({hash_field} {str(value)[:12]})'], output=ref.sha256)
    return evaluate


PREVIOUS = {'compile': 'hole.world.normalize', 'truth_gate': 'hole.world.compile', 'glb_export': 'hole.world.compile', 'glb_roundtrip': 'hole.glb.export'}


def eval_visual_canary(node, ctx):
    inputs = {'terrain': dep_input(ctx, node, 'hole.terrain.compile'), 'context': dep_input(ctx, node, 'layout.context.classify'),
              'holeDisplayInputHash': _sub(ctx, node, 'holeDisplayInputHash')}
    return evaluation(inputs)


def eval_player_capture(node, ctx):
    return evaluation({'canary': dep_input(ctx, node, 'hole.visual.canary')})


SPECS = [
    TaskSpec('hole.terrain.compile', TERRAIN_COMPILER, 'hole', ('facility.terrain.acquire', 'layout.package.validate', 'layout.context.classify?'), eval_terrain_compile,
             impl_files=(script('compile-course-terrain.py'), script('elevation_raster.py')), retention='C', estimated_bytes=5_000_000,
             settings={'style': TERRAIN_STYLE}),
    TaskSpec('hole.world.normalize', '1', 'hole', ('hole.terrain.compile',), _world_eval('normalize', 'studyHash'),
             impl_files=(script('normalize-study.py'), script('build-course-world.py')), estimated_bytes=5_000_000),
    TaskSpec('hole.world.compile', '1', 'hole', ('hole.world.normalize',), _world_eval('compile', 'physicalWorldHash'),
             impl_files=(script('compile-physical-world.py'), script('build-course-world.py')), estimated_bytes=20_000_000),
    TaskSpec('hole.truth_gate', '1', 'hole', ('hole.world.compile',), _world_eval('truth_gate', 'truthGatePassed'),
             impl_files=(script('course-truth-gate.py'),), estimated_bytes=100_000),
    TaskSpec('hole.glb.export', '1', 'hole', ('hole.world.compile',), _world_eval('glb_export', 'glbSha256'),
             impl_files=(script('build-course-world.py'), script('export-v2-glb.mts')), estimated_bytes=20_000_000),
    TaskSpec('hole.glb.roundtrip', '1', 'hole', ('hole.glb.export',), _world_eval('glb_roundtrip', 'glbSha256'),
             impl_files=(script('build-course-world.py'),), estimated_bytes=1_000_000),
    TaskSpec('hole.visual.canary', '1', 'hole', ('hole.terrain.compile', 'layout.context.classify?'), eval_visual_canary,
             impl_files=RENDERER_FILES + (script('capture-visual-canaries.cjs'),), estimated_bytes=50_000_000),
    TaskSpec('hole.player.capture', '1', 'hole', ('hole.visual.canary',), eval_player_capture,
             impl_files=RENDERER_FILES + (script('capture-player-view.cjs'),), estimated_bytes=50_000_000),
]
