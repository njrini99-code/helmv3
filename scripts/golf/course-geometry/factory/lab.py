"""The local lab: the Vite fixture server (browser.config.ts, 127.0.0.1:8768)
that draws the checked-in course fixtures with the production renderer. The
sign-off captures (hole.visual.canary, hole.player.capture) run against it.

Its course registry is static (src/test/fixtures/course-geometry/browser/
fixture-assets.ts): a course is served when its compiled directory under the
fixtures is hash-locked to the package the factory validated, which is the
check the lab's own loader makes before it draws a hole. Nothing here writes
under src; retaining a new course in the lab is a PR, like publishing."""
import os
import socket
import urllib.parse

LAB_BASE = 'http://127.0.0.1:8768'
FIXTURES = 'src/test/fixtures/course-geometry'


def fixture_manifest_path(ctx, layout_id):
    return os.path.join(ctx.repo_root, FIXTURES, f'compiled-{layout_id}', 'asset-manifest.json')


def fixture_package_path(ctx, layout_id):
    # The capture scripts read this file for the package hash they record.
    return os.path.join(ctx.repo_root, FIXTURES, f'{layout_id}.json')


def served(ctx, layout_id, hole_key):
    """(ok, evidence): whether the lab draws `hole_key` from the package the
    factory validated for `layout_id`, and which mesh it will draw."""
    package_hash = ctx.package_hash(layout_id)
    manifest = ctx.json(fixture_manifest_path(ctx, layout_id))
    fixture = ctx.json(fixture_package_path(ctx, layout_id))
    evidence = {'layoutId': layout_id, 'holeKey': hole_key, 'packageHash': (package_hash or '')[:12] or None,
                'labPackageHash': str((manifest or {}).get('geometryHash') or '')[:12] or None, 'fixture': ctx.relpath(fixture_manifest_path(ctx, layout_id))}
    if not manifest or not fixture:
        return False, {**evidence, 'detail': 'the lab renders checked-in fixtures only and this layout has none; retaining one is a PR'}
    if manifest.get('geometryHash') != package_hash or fixture.get('contentHash') != package_hash:
        return False, {**evidence, 'detail': 'the lab fixture is hash-locked to another package than the one the factory validated'}
    entry = (manifest.get('holes') or {}).get(hole_key)
    if not entry:
        return False, {**evidence, 'detail': f'the lab fixture does not list {hole_key}'}
    # The capture must describe the mesh this node fingerprints: when the
    # factory has compiled the hole, it is the mesh the lab has to draw.
    compiled = ctx.compiled_dir(layout_id, hole_key)
    report = ctx.json(os.path.join(compiled, f'{hole_key}-report.json')) if compiled else None
    if report and report.get('contentHash') != entry.get('contentHash'):
        return False, {**evidence, 'labTerrainHash': str(entry.get('contentHash'))[:12], 'terrainHash': str(report.get('contentHash'))[:12],
                       'detail': 'the lab fixture holds another compile of this hole than the one the factory built'}
    return True, {**evidence, 'terrainHash': entry.get('contentHash')}


def listening(base=LAB_BASE, timeout=1.0):
    url = urllib.parse.urlsplit(base)
    try:
        with socket.create_connection((url.hostname, url.port or 80), timeout=timeout):
            return True
    except OSError:
        return False


def expected_captures(hole, presets, viewports):
    return {(int(hole), preset, viewport) for preset in presets for viewport in viewports}


def canary_problem(report, hole, presets, viewports, terrain_hash, out_dir):
    """Why a canary matrix does not stand as this node's output, or None.

    The script's exit code is not the verdict: it exits 1 for a draw-call
    budget breach as well as for a page error. A breach is a finding for the
    visual aggregate and the review queue; a page error, a missing capture or
    a capture of a different mesh than the one this node fingerprints is a
    failure of the capture itself."""
    if not report:
        return 'CAPTURE_REPORT_MISSING: canaries.json was not written'
    errors = report.get('errors') or []
    if errors:
        return f'PAGE_ERRORS: {len(errors)} page error(s); first: {errors[0].get("message", errors[0])}'
    captures = report.get('captures') or []
    got = {(int(c.get('hole', -1)), c.get('preset'), c.get('viewport')) for c in captures}
    missing = sorted(expected_captures(hole, presets, viewports) - got)
    if missing:
        return f'CAPTURE_MISSING: {len(missing)} of {len(presets) * len(viewports)} captures absent from the report; first: {missing[0]}'
    absent = [c['file'] for c in captures if not os.path.isfile(os.path.join(out_dir, c['file']))]
    if absent:
        return f'CAPTURE_MISSING: {len(absent)} image(s) named by the report are not on disk; first: {absent[0]}'
    drawn = {(c.get('metadata') or {}).get('terrainHash') for c in captures}
    if terrain_hash and drawn != {terrain_hash}:
        other = next(iter(drawn - {terrain_hash}), None)
        return f'CAPTURE_MESH_MISMATCH: the lab drew {str(other)[:12]}, this node fingerprints {terrain_hash[:12]}'
    return None


def player_problem(doc, image_path, terrain_hash):
    """Why one player-view capture does not stand, or None (same rule as the canaries)."""
    if not doc:
        return f'CAPTURE_REPORT_MISSING: {os.path.basename(image_path)[:-4]}.json was not written'
    errors = doc.get('errors') or []
    if errors:
        return f'PAGE_ERRORS: {len(errors)} page error(s); first: {errors[0]}'
    if not os.path.isfile(image_path):
        return f'CAPTURE_MISSING: {os.path.basename(image_path)} is not on disk'
    drawn = (doc.get('dataset') or {}).get('terrainHash')
    if terrain_hash and drawn != terrain_hash:
        return f'CAPTURE_MESH_MISMATCH: the lab drew {str(drawn)[:12]}, this node fingerprints {terrain_hash[:12]}'
    return None


def budget_breaches(captures):
    """Captures whose draw calls exceeded the renderer's budget (§106)."""
    return [{'hole': c.get('hole'), 'file': c.get('file'), 'drawCalls': (c.get('metadata') or {}).get('drawCalls'),
             'drawCallBudget': (c.get('metadata') or {}).get('drawCallBudget'), 'status': (c.get('metadata') or {}).get('drawCallStatus')}
            for c in captures if (c.get('metadata') or {}).get('drawCallStatus') not in (None, 'within')]
