"""Executors: how each factory task actually runs. Every one wraps an
existing pipeline script unchanged (Factory v2 §31 anti-goal: no geospatial
rewrites) or a bounded provider request the scripts themselves would make.
Executors are injected through the Context, so tests replace them with fakes
and never touch the network."""
import hashlib
import json
import math
import os
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from contextlib import contextmanager

import fcntl

from physical_admission import review_input_hash
from source_geometry import resolved_routes

from . import imagery, lab
from .fingerprints import digest, file_sha256, terrain_source_identity
from .model import Blocker, Precondition
from .planner import DONE
from .providers import select_terrain_provider
from .tasks import facility_tasks
from .tasks.common import artifact, script

OVERPASS = 'https://overpass-api.de/api/interpreter'
USER_AGENT = 'GolfHelm course-geometry factory (bounded, one request per facility revision)'
MAX_AOI_BYTES = 4_000_000
VISUAL_TERRAIN_DERIVED_RESOLUTIONS_M = (2, 4, 8, 12, 16)
# A new source-frame validator must not reinterpret an older visual terrain
# cache. The older cache remains retained evidence; v2 is a separate derived
# scene source made under the current visual-only contract.
NC_VISUAL_TERRAIN_CACHE_REVISION = 'nc-native-frame-v3'
VISUAL_TERRAIN_DERIVED_CACHE_REVISION = 'v2'


def terrain_acquisition_precondition(error, layout_id, provider, source_selection_dossier_path=None):
    """Turn known evidence gaps into actionable blocked tasks, never failures.

    The compiler raises a detailed exception because it does not know the
    factory task graph.  Here those expected, provenance-preserving refusals
    become stable work-queue reasons. Unknown errors still fail loudly.
    """
    message = str(error)
    if 'NC_SOURCE_SELECTION_UNRESOLVED' in message:
        details = {
            'layoutId': layout_id,
            'provider': provider.compiler_id,
            'remediation': 'review the retained candidate raster dossier; physical terrain remains unavailable until one source is approved',
        }
        if source_selection_dossier_path:
            details['sourceSelectionDossierPath'] = source_selection_dossier_path
        return Precondition(Blocker('NC_SOURCE_SELECTION_UNRESOLVED', details))
    if 'No native-1m tile set covers the full bounded course context' in message:
        return Precondition(Blocker('NATIVE_TERRAIN_COVERAGE_GAP', {
            'layoutId': layout_id,
            'provider': provider.compiler_id,
            'remediation': 'acquire a full-coverage native terrain product or retain a visual-only fallback without measurement authority',
        }))
    if 'Every covering terrain tile exported empty fill over the course context' in message:
        return Precondition(Blocker('TERRAIN_EXPORT_EMPTY', {
            'layoutId': layout_id,
            'provider': provider.compiler_id,
            'remediation': 'the provider returned no usable elevation samples; acquire another terrain product before rendering terrain or measuring',
        }))
    if 'VERTICAL_UNIT_UNKNOWN' in message:
        return Precondition(Blocker('VERTICAL_UNIT_UNKNOWN', {
            'layoutId': layout_id,
            'provider': provider.compiler_id,
            'remediation': 'verify an independent vertical CRS/unit before using terrain for physical measurements',
        }))
    if 'SOURCE_FRAME_UNVERIFIED' in message:
        return Precondition(Blocker('SOURCE_FRAME_UNVERIFIED', {
            'layoutId': layout_id,
            'provider': provider.compiler_id,
            'remediation': 'retain the legacy source cache; acquire a new source revision with the current horizontal and vertical frame contract before measurement use',
        }))
    return None


def context_classification_precondition(error, layout_id):
    """A context zone that still reaches past the runtime's 5 km local frame
    (project.ts, geodesy.ts) after clipping is a data problem, not a script
    crash: surface it as a stable, actionable blocked task."""
    message = str(error)
    if 'LOCAL_FRAME_EXTENT_EXCEEDED' in message:
        return Precondition(Blocker('LOCAL_FRAME_EXTENT_EXCEEDED', {
            'layoutId': layout_id,
            'remediation': 'a retained OSM way still reaches past the 5 km local frame after the fixed clip margin; '
                           'review the course AOI/margin or the offending way before classifying context again',
        }))
    return None


def canopy_source_precondition(error, layout_id):
    """Classify bounded upstream imagery outages without faking canopy data."""
    message = str(error)
    if any(token in message for token in ('HTTP Error 500', 'HTTP Error 502', 'HTTP Error 503', 'HTTP Error 504', 'timed out', 'TimeoutError')):
        return Precondition(Blocker('CANOPY_SOURCE_TRANSIENT', {
            'layoutId': layout_id,
            'remediation': 'retry the bounded imagery acquisition later; canopy remains unavailable and cannot be used as obstacle or physical evidence',
        }))
    return None


def _write_json(path, doc):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(doc, f, indent=1, ensure_ascii=False, sort_keys=True)
        f.write('\n')


def run_command(ctx, run, node, command, env=None, check=True):
    """Run one command from the repo root, appending stdout/stderr to the
    node's run log. Raises with the tail of the output on failure unless the
    caller judges the outcome from what the command wrote (check=False)."""
    log_path = run.log_path(node)
    os.makedirs(os.path.dirname(log_path), exist_ok=True)
    command = [str(a) for a in command]
    with open(log_path, 'a', encoding='utf-8') as log:
        log.write('$ ' + ' '.join(command) + '\n')
        log.flush()
        result = subprocess.run(command, cwd=ctx.repo_root, stdout=log, stderr=subprocess.STDOUT, text=True,
                                env={**os.environ, **(env or {})}, check=False)
    if check and result.returncode != 0:
        with open(log_path, encoding='utf-8') as log:
            tail = log.read()[-1500:]
        raise RuntimeError(f'{os.path.basename(command[1] if len(command) > 1 else command[0])} exited {result.returncode}\n{tail}')
    return result


def run_script(ctx, run, node, script_rel, args, env=None):
    """Run one pipeline script (python) from the repo root."""
    return run_command(ctx, run, node, [sys.executable, ctx.abspath(script_rel), *args], env=env)


def safe_rmtree(ctx, path):
    """Derived outputs are regenerated into empty directories; only the
    factory's own output root is ever cleared."""
    if not ctx.inside_output(path):
        raise RuntimeError(f'refusing to delete outside the factory output root: {path}')
    shutil.rmtree(path)


def visual_source_cache_complete(path):
    """Whether a retained visual-terrain directory is reusable as a unit.

    A source manifest is written near the end of acquisition, but class-C
    eviction can later remove its large raster while deliberately retaining
    the small manifest.  Treating the manifest alone as a cache hit makes a
    visual fallback retry the same broken directory.  This is intentionally a
    file-presence check only: physical source validation remains in the terrain
    compiler and a visual cache can never supply physical measurements.
    """
    manifest_path = os.path.join(path, 'source-manifest.json')
    if not os.path.isfile(manifest_path):
        return False
    try:
        with open(manifest_path, encoding='utf-8') as stream:
            manifest = json.load(stream)
    except (OSError, json.JSONDecodeError):
        return False
    hashes = manifest.get('fileHashes')
    if not isinstance(hashes, dict) or not hashes:
        return False
    return all(
        isinstance(name, str)
        and os.path.basename(name) == name
        and os.path.isfile(os.path.join(path, name))
        for name in hashes
    )


def reset_incomplete_visual_source_cache(ctx, path):
    """Evict only an incomplete generated visual cache before retrying it."""
    if os.path.isdir(path) and not visual_source_cache_complete(path):
        safe_rmtree(ctx, path)


@contextmanager
def derived_output_lock(ctx, path):
    """Serialize replacement of one derived output across factory processes.

    Batch retries can legitimately overlap (for example, an operator retries a
    failed layout while a catalog run is completing).  The output itself is
    deliberately replaceable, so a process that sees an incomplete cache must
    not remove it while another process is still writing its raster or world.
    The sidecar lock is outside the replaceable directory and is released by
    the kernel if the owning process exits.
    """
    lock_path = path + '.lock'
    if not ctx.inside_output(lock_path):
        raise RuntimeError(f'refusing to lock outside the factory output root: {lock_path}')
    os.makedirs(os.path.dirname(lock_path), exist_ok=True)
    with open(lock_path, 'a+', encoding='utf-8') as handle:
        fcntl.flock(handle.fileno(), fcntl.LOCK_EX)
        try:
            yield
        finally:
            fcntl.flock(handle.fileno(), fcntl.LOCK_UN)


def visual_terrain_source_root(ctx, facility_id, package, provider):
    """A visual-only cache namespace that never reinterprets older frames."""
    suffix = NC_VISUAL_TERRAIN_CACHE_REVISION if provider.compiler_id == 'nc_onemap_dem03' else 'perimeter-v1'
    return os.path.join(
        ctx.facility_out(facility_id), 'visual-terrain', f"{package['contentHash'][:12]}-{suffix}",
    )


def visual_terrain_candidate_path(source_root, resolution_m):
    return f'{source_root}-visual-r{resolution_m}m-{VISUAL_TERRAIN_DERIVED_CACHE_REVISION}'


# --- facility -------------------------------------------------------------
OVERPASS_RETRY_SECONDS = (5, 20, 60)   # the public endpoint answers 429/504 under load; three bounded retries, then the run records the failure


def overpass(query, limit, sleep=time.sleep):
    request = urllib.request.Request(OVERPASS, data=urllib.parse.urlencode({'data': query}).encode(), headers={'User-Agent': USER_AGENT})
    for attempt, wait in enumerate((*OVERPASS_RETRY_SECONDS, None)):
        try:
            with urllib.request.urlopen(request, timeout=120) as response:
                raw = response.read(limit + 1)
            break
        except urllib.error.HTTPError as exc:
            if exc.code not in (429, 502, 503, 504) or wait is None:
                raise
            sleep(wait)
    if len(raw) > limit:
        raise ValueError('Overpass response exceeds the bounded budget')
    return raw


# facility.aoi.resolve's executor now lives in tasks/facility_tasks.py
# (facility_tasks.resolve_aoi): the fetch bbox must cover every catalogued
# layout's pinned routeWayIds, not only the AOI element itself, so it needs
# the catalog (ctx.catalog.layouts_of), which this module doesn't otherwise
# touch.


def write_card(ctx, facility_id):
    """The scorecard-shaped facility card the fetchers read: bbox, site, name."""
    facility = ctx.facility(facility_id)
    aoi = ctx.aoi(facility_id)
    card = {'siteId': 'osm-' + facility['aoi']['id'].replace('/', '-'), 'name': facility['name'], 'slug': facility_id,
            'originWgs84': facility['originWgs84'], 'bboxWgs84': aoi['bboxWgs84'], 'aoiElement': aoi['element']}
    path = ctx.card_path(facility_id)
    _write_json(path, card)
    return path


def extract_complete(folder):
    """The fetch scripts write the gzip first and the manifest last, so a
    manifest beside its extract means the fetch finished."""
    return os.path.isfile(os.path.join(folder, 'manifest.json')) and os.path.isfile(os.path.join(folder, 'overpass.json.gz'))


def _snapshot(node, ctx, run, kind, script_rel, keys):
    """Retained extracts are immutable, so a re-run never overwrites one:
    a complete extract for the same AOI is reused (an implementation change
    re-records it under the new fingerprint without a network call), and a
    manual invalidation fetches a new revision directory and moves the
    pointer to it."""
    facility_id = node.scope.facility_id
    card = write_card(ctx, facility_id)
    base = os.path.join(ctx.facility_out(facility_id), kind)
    aoi_key = ctx._aoi_key(facility_id)
    out = ctx.snapshot_dir(facility_id, kind)
    success = ctx.ledger.last_success(node.key) if ctx.ledger else None
    manual = ctx.ledger.invalidation_after(node.key, success['finished_at']) if success else None
    if manual or (os.path.isdir(out) and not extract_complete(out)):
        # A partial directory (interrupted fetch) or an explicit request for
        # fresh data: fetch into the next revision beside it.
        if os.path.isdir(out) and not extract_complete(out):
            safe_rmtree(ctx, out)
        n = 2
        while os.path.exists(os.path.join(base, f'{aoi_key}-r{n}')):
            n += 1
        out = os.path.join(base, f'{aoi_key}-r{n}') if os.path.exists(out) else out
    if not extract_complete(out):
        run_script(ctx, run, node, script_rel, [card, out])
    else:
        with open(run.log_path(node), 'a', encoding='utf-8') as log:
            log.write(f'{node.key}: reused the complete immutable extract at {ctx.relpath(out)}\n')
    _write_json(ctx.snapshot_pointer_path(facility_id, kind), {'kind': 'golfhelm-factory-snapshot-pointer-v1', 'facilityId': facility_id, 'aoiKey': aoi_key,
                                                                'directory': ctx.relpath(out), 'revision': os.path.basename(out)})
    ctx.forget(ctx.snapshot_pointer_path(facility_id, kind))
    return [artifact(keys[0], os.path.join(out, 'manifest.json'), 'A'), artifact(keys[1], os.path.join(out, 'overpass.json.gz'), 'A')]


def snapshot_osm(node, ctx, run):
    return _snapshot(node, ctx, run, 'osm', 'scripts/golf/course-geometry/fetch-osm-course.py', ('osm-manifest', 'osm-extract'))


def snapshot_context(node, ctx, run):
    return _snapshot(node, ctx, run, 'osm-context', 'scripts/golf/course-geometry/fetch-osm-context.py', ('osm-context-manifest', 'osm-context-extract'))


# --- layout ---------------------------------------------------------------
def resolve_routes(node, ctx, run):
    layout_id = node.scope.layout_id
    resolution = ctx.route_resolution(layout_id)
    if not resolved_routes(resolution):
        raise RuntimeError('routes are not resolvable; the plan should have blocked this node')
    path = ctx.routes_path(layout_id)
    _write_json(path, {'kind': 'golfhelm-factory-routes-v1', 'layoutId': layout_id, **resolution})
    return [artifact('routes', path, 'A')]


def write_route_dossier(node, ctx, run):
    """Write auditable OSM route evidence without admitting an unconfirmed route.

    The dossier is intentionally separate from the canonical world. A route
    enters canonical geometry only through ``layout.routes.resolve`` after it
    is uniquely sourced or explicitly human-pinned.
    """
    layout_id = node.scope.layout_id
    layout = ctx.layout(layout_id) or {}
    card = ctx.scorecard(layout_id) or {}
    resolution = ctx.route_resolution(layout_id) or {}
    manifest, _extract = ctx.snapshot(node.scope.facility_id)
    route_ids = resolution.get('routeWayIds')
    attempts = (resolution.get('evidence') or {}).get('attempts') or []
    if resolved_routes(resolution):
        status = 'resolved'
        truth_class = 'derived'
        remediation = []
    else:
        status = 'source_confirmation_required'
        truth_class = None
        remediation = [
            'Review the retained OSM candidates against current orthophotography and the scorecard; pin routeWayIds only when the complete ordered route is verified.',
            'If the extract has missing hole references, acquire an authoritative course map, a current orthophoto-derived route, or a human-reviewed source vector. Do not infer a route from scorecard distance.',
        ]
    doc = {
        'schema': 'golfhelm-factory-route-review-v1',
        'layoutId': layout_id,
        'layoutName': layout.get('name'),
        'status': status,
        # ``None`` means this dossier did not admit a canonical physical
        # route. It must never be interpreted as an estimated route.
        'truthClass': truth_class,
        'canonicalRouteAdmitted': resolved_routes(resolution),
        'routeWayIds': route_ids,
        'routeSource': resolution.get('source'),
        'routeResolution': resolution,
        'extractSha256': (manifest or {}).get('uncompressedSha256'),
        'expectedSource': 'a complete ordered route set from a current authoritative map, a reviewed source vector, or uniquely identified OSM hole ways',
        'scorecard': {
            'profileId': card.get('profileId'),
            'source': card.get('source'),
            'holes': len(card.get('holes') or []),
        },
        'evidenceSummary': {
            'attempts': len(attempts),
            'candidateCounts': [attempt.get('candidates') for attempt in attempts],
            'missingRefs': [attempt.get('missingRefs') or [] for attempt in attempts],
            'duplicateRefs': [attempt.get('duplicateRefs') or {} for attempt in attempts],
        },
        'remediation': remediation,
    }
    path = os.path.join(ctx.layout_out(layout_id), 'route-review.json')
    _write_json(path, doc)
    return [artifact('route-review', path, 'C')]


def compose_visual_candidates(node, ctx, run):
    """Build or reuse the shared facility visual package for an unresolved layout.

    The facility package has no playable route. The per-layout pointer is the
    important boundary: it tells every later reader this is a render-only
    fallback for this particular unresolved layout, not a substitute for its
    canonical package.
    """
    layout_id, facility_id = node.scope.layout_id, node.scope.facility_id
    resolution = ctx.route_resolution(layout_id) or {}
    admission = ctx.canonical_route_admission(layout_id)
    pointer_path = ctx.visual_candidate_pointer_path(layout_id)
    if admission.get('admitted') and ctx.route_terrain_renderable(layout_id):
        _write_json(pointer_path, {
            'kind': 'golfhelm-layout-visual-candidate-pointer-v1', 'layoutId': layout_id, 'facilityId': facility_id,
            'status': 'not_required_source_route_available', 'canonicalHoleRoutesAdmitted': True,
            'routeSource': resolution.get('source'),
            'note': 'The route-specific candidate package is the only geometry input for this layout; no facility visual fallback was built.',
        })
        return [artifact('visual-candidate-pointer', pointer_path, 'C')]
    package_dir = ctx.visual_candidate_dir(layout_id)
    package_path = ctx.visual_candidate_package_path(layout_id)
    report_path = ctx.visual_candidate_report_path(layout_id)
    manifest, extract = ctx.snapshot(facility_id)
    if not manifest or not extract:
        raise RuntimeError('visual candidate requires a retained OSM snapshot')
    package = ctx.json(package_path, fresh=True) if os.path.isfile(package_path) else None
    report = ctx.json(report_path, fresh=True) if os.path.isfile(report_path) else None
    reuse = bool(package and report and package.get('kind') == 'golfhelm-facility-visual-package-v1'
                 and package.get('contentHash') and report.get('packageHash') == package.get('contentHash')
                 and report.get('extractSha256') == manifest.get('uncompressedSha256')
                 and (report.get('sourceCoverage') or {}).get('status') in {'sparse', 'contextual'}
                 and (report.get('visualReadiness') or {}).get('highFidelityHoleWorld') is False)
    if not reuse:
        if os.path.isdir(package_dir):
            safe_rmtree(ctx, package_dir)
        if not os.path.isfile(ctx.card_path(facility_id)):
            write_card(ctx, facility_id)
        run_script(ctx, run, node, 'scripts/golf/course-geometry/prepare-osm-facility-visual.py', [extract, ctx.card_path(facility_id), package_dir])
        package = ctx.json(package_path, fresh=True)
        report = ctx.json(report_path, fresh=True)
    route_status = 'unresolved' if not admission.get('admitted') else 'route_admitted_terrain_unavailable'
    _write_json(pointer_path, {
        'kind': 'golfhelm-layout-visual-candidate-pointer-v1', 'layoutId': layout_id, 'facilityId': facility_id,
        'packagePath': ctx.relpath(package_path), 'packageHash': package['contentHash'],
        'extractSha256': manifest.get('uncompressedSha256'), 'canonicalHoleRoutesAdmitted': False,
        'routeStatus': route_status, 'renderingContract': report['renderingContract'],
        'sourceCoverage': report['sourceCoverage'], 'visualReadiness': report['visualReadiness'],
    })
    ref = artifact('package', package_path, 'C')
    ref.sha256 = package['contentHash']
    return [artifact('visual-candidate-pointer', pointer_path, 'C'), ref,
            artifact('visual-candidate-report', report_path, 'C')]


def acquire_visual_terrain_source(node, ctx, run, layout_id, provider, source_root, base_args):
    """Acquire or reuse a fully written visual source under the caller lock."""
    source = source_root
    # Keep the provider's native-size cap hard.  A facility that exceeds that
    # one-request limit receives a separately versioned derived raster solely
    # for a non-measurable visual scene. Nothing in this branch can make it a
    # route, terrain measurement, shot constraint, or hole association.
    # The native physical attempt and every visual tier use distinct cache
    # identities.  A failed physical attempt may leave source-selection
    # metadata behind, but it must not become the visual fallback's identity.
    reset_incomplete_visual_source_cache(ctx, source)
    try:
        run_script(ctx, run, node, 'scripts/golf/course-geometry/compile-course-terrain.py', [*base_args, '--source', source])
    except RuntimeError as error:
        failure = str(error)
        source_coverage_gap = provider.compiler_id == 'usgs_3dep_project_1m' and 'No native-1m tile set covers' in failure
        vertical_unknown = provider.compiler_id == 'nc_onemap_dem03' and 'VERTICAL_UNIT_UNKNOWN' in failure
        source_selection_unresolved = provider.compiler_id == 'nc_onemap_dem03' and 'NC_SOURCE_SELECTION_UNRESOLVED' in failure
        precondition = terrain_acquisition_precondition(error, layout_id, provider)
        if precondition and 'Every covering terrain tile exported empty fill' in failure:
            raise precondition from error
        if provider.compiler_id not in ('nc_onemap_dem03', 'usgs_3dep_project_1m') or ('pixel cap' not in failure and not source_coverage_gap and not vertical_unknown and not source_selection_unresolved):
            raise
        for resolution_m in VISUAL_TERRAIN_DERIVED_RESOLUTIONS_M:
            candidate = visual_terrain_candidate_path(source_root, resolution_m)
            # Retention class C is allowed to evict the raster while keeping
            # its manifest. Require all manifest-listed files before reuse;
            # otherwise start this derived visual cache fresh.
            reset_incomplete_visual_source_cache(ctx, candidate)
            try:
                run_script(ctx, run, node, 'scripts/golf/course-geometry/compile-course-terrain.py', [*base_args, '--source', candidate,
                           '--rendering-only-resolution-m', str(resolution_m)])
            except RuntimeError as derived_error:
                # A 1 m source may need a coarser export for pixel budget;
                # a lower-resolution public fallback needs a render grid no
                # finer than its declared source spacing.  In both cases try
                # the next declared visual tier, never inventing resolution.
                if 'pixel cap' in str(derived_error) or 'No native-1m tile set covers' in str(derived_error):
                    continue
                raise
            source = candidate
            break
        else:
            raise RuntimeError('No bounded derived visual terrain resolution fits the provider acquisition cap') from error
    return source


def acquire_visual_terrain(node, ctx, run):
    """Acquire one source-hashed terrain raster for a facility visual scene."""
    layout_id, facility_id = node.scope.layout_id, node.scope.facility_id
    if (ctx.visual_candidate_pointer(layout_id) or {}).get('status') == 'not_required_source_route_available':
        pointer_path = ctx.visual_terrain_pointer_path(layout_id)
        _write_json(pointer_path, {
            'kind': 'golfhelm-layout-visual-terrain-pointer-v1', 'layoutId': layout_id, 'facilityId': facility_id,
            'status': 'not_required_source_route_available',
            'note': 'The route-specific terrain chain is authoritative for this layout.',
        })
        return [artifact('visual-terrain-pointer', pointer_path, 'C')]
    facility = ctx.facility(facility_id) or {}
    package = ctx.json(ctx.visual_candidate_package_path(layout_id), fresh=True)
    if not package:
        raise RuntimeError('visual terrain requires a facility visual package')
    provider = select_terrain_provider((facility.get('providerPolicy') or {}).get('terrain') or [])
    if provider is None:
        raise RuntimeError('no terrain acquisition adapter is available for the facility visual world')
    # New sources must record the perimeter-aware coverage contract. The
    # older directory is retained immutable evidence; it cannot be relabelled
    # after discovering an edge-coverage defect.
    source_root = visual_terrain_source_root(ctx, facility_id, package, provider)
    base_args = ['--acquire-only', '--provider', provider.compiler_id, '--holes', 'all', '--package', ctx.visual_candidate_package_path(layout_id),
                 '--output', os.path.join(ctx.facility_out(facility_id), 'visual-compiled')]
    with derived_output_lock(ctx, source_root):
        source = acquire_visual_terrain_source(node, ctx, run, layout_id, provider, source_root, base_args)
        manifest = ctx.json(os.path.join(source, 'source-manifest.json'), fresh=True)
    pointer_path = ctx.visual_terrain_pointer_path(layout_id)
    _write_json(pointer_path, {
        'kind': 'golfhelm-layout-visual-terrain-pointer-v1', 'layoutId': layout_id, 'facilityId': facility_id,
        'directory': ctx.relpath(source), 'packageHash': package['contentHash'],
        'sourceIdentity': terrain_source_identity(manifest), 'sourceManifestHash': digest(manifest),
        'providerPolicyId': provider.policy_id, 'selectedTitle': manifest.get('selectedTitle'),
        'renderingOnly': True, 'terrainTruthClass': 'visual_only',
        'sourceNativeResolutionM': manifest.get('sourceNativeResolutionM', manifest.get('nativeResolutionM')),
        'rasterResolutionM': manifest.get('nativeResolutionM'),
    })
    artifacts = [artifact('visual-terrain-pointer', pointer_path, 'C')]
    artifacts += [artifact(f'visual-terrain-{name}', os.path.join(source, name), 'C') for name in manifest.get('fileHashes') or {}]
    return artifacts


def _facility_visual_step(manifest):
    """A facility scene is background context, so cap its grid by visual
    importance. This only decimates source samples for rendering; it never
    changes the acquired raster or promotes the result into physical truth."""
    bounds = (manifest or {}).get('requestedLocalBoundsM') or []
    if len(bounds) != 4:
        return 12
    area = max(1, (bounds[2] - bounds[0]) * (bounds[3] - bounds[1]))
    return min(20, max(8, math.ceil(math.sqrt(area / 120_000))))


def build_visual_world(node, ctx, run):
    """Compile one GLB per facility and point each unresolved layout at it."""
    layout_id, facility_id = node.scope.layout_id, node.scope.facility_id
    if (ctx.visual_candidate_pointer(layout_id) or {}).get('status') == 'not_required_source_route_available':
        pointer_path = ctx.visual_world_pointer_path(layout_id)
        _write_json(pointer_path, {
            'kind': 'golfhelm-layout-visual-world-pointer-v1', 'layoutId': layout_id, 'facilityId': facility_id,
            'status': 'not_required_source_route_available', 'canonicalHoleRoutesAdmitted': True,
            'note': 'Use the route-specific world; a facility-only fallback would be less precise.',
        })
        return [artifact('visual-world-pointer', pointer_path, 'C')]
    package_path = ctx.visual_candidate_package_path(layout_id)
    package = ctx.json(package_path, fresh=True)
    source = ctx.visual_terrain_source_dir(layout_id)
    if not package or not source:
        raise RuntimeError('visual world requires the visual package and terrain source')
    key = package['holes'][0]['key']
    out = ctx.visual_world_dir(layout_id)
    manifest_path = os.path.join(out, 'course-world-manifest.json')
    glb_path = os.path.join(out, 'holes', key, 'rendering', f'{key}.glb')
    preview_path = os.path.join(out, 'holes', key, 'rendering', f'{key}-preview.png')
    source_manifest_path = os.path.join(source, 'source-manifest.json')
    source_manifest = ctx.json(source_manifest_path, fresh=True)
    with open(source_manifest_path, 'rb') as source_manifest_file:
        source_manifest_sha256 = hashlib.sha256(source_manifest_file.read()).hexdigest()
    # A world compile removes and recreates the whole derived directory.  Do
    # that atomically with respect to another factory run so a reader never
    # observes a half-replaced study.json/manifest pair.
    with derived_output_lock(ctx, out):
        current = ctx.json(manifest_path, fresh=True) if os.path.isfile(manifest_path) else None
        reuse = bool(current and current.get('packageHash') == package['contentHash']
                     and current.get('terrainSourceManifestSha256') == source_manifest_sha256
                     and os.path.isfile(glb_path) and os.path.isfile(preview_path))
        if not reuse:
            if os.path.isdir(out):
                safe_rmtree(ctx, out)
            step = _facility_visual_step(source_manifest)
            # Keep at least two visual-grid cells outside every source feature.
            # The extra sampled terrain is render support only; no semantic point
            # is moved or promoted into the physical model.
            terrain_guard_m = max(16, step * 2)
            run_script(ctx, run, node, 'scripts/golf/course-geometry/build-course-world.py',
                       [package_path, source, out, '--terrain-step-m', str(step), '--padding-m', str(terrain_guard_m)])
            current = ctx.json(manifest_path, fresh=True)
    pointer_path = ctx.visual_world_pointer_path(layout_id)
    _write_json(pointer_path, {
        'kind': 'golfhelm-layout-visual-world-pointer-v1', 'layoutId': layout_id, 'facilityId': facility_id,
        'visualPackageHash': package['contentHash'], 'facilityWorldManifest': ctx.relpath(manifest_path),
        'glb': ctx.relpath(glb_path), 'preview': ctx.relpath(preview_path),
        'canonicalHoleRoutesAdmitted': False,
        'renderingContract': {
            'canRender': True, 'canMeasure': False, 'maySupplyHoleAssociation': False,
            'rule': 'The GLB is facility context only until a separately reviewed tee-to-green route is admitted into canonical geometry.',
        },
        'truthGatePassed': bool(current.get('truthGatePassed')) if current else False,
    })
    return [artifact('visual-world-pointer', pointer_path, 'C'), artifact('visual-world-manifest', manifest_path, 'C'),
            artifact('visual-world-glb', glb_path, 'C'), artifact('visual-world-preview', preview_path, 'C')]


def compose_scorecard(node, ctx, run):
    layout_id = node.scope.layout_id
    doc = ctx.pilot_scorecard(layout_id)
    if not doc:
        raise RuntimeError('the pilot scorecard cannot be composed yet')
    path = ctx.scorecard_path(layout_id)
    _write_json(path, doc)
    return [artifact('scorecard', path, 'A')]


def _prepare(node, ctx, run, out, canopy=None):
    layout_id = node.scope.layout_id
    layout = ctx.layout(layout_id)
    _manifest, extract = ctx.snapshot(node.scope.facility_id)
    args = [extract, ctx.scorecard_path(layout_id), out]
    if canopy:
        args += ['--canopy-review', canopy]
    imported = ctx.retained(layout, 'sourceGeometry')
    if imported:
        args += ['--source-geometry', imported]
    route_traces = ctx.retained(layout, 'routeTraces')
    if route_traces:
        args += ['--route-traces', route_traces]
    traces = ctx.retained(layout, 'imageryTraces')
    if traces and os.path.isfile(traces):
        args += ['--traces', traces]
    if os.path.isdir(out):
        safe_rmtree(ctx, out)
    run_script(ctx, run, node, 'scripts/golf/course-geometry/prepare-osm-course.py', args)
    pkg = ctx.json(os.path.join(out, 'normalized.json'), fresh=True)
    ref = artifact('package', os.path.join(out, 'normalized.json'), 'A')
    ref.sha256 = pkg['contentHash']
    return [ref, artifact('association-report', os.path.join(out, 'association-report.json'), 'A'),
            artifact('source-metadata', os.path.join(out, 'source-metadata.json'), 'A')] + [
                artifact(name, os.path.join(out, name + '.json'), 'A')
                for name in ('source-geometry', 'route-traces', 'imagery-traces') if os.path.isfile(os.path.join(out, name + '.json'))]


def compose_candidates(node, ctx, run):
    return _prepare(node, ctx, run, ctx.candidates_dir(node.scope.layout_id))


def compose_package(node, ctx, run):
    canopy = ctx.canopy_path(node.scope.layout_id)
    canopy = canopy if ctx.states.get(f'layout.canopy.derive[{node.scope.layout_id}]') in ('cached', 'success') and os.path.isfile(canopy) else None
    return _prepare(node, ctx, run, ctx.package_dir(node.scope.layout_id), canopy)


def acquire_terrain(node, ctx, run):
    """Lock one native-1m tile for the candidate package's bounds. The source
    directory is keyed by the request bounds so a second layout (or a revised
    package) with the same footprint reuses the raster; the compiler refuses
    any other reuse itself."""
    layout_id = node.scope.layout_id
    facility = ctx.facility(node.scope.facility_id) or {}
    provider = select_terrain_provider((facility.get('providerPolicy') or {}).get('terrain') or [])
    if provider is None:
        raise RuntimeError('no terrain acquisition adapter is available; the plan should have blocked this node')
    pkg_path = ctx.candidates_package_path(layout_id)
    bounds = ctx.terrain_bounds(layout_id)
    key = digest(bounds)[:12]
    # Keep the old four-corner source immutable. Perimeter coverage plus a
    # native-grid buffer is a different acquired raster, not a metadata edit.
    source = os.path.join(ctx.facility_out(node.scope.facility_id), 'terrain', key + ('-nc-native-v2' if provider.compiler_id == 'nc_onemap_dem03' else '-perimeter-v1'))
    try:
        run_script(ctx, run, node, 'scripts/golf/course-geometry/compile-course-terrain.py',
                   ['--acquire-only', '--provider', provider.compiler_id, '--holes', 'all', '--package', pkg_path, '--source', source, '--output', ctx.terrain_base_out(layout_id)])
    except RuntimeError as error:
        dossier = os.path.join(source, 'source-selection-dossier.json')
        precondition = terrain_acquisition_precondition(
            error, layout_id, provider,
            ctx.relpath(dossier) if os.path.isfile(dossier) else None,
        )
        if precondition:
            raise precondition from error
        raise
    manifest = ctx.json(os.path.join(source, 'source-manifest.json'), fresh=True)
    pointer = {'kind': 'golfhelm-factory-terrain-source-v1', 'layoutId': layout_id, 'directory': ctx.relpath(source),
               'requestedLocalBoundsM': bounds, 'sourceManifestHash': digest(manifest), 'sourceIdentity': terrain_source_identity(manifest),
               'providerPolicyId': provider.policy_id, 'selectedTitle': manifest.get('selectedTitle')}
    _write_json(ctx.terrain_pointer_path(layout_id), pointer)
    # The source manifest is evidence, not a verified artifact: the compiler
    # appends every package it serves to it while the raster never changes.
    artifacts = [artifact('terrain-source-pointer', ctx.terrain_pointer_path(layout_id), 'A')]
    for name in manifest.get('fileHashes') or {}:
        artifacts.append(artifact(f'terrain-{name}', os.path.join(source, name), 'A'))
    return artifacts


def derive_canopy(node, ctx, run):
    layout_id = node.scope.layout_id
    source = ctx.terrain_source_dir(layout_id)
    naip = ctx.naip_out(layout_id)
    out = ctx.canopy_out(layout_id)
    args = [ctx.candidates_package_path(layout_id), source, naip, out]
    imagery = ctx.indexed_imagery(layout_id)
    if imagery:
        args += ['--imagery-index', imagery['path']]
    from .payload_reuse import load_receipt, retain_receipt, stage_identity
    package = ctx.json(ctx.candidates_package_path(layout_id), fresh=True)
    identity = stage_identity(ctx, node, package, {'imagery': imagery['identity'] if imagery else None})
    receipt = load_receipt(ctx, layout_id, 'canopy', identity)
    if receipt:
        document = ctx.json(out, fresh=True)
        if document.get('packageHash') != receipt['packageHash']:
            raise RuntimeError('reusable canopy envelope mismatch')
        _write_json(out, {**document, 'packageHash': package['contentHash']})
    else:
        try:
            run_script(ctx, run, node, 'scripts/golf/course-geometry/derive-canopy-naip.py', args)
        except RuntimeError as error:
            precondition = canopy_source_precondition(error, layout_id)
            if precondition:
                raise precondition from error
            raise
    paths = [out, os.path.join(naip, 'manifest.json'), os.path.join(naip, 'naip.tif')]
    retained = retain_receipt(ctx, layout_id, 'canopy', identity, package['contentHash'], paths)
    return [artifact('canopy-review', out, 'A'), artifact('naip-manifest', paths[1], 'B'), artifact('naip-raster', paths[2], 'B'),
            artifact('payload-reuse', retained, 'C')]


def _compile(node, ctx, run, holes, out, context=None):
    layout_id = node.scope.layout_id
    args = ['--holes', holes, '--package', ctx.package_path(layout_id), '--source', ctx.terrain_source_dir(layout_id), '--output', out]
    if context:
        args += ['--context', context]
    run_script(ctx, run, node, 'scripts/golf/course-geometry/compile-course-terrain.py', args)


def compile_terrain_base(node, ctx, run):
    layout_id = node.scope.layout_id
    out = ctx.terrain_base_out(layout_id)
    from .payload_reuse import (
        load_receipt,
        rebind_terrain,
        retain_receipt,
        stage_identity,
        terrain_files,
    )
    package = ctx.json(ctx.package_path(layout_id), fresh=True)
    identity = stage_identity(ctx, node, package)
    receipt = load_receipt(ctx, layout_id, 'terrain-base', identity)
    if receipt:
        rebind_terrain(out, package, receipt['packageHash'], ctx.terrain_source_manifest(layout_id))
    else:
        if os.path.isdir(out):
            safe_rmtree(ctx, out)
        _compile(node, ctx, run, 'all', out)
    retained = retain_receipt(ctx, layout_id, 'terrain-base', identity, package['contentHash'], terrain_files(out))
    return [artifact('compiled-base-assets', os.path.join(out, 'asset-manifest.json'), 'C'),
            artifact('compiled-base-report', os.path.join(out, 'compilation-report.json'), 'C'), artifact('payload-reuse', retained, 'C')]


def prepare_compiled_dir(ctx, layout_id):
    """Make the shared compiled directory accept this package's hole compiles.

    The compiler refuses a directory whose asset manifest names another
    package or source. A new source makes every mesh stale, so the directory
    is cleared. A new package hash does not: hole compiles key on their own
    hole's inputs, so the holes an edit did not touch stay cached and their
    files must stay in the directory and in the manifest. The manifest is
    relabelled with the new hash and keeps every listed hole still in the
    package whose file is present; a hole that does need work overwrites its
    own entry when it compiles. A kept entry cannot fake a cache hit: the
    planner trusts the ledger fingerprint and the per-hole report, never this
    manifest."""
    out = ctx.compiled_out(layout_id)
    path = os.path.join(out, 'asset-manifest.json')
    manifest = ctx.json(path, fresh=True)
    if not manifest:
        return out
    if manifest.get('sourceIdentity') != terrain_source_identity(ctx.terrain_source_manifest(layout_id)):
        # Another terrain source, or a manifest an older compiler wrote
        # without a source identity: nothing here is known to be current.
        safe_rmtree(ctx, out)
        ctx.forget(path)
        return out
    package = ctx.package(layout_id) or {}
    if manifest.get('geometryHash') == package.get('contentHash'):
        return out
    keys = {h['key'] for h in package.get('holes', [])}
    kept = {key: entry for key, entry in (manifest.get('holes') or {}).items()
            if key in keys and entry.get('fileName') and os.path.isfile(os.path.join(out, entry['fileName']))}
    _write_json(path, {**manifest, 'geometryHash': package['contentHash'], 'holes': dict(sorted(kept.items()))})
    ctx.forget(path)
    return out


def compile_hole_terrain(node, ctx, run):
    layout_id = node.scope.layout_id
    out = prepare_compiled_dir(ctx, layout_id)
    context = ctx.context_layer_path(layout_id)
    context = context if ctx.states.get(f'layout.context.classify[{layout_id}]') in ('cached', 'success') and os.path.isfile(context) else None
    _compile(node, ctx, run, str(node.scope.ordinal), out, context)
    hole = ctx.package_hole(layout_id, node.scope.ordinal)
    return [artifact('terrain', os.path.join(out, f'{hole["key"]}-terrain.json'), 'C'), artifact('terrain-report', os.path.join(out, f'{hole["key"]}-report.json'), 'C')]


def audit_imagery(node, ctx, run):
    layout_id = node.scope.layout_id
    out_dir = os.path.join(ctx.layout_out(layout_id), 'imagery-review')
    summary = ctx.imagery_review_out(layout_id)
    run_script(ctx, run, node, 'scripts/golf/course-geometry/review-course-imagery.py', [ctx.package_path(layout_id), ctx.naip_dir(layout_id), out_dir, summary])
    return [artifact('imagery-review', summary, 'A')]


def classify_context(node, ctx, run):
    layout_id = node.scope.layout_id
    out = os.path.join(ctx.layout_out(layout_id), 'context')
    os.makedirs(out, exist_ok=True)
    golf = os.path.join(ctx.osm_dir(node.scope.facility_id), 'overpass.json.gz')
    context = os.path.join(ctx.context_dir(node.scope.facility_id), 'overpass.json.gz')
    compiled = ctx.terrain_base_dir(layout_id)
    package = ctx.package_path(layout_id)
    from .payload_reuse import (
        load_receipt,
        rebind_context,
        retain_receipt,
        stage_identity,
    )
    package_doc = ctx.json(package, fresh=True)
    base_receipt = ctx.json(os.path.join(ctx.layout_out(layout_id), 'payload-reuse', 'terrain-base.json'), fresh=True)
    # A legacy base without a receipt remains safe but cannot skip context
    # classification on a card edit until a verified producer has run once.
    base_identity = (base_receipt or {}).get('inputHash') or file_sha256(os.path.join(compiled, 'asset-manifest.json'))
    identity = stage_identity(ctx, node, package_doc, {'golf': file_sha256(golf), 'context': file_sha256(context), 'base': base_identity})
    receipt = load_receipt(ctx, layout_id, 'context', identity)
    if receipt:
        rebind_context(ctx.context_layer_out(layout_id), ctx.context_report_out(layout_id), package_doc['contentHash'], receipt['packageHash'])
    else:
        try:
            run_script(ctx, run, node, 'scripts/golf/course-geometry/prepare-context-layer.py', [package, golf, context, compiled, out])
        except RuntimeError as error:
            precondition = context_classification_precondition(error, layout_id)
            if precondition:
                raise precondition from error
            raise
        # The script names outputs after the package file; the factory keeps
        # them under layout ID so retained and built layers share one path.
        stem = os.path.splitext(os.path.basename(package))[0]
        for suffix, target in (('-context.json', ctx.context_layer_out(layout_id)), ('-context-report.json', ctx.context_report_out(layout_id))):
            written = os.path.join(out, f'{stem}{suffix}')
            if os.path.abspath(written) != os.path.abspath(target):
                os.replace(written, target)
    retained = retain_receipt(ctx, layout_id, 'context', identity, package_doc['contentHash'],
                              [ctx.context_layer_out(layout_id), ctx.context_report_out(layout_id)])
    layer = ctx.json(ctx.context_layer_out(layout_id), fresh=True)
    ref = artifact('context-layer', ctx.context_layer_out(layout_id), 'A')
    ref.sha256 = layer['contentHash']
    return [ref, artifact('context-report', ctx.context_report_out(layout_id), 'A'), artifact('payload-reuse', retained, 'C')]


def build_hole_world(node, ctx, run):
    layout_id = node.scope.layout_id
    out = os.path.join(ctx.layout_out(layout_id), 'world')
    hole = ctx.package_hole(layout_id, node.scope.ordinal)
    args = [ctx.package_path(layout_id), ctx.terrain_source_dir(layout_id), out, '--holes', str(node.scope.ordinal)]
    admission_path = ctx.retained(ctx.layout(layout_id), 'physicalAdmission')
    if admission_path:
        args.extend(['--physical-admission', admission_path])
    if not shutil.which('blender'):
        args.append('--skip-blender')
    run_script(ctx, run, node, 'scripts/golf/course-geometry/build-course-world.py', args)
    # The driver rewrites the course manifest per invocation; keep this hole's
    # record beside its files so the aggregate can rebuild the course view.
    manifest = ctx.json(os.path.join(out, 'course-world-manifest.json'), fresh=True)
    record = next(h for h in manifest['holes'] if h['ordinal'] == node.scope.ordinal)
    record_path = os.path.join(out, 'holes', hole['key'], 'record.json')
    _write_json(record_path, {'packageHash': manifest['packageHash'], 'terrainRasterSha256': manifest['terrainRasterSha256'],
                              'terrainSourceIdentity': terrain_source_identity(ctx.terrain_source_manifest(layout_id)), 'builtAt': manifest['builtAt'],
                              'admissionReviewHash': review_input_hash(ctx.json(admission_path), hole['key']) if admission_path else None,
                              'blender': args[-1] != '--skip-blender', **record})
    return [artifact('world-record', record_path, 'C'), artifact('world-study', os.path.join(out, 'holes', hole['key'], 'study.json'), 'C'),
            artifact('world-truth', os.path.join(out, 'holes', hole['key'], 'validation', 'course-truth.json'), 'C')]


def aggregate_world(node, ctx, run):
    layout_id = node.scope.layout_id
    out = os.path.join(ctx.layout_out(layout_id), 'world')
    records = []
    for key in ctx.graph.layout_holes.get(layout_id, []):
        hole = ctx.package_hole(layout_id, int(key.rsplit(':', 1)[1]))
        record = ctx.json(os.path.join(out, 'holes', hole['key'], 'record.json'), fresh=True) if hole else None
        if record:
            records.append(record)
    manifest = {'schemaVersion': 1, 'kind': 'golfhelm-course-world-manifest-v1', 'layoutId': layout_id, 'packageHash': ctx.package_hash(layout_id),
                'holes': sorted(records, key=lambda r: r['ordinal']), 'truthGatePassed': all(r['truthGatePassed'] for r in records) if records else None,
                'publicationRule': 'No hole below passes the course truth gate unless its row says so; GLBs are visual review products only.'}
    path = os.path.join(out, 'course-world-manifest.json')
    _write_json(path, manifest)
    return [artifact('world-manifest', path, 'C')]


def aggregate_terrain(node, ctx, run):
    """Bind cached numeric payloads to the current package without rewriting
    their producer artifacts or pretending old serialized hashes are new."""
    from .payload_reuse import bind_verified_hole
    from .planner import verify_artifacts
    from .terrain_contract import conform_mesh
    layout_id = node.scope.layout_id
    package = ctx.package(layout_id)
    context_hash = (ctx.context_layer(layout_id) or {}).get('contentHash')
    bound = os.path.join(ctx.layout_out(layout_id), 'compiled-bound')
    os.makedirs(bound, exist_ok=True)
    reports, entries, artifacts = [], {}, []
    for scope_key in ctx.graph.layout_holes.get(layout_id, []):
        hole = ctx.package_hole(layout_id, int(scope_key.rsplit(':', 1)[1]))
        producer = ctx.rows.get(f'hole.terrain.compile[{scope_key}]')
        if not hole or not producer or producer.state not in DONE or not producer.artifacts:
            raise RuntimeError('current verified terrain producer required for package binding')
        problem = verify_artifacts(producer.artifacts)
        if problem:
            raise RuntimeError(f'terrain producer integrity failed: {problem[0]}')
        folder = ctx.compiled_dir(layout_id, hole['key'])
        mesh = ctx.json(os.path.join(folder, f'{hole["key"]}-terrain.json'), fresh=True)
        report = ctx.json(os.path.join(folder, f'{hole["key"]}-report.json'), fresh=True)
        # The producer's own mesh must verify before conformance rewrites a
        # contract field (terrain_contract.py); the rewrite is recorded on the
        # bound report and binding, never on the producer artifacts.
        producer_hash = mesh.get('contentHash') if mesh.get('contentHash') == report.get('contentHash') else None
        mesh, conformance = conform_mesh(mesh)
        if conformance:
            if producer_hash is None:
                raise RuntimeError('terrain producer mesh/report disagree; refusing contract conformance')
            report = {**report, 'contentHash': mesh['contentHash']}
        payload, compressed, entry, rebound_report, binding = bind_verified_hole(
            mesh, report, package, hole, producer.fingerprint, context_hash)
        if conformance:
            rebound_report['contractConformance'] = conformance
            binding.update({'contractConformance': conformance, 'producerMeshHash': producer_hash, 'conformedMeshHash': mesh['contentHash']})
        names = {f'{hole["key"]}-terrain.json': payload, entry['fileName']: compressed}
        for name, data in names.items():
            with open(os.path.join(bound, name), 'wb') as handle:
                handle.write(data)
            artifacts.append(artifact(name, os.path.join(bound, name), 'C'))
        for name, doc in ((f'{hole["key"]}-report.json', rebound_report), (f'{hole["key"]}-binding.json', binding)):
            _write_json(os.path.join(bound, name), doc)
            artifacts.append(artifact(name, os.path.join(bound, name), 'C'))
        entries[hole['key']] = entry
        reports.append({'key': hole['key'], 'ordinal': hole['ordinal'], 'contentHash': entry['contentHash'],
                        'triangles': report.get('triangles'), 'tJunctionVertices': (report.get('noding') or {}).get('tJunctionVertices'),
                        'asset': entry, 'producerFingerprint': producer.fingerprint})
    manifest_path = os.path.join(bound, 'asset-manifest.json')
    _write_json(manifest_path, {'schemaVersion': 1, 'compilerVersion': 'course-terrain-v4', 'geometryHash': package['contentHash'],
                               'sourceIdentity': terrain_source_identity(ctx.terrain_source_manifest(layout_id)), 'holes': entries})
    summary = {'kind': 'golfhelm-factory-terrain-summary-v1', 'layoutId': layout_id, 'packageHash': package['contentHash'],
               'sourceIdentity': terrain_source_identity(ctx.terrain_source_manifest(layout_id)), 'holes': sorted(reports, key=lambda r: r['ordinal'])}
    path = os.path.join(ctx.layout_out(layout_id), 'terrain-summary.json')
    _write_json(path, summary)
    return [artifact('terrain-summary', path, 'C'), artifact('bound-manifest', manifest_path, 'C'), *artifacts]


def review_queue(node, ctx, run):
    """What only a person can do next for this layout, from the evidence the
    machine stages left (Factory v2 §9)."""
    layout_id = node.scope.layout_id
    items = []
    routes = ctx.json(ctx.routes_path(layout_id), fresh=True)
    if routes and routes.get('source') != 'catalog':
        items.append({'pass': 'route_confirmation', 'code': 'HUMAN_ROUTE_CONFIRMATION_REQUIRED', 'evidence': routes.get('evidence'),
                      'action': 'confirm numbered hole identity against the course map; retain sourceGeometry bindings for traced routes or routeWayIds for OSM routes; neither is boundary approval'})
    currency = imagery.currency(ctx, layout_id)
    if currency and currency['predatesRenovation']:
        # The audit is blocked on this (a freshness failure, v2 §21.5); the
        # decision that unblocks it is a person's.
        items.append({'pass': 'imagery_currency', 'code': imagery.CODE, 'evidence': currency,
                      'action': 'retain a NAIP capture flown after the renovation (another year or provider) and re-derive canopy and the imagery audit, '
                                'or lift knownRenovationAfter in the catalog with a note saying why the change did not move these surfaces'})
    review = ctx.json(ctx.imagery_review_path(layout_id), fresh=True)
    if review and ctx.states.get(f'layout.imagery.audit[{layout_id}]') in DONE:
        flagged = [b for row in review.get('holes', []) for b in row.get('bunkers', []) if b.get('sandShareInside', 1) < review.get('lowSandShare', 0.35)]
        items.append({'pass': 'imagery_review', 'code': 'HUMAN_IMAGERY_REVIEW_REQUIRED',
                      'evidence': {'lowSandBunkers': len(flagged), 'holes': len(review.get('holes', [])), 'capturedAt': (review.get('imagery') or {}).get('capturedAt'),
                                   'knownRenovationAfter': (currency or {}).get('knownRenovationAfter')},
                      'action': 'walk the contact sheet; flag mis-traced or grass-faced bunkers; decide imagery currency'})
    report = ctx.json(ctx.context_report_path(layout_id), fresh=True)
    if report:
        over = [h for h in report.get('holes', []) if (h.get('uncertainShare') or 0) > 0.15]
        items.append({'pass': 'context_review', 'code': 'HUMAN_CONTEXT_REVIEW_REQUIRED', 'evidence': {'holesOverUncertainGate': len(over), 'holes': len(report.get('holes', []))},
                      'action': 'answer the §39 prompts per hole in QGIS; accept/reject zones in the sidecar'})
    visual = ctx.json(os.path.join(ctx.layout_out(layout_id), 'visual', 'visual-summary.json'), fresh=True)
    player = ctx.json(os.path.join(ctx.layout_out(layout_id), 'player', 'player-summary.json'), fresh=True)
    if (visual or player) and ctx.states.get(f'layout.visual.aggregate[{layout_id}]') in DONE:
        # The captures exist; what they show is a reader's call (master plan
        # §8 canary review, §106 draw-call budget, outside-world §39 gate).
        breaches = len((visual or {}).get('drawCallBreaches') or []) + len((player or {}).get('drawCallBreaches') or [])
        items.append({'pass': 'visual_signoff', 'code': 'HUMAN_VISUAL_SIGNOFF_REQUIRED',
                      'evidence': {'canaryCaptures': (visual or {}).get('captures'), 'playerCaptures': (player or {}).get('captures'), 'drawCallBreaches': breaches,
                                   'holesOverUncertainGate': len(((visual or {}).get('uncertainGate') or {}).get('fail') or []), 'sheets': (visual or {}).get('sheets') or []},
                      'action': 'walk the canary sheets per viewport and the player captures; clear or accept each draw-call breach; answer the §39 prompts for holes over the gate'})
    pkg = ctx.package(layout_id)
    if pkg:
        unreviewed = sum(1 for f in pkg.get('features', []) if f.get('kind') != 'route' and not f.get('reviewed'))
        items.append({'pass': 'boundary_review', 'code': 'HUMAN_BOUNDARY_REVIEW_REQUIRED', 'evidence': {'unreviewedFeatures': unreviewed, 'status': pkg.get('status')},
                      'action': 'review surface boundaries in the QGIS kit; apply the sidecar; approve the resulting package hash or lift source_candidate'})
    path = os.path.join(ctx.layout_out(layout_id), 'review-queue.json')
    _write_json(path, {'kind': 'golfhelm-factory-review-queue-v1', 'layoutId': layout_id, 'packageHash': ctx.package_hash(layout_id), 'items': items})
    return [artifact('review-queue', path, 'C')]


# --- sign-off captures (lab) --------------------------------------------------
def _lab_base(ctx):
    """The lab the captures run against. Its absence is a precondition, not a
    failure: the node closes as blocked and stays ready for the next run."""
    if not shutil.which('node'):
        raise Precondition(Blocker('TOOL_MISSING', {'tool': 'node', 'detail': 'the capture scripts run under node with playwright'}))
    if not lab.listening(lab.LAB_BASE):
        raise Precondition(Blocker('LAB_NOT_LISTENING', {'base': lab.LAB_BASE, 'detail': 'start it from the repo root: npx vite --config scripts/golf/course-geometry/browser.config.ts'}))
    return lab.LAB_BASE


def _lab_hole(node, ctx):
    hole = ctx.package_hole(node.scope.layout_id, node.scope.ordinal)
    ok, evidence = lab.served(ctx, node.scope.layout_id, hole['key'])
    if not ok:
        raise Precondition(Blocker('LAB_COURSE_NOT_SERVED', evidence))
    return hole, evidence['terrainHash']


def _fresh_dir(ctx, path):
    if os.path.isdir(path):
        safe_rmtree(ctx, path)
    os.makedirs(path)
    return path


def capture_visual_canary(node, ctx, run):
    """The sign-off matrix for one hole (master plan §8): every preset ×
    viewport in the task settings, drawn by the lab from the mesh this node
    fingerprints and captured by capture-visual-canaries.cjs into the hole's
    own directory. The report the script writes is the verdict, not its exit
    code: see lab.canary_problem."""
    layout_id, ordinal = node.scope.layout_id, node.scope.ordinal
    hole, terrain_hash = _lab_hole(node, ctx)
    base = _lab_base(ctx)
    presets, viewports = node.spec.settings['presets'], node.spec.settings['viewports']
    out = _fresh_dir(ctx, os.path.join(ctx.layout_out(layout_id), 'visual', 'holes', hole['key']))
    run_command(ctx, run, node, ['node', ctx.abspath(script('capture-visual-canaries.cjs')), f'--label={layout_id}/{hole["key"]}', f'--base={base}',
                                 f'--course={layout_id}', f'--holes={ordinal}', f'--presets={",".join(presets)}', f'--viewports={",".join(viewports)}', f'--out={out}'], check=False)
    report_path = os.path.join(out, 'canaries.json')
    report = ctx.json(report_path, fresh=True)
    problem = lab.canary_problem(report, ordinal, presets, viewports, terrain_hash, out)
    if problem:
        raise RuntimeError(problem)
    return [artifact('canaries', report_path, 'C')] + [artifact(f'capture:{c["file"]}', os.path.join(out, c['file']), 'C') for c in report['captures']]


def capture_player_view(node, ctx, run):
    """The production player view for one hole from the play fixture: one
    capture per (viewport, view) in the task settings, judged like the
    canaries (lab.player_problem)."""
    layout_id, ordinal = node.scope.layout_id, node.scope.ordinal
    hole, terrain_hash = _lab_hole(node, ctx)
    base = _lab_base(ctx)
    out = _fresh_dir(ctx, os.path.join(ctx.layout_out(layout_id), 'player', 'holes', hole['key']))
    artifacts = []
    for viewport, view in node.spec.settings['views']:
        image = os.path.join(out, f'{viewport}-{view}.png')
        run_command(ctx, run, node, ['node', ctx.abspath(script('capture-player-view.cjs')), f'--out={image}', f'--base={base}', f'--course={layout_id}',
                                     f'--hole={ordinal}', f'--viewport={viewport}', f'--view={view}'], check=False)
        doc = ctx.json(image[:-4] + '.json', fresh=True)
        problem = lab.player_problem(doc, image, terrain_hash)
        if problem:
            raise RuntimeError(f'{viewport} {view}: {problem}')
        artifacts += [artifact(f'player:{viewport}-{view}', image, 'C'), artifact(f'player:{viewport}-{view}:report', image[:-4] + '.json', 'C')]
    return artifacts


def _hole_reports(ctx, layout_id, folder, name):
    for hole in (ctx.package(layout_id) or {}).get('holes', []):
        doc = ctx.json(os.path.join(ctx.layout_out(layout_id), folder, 'holes', hole['key'], name), fresh=True)
        if not doc:
            raise RuntimeError(f'{folder}/holes/{hole["key"]}/{name} is missing; the hole captures have to succeed first')
        yield hole, doc


def aggregate_visual(node, ctx, run):
    """One canaries.json for the layout from the per-hole matrices (files
    named relative to the visual directory, so build-canary-sheet.py reads it
    unchanged), a contact sheet per viewport, and the summary a reader clears:
    draw-call budget breaches and holes over the uncertain gate."""
    layout_id = node.scope.layout_id
    root = os.path.join(ctx.layout_out(layout_id), 'visual')
    merged = {'kind': 'golfhelm-factory-canaries-v1', 'label': layout_id, 'course': layout_id, 'packageHash': ctx.package_hash(layout_id), 'base': None,
              'capturedAt': None, 'holes': [], 'presets': [], 'viewports': [], 'uncertainGate': {'max': None, 'contextLayerHash': None, 'pass': [], 'fail': [], 'unavailable': []},
              'captures': [], 'errors': []}
    for hole, report in _hole_reports(ctx, layout_id, 'visual', 'canaries.json'):
        merged['base'] = report.get('base')
        merged['capturedAt'] = max(filter(None, [merged['capturedAt'], report.get('capturedAt')]), default=None)
        merged['holes'].append(hole['ordinal'])
        merged['presets'] = merged['presets'] or list(report.get('presets') or [])
        merged['viewports'] = merged['viewports'] or list(report.get('viewports') or [])
        gate = report.get('uncertainGate') or {}
        merged['uncertainGate']['max'] = gate.get('max', merged['uncertainGate']['max'])
        merged['uncertainGate']['contextLayerHash'] = gate.get('contextLayerHash', merged['uncertainGate']['contextLayerHash'])
        for verdict in ('pass', 'fail', 'unavailable'):
            merged['uncertainGate'][verdict] += list(gate.get(verdict) or [])
        merged['captures'] += [{**c, 'file': f'holes/{hole["key"]}/{c["file"]}'} for c in report.get('captures') or []]
    for verdict in ('pass', 'fail', 'unavailable'):
        merged['uncertainGate'][verdict] = sorted(set(merged['uncertainGate'][verdict]))
    _write_json(os.path.join(root, 'canaries.json'), merged)
    sheets = []
    for viewport in merged['viewports']:
        sheet = os.path.join(root, f'sheet-{viewport}.png')
        run_script(ctx, run, node, script('build-canary-sheet.py'), [root, viewport, sheet])
        sheets.append(sheet)
    summary = {'kind': 'golfhelm-factory-visual-summary-v1', 'layoutId': layout_id, 'packageHash': merged['packageHash'], 'holes': len(merged['holes']),
               'captures': len(merged['captures']), 'presets': merged['presets'], 'viewports': merged['viewports'],
               'drawCallBreaches': lab.budget_breaches(merged['captures']), 'uncertainGate': merged['uncertainGate'],
               'sheets': [ctx.relpath(s) for s in sheets]}
    _write_json(os.path.join(root, 'visual-summary.json'), summary)
    return [artifact('canaries', os.path.join(root, 'canaries.json'), 'C'), artifact('visual-summary', os.path.join(root, 'visual-summary.json'), 'C')] + \
        [artifact(f'sheet:{os.path.basename(s)}', s, 'C') for s in sheets]


def aggregate_player(node, ctx, run):
    """The player captures of a layout in one summary (draw calls, budget
    status, chrome, errors per hole and view) and a sheet per viewport."""
    layout_id = node.scope.layout_id
    root = os.path.join(ctx.layout_out(layout_id), 'player')
    rows, breaches, views = [], [], []
    for hole in (ctx.package(layout_id) or {}).get('holes', []):
        # Each hole directory is rewritten whole by its capture node, so its
        # reports are exactly the views the task settings asked for.
        folder = os.path.join(root, 'holes', hole['key'])
        names = sorted(f[:-5] for f in os.listdir(folder) if f.endswith('.json')) if os.path.isdir(folder) else []
        if not names:
            raise RuntimeError(f'player/holes/{hole["key"]} has no captures; the hole captures have to succeed first')
        views = sorted(set(views) | set(names))
        for name in names:
            doc = ctx.json(os.path.join(folder, f'{name}.json'), fresh=True)
            dataset = doc.get('dataset') or {}
            row = {'hole': hole['ordinal'], 'key': hole['key'], 'capture': name, 'file': f'holes/{hole["key"]}/{name}.png', 'viewport': doc.get('viewport'), 'view': doc.get('view'),
                   'drawCalls': dataset.get('drawCalls'), 'drawCallBudget': dataset.get('drawCallBudget'), 'drawCallStatus': dataset.get('drawCallStatus'),
                   'renderTriangles': dataset.get('renderTriangles'), 'terrainHash': dataset.get('terrainHash'), 'chrome': doc.get('chrome'), 'errors': doc.get('errors') or []}
            rows.append(row)
            if row['drawCallStatus'] not in (None, 'within'):
                breaches.append({'hole': row['hole'], 'file': row['file'], 'drawCalls': row['drawCalls'], 'drawCallBudget': row['drawCallBudget'], 'status': row['drawCallStatus']})
    summary = {'kind': 'golfhelm-factory-player-summary-v1', 'layoutId': layout_id, 'packageHash': ctx.package_hash(layout_id), 'holes': len({r['hole'] for r in rows}),
               'captures': len(rows), 'views': views, 'drawCallBreaches': breaches, 'rows': rows}
    _write_json(os.path.join(root, 'player-summary.json'), summary)
    sheets = []
    for viewport in sorted({name.split('-', 1)[0] for name in views}):
        sheet = os.path.join(root, f'sheet-{viewport}.png')
        run_script(ctx, run, node, script('build-player-sheet.py'), [root, viewport, sheet])
        sheets.append(sheet)
    return [artifact('player-summary', os.path.join(root, 'player-summary.json'), 'C')] + [artifact(f'sheet:{os.path.basename(s)}', s, 'C') for s in sheets]


# --- publishing -----------------------------------------------------------------
def verify_publish(node, ctx, run):
    """Read-only check of what is published under public/ against the evidence
    the factory holds (Factory v2 §11): every URL in the published manifest
    resolves to a file whose content hash is the package, the compiled mesh
    of that hole or the context layer this layout's nodes fingerprint. A
    mismatch fails the node — the fix is a publishing PR, never a write here."""
    from .fingerprints import content_hash_matches
    from .publication import public_asset, publication_snapshot
    layout_id = node.scope.layout_id
    layout = ctx.layout(layout_id) or {}
    manifest_path = ctx.abspath((layout.get('geometry') or {}).get('published'))
    manifest = ctx.json(manifest_path, fresh=True) or {}
    public_root = os.path.join(ctx.repo_root, 'public')
    expected_package = ctx.package_hash(layout_id)
    checks = []
    inventory = publication_snapshot(ctx, layout_id)
    inventory_valid = not inventory['error'] and all(item.get('sha256') for item in inventory['assets'])

    def check(name, url, expected, read, producer_path):
        actual, actual_sha, expected_sha = None, None, None
        valid = False
        try:
            _path, raw = public_asset(public_root, url)
            doc = json.loads(raw)
            actual = read(doc)
            actual_sha = hashlib.sha256(raw).hexdigest()
            with open(producer_path, 'rb') as handle:
                producer_bytes = handle.read()
            expected_sha = hashlib.sha256(producer_bytes).hexdigest()
            valid = content_hash_matches(doc) and actual == expected and actual_sha == expected_sha
        except (OSError, ValueError, TypeError, AttributeError):
            valid = False
        checks.append({'name': name, 'url': url, 'expected': expected, 'actual': actual,
                       'expectedSha256': expected_sha, 'actualSha256': actual_sha, 'ok': valid})

    checks.append({'name': 'manifest.geometryVersion', 'url': ctx.relpath(manifest_path) if manifest_path else None, 'expected': expected_package,
                   'actual': manifest.get('geometryVersion'), 'ok': bool(manifest) and inventory_valid and manifest.get('geometryVersion') == expected_package})
    check('package', manifest.get('packageUrl'), expected_package, lambda d: d.get('contentHash'), ctx.package_path(layout_id))
    terrain_by_hole = manifest.get('terrainByHole') or {}
    for hole in (ctx.package(layout_id) or {}).get('holes', []):
        key = hole['key']
        folder = os.path.join(ctx.layout_out(layout_id), 'compiled-bound')
        report = ctx.json(os.path.join(folder, f'{key}-report.json')) if folder else None
        check(f'terrain:{key}', terrain_by_hole.get(key), (report or {}).get('contentHash'), lambda d: d.get('contentHash') if d.get('geometryHash') == expected_package else f'mesh of package {str(d.get("geometryHash"))[:12]}', os.path.join(folder, f'{key}-terrain.json'))
    context = ctx.context_layer(layout_id) if ctx.states.get(f'layout.context.classify[{layout_id}]') in DONE else None
    if manifest.get('contextLayerUrl') or context:
        check('contextLayer', manifest.get('contextLayerUrl'), (context or {}).get('contentHash'), lambda d: d.get('contentHash'), ctx.context_layer_path(layout_id))
    inventory_path = os.path.join(ctx.layout_out(layout_id), 'published-byte-inventory.json')
    _write_json(inventory_path, inventory)
    failed = [c for c in checks if not c['ok']]
    out = os.path.join(ctx.layout_out(layout_id), 'publish-verification.json')
    _write_json(out, {'kind': 'golfhelm-factory-publish-verification-v1', 'layoutId': layout_id, 'packageHash': expected_package, 'manifest': ctx.relpath(manifest_path) if manifest_path else None,
                      'checks': checks, 'ok': not failed, 'verifiedAt': datetime.now(timezone.utc).isoformat()})
    if failed:
        first = failed[0]
        raise RuntimeError(f'PUBLISH_MISMATCH: {len(failed)} of {len(checks)} published files differ from the evidence; first {first["name"]}: expected {str(first["expected"])[:12]}, published {str(first["actual"])[:12]}')
    return [artifact('publish-verification', out, 'C'), artifact('published-byte-inventory', inventory_path, 'C')]


DEFAULT_EXECUTORS = {
    'facility.aoi.resolve': facility_tasks.resolve_aoi,
    'facility.osm.snapshot': snapshot_osm,
    'facility.context.snapshot': snapshot_context,
    'layout.routes.resolve': resolve_routes,
    'layout.route.dossier': write_route_dossier,
    'layout.visual.candidates.compose': compose_visual_candidates,
    'layout.visual.terrain.acquire': acquire_visual_terrain,
    'layout.visual.world.build': build_visual_world,
    'layout.scorecard.compose': compose_scorecard,
    'layout.candidates.compose': compose_candidates,
    'layout.terrain.acquire': acquire_terrain,
    'layout.canopy.derive': derive_canopy,
    'layout.package.compose': compose_package,
    'layout.terrain.base': compile_terrain_base,
    'layout.imagery.audit': audit_imagery,
    'layout.context.classify': classify_context,
    'hole.terrain.compile': compile_hole_terrain,
    'hole.world.build': build_hole_world,
    'layout.terrain.aggregate': aggregate_terrain,
    'layout.world.aggregate': aggregate_world,
    'layout.review.queue': review_queue,
    'hole.visual.canary': capture_visual_canary,
    'hole.player.capture': capture_player_view,
    'layout.visual.aggregate': aggregate_visual,
    'layout.player.aggregate': aggregate_player,
    'layout.publish.verify': verify_publish,
}
