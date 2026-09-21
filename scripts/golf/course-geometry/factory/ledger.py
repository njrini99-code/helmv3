"""Disposable build state in SQLite (Factory v2 §11). Never source truth: a
row only says what a run recorded; the planner re-verifies every artifact
on disk before it trusts a success."""
import datetime as dt
import json
import os
import socket
import sqlite3

from .fingerprints import file_sha256
from .model import ArtifactRef

SCHEMA = """
CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS build_runs (
  id TEXT PRIMARY KEY, started_at TEXT NOT NULL, finished_at TEXT, command TEXT NOT NULL,
  git_head TEXT, host TEXT NOT NULL, result TEXT);
CREATE TABLE IF NOT EXISTS task_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT, build_run_id TEXT NOT NULL, task_key TEXT NOT NULL,
  scope_type TEXT NOT NULL, scope_id TEXT NOT NULL, fingerprint TEXT, state TEXT NOT NULL,
  started_at TEXT NOT NULL, finished_at TEXT, exit_code INTEGER, blocker_code TEXT, log_path TEXT,
  pid INTEGER, host TEXT);
CREATE INDEX IF NOT EXISTS task_runs_key ON task_runs(task_key, id);
CREATE TABLE IF NOT EXISTS artifacts (
  producer_task_key TEXT NOT NULL, artifact_key TEXT NOT NULL, fingerprint TEXT NOT NULL, path TEXT NOT NULL,
  sha256 TEXT, bytes INTEGER, retention_class TEXT NOT NULL, created_at TEXT NOT NULL, verified_at TEXT,
  PRIMARY KEY (producer_task_key, artifact_key));
CREATE TABLE IF NOT EXISTS task_inputs (
  task_key TEXT NOT NULL, fingerprint TEXT NOT NULL, input_key TEXT NOT NULL, input_hash TEXT,
  PRIMARY KEY (task_key, fingerprint, input_key));
CREATE TABLE IF NOT EXISTS manual_invalidations (
  id INTEGER PRIMARY KEY AUTOINCREMENT, task_key TEXT NOT NULL, scope_id TEXT NOT NULL, reason TEXT NOT NULL,
  created_at TEXT NOT NULL, actor TEXT);
"""
SCHEMA_VERSION = 1


def now_iso():
    # Microseconds: a manual invalidation is ordered against the success it
    # targets by timestamp, and a rebuild can finish within the same second
    # as the `invalidate` that asked for it.
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec='microseconds')


def pid_alive(pid):
    if not pid:
        return False
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    return True


class Ledger:
    def __init__(self, path):
        self.path = os.fspath(path)
        if self.path != ':memory:':
            os.makedirs(os.path.dirname(self.path) or '.', exist_ok=True)
        self.db = sqlite3.connect(self.path)
        self.db.row_factory = sqlite3.Row
        self.db.executescript(SCHEMA)
        if not self.db.execute('SELECT 1 FROM schema_version').fetchone():
            self.db.execute('INSERT INTO schema_version VALUES (?)', (SCHEMA_VERSION,))
        self.db.commit()
        self.host = socket.gethostname()

    def close(self):
        self.db.close()

    # --- runs ---------------------------------------------------------------
    def begin_run(self, run_id, command, git_head=None):
        self.db.execute('INSERT INTO build_runs (id, started_at, command, git_head, host) VALUES (?,?,?,?,?)',
                        (run_id, now_iso(), command, git_head, self.host))
        self.db.commit()
        return run_id

    def finish_run(self, run_id, result):
        self.db.execute('UPDATE build_runs SET finished_at=?, result=? WHERE id=?', (now_iso(), result, run_id))
        self.db.commit()

    def runs(self, limit=20):
        """Runs an operator launched, newest first. The synthetic runs that
        book plan-time adoptions are bookkeeping, not history."""
        return [dict(r) for r in self.db.execute("SELECT * FROM build_runs WHERE command NOT LIKE 'plan (%' ORDER BY started_at DESC, rowid DESC LIMIT ?", (limit,))]

    # --- task runs ----------------------------------------------------------
    def start_task(self, run_id, node, fingerprint, log_path=None, pid=None):
        cur = self.db.execute(
            'INSERT INTO task_runs (build_run_id, task_key, scope_type, scope_id, fingerprint, state, started_at, log_path, pid, host) '
            'VALUES (?,?,?,?,?,?,?,?,?,?)',
            (run_id, node.key, node.scope.kind, node.scope.key_part, fingerprint, 'running', now_iso(), log_path, pid or os.getpid(), self.host))
        self.db.commit()
        return cur.lastrowid

    def end_task(self, task_run_id, state, exit_code=None, blocker_code=None):
        self.db.execute('UPDATE task_runs SET state=?, finished_at=?, exit_code=?, blocker_code=? WHERE id=?',
                        (state, now_iso(), exit_code, blocker_code, task_run_id))
        self.db.commit()

    def record_success(self, run_id, node, fingerprint, inputs, artifacts, task_run_id=None, log_path=None):
        """One success = a task_runs row, its inputs, and its verified outputs."""
        if task_run_id is None:
            task_run_id = self.start_task(run_id, node, fingerprint, log_path)
        self.end_task(task_run_id, 'success', 0)
        self.db.execute('DELETE FROM task_inputs WHERE task_key=? AND fingerprint=?', (node.key, fingerprint))
        self.db.executemany('INSERT INTO task_inputs (task_key, fingerprint, input_key, input_hash) VALUES (?,?,?,?)',
                            [(node.key, fingerprint, k, _as_hash(v)) for k, v in sorted(inputs.items())])
        self.db.execute('DELETE FROM artifacts WHERE producer_task_key=?', (node.key,))
        stamp = now_iso()
        for a in artifacts:
            sha = a.sha256 if a.sha256 else (file_sha256(a.path) if os.path.isfile(a.path) else None)
            size = a.bytes if a.bytes is not None else (os.path.getsize(a.path) if os.path.isfile(a.path) else None)
            self.db.execute('INSERT INTO artifacts (producer_task_key, artifact_key, fingerprint, path, sha256, bytes, retention_class, created_at, verified_at) '
                            'VALUES (?,?,?,?,?,?,?,?,?)', (node.key, a.key, fingerprint, a.path, sha, size, a.retention, stamp, stamp))
        self.db.commit()
        return task_run_id

    def record_failure(self, run_id, node, fingerprint, exit_code, blocker_code=None, task_run_id=None, log_path=None):
        if task_run_id is None:
            task_run_id = self.start_task(run_id, node, fingerprint, log_path)
        self.end_task(task_run_id, 'failed', exit_code, blocker_code)
        return task_run_id

    def last_run(self, task_key, states=None):
        if states:
            marks = ','.join('?' * len(states))
            row = self.db.execute(f'SELECT * FROM task_runs WHERE task_key=? AND state IN ({marks}) ORDER BY id DESC LIMIT 1', (task_key, *states)).fetchone()
        else:
            row = self.db.execute('SELECT * FROM task_runs WHERE task_key=? ORDER BY id DESC LIMIT 1', (task_key,)).fetchone()
        return dict(row) if row else None

    def last_success(self, task_key):
        return self.last_run(task_key, ('success',))

    def running(self, task_key):
        return self.last_run(task_key, ('running',))

    def recover_interrupted(self):
        """Running rows with no live process on this host become
        `interrupted` (§11.2); their keys are reported to the planner."""
        recovered = []
        for row in self.db.execute("SELECT id, task_key, pid, host FROM task_runs WHERE state='running'"):
            if row['host'] == self.host and pid_alive(row['pid']):
                continue
            self.db.execute("UPDATE task_runs SET state='interrupted', finished_at=? WHERE id=?", (now_iso(), row['id']))
            recovered.append(row['task_key'])
        self.db.commit()
        return recovered

    def inputs_for(self, task_key, fingerprint):
        return {r['input_key']: r['input_hash'] for r in self.db.execute('SELECT input_key, input_hash FROM task_inputs WHERE task_key=? AND fingerprint=?', (task_key, fingerprint))}

    def artifacts_for(self, task_key):
        return [ArtifactRef(key=r['artifact_key'], path=r['path'], retention=r['retention_class'], sha256=r['sha256'], bytes=r['bytes'])
                for r in self.db.execute('SELECT * FROM artifacts WHERE producer_task_key=? ORDER BY artifact_key', (task_key,))]

    def touch_artifacts(self, task_key):
        self.db.execute('UPDATE artifacts SET verified_at=? WHERE producer_task_key=?', (now_iso(), task_key))
        self.db.commit()

    # --- manual invalidation -----------------------------------------------
    def invalidate(self, task_key, scope_id, reason, actor=None):
        self.db.execute('INSERT INTO manual_invalidations (task_key, scope_id, reason, created_at, actor) VALUES (?,?,?,?,?)',
                        (task_key, scope_id, reason, now_iso(), actor or os.environ.get('USER', 'unknown')))
        self.db.commit()

    def invalidation_after(self, task_key, since_iso):
        row = self.db.execute('SELECT * FROM manual_invalidations WHERE task_key=? AND created_at>=? ORDER BY id DESC LIMIT 1',
                              (task_key, since_iso or '')).fetchone()
        return dict(row) if row else None

    # --- disk accounting ----------------------------------------------------
    def retained_bytes(self):
        """Bytes per retention class and per scope prefix, from recorded artifacts."""
        by_class, by_scope = {}, {}
        for r in self.db.execute('SELECT producer_task_key, retention_class, bytes FROM artifacts'):
            size = r['bytes'] or 0
            by_class[r['retention_class']] = by_class.get(r['retention_class'], 0) + size
            scope = r['producer_task_key'].split('[', 1)[1].rstrip(']').split(':', 1)[0]
            by_scope[scope] = by_scope.get(scope, 0) + size
        return {'byClass': by_class, 'byScope': by_scope}

    def evictable(self, need_bytes):
        """Class B/C artifacts, largest first, until `need_bytes` is covered."""
        return self.eviction_candidates(need_bytes)

    def eviction_candidates(self, need_bytes, classes=('B', 'C'), path_prefix=None):
        """Return existing disposable artifacts without changing the ledger.

        Callers choose the retention classes deliberately.  The disk guard
        uses both B and C for *advice*, while an operator may restrict an
        actual eviction to reproducible C artifacts and a known intermediate
        directory.  Prefix matching is exact-path based rather than a loose
        substring so a course name cannot select an unrelated artifact.
        """
        if not classes or any(value not in ('B', 'C') for value in classes):
            raise ValueError('only disposable B/C retention classes may be evicted')
        marks = ','.join('?' * len(classes))
        query = ("SELECT path, bytes, retention_class, producer_task_key FROM artifacts "
                 f"WHERE retention_class IN ({marks})")
        params = list(classes)
        if path_prefix:
            query += ' AND path LIKE ?'
            params.append(os.path.join(os.path.abspath(path_prefix), '') + '%')
        query += ' ORDER BY bytes DESC, path ASC'
        out, covered = [], 0
        for r in self.db.execute(query, params):
            if covered >= need_bytes:
                break
            if os.path.exists(r['path']):
                out.append({'path': r['path'], 'bytes': r['bytes'] or 0, 'retention': r['retention_class'], 'producer': r['producer_task_key']})
                covered += r['bytes'] or 0
        return out

    def forget_evicted(self, candidates, reason):
        """Forget successfully deleted derived artifacts and force rebuild.

        A retained successful task may otherwise look cached with an empty
        artifact list.  Recording a normal manual invalidation preserves an
        audit trail and makes the planner rebuild from its canonical inputs.
        """
        producers = set()
        for candidate in candidates:
            path = os.fspath(candidate['path'])
            producer = candidate['producer']
            self.db.execute('DELETE FROM artifacts WHERE producer_task_key=? AND path=?', (producer, path))
            producers.add(producer)
        stamp = now_iso()
        actor = os.environ.get('USER', 'unknown')
        for producer in sorted(producers):
            scope = producer.split('[', 1)[1].rstrip(']') if '[' in producer else producer
            self.db.execute('INSERT INTO manual_invalidations (task_key, scope_id, reason, created_at, actor) VALUES (?,?,?,?,?)',
                            (producer, scope, reason, stamp, actor))
        self.db.commit()


def _as_hash(value):
    if value is None or isinstance(value, str):
        return value
    return json.dumps(value, sort_keys=True, separators=(',', ':'))
