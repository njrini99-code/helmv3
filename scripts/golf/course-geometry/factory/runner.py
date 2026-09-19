"""Bounded execution over a plan (Factory v2 §5.3). Cached nodes are
skipped, blocked ones refused, failures stop their descendants and leave
successful siblings alone; every attempt leaves a ledger row and a log."""
import os
import subprocess
import time
import traceback
from dataclasses import dataclass, field

from . import disk
from .fingerprints import digest
from .model import Blocker
from .planner import DONE, output_hash, plan_node, verify_artifacts
from .tasks import INLINE


@dataclass
class Run:
    run_id: str
    out_dir: str
    started: float = field(default_factory=time.monotonic)
    executed: list = field(default_factory=list)
    cached: list = field(default_factory=list)
    blocked: list = field(default_factory=list)
    failed: list = field(default_factory=list)
    skipped: list = field(default_factory=list)
    artifacts: list = field(default_factory=list)
    metrics: dict = field(default_factory=dict)

    def log_path(self, node):
        safe = node.key.replace('/', '_').replace('[', '.').replace(']', '').replace(':', '-')
        return os.path.join(self.out_dir, 'logs', f'{safe}.log')


def git_head(repo_root):
    try:
        return subprocess.run(['git', 'rev-parse', 'HEAD'], cwd=repo_root, capture_output=True, text=True, timeout=5, check=False).stdout.strip() or None
    except Exception:  # noqa: BLE001 - no git, no head: the report says so
        return None


def select_keys(graph, targets=None, until=None, task=None):
    """Which nodes a run may execute: the targets and everything they need."""
    keys = set(graph.order)
    if task:
        keys = {k for k in graph.order if k.split('[', 1)[0] == task}
    if until:
        keys = {k for k in graph.order if k.split('[', 1)[0] == until}
    if targets:
        keys &= set(targets)
    if task or until:
        needed = set(keys)
        for k in list(keys):
            needed |= graph.ancestors(k)
        keys = needed
    return keys


def execute(graph, ctx, run, keys=None, dry_run=False, recovered=()):
    """Walk the graph in topological order, planning each node against the
    outputs produced so far, and execute what is ready."""
    ctx.graph = graph
    ledger = ctx.ledger
    free = disk.free_bytes(ctx.output_root)
    rows = {}
    for key in graph.order:
        node = graph.nodes[key]
        row = plan_node(node, ctx, recovered, adopt=True, free=free)
        rows[key] = row
        if keys is not None and key not in keys:
            continue
        if row.state in DONE:
            run.cached.append(key)
            continue
        if row.state == 'pending' and dry_run:
            run.skipped.append(key)
            continue
        if row.state in ('blocked', 'running', 'pending'):
            run.blocked.append({'key': key, 'reason': row.reason, 'blockers': [b.as_dict() for b in row.blockers]})
            continue
        spec = node.spec
        executor = ctx.executor(spec)
        if executor is None:
            blocker = Blocker('ADAPTER_NOT_IMPLEMENTED', {'task': spec.id})
            row.state, row.reason, row.blockers = 'blocked', blocker.code, [blocker]
            ctx.states[key] = 'blocked'
            run.blocked.append({'key': key, 'reason': row.reason, 'blockers': [blocker.as_dict()]})
            continue
        guard = disk.guard(ctx.output_root, spec.estimated_bytes, ledger, free) if spec.estimated_bytes else None
        if guard:
            row.state, row.reason, row.blockers = 'blocked', guard.code, [guard]
            ctx.states[key] = 'blocked'
            run.blocked.append({'key': key, 'reason': guard.code, 'blockers': [guard.as_dict()]})
            continue
        if dry_run:
            run.skipped.append(key)
            continue
        recorded_inputs = {**row.inputs, '__version__': spec.version, '__impl__': ctx.impl_hash(spec), '__settings__': digest(spec.settings)}
        if executor == INLINE:
            ledger.record_success(run.run_id, node, row.fingerprint, recorded_inputs, [])
            row.state, row.reason, row.output_hash = 'success', 'INLINE_VALIDATED', row.fingerprint
            ctx.states[key], ctx.outputs[key], ctx.rows[key] = 'success', row.fingerprint, row
            run.executed.append(key)
            continue
        log_path = run.log_path(node)
        os.makedirs(os.path.dirname(log_path), exist_ok=True)
        task_run_id = ledger.start_task(run.run_id, node, row.fingerprint, log_path)
        started = time.monotonic()
        try:
            artifacts = executor(node, ctx, run) or []
            # An executor only ever produces under the output root; retained
            # evidence (checked-in fixtures, external exports) is read, never
            # written, so a task that reports one has written where it must not.
            outside = [a.path for a in artifacts if not ctx.inside_output(a.path)]
            if outside:
                raise RuntimeError(f'ARTIFACT_OUTSIDE_OUTPUT_ROOT: {", ".join(ctx.relpath(p) for p in outside)}')
            problem = verify_artifacts(artifacts)
            if problem:
                raise RuntimeError(f'{problem[0]}: {problem[1]}')
            ledger.record_success(run.run_id, node, row.fingerprint, recorded_inputs, artifacts, task_run_id=task_run_id, log_path=log_path)
            row.state, row.reason, row.artifacts = 'success', 'FINGERPRINT_UNCHANGED', artifacts
            # The node's output identity must be the same one a later plan
            # derives from the artifact (its contentHash, extract sha, …), or
            # every dependent would look stale on the next plan.
            for a in artifacts:
                ctx.forget(a.path)
            fresh = spec.evaluate(node, ctx)
            row.output_hash = fresh.output or output_hash(artifacts, row.fingerprint)
            ctx.states[key], ctx.outputs[key], ctx.rows[key] = 'success', row.output_hash, row
            run.executed.append(key)
            run.artifacts.extend(a.as_dict() for a in artifacts)
            with open(log_path, 'a', encoding='utf-8') as log:
                log.write(f'{key}: success in {time.monotonic() - started:.3f}s\n')
        except Exception as exc:  # noqa: BLE001 - every failure is recorded, never swallowed
            with open(log_path, 'a', encoding='utf-8') as log:
                log.write(f'{key}: failed\n{traceback.format_exc()}\n')
            ledger.record_failure(run.run_id, node, row.fingerprint, 1, task_run_id=task_run_id, log_path=log_path)
            row.state, row.reason = 'failed', 'PREVIOUS_RUN_FAILED'
            row.notes.append(str(exc))
            ctx.states[key], ctx.rows[key] = 'failed', row
            run.failed.append({'key': key, 'error': str(exc), 'log': log_path})
        run.metrics[key] = {'wallClockMs': round((time.monotonic() - started) * 1000)}
    return rows
