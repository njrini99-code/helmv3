"""Ledger tests for the course factory (Factory v2 §10–11): a disposable
SQLite file that records runs, inputs, verified artifacts, invalidations and
interrupted work, and answers the planner's questions about them."""
import os
import shutil
import tempfile
import unittest

from factory.ledger import Ledger, pid_alive
from factory.model import ArtifactRef, Node, Scope, TaskSpec
from factory.planner import verify_artifacts
from factory.tasks.common import artifact, evaluation


def node(task_id='x.task', kind='layout'):
    spec = TaskSpec(task_id, '1', kind, (), lambda n, c: evaluation())
    scope = Scope(kind, 'fac', 'lay') if kind == 'layout' else Scope('facility', 'fac')
    return Node(spec=spec, scope=scope)


class LedgerTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix='factory-ledger-')
        self.ledger = Ledger(os.path.join(self.tmp, 'state.sqlite'))

    def tearDown(self):
        self.ledger.close()
        shutil.rmtree(self.tmp, ignore_errors=True)

    def write(self, name, text='hello'):
        path = os.path.join(self.tmp, name)
        with open(path, 'w', encoding='utf-8') as f:
            f.write(text)
        return path

    def test_success_records_inputs_and_artifacts_and_reopens(self):
        n = node()
        self.ledger.begin_run('run-1', 'run --layout lay', 'abc123')
        path = self.write('a.json')
        self.ledger.record_success('run-1', n, 'fp1', {'k': 'v', 'n': None}, [artifact('a', path, 'A')])
        self.ledger.finish_run('run-1', 'ok')
        success = self.ledger.last_success(n.key)
        self.assertEqual(success['fingerprint'], 'fp1')
        self.assertEqual(self.ledger.inputs_for(n.key, 'fp1'), {'k': 'v', 'n': None})
        arts = self.ledger.artifacts_for(n.key)
        self.assertEqual([a.key for a in arts], ['a'])
        self.assertEqual(arts[0].sha256, artifact('a', path).sha256)
        self.assertIsNone(verify_artifacts(arts))
        self.assertEqual(self.ledger.runs()[0]['id'], 'run-1')
        # A second Ledger on the same file sees the same history.
        again = Ledger(self.ledger.path)
        try:
            self.assertEqual(again.last_success(n.key)['fingerprint'], 'fp1')
        finally:
            again.close()

    def test_new_success_replaces_the_artifact_list(self):
        n = node()
        first, second = self.write('one'), self.write('two')
        self.ledger.record_success('run-1', n, 'fp1', {}, [artifact('one', first, 'C')])
        self.ledger.record_success('run-2', n, 'fp2', {}, [artifact('two', second, 'C')])
        self.assertEqual([a.key for a in self.ledger.artifacts_for(n.key)], ['two'])
        self.assertEqual(self.ledger.last_success(n.key)['fingerprint'], 'fp2')
        self.assertEqual(self.ledger.inputs_for(n.key, 'fp1'), {})

    def test_missing_and_corrupt_artifacts_are_told_apart(self):
        n = node()
        path = self.write('c.json', 'original')
        self.ledger.record_success('run-1', n, 'fp1', {}, [artifact('c', path, 'C')])
        arts = self.ledger.artifacts_for(n.key)
        with open(path, 'w', encoding='utf-8') as f:
            f.write('changed')
        self.assertEqual(verify_artifacts(arts)[0], 'ARTIFACT_CORRUPT')
        os.remove(path)
        self.assertEqual(verify_artifacts(arts)[0], 'ARTIFACT_MISSING')

    def test_failure_is_the_last_run_but_never_a_success(self):
        n = node()
        self.ledger.record_success('run-1', n, 'fp1', {}, [])
        self.ledger.record_failure('run-2', n, 'fp2', 1)
        self.assertEqual(self.ledger.last_run(n.key)['state'], 'failed')
        self.assertEqual(self.ledger.last_success(n.key)['fingerprint'], 'fp1')

    def test_manual_invalidation_is_visible_after_the_success_it_targets(self):
        n = node()
        self.ledger.record_success('run-1', n, 'fp1', {}, [])
        finished = self.ledger.last_success(n.key)['finished_at']
        self.assertIsNone(self.ledger.invalidation_after(n.key, finished))
        self.ledger.invalidate(n.key, 'lay', 'bunker moved', actor='tester')
        found = self.ledger.invalidation_after(n.key, finished)
        self.assertEqual((found['reason'], found['actor']), ('bunker moved', 'tester'))
        self.assertIsNone(self.ledger.invalidation_after(n.key, '9999-01-01T00:00:00+00:00'))
        # A rebuild recorded right after the invalidation (same second) clears it.
        self.ledger.record_success('run-2', n, 'fp1', {}, [])
        self.assertIsNone(self.ledger.invalidation_after(n.key, self.ledger.last_success(n.key)['finished_at']))

    def test_running_rows_without_a_live_process_are_recovered_as_interrupted(self):
        n = node()
        dead = 2 ** 22 + 12345      # far above any live pid on this host
        self.assertFalse(pid_alive(dead))
        self.ledger.start_task('run-1', n, 'fp1', pid=dead)
        alive = node('y.task')
        self.ledger.start_task('run-1', alive, 'fp2', pid=os.getpid())
        self.assertEqual(self.ledger.recover_interrupted(), [n.key])
        self.assertEqual(self.ledger.last_run(n.key)['state'], 'interrupted')
        self.assertIsNotNone(self.ledger.running(alive.key))
        self.assertIsNone(self.ledger.last_success(n.key))

    def test_retained_bytes_and_eviction_candidates(self):
        n = node()
        big = self.write('big.bin', 'x' * 5000)
        small = self.write('small.bin', 'y' * 10)
        keep = self.write('keep.bin', 'z' * 2000)
        self.ledger.record_success('run-1', n, 'fp1', {}, [artifact('big', big, 'C'), artifact('small', small, 'B'), artifact('keep', keep, 'A')])
        totals = self.ledger.retained_bytes()
        self.assertEqual(totals['byClass'], {'C': 5000, 'B': 10, 'A': 2000})
        self.assertEqual(totals['byScope'], {'lay': 7010})
        evict = self.ledger.evictable(4000)
        self.assertEqual([e['path'] for e in evict], [big])
        self.assertTrue(all(e['retention'] in ('B', 'C') for e in self.ledger.evictable(10 ** 9)))

    def test_artifact_ref_without_hash_is_hashed_on_record(self):
        n = node()
        path = self.write('lazy.json', 'lazy')
        self.ledger.record_success('run-1', n, 'fp1', {}, [ArtifactRef(key='lazy', path=path, retention='C')])
        art = self.ledger.artifacts_for(n.key)[0]
        self.assertEqual(art.sha256, artifact('lazy', path).sha256)
        self.assertEqual(art.bytes, 4)


if __name__ == '__main__':
    unittest.main()
