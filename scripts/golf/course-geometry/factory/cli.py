"""`course-factory.py` — doctor · plan · run · status · why · invalidate."""
import argparse
import glob
import importlib
import json
import os
import platform
import shutil
import subprocess
import sys
import uuid

from . import disk
from .adapters import DEFAULT_EXECUTORS
from .catalog import load_catalog
from .context import Context
from .graph import build_graph
from .ledger import Ledger, now_iso
from .planner import apply_disk_guard, plan, why
from .reasons import describe
from .report import (
    golden_rows,
    plan_json,
    render_plan,
    render_status,
    status_json,
    write_run_report,
)
from .runner import Run, execute, git_head, select_keys
from .tasks import default_specs

DEFAULT_CATALOG = 'course-geometry/catalog'
DEFAULT_OUTPUT = 'output/course-geometry/factory'


def find_repo_root(start):
    probe = os.path.abspath(start)
    while True:
        if os.path.isfile(os.path.join(probe, 'package.json')) and os.path.isdir(os.path.join(probe, 'scripts')):
            return probe
        parent = os.path.dirname(probe)
        if parent == probe:
            return os.getcwd()
        probe = parent


def build_parser():
    p = argparse.ArgumentParser(prog='course-factory', description='Course Geometry Factory v2 build engine')
    p.add_argument('--repo-root', default=None)
    p.add_argument('--catalog', default=None, help=f'catalog directory (default {DEFAULT_CATALOG})')
    p.add_argument('--output', default=None, help=f'factory output root (default {DEFAULT_OUTPUT})')
    p.add_argument('--no-adopt-output', action='store_true', help='ignore retained artifacts under output/ (deterministic plans)')
    p.add_argument('--fresh', action='store_true',
                    help='replay from sources: ignore every catalog/retained fixture override (the checked-in package, canopy review, terrain, OSM snapshot, …) '
                         'and never adopt one into the ledger. Requires --output pointing outside the default factory output root.')
    p.add_argument('--fresh-traces', action='append', default=[], metavar='LAYOUT=PATH',
                    help='in --fresh mode, an imagery-traces file to use for LAYOUT instead of the catalog default (none); repeatable')
    sub = p.add_subparsers(dest='command', required=True)
    sub.add_parser('doctor')
    for name in ('plan', 'status'):
        s = sub.add_parser(name)
        s.add_argument('--layout')
        s.add_argument('--facility')
        s.add_argument('--json', action='store_true')
        s.add_argument('--notes', action='store_true', help='print the evidence notes under each row')
        if name == 'plan':
            s.add_argument('--golden', action='store_true', help='print only the machine-stable rows (state, reason per key)')
    r = sub.add_parser('run')
    r.add_argument('--layout')
    r.add_argument('--facility')
    r.add_argument('--until', help='run up to and including this task id')
    r.add_argument('--task', help='run only this task id (and what it needs)')
    r.add_argument('--holes', help='comma-separated hole ordinals, e.g. 7,8')
    r.add_argument('--dry-run', action='store_true')
    r.add_argument('--json', action='store_true')
    b = sub.add_parser('batch', help='serially compile the catalogued usage cohort through physical-world aggregation; never publishes')
    b.add_argument('--cohort', default='src/test/fixtures/course-geometry/course-cohort-2026-09-13.json')
    b.add_argument('--all-layouts', action='store_true', help='compile every catalogued layout; ignores usage ranking and never publishes')
    b.add_argument('--min-rounds', type=int, default=2, help='include courses with at least this many completed rounds')
    b.add_argument('--until', default='layout.world.aggregate', help='safe terminal task; publish/capture tasks are excluded unless explicitly named')
    b.add_argument('--max-layouts', type=int, help='bounded number of ranked layouts to attempt')
    b.add_argument('--include-nonstandard', action='store_true', help='include layouts whose scorecard is not an 18-hole standard round')
    b.add_argument('--dry-run', action='store_true')
    b.add_argument('--json', action='store_true')
    w = sub.add_parser('why')
    w.add_argument('--layout', required=True)
    w.add_argument('--task', required=True)
    w.add_argument('--hole', type=int)
    k = sub.add_parser('intake', help='catalog the usage cohort, most-played first (C0 manifests; never overwrites)')
    k.add_argument('--cohort', default='src/test/fixtures/course-geometry/course-cohort-2026-09-13.json')
    k.add_argument('--coverage', default='output/course-geometry/library-coverage/coverage.json')
    k.add_argument('--scorecards', default='src/test/fixtures/course-geometry/cohort-scorecards.json')
    k.add_argument('--min-rounds', type=int, default=1)
    k.add_argument('--write', action='store_true', help='write the new catalog manifests (default: report only)')
    k.add_argument('--json', action='store_true')
    kp = sub.add_parser('intake-played', help='intake for every played course (played-courses.json), resolving missing/stale facilities first; C0 manifests, never overwrites')
    kp.add_argument('--played', default='output/course-geometry/overnight/played-courses.json')
    kp.add_argument('--coverage', default='output/course-geometry/library-coverage/coverage.json')
    kp.add_argument('--coverage-out', default='output/course-geometry/library-coverage/coverage-played.json', help='merged coverage (the audit file is never overwritten)')
    kp.add_argument('--scorecards', default='output/course-geometry/overnight/played-scorecards.json')
    kp.add_argument('--cache', default='output/course-geometry/library-coverage/resolver-cache')
    kp.add_argument('--sleep', type=float, default=1.5, help='seconds between public API calls')
    kp.add_argument('--no-resolve', action='store_true', help='report on current coverage only; no network')
    kp.add_argument('--min-rounds', type=int, default=1)
    kp.add_argument('--write', action='store_true', help='write the new catalog manifests (default: report only)')
    kp.add_argument('--json', action='store_true')
    s = sub.add_parser('refresh-scorecards', help='append all identified tee revisions from a complete export; preserve existing cards and reference selection')
    s.add_argument('--snapshot', required=True)
    s.add_argument('--write', action='store_true')
    review = sub.add_parser('review-bundle', help='export one immutable local review bundle; optional serial captures, no admission or publication')
    review.add_argument('--layout', required=True)
    review.add_argument('--capture', action='store_true', help='capture every bundle hole using the existing loopback factory lab on port 8774')
    recovery = sub.add_parser('route-recovery', help='inspect retained route sources and emit bounded remediation commands; no downloads or geometry writes')
    recovery.add_argument('--layout')
    recovery.add_argument('--facility')
    recovery.add_argument('--json', action='store_true')
    coverage = sub.add_parser('coverage', help='read the canonical 44-layout evidence/capability state; no factory task runs')
    coverage.add_argument('--json', action='store_true')
    coverage.add_argument('--write-json', help='optional report path outside factory inputs')
    coverage.add_argument('--write-markdown', help='optional report path outside factory inputs')
    coverage.add_argument('--write-acquisition-tasks', help='optional generated external-evidence queue')
    coverage.add_argument('--write-terrain-decisions', help='optional generated terrain source-decision queue')
    i = sub.add_parser('invalidate')
    i.add_argument('--layout', required=True)
    i.add_argument('--task', required=True)
    i.add_argument('--hole', type=int)
    i.add_argument('--reason', required=True)
    e = sub.add_parser('evict', help='remove selected reproducible factory intermediates; source truth is never selected')
    e.add_argument('--bytes', type=int, required=True, help='minimum bytes to reclaim')
    e.add_argument('--path-prefix', required=True, help='directory below --output containing only intended intermediates')
    e.add_argument('--apply', action='store_true', help='perform deletion; default reports the exact candidates only')
    e.add_argument('--json', action='store_true')
    ship = sub.add_parser('ship', help='run the DAG through layout.world.aggregate/layout.terrain.aggregate, capture the candidate against the factory lab, then the automated QA gates; stop at READY_FOR_APPROVAL or a blocker list')
    ship.add_argument('--layout', help='required unless --approve')
    ship.add_argument('--approve', nargs=2, metavar=('LAYOUT', 'CONTENTHASH'), help='merge this exact READY_FOR_APPROVAL hash into course-geometry/approvals.json and regenerate the registry')
    ship.add_argument('--live-pilot', action='store_true', help='with --approve: set livePilot: true on the merged package entry')
    ship.add_argument('--upload', action='store_true', help='with --approve: also upload the staged files to Supabase Storage (requires the bucket migration to be applied)')
    ship.add_argument('--all-played', action='store_true',
                      help='run ship for every played, catalogued course (Oviinbyrd excepted) from output/course-geometry/overnight/played-courses.json, '
                           'one course at a time, each ship/evict step under its own BUILD.lock; honours PAUSE and --min-free-gb before every course; '
                           'writes output/course-geometry/overnight/batch-summary.json. Must not itself be wrapped in lockf -k BUILD.lock (it locks per course).')
    ship.add_argument('--min-free-gb', type=float, default=9.0, help='with --all-played: wait until at least this much free disk before each course (default 9.0)')
    ship.add_argument('--poll-seconds', type=int, default=30, help='with --all-played: how often to re-check PAUSE/free disk while waiting (default 30)')
    ship.add_argument('--dry-run', action='store_true', help='with --all-played: print the selected/skipped courses and exit without running ship or evict')
    ship.add_argument('--json', action='store_true')
    return p


def _parse_fresh_traces(items):
    overrides = {}
    for item in items or []:
        layout_id, sep, path = item.partition('=')
        if not sep or not layout_id or not path:
            raise SystemExit(f'--fresh-traces must be LAYOUT=PATH, got {item!r}')
        overrides[layout_id] = path
    return overrides


class Session:
    def __init__(self, args, ledger=None, executors=None, spec_overrides=None):
        self.repo_root = os.path.abspath(args.repo_root) if args.repo_root else find_repo_root(os.path.dirname(os.path.abspath(__file__)))
        self.catalog_root = os.path.join(self.repo_root, args.catalog or DEFAULT_CATALOG) if not (args.catalog and os.path.isabs(args.catalog)) else args.catalog
        self.output_root = os.path.join(self.repo_root, args.output or DEFAULT_OUTPUT) if not (args.output and os.path.isabs(args.output)) else args.output
        self.fresh = bool(getattr(args, 'fresh', False))
        if self.fresh and os.path.realpath(self.output_root) == os.path.realpath(os.path.join(self.repo_root, DEFAULT_OUTPUT)):
            raise SystemExit('--fresh requires --output pointing outside the default factory output root (it must not adopt or share a ledger with it)')
        self.catalog = load_catalog(self.catalog_root)
        self.specs = default_specs(spec_overrides)
        # Recovery is a retained-file inventory, including while a batch is
        # running. Do not open/create the shared ledger for this command.
        self.ledger = None if args.command in {'route-recovery', 'coverage'} else (ledger if ledger is not None else Ledger(os.path.join(self.output_root, 'state.sqlite')))
        # Injected executors (tests) replace the real adapters wholesale, so a
        # test never reaches a script or the network by accident.
        self.ctx = Context(self.repo_root, self.catalog, self.output_root, self.ledger, adopt_output=not args.no_adopt_output,
                           executors=executors if executors is not None else dict(DEFAULT_EXECUTORS),
                           fresh=self.fresh, trace_overrides=_parse_fresh_traces(getattr(args, 'fresh_traces', None)))

    def graph(self, layout=None, facility=None, holes=None):
        layouts = [layout] if layout else None
        facilities = [facility] if facility else None
        if layout and layout not in self.catalog.layouts:
            raise SystemExit(f'unknown layout {layout}; catalog has {", ".join(sorted(self.catalog.layouts)) or "none"}')
        if facility and facility not in self.catalog.facilities:
            raise SystemExit(f'unknown facility {facility}; catalog has {", ".join(sorted(self.catalog.facilities)) or "none"}')
        return build_graph(self.catalog, self.specs, facilities, layouts, holes)


def parse_holes(text):
    return {int(x) for x in text.split(',') if x.strip()} if text else None


def cmd_doctor(session, args, out):
    checks = []

    def probe(name, fn, required=False):
        try:
            value = fn()
            checks.append({'check': name, 'ok': bool(value), 'detail': value if isinstance(value, str) else ('present' if value else 'missing'), 'required': required})
        except Exception as exc:  # noqa: BLE001 - a probe reports any failure as a missing tool
            checks.append({'check': name, 'ok': False, 'detail': str(exc)[:120], 'required': required})

    def module(name):
        def go():
            m = importlib.import_module(name)
            return getattr(m, '__version__', 'present')
        return go

    def binary(name, args=('--version',)):
        def go():
            path = shutil.which(name)
            if not path:
                return None
            try:
                res = subprocess.run([path, *args], capture_output=True, text=True, timeout=10, check=False)
                return (res.stdout or res.stderr).strip().splitlines()[0][:80] if (res.stdout or res.stderr) else path
            except Exception:  # noqa: BLE001 - a version probe that fails still proves the binary exists
                return path
        return go

    probe('python', lambda: platform.python_version(), True)
    probe('gdal (osgeo)', module('osgeo.gdal'))
    probe('gdalinfo', binary('gdalinfo'))
    probe('shapely', module('shapely'))
    probe('pyproj', module('pyproj'))
    probe('numpy', module('numpy'))
    probe('scipy', module('scipy'))
    probe('node', binary('node'))
    probe('tsx', lambda: os.path.isfile(os.path.join(session.repo_root, 'node_modules', '.bin', 'tsx')))
    probe('playwright', lambda: os.path.isfile(os.path.join(session.repo_root, 'node_modules', 'playwright', 'package.json')))
    probe('pdal', binary('pdal'))
    probe('osmium (optional)', binary('osmium'))
    probe('blender (optional)', binary('blender'))
    probe('qgis (optional)', lambda: 'present' if glob.glob('/Applications/QGIS*.app') else None)
    free = disk.free_bytes(session.output_root)
    checks.append({'check': 'free disk', 'ok': free > disk.reserve_bytes(), 'detail': f'{disk.gb(free)} GB free, reserve {disk.gb(disk.reserve_bytes())} GB', 'required': True})
    catalog = session.catalog
    checks.append({'check': 'catalog', 'ok': not catalog.problems,
                   'detail': f'{len(catalog.facilities)} facilities, {len(catalog.layouts)} layouts, {len(catalog.scorecards)} scorecards' + (f'; {len(catalog.problems)} problem(s): ' + '; '.join(catalog.problems[:3]) if catalog.problems else ''), 'required': True})
    missing = [f'{doc_id}.{key}' for kind in ('facilities', 'layouts') for doc_id, doc in getattr(catalog, kind).items()
               for key, path in (doc.get('retained') or {}).items() if not os.path.exists(session.ctx.abspath(path))]
    checks.append({'check': 'retained evidence', 'ok': not missing, 'detail': 'all retained paths present' if not missing else f'{len(missing)} missing: {", ".join(missing[:4])}', 'required': False})
    checks.append({'check': 'ledger', 'ok': True, 'detail': session.ledger.path, 'required': False})
    for c in checks:
        mark = 'ok ' if c['ok'] else ('!! ' if c['required'] else '-- ')
        out.write(f'{mark}{c["check"]:<20} {c["detail"]}\n')
    return 0 if all(c['ok'] or not c['required'] for c in checks) else 1


def cmd_plan(session, args, out):
    graph = session.graph(args.layout, args.facility)
    rows = plan(graph, session.ctx, adopt=not session.fresh)
    apply_disk_guard(rows, session.ctx, graph)
    selection = {'layout': args.layout, 'facility': args.facility}
    if args.golden:
        out.write(json.dumps(golden_rows(rows), indent=1) + '\n')
    elif args.json:
        out.write(json.dumps(plan_json(rows, session.ctx, selection), indent=1) + '\n')
    else:
        out.write(render_plan(rows, notes=args.notes, graph=graph) + '\n')
    return 0


def cmd_run(session, args, out):
    holes = parse_holes(args.holes)
    graph = session.graph(args.layout, args.facility, holes)
    keys = select_keys(graph, until=args.until, task=args.task)
    if holes:
        keys = {k for k in keys if graph.nodes[k].scope.kind != 'layout' or not any(d.startswith('hole.') for d in graph.nodes[k].spec.deps)}
    run_id = 'run-' + now_iso().replace(':', '').replace('-', '')[:15] + '-' + uuid.uuid4().hex[:6]
    run = Run(run_id=run_id, out_dir=os.path.join(session.output_root, 'runs', run_id))
    command = ' '.join(sys.argv[1:]) if sys.argv else 'run'
    session.ledger.begin_run(run_id, command, git_head(session.repo_root))
    recovered = session.ledger.recover_interrupted()
    rows = execute(graph, session.ctx, run, keys, dry_run=args.dry_run, recovered=recovered)
    result = 'failed' if run.failed else ('dry-run' if args.dry_run else 'ok')
    session.ledger.finish_run(run_id, result)
    selection = {'layout': args.layout, 'facility': args.facility, 'until': args.until, 'task': args.task, 'holes': sorted(holes) if holes else None}
    body = write_run_report(run, rows, session.ctx, command, git_head(session.repo_root), selection)
    if args.json:
        out.write(json.dumps(body, indent=1) + '\n')
    else:
        out.write(f'run {run_id}: executed {len(run.executed)}, cached {len(run.cached)}, blocked {len(run.blocked)}, failed {len(run.failed)}' + (f', dry-run skipped {len(run.skipped)}' if args.dry_run else '') + '\n')
        for f in run.failed:
            out.write(f'  failed {f["key"]}: {f["error"]}\n')
        shown = 0
        for b in run.blocked:
            code = b['blockers'][0]['code'] if b['blockers'] else b['reason']
            if code in ('DEPENDENCY_BLOCKED', 'DEPENDENCY_PENDING'):
                continue
            out.write(f'  blocked {b["key"]}: {code} — {describe(code)}\n')
            shown += 1
            if shown >= 12:
                out.write(f'  … see {os.path.join(run.out_dir, "report.md")}\n')
                break
        out.write(f'report: {os.path.join(run.out_dir, "report.md")}\n')
    return 1 if run.failed else 0


def cohort_layouts(session, cohort_path, min_rounds, include_nonstandard=False):
    """Return the usage-ranked catalog layouts and explicit non-runnable rows.

    A batch starts only from a recorded completed-round cohort.  It never
    invents a priority from catalog order, and it excludes non-standard
    scorecards unless an operator opts in.
    """
    path = cohort_path if os.path.isabs(cohort_path) else os.path.join(session.repo_root, cohort_path)
    if not os.path.isfile(path):
        raise SystemExit(f'missing cohort {path}')
    with open(path, encoding='utf-8') as f:
        cohort = json.load(f)
    by_course = {}
    for layout in session.catalog.layouts.values():
        for course_id in (layout.get('externalBindings') or {}).get('golfCourseIds') or []:
            by_course.setdefault(str(course_id), []).append(layout)
    selected, excluded = [], []
    for course in sorted(cohort.get('courses') or [], key=lambda c: (-(c.get('completed_rounds') or 0), c.get('name') or '')):
        rounds = course.get('completed_rounds') or 0
        if rounds < min_rounds:
            continue
        layouts = by_course.get(str(course.get('id'))) or []
        if not layouts:
            excluded.append({'course': course.get('name'), 'courseId': course.get('id'), 'rounds': rounds,
                             'reason': 'COURSE_NOT_CATALOGUED'})
            continue
        for layout in layouts:
            count = len(layout.get('holeOrder') or [])
            if count != 18 and not include_nonstandard:
                excluded.append({'course': course.get('name'), 'courseId': course.get('id'), 'layoutId': layout['layoutId'],
                                 'rounds': rounds, 'reason': 'NONSTANDARD_HOLE_COUNT', 'holeCount': count})
                continue
            selected.append({'layoutId': layout['layoutId'], 'course': course.get('name'), 'rounds': rounds,
                             'holeCount': count})
    return selected, excluded


def catalog_layouts(session):
    """Every registered layout is a factory concern, even before it has
    recorded rounds.  This intentionally returns no inferred priority: the
    caller gets a deterministic catalog order and each layout's own truth
    gates decide whether any compiler work may happen."""
    return ([{'layoutId': layout['layoutId'], 'course': layout['name'], 'rounds': None,
              'holeCount': len(layout.get('holeOrder') or [])}
             for layout in sorted(session.catalog.layouts.values(), key=lambda item: item['layoutId'])], [])


def cmd_batch(session, args, out):
    # Physical-world aggregation is the safe scale terminal.  A cohort batch
    # never performs player captures or creates publish manifests by default.
    if args.until not in session.specs:
        raise SystemExit(f'unknown batch terminal {args.until}; no tasks were run')
    if args.until in ('layout.publish.prepare', 'layout.publish.verify') or args.until.startswith('hole.player') or args.until.startswith('layout.player'):
        raise SystemExit('batch refuses capture or publish tasks; use an explicit per-layout run after review approval')
    if args.all_layouts:
        selected, excluded = catalog_layouts(session)
        selection = 'catalog'
    else:
        selected, excluded = cohort_layouts(session, args.cohort, args.min_rounds, args.include_nonstandard)
        selection = 'usage_cohort'
    if args.max_layouts is not None:
        if args.max_layouts < 1:
            raise SystemExit('--max-layouts must be positive')
        selected = selected[:args.max_layouts]
    batches = []
    any_failed = False
    for item in selected:
        layout_id = item['layoutId']
        graph = session.graph(layout_id)
        # A world aggregate cannot be reached when route identity is not
        # source-confirmed. In that case the factory still builds a clearly
        # labelled, facility-scoped visual GLB. It has no hole association and
        # cannot feed measurements, but it prevents missing OSM route tags
        # from becoming a blank course. The independent dossier remains the
        # route-review evidence that unlocks the physical chain later.
        keys = select_keys(graph, until=args.until)
        # The default whole-world batch retains its independent visual fallback.
        # A deliberately earlier terminal is a work boundary: assembling routes
        # or vector candidates must not acquire rasters or invoke Blender.
        if args.until == 'layout.world.aggregate':
            keys |= (select_keys(graph, task='layout.route.dossier')
                     | select_keys(graph, task='layout.visual.world.build'))
        run_id = 'batch-' + now_iso().replace(':', '').replace('-', '')[:15] + '-' + uuid.uuid4().hex[:6]
        run = Run(run_id=run_id, out_dir=os.path.join(session.output_root, 'runs', run_id))
        command = f'batch --layout {layout_id} --until {args.until}'
        session.ledger.begin_run(run_id, command, git_head(session.repo_root))
        recovered = session.ledger.recover_interrupted()
        rows = execute(graph, session.ctx, run, keys, dry_run=args.dry_run, recovered=recovered)
        result = 'failed' if run.failed else ('dry-run' if args.dry_run else 'ok')
        session.ledger.finish_run(run_id, result)
        write_run_report(run, rows, session.ctx, command, git_head(session.repo_root),
                         {'layout': layout_id, 'batch': True, 'until': args.until})
        batches.append({**item, 'runId': run_id, 'executed': len(run.executed), 'cached': len(run.cached),
                        'blocked': run.blocked, 'failed': run.failed, 'report': session.ctx.relpath(os.path.join(run.out_dir, 'report.json'))})
        any_failed = any_failed or bool(run.failed)
    body = {'schema': 'golfhelm-factory-batch-v1', 'selection': selection,
            'cohort': None if args.all_layouts else args.cohort, 'minCompletedRounds': None if args.all_layouts else args.min_rounds,
            'until': args.until, 'selected': batches, 'excluded': excluded,
            'totals': {'attempted': len(batches), 'failed': sum(bool(b['failed']) for b in batches),
                       'blocked': sum(bool(b['blocked']) for b in batches), 'excluded': len(excluded)}}
    if args.json:
        out.write(json.dumps(body, indent=1) + '\n')
    else:
        out.write(f'batch: attempted {body["totals"]["attempted"]}, failed {body["totals"]["failed"]}, blocked {body["totals"]["blocked"]}, excluded {body["totals"]["excluded"]}\n')
        for entry in batches:
            state = 'failed' if entry['failed'] else ('blocked' if entry['blocked'] else 'ok')
            out.write(f'  {entry["layoutId"]}: {state}; executed {entry["executed"]}, cached {entry["cached"]}; {entry["report"]}\n')
        for entry in excluded:
            out.write(f'  excluded {entry.get("layoutId") or entry["course"]}: {entry["reason"]}\n')
    return 1 if any_failed else 0


def cmd_status(session, args, out):
    graph = session.graph(args.layout, args.facility)
    rows = plan(graph, session.ctx, adopt=not session.fresh)
    apply_disk_guard(rows, session.ctx, graph)
    status = status_json(rows, session.ctx, args.layout)
    out.write((json.dumps(status, indent=1, default=str) if args.json else render_status(status)) + '\n')
    return 0


def node_key(session, args):
    layout = session.catalog.layouts.get(args.layout)
    if not layout:
        raise SystemExit(f'unknown layout {args.layout}')
    spec = session.specs.get(args.task)
    if not spec:
        raise SystemExit(f'unknown task {args.task}; known: {", ".join(sorted(session.specs))}')
    if spec.scope_kind == 'facility':
        return f'{args.task}[{layout["facilityId"]}]'
    if spec.scope_kind == 'layout':
        return f'{args.task}[{args.layout}]'
    if not args.hole:
        raise SystemExit(f'{args.task} is a hole task: pass --hole N')
    return f'{args.task}[{args.layout}:{args.hole:02d}]'


def cmd_why(session, args, out):
    graph = session.graph(args.layout)
    rows = plan(graph, session.ctx, adopt=not session.fresh)
    apply_disk_guard(rows, session.ctx, graph)
    key = node_key(session, args)
    by_key = {r.key: r for r in rows}
    out.write('\n'.join(why(graph, session.ctx, by_key, key)) + '\n')
    return 0 if key in by_key else 1


def cmd_intake(session, args, out):
    from .intake import build_entries, render, write_entries

    def read(path):
        path = path if os.path.isabs(path) else os.path.join(session.repo_root, path)
        if not os.path.isfile(path):
            raise SystemExit(f'missing input {path}')
        with open(path, encoding='utf-8') as f:
            return json.load(f)

    rows = build_entries(read(args.cohort), read(args.coverage), read(args.scorecards), session.catalog, args.min_rounds)
    written = write_entries(session.catalog_root, rows) if args.write else []
    if args.json:
        out.write(json.dumps({'rows': [{k: v for k, v in r.items() if k != 'docs'} for r in rows], 'written': [session.ctx.relpath(w) for w in written]}, indent=1) + '\n')
    else:
        out.write(render(rows) + '\n')
        counts = {}
        for r in rows:
            counts[r['status']] = counts.get(r['status'], 0) + 1
        out.write('totals: ' + ', '.join(f'{k} {v}' for k, v in sorted(counts.items())) + '\n')
        if args.write:
            out.write(f'wrote {len(written)} manifest(s)\n' + ''.join(f'  {session.ctx.relpath(w)}\n' for w in written))
        elif any(r['status'] == 'ready_to_write' for r in rows):
            out.write('re-run with --write to add the ready_to_write rows to the catalog\n')
    return 0


def cmd_intake_played(session, args, out):
    from .intake_played import cmd_intake_played as run
    return run(session, args, out)


def cmd_invalidate(session, args, out):
    key = node_key(session, args)
    scope = key.split('[', 1)[1].rstrip(']')
    session.ledger.invalidate(key, scope, args.reason)
    out.write(f'invalidated {key}: {args.reason}\n')
    return 0


def cmd_evict(session, args, out):
    """Factory-owned cleanup for class-C reproducible intermediates.

    The command deliberately cannot select source truth (A), reacquirable
    source cache (B), or published assets (D).  It also refuses a prefix
    outside the configured output root and defaults to a dry run.
    """
    if args.bytes < 1:
        raise SystemExit('--bytes must be positive')
    output_root = os.path.realpath(session.output_root)
    prefix = os.path.realpath(args.path_prefix if os.path.isabs(args.path_prefix)
                              else os.path.join(output_root, args.path_prefix))
    if os.path.commonpath((output_root, prefix)) != output_root:
        raise SystemExit('--path-prefix must be inside --output')
    candidates = session.ledger.eviction_candidates(args.bytes, classes=('C',), path_prefix=prefix)
    body = {'schema': 'golfhelm-factory-eviction-v1', 'outputRoot': output_root,
            'pathPrefix': prefix, 'requestedBytes': args.bytes,
            'reclaimableBytes': sum(item['bytes'] for item in candidates),
            'applied': False, 'candidates': candidates}
    if args.apply:
        removed = []
        for item in candidates:
            path = os.path.realpath(item['path'])
            if os.path.commonpath((output_root, path)) != output_root:
                raise SystemExit(f'refusing to delete artifact outside output: {item["path"]}')
            if not os.path.isfile(path):
                continue
            os.remove(path)
            removed.append(item)
        if removed:
            session.ledger.forget_evicted(removed, f'factory eviction: reclaimed reproducible intermediate under {session.ctx.relpath(prefix)}')
        body.update({'applied': True, 'removed': removed, 'removedBytes': sum(item['bytes'] for item in removed)})
    if args.json:
        out.write(json.dumps(body, indent=1) + '\n')
    else:
        action = 'removed' if args.apply else 'would remove'
        out.write(f'{action} {len(body.get("removed", candidates))} class-C artifact(s), {body.get("removedBytes", body["reclaimableBytes"])} bytes\\n')
        for item in body.get('removed', candidates):
            out.write(f'  {session.ctx.relpath(item["path"])} ({item["bytes"]} bytes; {item["producer"]})\\n')
    return 0


def cmd_refresh_scorecards(session, args, out):
    from .scorecard_refresh import refresh
    result = refresh(session.catalog_root, session.ctx.abspath(args.snapshot), args.write)
    out.write(json.dumps(result, indent=1) + '\n')
    return 0


def cmd_review_bundle(session, args, out):
    from .review_bundle import review_bundle
    return review_bundle(session, args, out)


def cmd_route_recovery(session, args, out):
    from .route_recovery import inventory, render_inventory
    session.graph(args.layout, args.facility)  # Validate explicit scope, without planning/executing tasks.
    result = inventory(session.ctx, layout_id=args.layout, facility_id=args.facility)
    out.write((json.dumps(result, indent=1) if args.json else render_inventory(result)) + '\n')
    return 1 if result['totals']['invalidSources'] else 0


def cmd_coverage(session, args, out):
    """Read-only inventory/admission report used by CI and review queues."""
    from .world_coverage import acquisition_tasks, audit_catalog, render_markdown, terrain_decisions
    report = audit_catalog(session.repo_root, session.catalog_root, session.output_root)
    if args.write_json:
        with open(args.write_json, 'w', encoding='utf-8') as stream:
            json.dump(report, stream, indent=2, sort_keys=True)
            stream.write('\n')
    if args.write_markdown:
        from pathlib import Path
        Path(args.write_markdown).write_text(render_markdown(report) + '\n', encoding='utf-8')
    for path, document in ((args.write_acquisition_tasks, acquisition_tasks(report)),
                           (args.write_terrain_decisions, terrain_decisions(report))):
        if path:
            with open(path, 'w', encoding='utf-8') as stream:
                json.dump(document, stream, indent=2, sort_keys=True)
                stream.write('\n')
    out.write((json.dumps(report, indent=1) if args.json else render_markdown(report)) + '\n')
    return 0


def cmd_ship(session, args, out):
    if args.approve:
        from .ship_publish import cmd_ship_approve
        return cmd_ship_approve(session, args, out)
    if args.live_pilot or args.upload:
        raise SystemExit('--live-pilot and --upload only apply with --approve')
    if args.all_played:
        if args.layout:
            raise SystemExit('--layout and --all-played are mutually exclusive')
        from .ship_batch import cmd_ship_all_played
        return cmd_ship_all_played(session, args, out)
    if not args.layout:
        raise SystemExit('ship requires --layout (or --approve LAYOUT CONTENTHASH, or --all-played)')
    from .ship_run import cmd_ship_build
    return cmd_ship_build(session, args, out)


COMMANDS = {'doctor': cmd_doctor, 'plan': cmd_plan, 'run': cmd_run, 'status': cmd_status, 'batch': cmd_batch, 'why': cmd_why, 'invalidate': cmd_invalidate, 'evict': cmd_evict, 'intake': cmd_intake,
            'refresh-scorecards': cmd_refresh_scorecards, 'review-bundle': cmd_review_bundle, 'route-recovery': cmd_route_recovery,
            'coverage': cmd_coverage, 'ship': cmd_ship, 'intake-played': cmd_intake_played}


def main(argv=None, out=None, ledger=None, executors=None, spec_overrides=None):
    out = out or sys.stdout
    args = build_parser().parse_args(argv)
    session = Session(args, ledger=ledger, executors=executors, spec_overrides=spec_overrides)
    try:
        return COMMANDS[args.command](session, args, out)
    finally:
        if ledger is None and session.ledger is not None:
            session.ledger.close()
