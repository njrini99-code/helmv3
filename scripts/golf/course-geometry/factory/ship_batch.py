"""`course-factory.py ship --all-played`: run `ship --layout <id>` for every
played, catalogued course (Oviinbyrd excepted), one course and one disk-heavy
factory job at a time, honouring the overnight watchdog's PAUSE file and free
disk, evicting each course's own class-C intermediates once it reaches a
verdict, and writing one summary row per course to
`output/course-geometry/overnight/batch-summary.json`.

Disk-safety model (verified against the ledger, not assumed):
  - `evict --path-prefix <layout_out>` only ever deletes rows the ledger's
    `artifacts` table records with retention_class 'C' (`cli.cmd_evict` hard-
    codes `classes=('C',)`). Ship's own outputs -- qa-report.json, the
    contact sheet, captures.json, staging/ -- are written with plain
    `open()`/`json.dump()` in `ship_run.py` and are never passed through
    `adapters.artifact()`, so they are never ledger rows and can never be an
    eviction candidate, regardless of --path-prefix. The layout's own
    package (`package/normalized.json`, read by `ship --approve`) is
    registered class 'A' (source truth) by `layout.package.compose`, so it
    is structurally protected too. That leaves exactly the reproducible
    per-hole terrain/world intermediates (`compiled/*`, `compiled-bound/*`,
    `world/holes/*/record.json`, `world/course-world-manifest.json`,
    `terrain-summary.json`) as the eviction target -- confirmed directly
    against `output/course-geometry/factory/state.sqlite`, which holds real
    class-C rows for these tasks. So "except the files ship's outputs and
    the contact sheet need" is satisfied by construction: no extra
    exclusion list is required.
  - Every disk-heavy invocation (`ship --layout X`, `evict`) is its own
    `lockf -k BUILD.lock` subprocess, per course, per step -- never held for
    the whole batch, so another worker's job can interleave between
    courses and even between a course's ship run and its own eviction.
  - This driver itself must NOT be wrapped in `lockf -k BUILD.lock` by a
    caller -- it does its own per-step locking, and a wrapping lock would
    self-deadlock the first course. `_refuse_if_already_locked` guards
    against exactly that.
"""
import json
import os
import shutil
import subprocess
import sys
import time

from .catalog import load_catalog
from .ledger import now_iso

OVIINBYRD_DB_ID = '13d2c110-bee4-496e-b390-e523a4bd0fbb'
OVIINBYRD_NAME = 'oviinbyrd golf club'
DEFAULT_MIN_FREE_GB = 9.0
DEFAULT_POLL_SECONDS = 30
DEFAULT_STATUS_EVERY = 10  # ~ every (poll_seconds * this) seconds while waiting
EVICT_BUDGET_BYTES = 20_000_000_000  # effectively "evict every class-C row under this prefix"


def overnight_dir(repo_root):
    return os.path.join(repo_root, 'output', 'course-geometry', 'overnight')


def build_lock_path(repo_root):
    return os.path.join(overnight_dir(repo_root), 'BUILD.lock')


def free_gb(path):
    return shutil.disk_usage(path).free / 1e9


def _parse_ps_table(text):
    by_pid = {}
    for line in text.splitlines():
        parts = line.strip().split(None, 2)
        if len(parts) == 3 and parts[0].isdigit() and parts[1].isdigit():
            by_pid[int(parts[0])] = (int(parts[1]), parts[2])
    return by_pid


def _ancestor_holds_lock(by_pid, start_pid, lock_path, max_depth=8):
    """Pure ancestor walk: does `start_pid` (or one of its ancestors, up to
    `max_depth` hops) already run a `lockf ... <lock_path>` command? Returns
    the (pid, command) that matched, or None."""
    pid = start_pid
    for _ in range(max_depth):
        entry = by_pid.get(pid)
        if not entry:
            return None
        ppid, command = entry
        if 'lockf' in command and lock_path in command:
            return (pid, command)
        pid = ppid
    return None


def _refuse_if_already_locked(repo_root, out):
    """`ship --all-played` takes BUILD.lock itself, per course. If a caller
    also wraps this invocation in `lockf -k BUILD.lock`, the first per-course
    child lockf blocks forever on the lock its own parent holds. Detect that
    by name before starting, rather than hanging silently for hours."""
    lock_path = build_lock_path(repo_root)
    try:
        table = subprocess.run(['ps', '-ax', '-o', 'pid=,ppid=,command='],
                               capture_output=True, text=True, timeout=5, check=False).stdout
    except Exception as error:  # pragma: no cover - defensive only
        out.write(f'note: could not check for a nested BUILD.lock ({error}); continuing\n')
        return False
    hit = _ancestor_holds_lock(_parse_ps_table(table), os.getppid(), lock_path)
    if hit:
        pid, command = hit
        out.write(f'refusing to start: an ancestor process is already holding {lock_path} '
                  f'(pid {pid}: {command!r}); ship --all-played takes this lock itself, per course -- '
                  'do not wrap the --all-played invocation in lockf, or every course will deadlock waiting on its own parent\n')
        return True
    return False


def wait_for_capacity(pause_path, min_free_gb, out, free_gb_fn=None, sleep_fn=time.sleep,
                      poll_seconds=DEFAULT_POLL_SECONDS, status_every=DEFAULT_STATUS_EVERY):
    """Blocks while `pause_path` exists or free disk is below `min_free_gb`,
    polling every `poll_seconds`. Re-checked by the caller before every
    course, not just once at batch start. Free space is measured on the
    volume holding `pause_path` unless `free_gb_fn` is injected."""
    if free_gb_fn is None:
        def free_gb_fn():
            return free_gb(os.path.dirname(pause_path) or '.')
    ticks = 0
    while True:
        paused = os.path.exists(pause_path)
        free = free_gb_fn()
        if not paused and free >= min_free_gb:
            return
        ticks += 1
        if ticks == 1 or ticks % status_every == 0:
            reason = 'PAUSE is set' if paused else f'{free:.1f} GB free < {min_free_gb:.1f} GB required'
            out.write(f'waiting for capacity: {reason}\n')
        sleep_fn(poll_seconds)


def select_courses(played, catalog_layouts):
    """Pure selection: flattens played-courses.json into one row per course,
    skipping Oviinbyrd (out of scope) and any course with no catalog layout
    yet. A layout counts if played-courses.json lists it or if its
    `externalBindings.golfCourseIds` names the course (how `intake-played
    --write` binds a course catalogued after the played snapshot was taken).
    `catalog_layouts` maps layout id -> document, so the caller can re-load
    the catalog fresh right before calling this and pick up entries another
    worker adds mid-run. A layout already selected by an earlier row (an
    alias course folded into one layout) is not shipped twice."""
    rows = []
    selected = set()
    for course in played.get('courses') or []:
        db_id = course.get('dbCourseId')
        name = course.get('name') or ''
        base = {'dbCourseId': db_id, 'name': course.get('name'), 'rounds': course.get('rounds')}
        if db_id == OVIINBYRD_DB_ID or name.strip().lower() == OVIINBYRD_NAME:
            rows.append({**base, 'status': 'SKIPPED', 'skippedReason': 'out_of_scope', 'layouts': []})
            continue
        listed = [lid for lid in course.get('layouts') or [] if lid in catalog_layouts]
        bound = [lid for lid, doc in sorted(catalog_layouts.items())
                 if db_id and db_id in (((doc or {}).get('externalBindings') or {}).get('golfCourseIds') or [])]
        eligible = list(dict.fromkeys(listed + bound))
        if not eligible:
            rows.append({**base, 'status': 'SKIPPED', 'skippedReason': 'no_catalog_entry', 'layouts': []})
            continue
        fresh = [lid for lid in eligible if lid not in selected]
        if not fresh:
            rows.append({**base, 'status': 'SKIPPED', 'skippedReason': 'layout_selected_by_earlier_row', 'layouts': []})
            continue
        selected.update(fresh)
        rows.append({**base, 'status': None, 'skippedReason': None,
                    'layouts': [{'layoutId': lid} for lid in fresh]})
    return rows


def _write_summary_atomic(path, courses):
    body = {'schema': 'golfhelm-factory-ship-batch-summary-v1', 'generatedAt': now_iso(), 'courses': courses,
            'totals': {'courses': len(courses),
                       'ready': sum(1 for c in courses if c['status'] == 'READY_FOR_APPROVAL'),
                       'notReady': sum(1 for c in courses if c['status'] == 'NOT_READY'),
                       'error': sum(1 for c in courses if c['status'] == 'ERROR'),
                       'skipped': sum(1 for c in courses if c['status'] == 'SKIPPED')}}
    tmp = path + '.tmp'
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(body, f, indent=1, sort_keys=True)
        f.write('\n')
    os.replace(tmp, path)
    return body


def _run_locked(lock_path, argv, log_path):
    full = ['lockf', '-k', lock_path] + argv
    os.makedirs(os.path.dirname(log_path), exist_ok=True)
    with open(log_path, 'w', encoding='utf-8') as log:
        log.write('$ ' + ' '.join(full) + '\n')
        log.flush()
        result = subprocess.run(full, stdout=log, stderr=subprocess.STDOUT, text=True, check=False)
    return result.returncode


def _factory_cli_argv(session, args):
    factory_cli = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'course-factory.py')
    argv = [sys.executable or 'python3', factory_cli, '--repo-root', session.repo_root,
           '--catalog', session.catalog_root, '--output', session.output_root]
    if getattr(args, 'no_adopt_output', False):
        argv.append('--no-adopt-output')
    if getattr(args, 'fresh', False):
        argv.append('--fresh')
    for item in getattr(args, 'fresh_traces', None) or []:
        argv += ['--fresh-traces', item]
    return argv


class _NullWriter:
    def write(self, _text):
        pass


def _ship_one_layout(session, args, layout_id, overnight, lock_path, note):
    ctx = session.ctx
    dest = os.path.join(ctx.layout_out(layout_id), 'ship')
    qa_path = os.path.join(dest, 'qa-report.json')
    started = time.time()
    ship_log = os.path.join(overnight, 'logs', f'{layout_id}-ship.log')
    code = _run_locked(lock_path, _factory_cli_argv(session, args) + ['ship', '--layout', layout_id, '--json'], ship_log)
    fresh_enough = os.path.isfile(qa_path) and os.path.getmtime(qa_path) >= started
    qa = ctx.json(qa_path, fresh=True) if fresh_enough else None
    row = {'layoutId': layout_id, 'shipExitCode': code, 'shipLog': ctx.relpath(ship_log)}
    if qa:
        row.update({'status': qa.get('status'), 'blockers': [b.get('code') for b in (qa.get('blockers') or [])],
                    'contactSheet': qa.get('contactSheet'), 'packageHash': qa.get('packageHash')})
    else:
        row.update({'status': 'ERROR', 'blockers': [],
                    'contactSheet': None, 'packageHash': None,
                    'error': f'ship exited {code} without a fresh qa-report.json (crash, kill, or disk guard); see {ship_log}'})
    note.write(f'{layout_id}: {row["status"]}' + (f' ({", ".join(row["blockers"])})' if row.get('blockers') else '') + '\n')
    evict_log = os.path.join(overnight, 'logs', f'{layout_id}-evict.log')
    evict_code = _run_locked(lock_path, _factory_cli_argv(session, args) +
                             ['evict', '--bytes', str(EVICT_BUDGET_BYTES), '--path-prefix', ctx.layout_out(layout_id), '--apply', '--json'],
                             evict_log)
    row['evictExitCode'] = evict_code
    row['evictLog'] = ctx.relpath(evict_log)
    return row


def cmd_ship_all_played(session, args, out):
    # With --json, stdout carries only the final structured body (matching
    # every other subcommand's convention); progress still goes to `note`
    # (stdout when text mode is requested) and, either way, to the
    # incrementally-rewritten batch-summary.json on disk.
    note = _NullWriter() if args.json else out
    repo_root = session.repo_root
    overnight = overnight_dir(repo_root)
    os.makedirs(overnight, exist_ok=True)
    if _refuse_if_already_locked(repo_root, out):
        return 1
    lock_path = build_lock_path(repo_root)
    played_path = os.path.join(overnight, 'played-courses.json')
    with open(played_path, encoding='utf-8') as f:
        played = json.load(f)

    summary_path = os.path.join(overnight, 'batch-summary.json')
    pause_path = os.path.join(overnight, 'PAUSE')
    course_rows = []
    shipped_by_layout = {}  # reuse a result if two courses share a layout id
    any_not_ready = False

    for base_row in select_courses(played, load_catalog(session.catalog_root).layouts):
        if base_row['status'] == 'SKIPPED':
            course_rows.append(base_row)
            note.write(f'{base_row["name"]}: SKIPPED ({base_row["skippedReason"]})\n')
            if args.dry_run:
                continue
            _write_summary_atomic(summary_path, course_rows)
            continue
        if args.dry_run:
            course_rows.append({**base_row, 'status': 'DRY_RUN_SELECTED'})
            note.write(f'{base_row["name"]}: would ship {[l["layoutId"] for l in base_row["layouts"]]}\n')
            continue

        layout_results = []
        for entry in base_row['layouts']:
            layout_id = entry['layoutId']
            if layout_id in shipped_by_layout:
                layout_results.append(shipped_by_layout[layout_id])
                continue
            wait_for_capacity(pause_path, args.min_free_gb, note, poll_seconds=args.poll_seconds)
            result = _ship_one_layout(session, args, layout_id, overnight, lock_path, note)
            shipped_by_layout[layout_id] = result
            layout_results.append(result)

        statuses = {r['status'] for r in layout_results}
        course_status = 'READY_FOR_APPROVAL' if statuses == {'READY_FOR_APPROVAL'} else ('ERROR' if 'ERROR' in statuses else 'NOT_READY')
        any_not_ready = any_not_ready or course_status != 'READY_FOR_APPROVAL'
        single = layout_results[0] if len(layout_results) == 1 else None
        course_rows.append({**base_row, 'status': course_status,
                            'blockers': single['blockers'] if single else sorted({b for r in layout_results for b in r['blockers']}),
                            'contactSheet': single['contactSheet'] if single else None,
                            'packageHash': single['packageHash'] if single else None,
                            'layouts': layout_results})
        _write_summary_atomic(summary_path, course_rows)

    body = _write_summary_atomic(summary_path, course_rows) if not args.dry_run else {'schema': 'golfhelm-factory-ship-batch-summary-v1(dry-run)', 'courses': course_rows}
    if args.json:
        out.write(json.dumps(body, indent=1) + '\n')
    else:
        out.write(f'batch-summary: {summary_path if not args.dry_run else "(dry run, not written)"}\n')
    return 1 if (any_not_ready and not args.dry_run) else 0
