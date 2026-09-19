"""Hole-scoped tasks (Factory v2 §8.3). Each takes its hole's subhashes,
never the whole package hash, so one hole's edit stays one hole's rebuild."""
import os

from ..model import TaskSpec
from .common import (
    TERRAIN_COMPILER_FILES,
    artifact,
    dep_input,
    evaluation,
    exists,
    script,
)

TERRAIN_COMPILER = 'course-terrain-v4'
TERRAIN_STYLE = 'narrow-surround-v1'
RENDERER_FILES = ('src/lib/golf/course-geometry/three-renderer.ts', 'src/lib/golf/course-geometry/terrain-material.ts',
                  'src/lib/golf/course-geometry/ground-shader-v2.ts', 'src/lib/golf/course-geometry/visual-style.ts',
                  'src/lib/golf/course-geometry/render-quality.ts')


def _sub(ctx, node, name):
    sub = ctx.hole_subhashes(node.scope.layout_id, node.scope.ordinal)
    return sub.get(name) if sub else None


def eval_terrain_compile(node, ctx):
    layout_id = node.scope.layout_id
    context = ctx.context_layer(layout_id)
    context_ready = ctx.states.get(f'layout.context.classify[{layout_id}]') in ('cached', 'success')
    # Per-hole inputs only: the hole's golf geometry, canopy and the context
    # zones that touch it. The whole-layer hash is deliberately absent so a
    # zone edited on hole 12 leaves hole 3's compile cached.
    inputs = {'terrainSource': dep_input(ctx, node, 'layout.terrain.acquire'), 'holeTerrainInputHash': _sub(ctx, node, 'holeTerrainInputHash'),
              'holeContextHash': _sub(ctx, node, 'holeContextHash') if context_ready else None, 'withContext': context_ready}
    hole = ctx.package_hole(layout_id, node.scope.ordinal)
    folder = ctx.compiled_dir(layout_id, hole['key']) if hole else None
    if not hole or not folder or not ctx.can_adopt(folder):
        return evaluation(inputs)
    report_path = os.path.join(folder, f'{hole["key"]}-report.json')
    terrain_path = os.path.join(folder, f'{hole["key"]}-terrain.json')
    report = ctx.json(report_path)
    if not report:
        return evaluation(inputs)
    compilation = ctx.json(os.path.join(folder, 'compilation-report.json')) or {}
    assets = ctx.json(os.path.join(folder, 'asset-manifest.json')) or {}
    expected_context = (context or {}).get('contentHash') if context_ready else None
    per_hole_context = report.get('contextLayerHash', compilation.get('contextLayerHash'))
    checks = {
        'package': report.get('geometryHash') == ctx.package_hash(layout_id) and assets.get('geometryHash') == ctx.package_hash(layout_id),
        'terrain source': ctx.compiled_source_matches(layout_id, folder),
        'context layer': per_hole_context == expected_context,
        'compiler': assets.get('compilerVersion', compilation.get('compilerVersion')) == TERRAIN_COMPILER,
    }
    notes, adoptable = [], exists(terrain_path)
    for name, ok in checks.items():
        if not ok:
            adoptable = False
            notes.append(f'compiled {name} differs from the current input')
    if adoptable:
        notes.append(f'compiled terrain {report.get("contentHash", "")[:12]}, {report.get("triangles")} triangles')
    return evaluation(inputs, [], [artifact('terrain', terrain_path, 'C'), artifact('terrain-report', report_path, 'C')], adoptable, notes, output=report.get('contentHash'))


def eval_world_build(node, ctx):
    layout_id = node.scope.layout_id
    inputs = {'terrainSource': dep_input(ctx, node, 'layout.terrain.acquire'), 'holeGolfGeometryHash': _sub(ctx, node, 'holeGolfGeometryHash'),
              'holeCanopyHash': _sub(ctx, node, 'holeCanopyHash'), 'par': (ctx.package_hole(layout_id, node.scope.ordinal) or {}).get('par')}
    hole = ctx.package_hole(layout_id, node.scope.ordinal)
    if not hole:
        return evaluation(inputs)
    folder = os.path.join(ctx.layout_out(layout_id), 'world', 'holes', hole['key'])
    record = ctx.json(os.path.join(folder, 'record.json')) if ctx.can_adopt(folder) else None
    if not record:
        return evaluation(inputs)
    adoptable = record.get('packageHash') == ctx.package_hash(layout_id)
    notes = [f'world build {record.get("builtAt", "")[:10]}: truth gate {"passed" if record.get("truthGatePassed") else "failed"}'
             + ('' if record.get('blender', True) else ' (blender skipped)')]
    if not adoptable:
        notes.append('world build is for another package')
    artifacts = [artifact('world-record', os.path.join(folder, 'record.json'), 'C'), artifact('world-study', os.path.join(folder, 'study.json'), 'C'),
                 artifact('world-truth', os.path.join(folder, 'validation', 'course-truth.json'), 'C')]
    return evaluation(inputs, [], artifacts, adoptable, notes, output=record.get('physicalWorldHash'))


def eval_visual_canary(node, ctx):
    inputs = {'terrain': dep_input(ctx, node, 'hole.terrain.compile'), 'context': dep_input(ctx, node, 'layout.context.classify'),
              'holeDisplayInputHash': _sub(ctx, node, 'holeDisplayInputHash')}
    return evaluation(inputs)


def eval_player_capture(node, ctx):
    return evaluation({'canary': dep_input(ctx, node, 'hole.visual.canary')})


SPECS = [
    TaskSpec('hole.terrain.compile', TERRAIN_COMPILER, 'hole', ('layout.terrain.acquire', 'layout.package.validate', 'layout.context.classify?'), eval_terrain_compile,
             impl_files=TERRAIN_COMPILER_FILES, retention='C', estimated_bytes=5_000_000,
             settings={'style': TERRAIN_STYLE}),
    TaskSpec('hole.world.build', '1', 'hole', ('layout.package.validate', 'layout.terrain.acquire'), eval_world_build,
             impl_files=(script('build-course-world.py'), script('normalize-study.py'), script('compile-physical-world.py'), script('course-truth-gate.py')),
             estimated_bytes=30_000_000),
    TaskSpec('hole.visual.canary', '1', 'hole', ('hole.terrain.compile', 'layout.context.classify?'), eval_visual_canary,
             impl_files=RENDERER_FILES + (script('capture-visual-canaries.cjs'),), estimated_bytes=50_000_000),
    TaskSpec('hole.player.capture', '1', 'hole', ('hole.visual.canary',), eval_player_capture,
             impl_files=RENDERER_FILES + (script('capture-player-view.cjs'),), estimated_bytes=50_000_000),
]
