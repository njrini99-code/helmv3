"""States, blockers and rebuild reasons for every node (Factory v2 §5–6, §9, §11).

Order of judgement per node: its own blockers, then a blocked dependency,
then an unbuilt dependency, then the ledger (same fingerprint + verified
outputs = cached; other fingerprint = stale), then adoption of a retained
artifact that matches the current inputs, then ready / no adapter yet.
"""
import os

from . import disk
from .fingerprints import digest, file_sha256_or_none, fingerprint
from .graph import parse_dep
from .model import Blocker, PlanRow
from .tasks import INLINE

DONE = ('cached', 'success')


def optional_dep_ids(spec):
    return {parse_dep(d)[0] for d in spec.deps if parse_dep(d)[1]}


def plan(graph, ctx, adopt=True, free_bytes=None):
    """Plan rows in topological order. `adopt` also records adopted
    artifacts in the ledger so later plans explain changes against them."""
    ctx.graph = graph
    recovered = set(ctx.ledger.recover_interrupted()) if ctx.ledger else set()
    free = disk.free_bytes(ctx.output_root) if free_bytes is None else free_bytes
    rows = []
    for key in graph.order:
        row = plan_node(graph.nodes[key], ctx, recovered, adopt, free)
        rows.append(row)
    return rows


def plan_node(node, ctx, recovered=(), adopt=True, free=None):
    spec = node.spec
    ev = spec.evaluate(node, ctx)
    row = PlanRow(key=node.key, task=spec.id, scope=node.scope.label, state='unknown', reason='', inputs=dict(ev.inputs), artifacts=list(ev.artifacts), notes=list(ev.notes))
    impl = ctx.impl_hash(spec)
    fp = fingerprint(spec.id, spec.version, impl, spec.settings, ev.inputs)
    row.fingerprint = fp
    recorded_inputs = {**ev.inputs, '__version__': spec.version, '__impl__': impl, '__settings__': digest(spec.settings)}
    optional = optional_dep_ids(spec)

    def finish(state, reason, output=None, blockers=()):
        row.state, row.reason, row.output_hash, row.blockers = state, reason, output, list(blockers)
        ctx.states[node.key] = state
        ctx.rows[node.key] = row
        if output is not None:
            ctx.outputs[node.key] = output
        return row

    if ev.blockers:
        return finish('blocked', ev.blockers[0].code, blockers=ev.blockers)
    ledger = ctx.ledger
    success = ledger.last_success(node.key) if ledger else None
    executor = ctx.executor(spec)
    adoptable = ev.adoptable and ev.artifacts and all(os.path.isfile(a.path) for a in ev.artifacts)
    if success and success['fingerprint'] == fp and not ledger.invalidation_after(node.key, success['finished_at']):
        artifacts = ledger.artifacts_for(node.key)
        problem = verify_artifacts(artifacts)
        if problem is None:
            row.artifacts = artifacts
            ledger.touch_artifacts(node.key)
            return finish('cached', 'FINGERPRINT_UNCHANGED', ev.output or output_hash(artifacts, fp))
    unfinished = None
    if ledger and not success:
        # A run that died or failed on these inputs outranks a consistent-
        # looking artifact: the ledger says the work did not finish.
        last = ledger.last_run(node.key)
        if node.key in recovered or (last and last['state'] == 'interrupted'):
            unfinished = 'INTERRUPTED_RUN_RECOVERED'
        elif last and last['state'] == 'failed' and last['fingerprint'] == fp:
            unfinished = 'PREVIOUS_RUN_FAILED'
    retained = bool(ev.artifacts) and not any(ctx.is_output_path(a.path) for a in ev.artifacts)
    invalidated = bool(success and ledger.invalidation_after(node.key, success['finished_at']))
    if adoptable and not unfinished and (not success or (retained and not invalidated)):
        # A retained artifact that proves it was built from the current
        # inputs is done work, whether or not its upstream cache is present,
        # and stays so when only the fingerprint moved under an earlier
        # adoption (an implementation edit, a dependency's identity): the
        # content checks are what retained evidence is judged by, and a fresh
        # ledger would adopt it again. Built output keeps rebuilding on such a
        # change, and a manual invalidation still asks for the rebuild.
        if ledger and adopt:
            ledger.record_success(_plan_run_id(ledger), node, fp, recorded_inputs, ev.artifacts)
        return finish('cached', 'ADOPTED_EXTERNAL', ev.output or output_hash(ev.artifacts, fp))
    required = [d for d in node.deps if d.split('[', 1)[0] not in optional]
    dep_blocked = sorted((d for d in required if ctx.states.get(d) in ('blocked', 'failed')), key=lambda d: _blocker_rank(ctx.rows[d]))
    if dep_blocked:
        first = ctx.rows[dep_blocked[0]]
        code = first.blockers[0].code if first.blockers else first.reason
        root, root_key = _root_blocker(ctx, dep_blocked[0])
        return finish('blocked', 'DEPENDENCY_BLOCKED', blockers=[Blocker('DEPENDENCY_BLOCKED', {'dependency': dep_blocked[0], 'code': code, 'root': root, 'rootKey': root_key, 'count': len(dep_blocked)})])
    # An optional dependency never blocks its dependant, but the dependant
    # still waits for it to be attempted: planning a compile without the
    # context layer only because the classifier has not run yet would build
    # the wrong thing and then rebuild it.
    dep_pending = [d for d in node.deps if ctx.states.get(d) not in DONE and (d in required or ctx.states.get(d) not in ('blocked', 'failed'))]
    if dep_pending:
        # Nothing is wrong here: an upstream node simply has to run first. A
        # pending row tells the reader which one, and how far the wait reaches.
        root = _root_pending(ctx, dep_pending[0])
        return finish('pending', 'DEPENDENCY_PENDING', blockers=[Blocker('DEPENDENCY_PENDING', {'dependency': dep_pending[0], 'state': ctx.states.get(dep_pending[0]), 'root': root, 'count': len(dep_pending)})])

    if success:
        manual = ledger.invalidation_after(node.key, success['finished_at'])
        if manual:
            row.notes.append(f'invalidated {manual["created_at"]}: {manual["reason"]}')
            return _needs_work(row, finish, executor, 'MANUAL_INVALIDATION')
        if success['fingerprint'] == fp:
            artifacts = ledger.artifacts_for(node.key)
            code, path = verify_artifacts(artifacts)
            row.notes.append(f'{code.lower()}: {ctx.relpath(path)}')
            return _needs_work(row, finish, executor, code)
        previous = ledger.inputs_for(node.key, success['fingerprint'])
        row.changed_inputs = changed_inputs(previous, recorded_inputs)
        return _needs_work(row, finish, executor, 'FINGERPRINT_CHANGED')

    if executor == INLINE:
        if ledger:
            ledger.record_success(_plan_run_id(ledger), node, fp, recorded_inputs, [])
        return finish('cached', 'INLINE_VALIDATED', fp)
    if ledger:
        running = ledger.running(node.key)
        if running:
            row.notes.append(f'run {running["build_run_id"]} pid {running["pid"]}')
            return finish('running', 'RUNNING')
        if unfinished == 'INTERRUPTED_RUN_RECOVERED':
            row.notes.append('a previous run of this task was interrupted')
            return _needs_work(row, finish, executor, 'INTERRUPTED_RUN_RECOVERED')
        if unfinished == 'PREVIOUS_RUN_FAILED':
            last = ledger.last_run(node.key)
            row.notes.append(f'failed in run {last["build_run_id"]} (exit {last["exit_code"]})')
            return _needs_work(row, finish, executor, 'PREVIOUS_RUN_FAILED')
    return _needs_work(row, finish, executor, 'INTERRUPTED_RUN_RECOVERED' if node.key in recovered else 'NO_SUCCESSFUL_FINGERPRINT', free)


HUMAN_FIRST = ('ADAPTER_NOT_IMPLEMENTED', 'DEPENDENCY_PENDING', 'DEPENDENCY_BLOCKED', 'DISK_GUARD_BLOCKED', 'TOOL_MISSING')


def _blocker_rank(row):
    """A human decision (route ids, a review) outranks a missing adapter when
    a node names which dependency blocks it."""
    code = row.blockers[0].code if row.blockers else row.reason
    root = row.blockers[0].evidence.get('root') if row.blockers and code == 'DEPENDENCY_BLOCKED' else code
    return (1 if root in HUMAN_FIRST else 0, row.key)


def _root_blocker(ctx, key):
    """(code, node key) of the first node in a blocked chain that is blocked
    or failed on its own account."""
    row = ctx.rows.get(key)
    while row and row.blockers and row.blockers[0].code in ('DEPENDENCY_BLOCKED', 'DEPENDENCY_PENDING') and row.blockers[0].evidence.get('dependency') in ctx.rows:
        row = ctx.rows.get(row.blockers[0].evidence.get('dependency'))
    if not row:
        return None, key
    return (row.blockers[0].code if row.blockers else row.reason), row.key


def _root_pending(ctx, key):
    """The first node in a pending chain that is actually ready (or blocked)."""
    row = ctx.rows.get(key)
    seen = set()
    while row and row.state == 'pending' and row.blockers and row.key not in seen:
        seen.add(row.key)
        row = ctx.rows.get(row.blockers[0].evidence.get('dependency'))
    return row.key if row else key


def _needs_work(row, finish, executor, reason, free=None):
    if executor is None:
        # Not runnable yet, but the state stays truthful: a prior success
        # that no longer holds is stale, never silently cached.
        state = 'stale' if reason in ('FINGERPRINT_CHANGED', 'ARTIFACT_MISSING', 'ARTIFACT_CORRUPT', 'MANUAL_INVALIDATION') else 'blocked'
        blockers = [Blocker('ADAPTER_NOT_IMPLEMENTED', {'task': row.task})]
        return finish(state, reason if state == 'stale' else 'ADAPTER_NOT_IMPLEMENTED', blockers=blockers)
    if reason in ('FINGERPRINT_CHANGED', 'ARTIFACT_MISSING', 'ARTIFACT_CORRUPT', 'MANUAL_INVALIDATION'):
        return finish('stale', reason)
    if reason == 'PREVIOUS_RUN_FAILED':
        return finish('failed', reason)
    return finish('ready', reason)


def verify_artifacts(artifacts):
    """None when every recorded output is present and matches; else
    (ARTIFACT_MISSING | ARTIFACT_CORRUPT, path)."""
    for a in artifacts:
        if not os.path.isfile(a.path):
            return ('ARTIFACT_MISSING', a.path)
        if a.sha256 and a.key not in ('package', 'context-layer') and file_sha256_or_none(a.path) != a.sha256:
            return ('ARTIFACT_CORRUPT', a.path)
        if a.key in ('package', 'context-layer'):
            # Content-addressed documents: the recorded hash is their contentHash.
            import json

            from .fingerprints import content_hash_matches
            with open(a.path, encoding='utf-8') as f:
                doc = json.load(f)
            if doc.get('contentHash') != a.sha256 or not content_hash_matches(doc):
                return ('ARTIFACT_CORRUPT', a.path)
    return None


def output_hash(artifacts, fp):
    if not artifacts:
        return fp
    return digest([[a.key, a.sha256 or file_sha256_or_none(a.path)] for a in sorted(artifacts, key=lambda x: x.key)])


def changed_inputs(previous, current):
    keys = sorted(set(previous) | set(current))
    return [{'input': k, 'previous': previous.get(k), 'current': _as_str(current.get(k))} for k in keys if previous.get(k) != _as_str(current.get(k))]


def _as_str(value):
    if value is None or isinstance(value, str):
        return value
    import json
    return json.dumps(value, sort_keys=True, separators=(',', ':'))


_PLAN_RUN = {}


def _plan_run_id(ledger):
    """Adoptions and inline validations during a plan share one synthetic run."""
    if id(ledger) not in _PLAN_RUN:
        import uuid

        from .ledger import now_iso
        run_id = 'plan-' + now_iso().replace(':', '').replace('-', '')[:15] + '-' + uuid.uuid4().hex[:6]
        ledger.begin_run(run_id, 'plan (adoption)')
        _PLAN_RUN[id(ledger)] = run_id
    return _PLAN_RUN[id(ledger)]


def apply_disk_guard(rows, ctx, graph, free=None):
    """Heavy tasks that would cross the reserve become blocked (§13)."""
    free = disk.free_bytes(ctx.output_root) if free is None else free
    for row in rows:
        if row.state not in ('ready', 'stale', 'failed'):
            continue
        spec = graph.nodes[row.key].spec
        if spec.estimated_bytes <= 0:
            continue
        blocker = disk.guard(ctx.output_root, spec.estimated_bytes, ctx.ledger, free)
        if blocker:
            row.state, row.reason, row.blockers = 'blocked', blocker.code, [blocker]
            ctx.states[row.key] = 'blocked'
    return rows


def summarize(rows):
    counts = {}
    for row in rows:
        counts[row.state] = counts.get(row.state, 0) + 1
    return counts


def why(graph, ctx, rows_by_key, key, depth=0, seen=None):
    """A causal chain for one node: its state, what changed, and which
    upstream node changed it (§5.5)."""
    seen = seen if seen is not None else set()
    row = rows_by_key.get(key)
    lines = []
    if row is None:
        return [f'{key}: not in this plan']
    pad = '  ' * depth
    lines.append(f'{pad}{key} is {row.state}' + (f' ({row.reason})' if row.reason else ''))
    for b in row.blockers:
        lines.append(f'{pad}  blocked by {b.code}' + (f' {b.evidence}' if b.evidence else ''))
    for note in row.notes:
        lines.append(f'{pad}  note: {note}')
    dep_by_output = {}
    for dep_key in graph.nodes[key].deps:
        out = ctx.outputs.get(dep_key)
        if out:
            dep_by_output[out] = dep_key
    for change in row.changed_inputs:
        lines.append(f'{pad}  because input {change["input"]} changed')
        lines.append(f'{pad}    previous: {_short(change["previous"])}')
        lines.append(f'{pad}    current:  {_short(change["current"])}')
        cause = dep_by_output.get(change['current'])
        if cause and cause not in seen and depth < 4:
            seen.add(cause)
            cause_row = rows_by_key.get(cause)
            if cause_row and (cause_row.changed_inputs or cause_row.reason == 'ADOPTED_EXTERNAL'):
                lines.append(f'{pad}    caused by {cause}')
                lines.extend(why(graph, ctx, rows_by_key, cause, depth + 2, seen))
    if row.state == 'stale' and not row.changed_inputs and row.reason == 'FINGERPRINT_CHANGED':
        lines.append(f'{pad}  the previous inputs were not recorded; the fingerprint differs')
    unchanged = [d for d in graph.nodes[key].deps if ctx.states.get(d) in DONE and ctx.rows.get(d) and ctx.rows[d].reason in ('FINGERPRINT_UNCHANGED', 'ADOPTED_EXTERNAL', 'INLINE_VALIDATED')]
    if row.state in ('stale', 'ready') and unchanged and depth == 0:
        lines.append(f'{pad}  unchanged and reused: ' + ', '.join(unchanged[:6]) + (' …' if len(unchanged) > 6 else ''))
    return lines


def _short(value):
    if value is None:
        return 'none'
    value = str(value)
    return value if len(value) <= 20 else value[:12] + '…'
