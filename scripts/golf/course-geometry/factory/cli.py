"""`course-factory.py` — doctor · plan · run · status · why · invalidate."""
import argparse
import importlib
import json
import os
import platform
import shutil
import subprocess
import sys

from . import disk
from .catalog import load_catalog
from .context import Context
from .graph import build_graph
from .ledger import Ledger, now_iso
from .planner import apply_disk_guard, plan, why
from .reasons import describe
from .report import golden_rows, plan_json, render_plan, render_status, status_json, write_run_report
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
    w = sub.add_parser('why')
    w.add_argument('--layout', required=True)
    w.add_argument('--task', required=True)
    w.add_argument('--hole', type=int)
    i = sub.add_parser('invalidate')
    i.add_argument('--layout', required=True)
    i.add_argument('--task', required=True)
    i.add_argument('--hole', type=int)
    i.add_argument('--reason', required=True)
    return p


class Session:
    def __init__(self, args, ledger=None, executors=None, spec_overrides=None):
        self.repo_root = os.path.abspath(args.repo_root) if args.repo_root else find_repo_root(os.path.dirname(os.path.abspath(__file__)))
        self.catalog_root = os.path.join(self.repo_root, args.catalog or DEFAULT_CATALOG) if not (args.catalog and os.path.isabs(args.catalog)) else args.catalog
        self.output_root = os.path.join(self.repo_root, args.output or DEFAULT_OUTPUT) if not (args.output and os.path.isabs(args.output)) else args.output
        self.catalog = load_catalog(self.catalog_root)
        self.specs = default_specs(spec_overrides)
        self.ledger = ledger if ledger is not None else Ledger(os.path.join(self.output_root, 'state.sqlite'))
        self.ctx = Context(self.repo_root, self.catalog, self.output_root, self.ledger, adopt_output=not args.no_adopt_output, executors=executors)

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
        except Exception as exc:  # noqa: BLE001
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
                res = subprocess.run([path, *args], capture_output=True, text=True, timeout=10)
                return (res.stdout or res.stderr).strip().splitlines()[0][:80] if (res.stdout or res.stderr) else path
            except Exception:
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
    probe('osmium (optional)', binary('osmium'))
    probe('qgis (optional)', lambda: next((p for p in ('/Applications',) for _ in [0] for p in [__import__('glob').glob('/Applications/QGIS*.app')] if p), None) and 'present')
    free = disk.free_bytes(session.output_root)
    checks.append({'check': 'free disk', 'ok': free > disk.reserve_bytes(), 'detail': f'{disk.gb(free)} GB free, reserve {disk.gb(disk.reserve_bytes())} GB', 'required': True})
    catalog = session.catalog
    checks.append({'check': 'catalog', 'ok': not catalog.problems,
                   'detail': f'{len(catalog.facilities)} facilities, {len(catalog.layouts)} layouts, {len(catalog.scorecards)} scorecards' + (f'; {len(catalog.problems)} problem(s): ' + '; '.join(catalog.problems[:3]) if catalog.problems else ''), 'required': True})
    checks.append({'check': 'ledger', 'ok': True, 'detail': session.ledger.path, 'required': False})
    for c in checks:
        mark = 'ok ' if c['ok'] else ('!! ' if c['required'] else '-- ')
        out.write(f'{mark}{c["check"]:<20} {c["detail"]}\n')
    return 0 if all(c['ok'] or not c['required'] for c in checks) else 1


def cmd_plan(session, args, out):
    graph = session.graph(args.layout, args.facility)
    rows = plan(graph, session.ctx)
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
    run_id = 'run-' + now_iso().replace(':', '').replace('-', '')
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


def cmd_status(session, args, out):
    graph = session.graph(args.layout, args.facility)
    rows = plan(graph, session.ctx)
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
    rows = plan(graph, session.ctx)
    apply_disk_guard(rows, session.ctx, graph)
    key = node_key(session, args)
    by_key = {r.key: r for r in rows}
    out.write('\n'.join(why(graph, session.ctx, by_key, key)) + '\n')
    return 0 if key in by_key else 1


def cmd_invalidate(session, args, out):
    key = node_key(session, args)
    scope = key.split('[', 1)[1].rstrip(']')
    session.ledger.invalidate(key, scope, args.reason)
    out.write(f'invalidated {key}: {args.reason}\n')
    return 0


COMMANDS = {'doctor': cmd_doctor, 'plan': cmd_plan, 'run': cmd_run, 'status': cmd_status, 'why': cmd_why, 'invalidate': cmd_invalidate}


def main(argv=None, out=None, ledger=None, executors=None, spec_overrides=None):
    out = out or sys.stdout
    args = build_parser().parse_args(argv)
    session = Session(args, ledger=ledger, executors=executors, spec_overrides=spec_overrides)
    try:
        return COMMANDS[args.command](session, args, out)
    finally:
        if ledger is None:
            session.ledger.close()
