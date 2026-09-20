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

from . import lab
from .fingerprints import digest, terrain_source_identity
from .model import Blocker, Precondition
from .planner import DONE
from .tasks.common import artifact, script

OVERPASS = 'https://overpass-api.de/api/interpreter'
USER_AGENT = 'GolfHelm course-geometry factory (bounded, one request per facility revision)'
MAX_AOI_BYTES = 4_000_000


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


def resolve_aoi(node, ctx, run):
    """One bounded Overpass request for the facility's AOI element. Writes the
    element polygon (ways), its bbox and the margin bbox every fetcher uses."""
    facility = ctx.facility(node.scope.facility_id)
    kind, ident = facility['aoi']['id'].split('/')
    margin = facility['aoi']['marginM']
    raw = overpass(f'[out:json][timeout:60];{kind}({ident});out geom;', MAX_AOI_BYTES)
    doc = json.loads(raw)
    elements = doc.get('elements') or []
    if not elements:
        raise ValueError(f'Overpass returned no element for {facility["aoi"]["id"]}')
    points = []
    polygon = None
    for element in elements:
        if element.get('type') == 'way':
            polygon = [(p['lon'], p['lat']) for p in element.get('geometry') or []]
            points.extend(polygon)
        for member in element.get('members') or []:
            points.extend((p['lon'], p['lat']) for p in member.get('geometry') or [])
        bounds = element.get('bounds')
        if bounds and not points:
            points.extend([(bounds['minlon'], bounds['minlat']), (bounds['maxlon'], bounds['maxlat'])])
    if not points:
        raise ValueError('AOI element carries no geometry')
    west, south = min(p[0] for p in points), min(p[1] for p in points)
    east, north = max(p[0] for p in points), max(p[1] for p in points)
    lat = (south + north) / 2
    dlat = margin / 111_320
    dlon = margin / (111_320 * max(math.cos(math.radians(lat)), 0.2))
    aoi = {'kind': 'golfhelm-factory-aoi-v1', 'facilityId': facility['facilityId'], 'element': facility['aoi']['id'],
           'elementBboxWgs84': [round(west, 7), round(south, 7), round(east, 7), round(north, 7)], 'marginM': margin,
           'bboxWgs84': [round(west - dlon, 7), round(south - dlat, 7), round(east + dlon, 7), round(north + dlat, 7)],
           'centroidWgs84': [round((west + east) / 2, 7), round(lat, 7)], 'polygon': polygon,
           'retrievedAt': datetime.now(timezone.utc).date().isoformat(), 'endpoint': OVERPASS,
           'responseSha256': hashlib.sha256(raw).hexdigest(), 'license': 'ODbL-1.0', 'attribution': '© OpenStreetMap contributors'}
    path = ctx.aoi_path(facility['facilityId'])
    _write_json(path, aoi)
    return [artifact('aoi', path, 'A')]


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
    if not resolution or not resolution.get('routeWayIds'):
        raise RuntimeError('routes are not resolvable; the plan should have blocked this node')
    path = ctx.routes_path(layout_id)
    _write_json(path, {'kind': 'golfhelm-factory-routes-v1', 'layoutId': layout_id, **resolution})
    return [artifact('routes', path, 'A')]


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
    extract = os.path.join(ctx.osm_dir(node.scope.facility_id), 'overpass.json.gz')
    args = [extract, ctx.scorecard_path(layout_id), out]
    if canopy:
        args += ['--canopy-review', canopy]
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
            artifact('source-metadata', os.path.join(out, 'source-metadata.json'), 'A')]


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
    pkg_path = ctx.candidates_package_path(layout_id)
    bounds = ctx.terrain_bounds(layout_id)
    key = digest(bounds)[:12]
    source = os.path.join(ctx.facility_out(node.scope.facility_id), 'terrain', key)
    run_script(ctx, run, node, 'scripts/golf/course-geometry/compile-course-terrain.py',
               ['--acquire-only', '--holes', 'all', '--package', pkg_path, '--source', source, '--output', ctx.terrain_base_out(layout_id)])
    manifest = ctx.json(os.path.join(source, 'source-manifest.json'), fresh=True)
    pointer = {'kind': 'golfhelm-factory-terrain-source-v1', 'layoutId': layout_id, 'directory': ctx.relpath(source),
               'requestedLocalBoundsM': bounds, 'sourceManifestHash': digest(manifest), 'sourceIdentity': terrain_source_identity(manifest), 'selectedTitle': manifest.get('selectedTitle')}
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
    run_script(ctx, run, node, 'scripts/golf/course-geometry/derive-canopy-naip.py', [ctx.candidates_package_path(layout_id), source, naip, out])
    return [artifact('canopy-review', out, 'A'), artifact('naip-manifest', os.path.join(naip, 'manifest.json'), 'B'), artifact('naip-raster', os.path.join(naip, 'naip.tif'), 'B')]


def _compile(node, ctx, run, holes, out, context=None):
    layout_id = node.scope.layout_id
    args = ['--holes', holes, '--package', ctx.package_path(layout_id), '--source', ctx.terrain_source_dir(layout_id), '--output', out]
    if context:
        args += ['--context', context]
    run_script(ctx, run, node, 'scripts/golf/course-geometry/compile-course-terrain.py', args)


def compile_terrain_base(node, ctx, run):
    layout_id = node.scope.layout_id
    out = ctx.terrain_base_out(layout_id)
    if os.path.isdir(out):
        safe_rmtree(ctx, out)
    _compile(node, ctx, run, 'all', out)
    return [artifact('compiled-base-assets', os.path.join(out, 'asset-manifest.json'), 'C'), artifact('compiled-base-report', os.path.join(out, 'compilation-report.json'), 'C')]


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
    run_script(ctx, run, node, 'scripts/golf/course-geometry/prepare-context-layer.py', [package, golf, context, compiled, out])
    # The script names its outputs after the package file; the factory keeps
    # them under the layout id so retained and built layers share one path.
    stem = os.path.splitext(os.path.basename(package))[0]
    for suffix, target in (('-context.json', ctx.context_layer_out(layout_id)), ('-context-report.json', ctx.context_report_out(layout_id))):
        written = os.path.join(out, f'{stem}{suffix}')
        if os.path.abspath(written) != os.path.abspath(target):
            os.replace(written, target)
    layer = ctx.json(ctx.context_layer_out(layout_id), fresh=True)
    ref = artifact('context-layer', ctx.context_layer_out(layout_id), 'A')
    ref.sha256 = layer['contentHash']
    return [ref, artifact('context-report', ctx.context_report_out(layout_id), 'A')]


def build_hole_world(node, ctx, run):
    layout_id = node.scope.layout_id
    out = os.path.join(ctx.layout_out(layout_id), 'world')
    hole = ctx.package_hole(layout_id, node.scope.ordinal)
    args = [ctx.package_path(layout_id), ctx.terrain_source_dir(layout_id), out, '--holes', str(node.scope.ordinal)]
    if not shutil.which('blender'):
        args.append('--skip-blender')
    run_script(ctx, run, node, 'scripts/golf/course-geometry/build-course-world.py', args)
    # The driver rewrites the course manifest per invocation; keep this hole's
    # record beside its files so the aggregate can rebuild the course view.
    manifest = ctx.json(os.path.join(out, 'course-world-manifest.json'), fresh=True)
    record = next(h for h in manifest['holes'] if h['ordinal'] == node.scope.ordinal)
    record_path = os.path.join(out, 'holes', hole['key'], 'record.json')
    _write_json(record_path, {'packageHash': manifest['packageHash'], 'terrainRasterSha256': manifest['terrainRasterSha256'], 'builtAt': manifest['builtAt'],
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
    layout_id = node.scope.layout_id
    reports = []
    for key in ctx.graph.layout_holes.get(layout_id, []):
        hole = ctx.package_hole(layout_id, int(key.rsplit(':', 1)[1]))
        report = ctx.json(os.path.join(ctx.compiled_dir(layout_id, hole['key']), f'{hole["key"]}-report.json'), fresh=True) if hole else None
        if report:
            reports.append({'key': hole['key'], 'ordinal': hole['ordinal'], 'contentHash': report.get('contentHash'), 'triangles': report.get('triangles'),
                            'tJunctionVertices': (report.get('noding') or {}).get('tJunctionVertices'), 'asset': report.get('asset')})
    summary = {'kind': 'golfhelm-factory-terrain-summary-v1', 'layoutId': layout_id, 'packageHash': ctx.package_hash(layout_id),
               'sourceIdentity': terrain_source_identity(ctx.terrain_source_manifest(layout_id)), 'holes': sorted(reports, key=lambda r: r['ordinal'])}
    path = os.path.join(ctx.layout_out(layout_id), 'terrain-summary.json')
    _write_json(path, summary)
    return [artifact('terrain-summary', path, 'C')]


def review_queue(node, ctx, run):
    """What only a person can do next for this layout, from the evidence the
    machine stages left (Factory v2 §9)."""
    layout_id = node.scope.layout_id
    items = []
    routes = ctx.json(ctx.routes_path(layout_id), fresh=True)
    if routes and routes.get('source') != 'catalog':
        items.append({'pass': 'route_confirmation', 'code': 'HUMAN_ROUTE_CONFIRMATION_REQUIRED', 'evidence': routes.get('evidence'),
                      'action': 'confirm the proposed golf=hole ways against the scorecard and write them to the layout manifest routeWayIds'})
    imagery = ctx.json(ctx.imagery_review_path(layout_id), fresh=True)
    if imagery:
        flagged = [b for row in imagery.get('holes', []) for b in row.get('bunkers', []) if b.get('sandShareInside', 1) < imagery.get('lowSandShare', 0.35)]
        items.append({'pass': 'imagery_review', 'code': 'HUMAN_IMAGERY_REVIEW_REQUIRED', 'evidence': {'lowSandBunkers': len(flagged), 'holes': len(imagery.get('holes', []))},
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
    layout_id = node.scope.layout_id
    layout = ctx.layout(layout_id) or {}
    manifest_path = ctx.abspath((layout.get('geometry') or {}).get('published'))
    manifest = ctx.json(manifest_path, fresh=True) or {}
    public_root = os.path.join(ctx.repo_root, 'public')
    expected_package = ctx.package_hash(layout_id)
    checks = []

    def check(name, url, expected, read):
        path = os.path.join(public_root, url.lstrip('/')) if url else None
        doc = ctx.json(path, fresh=True) if path and os.path.isfile(path) else None
        actual = read(doc) if doc else None
        checks.append({'name': name, 'url': url, 'expected': expected, 'actual': actual, 'ok': bool(url) and actual is not None and actual == expected})

    checks.append({'name': 'manifest.geometryVersion', 'url': ctx.relpath(manifest_path) if manifest_path else None, 'expected': expected_package,
                   'actual': manifest.get('geometryVersion'), 'ok': bool(manifest) and manifest.get('geometryVersion') == expected_package})
    check('package', manifest.get('packageUrl'), expected_package, lambda d: d.get('contentHash'))
    terrain_by_hole = manifest.get('terrainByHole') or {}
    for hole in (ctx.package(layout_id) or {}).get('holes', []):
        key = hole['key']
        folder = ctx.compiled_dir(layout_id, key)
        report = ctx.json(os.path.join(folder, f'{key}-report.json')) if folder else None
        check(f'terrain:{key}', terrain_by_hole.get(key), (report or {}).get('contentHash'), lambda d: d.get('contentHash') if d.get('geometryHash') == expected_package else f'mesh of package {str(d.get("geometryHash"))[:12]}')
    context = ctx.context_layer(layout_id) if ctx.states.get(f'layout.context.classify[{layout_id}]') in DONE else None
    if manifest.get('contextLayerUrl') or context:
        check('contextLayer', manifest.get('contextLayerUrl'), (context or {}).get('contentHash'), lambda d: d.get('contentHash'))
    failed = [c for c in checks if not c['ok']]
    out = os.path.join(ctx.layout_out(layout_id), 'publish-verification.json')
    _write_json(out, {'kind': 'golfhelm-factory-publish-verification-v1', 'layoutId': layout_id, 'packageHash': expected_package, 'manifest': ctx.relpath(manifest_path) if manifest_path else None,
                      'checks': checks, 'ok': not failed, 'verifiedAt': datetime.now(timezone.utc).isoformat()})
    if failed:
        first = failed[0]
        raise RuntimeError(f'PUBLISH_MISMATCH: {len(failed)} of {len(checks)} published files differ from the evidence; first {first["name"]}: expected {str(first["expected"])[:12]}, published {str(first["actual"])[:12]}')
    return [artifact('publish-verification', out, 'C')]


DEFAULT_EXECUTORS = {
    'facility.aoi.resolve': resolve_aoi,
    'facility.osm.snapshot': snapshot_osm,
    'facility.context.snapshot': snapshot_context,
    'layout.routes.resolve': resolve_routes,
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
