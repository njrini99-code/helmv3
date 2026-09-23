"""`course-factory.py ship --layout <id>`: run the DAG through
`layout.world.aggregate` (every hole's GLB/truth-gate record) and
`layout.terrain.aggregate` (the package-bound terrain meshes), capture the
candidate against the factory lab, then the automated QA gates in
`ship.py`, and stop at READY_FOR_APPROVAL or a list of blocker codes (plan
"Design: one command, ship"). Writes everything under `<layout output>/ship/`.

`ship` deliberately never targets `layout.player.aggregate`/
`layout.visual.aggregate` (the legacy `hole.player.capture`/
`hole.visual.canary` DAG tasks): those are permanently hash-locked to
checked-in fixtures (`factory/lab.py`, the Vite fixture server on `:8768`)
and can never serve a not-yet-published candidate -- retaining a course
there is a PR, like publishing (`lab.py`'s own docstring). `ship` instead
captures its own candidate independently, from the factory's own output
root, against the separate factory lab (`factory-lab/`, `:8774`, driven by
`review-bundle`/`capture-factory-bundle.cjs`), which serves any factory
output by content hash. See `_capture_bundle`.
"""
import http.client
import json
import os
import shutil
import subprocess
import uuid
from pathlib import Path

from source_geometry import identity as source_identity
from source_geometry import resolved_routes

from . import ship
from .lab_bundle import export_bundle
from .ledger import now_iso
from .review_bundle import capture_directory, require_served_bundle
from .runner import Run, execute, git_head, select_keys

SHIP_TARGET = 'layout.world.aggregate'
# `layout.terrain.aggregate` (compiled-bound/asset-manifest.json,
# terrain-summary.json -- what the hash-chain and T-junction gates read) is
# not an ancestor of `layout.world.aggregate` either: `hole.terrain.compile`
# and `hole.world.build` are sibling consumers of `layout.terrain.acquire`,
# not parent/child, so its closure is unioned in explicitly (same pattern
# `cmd_batch` uses for `layout.route.dossier`/`layout.visual.world.build`).
EXTRA_TARGETS = ('layout.terrain.aggregate',)
# Skipped when turning DAG blockers into qa-report codes: purely derivative
# of another node's own blocker, already reported once at its root cause.
NOISE_CODES = {'DEPENDENCY_BLOCKED', 'DEPENDENCY_PENDING'}
CAPTURE_VIEWPORT = '390x844'


def ship_dir(ctx, layout_id):
    return os.path.join(ctx.layout_out(layout_id), 'ship')


def _dag_blockers(rows):
    """`run.blocked`/`run.failed` rows -> flat blocker dicts, root causes only."""
    blockers = []
    for row in rows.get('blocked', []):
        codes = [b['code'] for b in (row.get('blockers') or [])] or [row.get('reason')]
        for code in codes:
            if code in NOISE_CODES:
                continue
            fields = next((b for b in (row.get('blockers') or []) if b.get('code') == code), {})
            blockers.append(ship.blocker(code, key=row['key'], **{k: v for k, v in fields.items() if k != 'code'}))
    for row in rows.get('failed', []):
        blockers.append(ship.blocker('TASK_FAILED', key=row['key'], error=row.get('error')))
    return blockers


def _capture_bundle(session, layout_id, log_path):
    """Ship's own player-capture evidence (see the module docstring):
    export the layout's current factory output as an immutable,
    content-addressed bundle, then capture every hole against the factory
    lab on `:8774`, which must already be pointed at this session's own
    `--output` root (`GOLFHELM_FACTORY_OUTPUT_ROOT`) -- `ship` never starts
    a lab itself. Returns `(captures_report_or_None, capture_root_or_None,
    infra_blockers)`; a non-empty `infra_blockers` means the capture never
    ran at all (a `ship.py` gate reads `captures_report` as
    `SHIP_CAPTURES_MISSING` either way, so the two never double-count)."""
    try:
        ctx = session.ctx
        bundle = export_bundle(session.output_root, layout_id, package_path=ctx.package_path(layout_id),
                               context_path=ctx.context_layer_path(layout_id),
                               retained_root=os.path.join(session.repo_root, 'src', 'test', 'fixtures', 'course-geometry'))
    except (OSError, ValueError, KeyError, TypeError) as exc:
        return None, None, [ship.blocker('SHIP_CAPTURE_BUNDLE_EXPORT_FAILED', detail=str(exc))]
    try:
        require_served_bundle(session.output_root, bundle)
    except (OSError, http.client.HTTPException) as exc:
        return None, None, [ship.blocker('FACTORY_LAB_NOT_LISTENING', detail=str(exc),
                                         remediation='start it from the repo root with GOLFHELM_FACTORY_OUTPUT_ROOT='
                                                     f'{session.output_root}: node_modules/.bin/vite --config scripts/golf/course-geometry/factory-lab.config.ts; ship never starts one itself')]
    except ValueError as exc:
        # `require_served_bundle`'s own three ValueErrors (a non-200 status --
        # including the 404 a mismatched root serves, a manifest hash
        # mismatch, or its body disagreeing with this output root) are all
        # the same fact from ship's point of view: a lab is listening, but
        # not serving this run's own root.
        return None, None, [ship.blocker('FACTORY_LAB_ROOT_MISMATCH', detail=str(exc), expectedRoot=session.output_root,
                                         remediation=f'restart the factory lab with GOLFHELM_FACTORY_OUTPUT_ROOT={session.output_root}')]
    node = shutil.which('node')
    if not node:
        return None, None, [ship.blocker('TOOL_MISSING', tool='node', detail='capture-factory-bundle.cjs runs under node with playwright')]
    capture_root = capture_directory(session.output_root, bundle)
    cmd = [node, str(Path(session.repo_root) / 'scripts/golf/course-geometry/capture-factory-bundle.cjs'),
           f'--layout={layout_id}', f'--bundle={bundle["bundleHash"]}', f'--out={capture_root}']
    os.makedirs(os.path.dirname(log_path), exist_ok=True)
    with open(log_path, 'w', encoding='utf-8') as log:
        log.write('$ ' + ' '.join(cmd) + '\n')
        log.flush()
        try:
            subprocess.run(cmd, cwd=session.repo_root, stdout=log, stderr=subprocess.STDOUT, text=True,
                           timeout=max(60, bundle['holeCount'] * 90), check=False)
        except subprocess.TimeoutExpired:
            log.write('\ncapture-factory-bundle.cjs timed out\n')
    report = session.ctx.json(str(capture_root / 'captures.json'), fresh=True)
    if not report:
        return None, str(capture_root), [ship.blocker('SHIP_CAPTURE_REPORT_MISSING', log=session.ctx.relpath(log_path))]
    return report, str(capture_root), []


def _synthesize_player_summary(ctx, layout_id, captures_report, context_report):
    """A `player-summary.json`-shaped document from the factory-lab capture
    report, so `build-player-sheet.py` can be reused unchanged for ship's
    own contact sheet even though the capture shape (one fixed viewport per
    hole, from `capture-factory-bundle.cjs`) differs from the legacy
    per-(viewport, view) `hole.player.capture` layout. Each row also carries
    `uncertainShare` so the sheet shows the same advisory number the QA
    report does."""
    package = ctx.package(layout_id) or {}
    ordinal_by_key = {hole['key']: hole['ordinal'] for hole in package.get('holes') or []}
    share_by_key = {hole.get('key'): hole.get('uncertainShare') for hole in (context_report or {}).get('holes') or []}
    errors_by_key = {}
    for error in captures_report.get('errors') or []:
        errors_by_key.setdefault(error.get('hole'), []).append(error.get('message'))
    rows = []
    for capture in captures_report.get('captures') or []:
        key = capture.get('holeKey')
        renderer = capture.get('renderer') or {}
        rows.append({'hole': ordinal_by_key.get(key), 'key': key, 'capture': f'{CAPTURE_VIEWPORT}-terrain', 'file': capture.get('file'),
                     'view': 'terrain', 'drawCalls': renderer.get('drawCalls'), 'drawCallBudget': renderer.get('drawCallBudget'),
                     'drawCallStatus': renderer.get('drawCallStatus'), 'renderTriangles': renderer.get('renderTriangles'),
                     'chrome': [], 'errors': errors_by_key.get(key, []), 'uncertainShare': share_by_key.get(key)})
    return {'kind': 'golfhelm-factory-player-summary-v1', 'layoutId': layout_id, 'packageHash': captures_report.get('packageHash'),
            'holes': len(rows), 'captures': len(rows), 'views': [f'{CAPTURE_VIEWPORT}-terrain'], 'drawCallBreaches': [],
            'rows': rows, 'source': 'ship-factory-lab-capture'}


def _build_contact_sheet(ctx, layout_id, captures_report, capture_root, context_report, dest):
    """One 18-hole contact sheet PNG from ship's own factory-lab captures
    (reusing `build-player-sheet.py`, per the plan). Built whenever a
    capture ran at all, independent of overall readiness, so a reviewer can
    see it on a NOT_READY report too."""
    summary_path = os.path.join(capture_root, 'player-summary.json')
    with open(summary_path, 'w', encoding='utf-8') as f:
        json.dump(_synthesize_player_summary(ctx, layout_id, captures_report, context_report), f, indent=1)
        f.write('\n')
    sheet = os.path.join(dest, f'contact-sheet-{CAPTURE_VIEWPORT}.png')
    result = subprocess.run(['python3', ctx.abspath('scripts/golf/course-geometry/build-player-sheet.py'), capture_root, CAPTURE_VIEWPORT, sheet],
                            cwd=ctx.repo_root, capture_output=True, text=True, check=False)
    if result.returncode != 0:
        return None, (result.stdout or '') + (result.stderr or '')
    return sheet, None


def _build_route_overview(ctx, layout_id, routes_doc, proposal_doc, dest):
    """The whole-course route overview PNG next to the contact sheet (Phase
    D1 item 5): required reading for `ship --confirm-route` on an
    `auto-route-v1` layout (every hole's order, tee/green source, scorecard
    vs measured yards and confidence -- see `ship.route_confirmation_item`),
    and produced for an OSM-routed layout too, since ship's own per-hole
    contact sheet has no way to show hole ORDER. Runs `route-overview.py`
    as its own subprocess (same pattern as `_build_contact_sheet`'s
    `build-player-sheet.py`): a rendering failure must never crash `ship`
    itself, only report `routeOverviewError`. Returns
    `(path_or_None, error_or_None)`."""
    layout = ctx.layout(layout_id) or {}
    facility_id = layout.get('facilityId')
    out_path = os.path.join(dest, 'route-overview.png')
    cmd = ['python3', ctx.abspath('scripts/golf/course-geometry/route-overview.py'),
           '--routes', ctx.routes_path(layout_id), '--out', out_path]
    if layout.get('name'):
        cmd += ['--layout-name', layout['name']]
    if routes_doc.get('source') == 'auto-route-v1':
        proposal_path = ctx.route_proposal_path(layout_id)
        if not (proposal_doc and os.path.isfile(proposal_path)):
            return None, 'ROUTE_PROPOSAL_MISSING: auto-route-v1 routes.json but no route-proposal.json to render'
        cmd += ['--proposal', proposal_path]
    elif routes_doc.get('routeWayIds') and facility_id:
        _manifest, extract_path = ctx.snapshot(facility_id)
        if not extract_path:
            return None, 'OSM_SNAPSHOT_MISSING: routeWayIds resolved but no retained OSM extract to render from'
        cmd += ['--osm', extract_path]
    else:
        return None, f'ROUTE_OVERVIEW_UNSUPPORTED_SOURCE: {routes_doc.get("source")!r} has neither a proposal nor routeWayIds'
    scorecard_path = ctx.scorecard_path(layout_id)
    if os.path.isfile(scorecard_path):
        cmd += ['--scorecard', scorecard_path]
    naip_dir = ctx.naip_dir(layout_id)
    if naip_dir:
        naip_manifest = ctx.json(os.path.join(naip_dir, 'manifest.json')) or {}
        naip_tif = os.path.join(naip_dir, naip_manifest.get('file', 'naip.tif'))
        if os.path.isfile(naip_tif):
            cmd += ['--naip', naip_tif]
    result = subprocess.run(cmd, cwd=ctx.repo_root, capture_output=True, text=True, check=False)
    if result.returncode != 0:
        return None, ((result.stdout or '') + (result.stderr or ''))[-1500:]
    return out_path, None


def _publish_stage(ctx, layout_id, out_dir, log_path):
    """publish-course-assets.mts against a local staging folder only -- never
    `public/course-geometry` (its own default). `--compiled` must point at
    `compiled-bound`: the package-bound meshes `aggregate_terrain` writes,
    not the unbound `compiled`/`compiled-base` directories the script would
    otherwise guess at, which do not exist under factory output at all."""
    tsx = ctx.abspath(os.path.join('node_modules', '.bin', 'tsx'))
    cmd = [tsx, '--tsconfig', 'tsconfig.json', ctx.abspath('scripts/golf/course-geometry/publish-course-assets.mts'),
           f'--course={layout_id}', f'--from={ctx.layout_out(layout_id)}', f'--compiled={ship.bound_dir(ctx, layout_id)}', f'--out={out_dir}']
    os.makedirs(os.path.dirname(log_path), exist_ok=True)
    with open(log_path, 'w', encoding='utf-8') as log:
        log.write('$ ' + ' '.join(cmd) + '\n')
        log.flush()
        result = subprocess.run(cmd, cwd=ctx.repo_root, stdout=subprocess.PIPE, stderr=log, text=True, check=False)
        log.write(result.stdout or '')
    if result.returncode != 0:
        with open(log_path, encoding='utf-8') as log:
            tail = log.read()[-1500:]
        raise RuntimeError(f'publish-course-assets.mts exited {result.returncode}\n{tail}')
    # The script's own doc: "Prints one JSON summary line to stdout ... so
    # `--course=... | jq` gets exactly the summary." Progress notes are on
    # stderr (captured into the log above), so the last non-blank stdout
    # line is the summary even if something else ever writes to stdout.
    lines = [line for line in (result.stdout or '').splitlines() if line.strip()]
    if not lines:
        raise RuntimeError(f'publish-course-assets.mts produced no summary line; see {log_path}')
    return json.loads(lines[-1])


def run_ship(session, layout_id, out=None):
    """Executes the DAG and gates, writes ship/qa-report.json (+ the ready
    artifacts when applicable), and returns the qa-report dict."""
    ctx = session.ctx
    graph = session.graph(layout_id)
    keys = select_keys(graph, task=SHIP_TARGET)
    for target in EXTRA_TARGETS:
        keys |= select_keys(graph, task=target)
    run_id = 'ship-' + now_iso().replace(':', '').replace('-', '')[:15] + '-' + uuid.uuid4().hex[:6]
    run = Run(run_id=run_id, out_dir=os.path.join(session.output_root, 'runs', run_id))
    session.ledger.begin_run(run_id, f'ship --layout {layout_id}', git_head(session.repo_root))
    recovered = session.ledger.recover_interrupted()
    execute(graph, ctx, run, keys, recovered=recovered)
    session.ledger.finish_run(run_id, 'failed' if run.failed else 'ok')

    dest = ship_dir(ctx, layout_id)
    os.makedirs(dest, exist_ok=True)
    dag_blockers = _dag_blockers({'blocked': run.blocked, 'failed': run.failed})

    context_report = ctx.json(ctx.context_report_path(layout_id), fresh=True)
    captures_report, capture_root, capture_blockers = _capture_bundle(session, layout_id, os.path.join(dest, 'capture.log'))
    gate_blockers, advisory = ship.evaluate_gates(ctx, layout_id, captures_report=captures_report, capture_blockers=capture_blockers)
    blockers = dag_blockers + gate_blockers
    notes = [advisory.pop('factoryLabScopeNote')]

    contact_sheet, contact_sheet_error = (None, None)
    if captures_report and capture_root:
        contact_sheet, contact_sheet_error = _build_contact_sheet(ctx, layout_id, captures_report, capture_root, context_report, dest)

    routes_doc = ctx.json(ctx.routes_path(layout_id), fresh=True)
    proposal_doc = ctx.json(ctx.route_proposal_path(layout_id), fresh=True) if (routes_doc or {}).get('source') == 'auto-route-v1' else None
    confirmation_doc = ctx.json(ctx.route_confirmation_path(layout_id), fresh=True)
    route_confirmation = ship.route_confirmation_item(layout_id, routes_doc, proposal_doc, confirmation_doc)

    route_overview, route_overview_error = (None, None)
    if resolved_routes(routes_doc):
        # Required for a proposed-route layout (that is what the owner
        # reviews at ship --confirm-route); an OSM-routed layout may get one
        # too, since the whole-course order is otherwise unreviewable next
        # to the per-hole contact sheet.
        route_overview, route_overview_error = _build_route_overview(ctx, layout_id, routes_doc, proposal_doc, dest)

    package = ctx.package(layout_id)
    report = {'kind': 'golfhelm-factory-ship-qa-v1', 'layoutId': layout_id, 'packageHash': (package or {}).get('contentHash'),
              'runId': run_id, 'status': 'READY_FOR_APPROVAL' if not blockers else 'NOT_READY',
              'dag': {'executed': len(run.executed), 'cached': len(run.cached), 'blocked': len(run.blocked), 'failed': len(run.failed)},
              'blockers': blockers, 'advisory': advisory, 'notes': notes,
              'contactSheet': ctx.relpath(contact_sheet) if contact_sheet else None, 'contactSheetError': contact_sheet_error,
              'routeConfirmation': route_confirmation,
              'routeOverview': ctx.relpath(route_overview) if route_overview else None, 'routeOverviewError': route_overview_error,
              'generatedAt': now_iso()}
    qa_path = os.path.join(dest, 'qa-report.json')
    with open(qa_path, 'w', encoding='utf-8') as f:
        json.dump(report, f, indent=1, sort_keys=True)
        f.write('\n')

    if not blockers:
        staging = os.path.join(dest, 'staging')
        publish_summary = _publish_stage(ctx, layout_id, staging, os.path.join(dest, 'publish.log'))
        proposed = {'kind': 'golfhelm-factory-ship-proposed-approval-v1', 'layoutId': layout_id, 'contentHash': report['packageHash'],
                    'packageBytesSha256': publish_summary.get('packageByteSha256'), 'stagingDir': ctx.relpath(staging),
                    'contactSheets': [report['contactSheet']] if report['contactSheet'] else [], 'publishSummary': publish_summary, 'generatedAt': now_iso(),
                    'tracedSurfaces': advisory.get('tracedSurfaces') or [],
                    'note': 'ship --approve merges this into course-geometry/approvals.json; a layout not already there also needs an owner-reviewed courseNamePatterns entry. '
                            'Approving also counts as the owner\'s context sign-off (see advisory.contextUncertainShares in qa-report.json), the same pattern as route confirmation, '
                            'and the owner\'s review of every imagery-traced surface listed in tracedSurfaces.'}
        with open(os.path.join(dest, 'proposed-approval.json'), 'w', encoding='utf-8') as f:
            json.dump(proposed, f, indent=1, sort_keys=True)
            f.write('\n')
    return report


def cmd_ship_confirm_route(session, args, out):
    """`ship --confirm-route LAYOUT`: record the owner's review of the
    current `auto-route-v1` `route-proposal.json` hole order (Phase D1,
    owner decision 2026-09-23 -- see `ship.route_confirmation_item`'s
    docstring). Keys the confirmation to `source_identity(raw)`, the exact
    hash `ctx.route_resolution` also computes for `routes.json`'s
    `sourceGeometryHash`, so a later, different proposal run (a changed
    `layout.routes.propose` output) invalidates this confirmation without
    `ship --approve`'s refusal gate having to compare anything else.
    Deliberately independent of a full `ship --layout` DAG run: an owner
    can review and confirm hole order as soon as a proposal exists."""
    ctx = session.ctx
    layout_id = args.confirm_route
    path = ctx.route_proposal_path(layout_id)
    if not os.path.isfile(path):
        raise SystemExit(f'no route-proposal.json for {layout_id} at {path}; run '
                          f'`course-factory.py ship --layout {layout_id}` (or `run --layout {layout_id} '
                          f'--task layout.routes.propose`) first')
    raw = ctx.json(path)
    if not isinstance(raw, dict):
        raise SystemExit(f'{path} is not a readable document')
    proposal_hash = source_identity(raw)
    confirmed_by = args.confirmed_by or os.environ.get('USER') or os.environ.get('USERNAME') or 'unknown'
    doc = {'kind': 'golfhelm-factory-route-confirmation-v1', 'layoutId': layout_id, 'proposalHash': proposal_hash,
           'confirmedAt': now_iso(), 'confirmedBy': confirmed_by, 'proposalPath': ctx.relpath(path)}
    out_path = ctx.route_confirmation_path(layout_id)
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(doc, f, indent=1, sort_keys=True)
        f.write('\n')
    if args.json:
        out.write(json.dumps(doc, indent=1) + '\n')
    else:
        out.write(f'route confirmed for {layout_id}: proposalHash {proposal_hash[:12]} by {confirmed_by}\n')
        out.write(f'written to {out_path}\n')
    return 0


def cmd_ship_build(session, args, out):
    report = run_ship(session, args.layout)
    if args.json:
        out.write(json.dumps(report, indent=1) + '\n')
    else:
        out.write(f'ship {args.layout}: {report["status"]} (run {report["runId"]})\n')
        for b in report['blockers']:
            out.write(f'  {b["code"]}: {json.dumps({k: v for k, v in b.items() if k != "code"})}\n')
        out.write(f'report: {os.path.join(ship_dir(session.ctx, args.layout), "qa-report.json")}\n')
    return 0 if report['status'] == 'READY_FOR_APPROVAL' else 1
