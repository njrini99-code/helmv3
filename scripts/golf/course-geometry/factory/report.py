"""One JSON + one Markdown report per run, and the plan/status renderers
(Factory v2 §5.2, §50)."""
import json
import os

from . import disk
from .planner import summarize
from .reasons import describe

COLUMNS = ('STATE', 'SCOPE', 'TASK', 'REASON')


def reason_text(row):
    if row.state in ('blocked', 'pending') and row.blockers:
        b = row.blockers[0]
        if b.code == 'DEPENDENCY_BLOCKED':
            root = b.evidence.get('root')
            where = b.evidence.get('rootKey') or b.evidence.get('dependency')
            return f'upstream {root or b.evidence.get("code")} at {where}' if root != 'DEPENDENCY_PENDING' else f'upstream failure at {where}'
        if b.code == 'DEPENDENCY_PENDING':
            root = b.evidence.get('root')
            return f'waiting for {root}' if root and root != b.evidence.get('dependency') else f'waiting for {b.evidence.get("dependency")}'
        return b.code
    if row.state == 'stale' and row.changed_inputs:
        return f'{row.reason}: ' + ', '.join(c['input'] for c in row.changed_inputs[:3])
    return row.reason


def display_order(rows, graph=None):
    """Facility rows, layout rows, each hole's rows, then the layout aggregates."""
    def rank(item):
        index, row = item
        kind = row.scope.split(':', 1)[0]
        aggregate = graph is not None and any(d.endswith(('*', '*?')) for d in graph.nodes[row.key].spec.deps)
        return ({'facility': 0, 'layout': 3 if aggregate else 1, 'hole': 2}[kind], row.scope, index)
    return [row for _, row in sorted(enumerate(rows), key=rank)]


def render_plan(rows, notes=False, graph=None):
    lines = [f'{COLUMNS[0]:<9} {COLUMNS[1]:<32} {COLUMNS[2]:<28} {COLUMNS[3]}']
    for row in display_order(rows, graph):
        lines.append(f'{row.state:<9} {row.scope:<32} {row.task:<28} {reason_text(row)}')
        if notes:
            for note in row.notes:
                lines.append(f'{"":<9} {"":<32} {"":<28}   · {note}')
    counts = summarize(rows)
    lines.append('')
    lines.append('totals: ' + ', '.join(f'{k} {v}' for k, v in sorted(counts.items())))
    return '\n'.join(lines)


def plan_json(rows, ctx=None, selection=None):
    return {'schema': 'golfhelm-factory-plan-v1', 'selection': selection or {}, 'totals': summarize(rows), 'rows': [r.as_dict() for r in rows]}


def golden_rows(rows):
    """The machine-stable part of a plan: state and reason per node."""
    return [{'key': r.key, 'state': r.state, 'reason': r.reason} for r in rows]


def write_run_report(run, rows, ctx, command, head, selection):
    os.makedirs(run.out_dir, exist_ok=True)
    counts = summarize(list(rows.values()))
    body = {
        'schema': 'golfhelm-factory-run-report-v1', 'runId': run.run_id, 'command': command, 'gitHead': head, 'selection': selection,
        'totals': counts, 'executed': run.executed, 'cached': len(run.cached), 'blocked': run.blocked, 'failed': run.failed, 'skipped': run.skipped,
        'artifacts': run.artifacts, 'metrics': run.metrics, 'disk': disk.status(ctx.output_root, ctx.ledger),
        'nextRunnable': [r.key for r in rows.values() if r.state in ('ready', 'stale', 'failed')][:20],
    }
    with open(os.path.join(run.out_dir, 'report.json'), 'w', encoding='utf-8') as f:
        json.dump(body, f, indent=1, sort_keys=True)
    md = [f'# Course factory run {run.run_id}', '', f'- command: `{command}`', f'- git head: `{head}`', f'- selection: `{json.dumps(selection)}`',
          '- totals: ' + ', '.join(f'{k} {v}' for k, v in sorted(counts.items())), '']
    md.append('## Executed'); md += [f'- {k} ({run.metrics.get(k, {}).get("wallClockMs", 0)} ms)' for k in run.executed] or ['- nothing']
    md.append(''); md.append('## Blocked'); md += [f'- {b["key"]}: {b["reason"]}' for b in run.blocked[:40]] or ['- nothing']
    if len(run.blocked) > 40:
        md.append(f'- … {len(run.blocked) - 40} more')
    md.append(''); md.append('## Failed'); md += [f'- {f["key"]}: {f["error"]} (log {f["log"]})' for f in run.failed] or ['- nothing']
    md.append(''); md.append('## Artifacts'); md += [f'- {a["key"]}: {a["path"]} ({a["bytes"]} bytes, class {a["retention"]})' for a in run.artifacts] or ['- none']
    d = body['disk']
    md.append(''); md.append('## Disk'); md.append(f'- free {d["freeGb"]} GB, reserve {d["reserveGb"]} GB; retained by class {d["retainedGbByClass"]}')
    md.append(''); md.append('## Next runnable'); md += [f'- {k}' for k in body['nextRunnable']] or ['- nothing: everything is cached or blocked']
    with open(os.path.join(run.out_dir, 'report.md'), 'w', encoding='utf-8') as f:
        f.write('\n'.join(md) + '\n')
    return body


def status_json(rows, ctx, layout_id=None):
    counts = summarize(rows)
    blockers = {}
    for r in rows:
        if r.state == 'blocked' and r.blockers and r.blockers[0].code not in ('DEPENDENCY_BLOCKED', 'DEPENDENCY_PENDING'):
            blockers.setdefault(r.blockers[0].code, []).append(r.key)
    out = {'schema': 'golfhelm-factory-status-v1', 'layoutId': layout_id, 'totals': counts, 'blockers': blockers, 'disk': disk.status(ctx.output_root, ctx.ledger)}
    if layout_id:
        pkg = ctx.package(layout_id)
        cap_path = os.path.join(ctx.layout_out(layout_id), 'capability-report.json')
        cap = ctx.json(cap_path)
        layout = ctx.layout(layout_id) or {}
        out.update({'catalogTier': layout.get('capabilityTier'), 'packageHash': (pkg or {}).get('contentHash'), 'packageStatus': (pkg or {}).get('status'),
                    'capabilityReport': cap, 'published': bool(ctx.json(ctx.abspath((layout.get('geometry') or {}).get('published'))))})
    if ctx.ledger:
        runs = ctx.ledger.runs(5)
        out['recentRuns'] = runs
        last_failed = ctx.ledger.db.execute("SELECT task_key, finished_at, build_run_id FROM task_runs WHERE state='failed' ORDER BY id DESC LIMIT 1").fetchone()
        out['lastFailedTask'] = dict(last_failed) if last_failed else None
    return out


def render_status(status):
    lines = [f'layout: {status.get("layoutId") or "(all)"}']
    if status.get('layoutId'):
        lines.append(f'catalog tier: {status.get("catalogTier")}  package: {str(status.get("packageHash"))[:12]} ({status.get("packageStatus")})  published: {status.get("published")}')
        cap = status.get('capabilityReport')
        if cap:
            lines.append(f'earned tier: {cap["earnedTier"]}  blocked higher tiers: {json.dumps(cap["blockedHigherTiers"])}')
        else:
            lines.append('earned tier: not evaluated yet (run layout.capability.evaluate)')
    lines.append('tasks: ' + ', '.join(f'{k} {v}' for k, v in sorted(status['totals'].items())))
    for code, keys in sorted(status['blockers'].items()):
        lines.append(f'blocked {code} ({describe(code)}): {len(keys)} task(s), e.g. {keys[0]}')
    d = status['disk']
    lines.append(f'disk: free {d["freeGb"]} GB, reserve {d["reserveGb"]} GB, retained by class {d["retainedGbByClass"]}')
    if status.get('recentRuns'):
        last = status['recentRuns'][0]
        lines.append(f'last run: {last["id"]} {last["started_at"]} → {last.get("result")}')
    if status.get('lastFailedTask'):
        lines.append(f'last failed task: {status["lastFailedTask"]["task_key"]} in {status["lastFailedTask"]["build_run_id"]}')
    return '\n'.join(lines)
