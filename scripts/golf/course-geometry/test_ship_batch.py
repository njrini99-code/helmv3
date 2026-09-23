import json
import os
import tempfile
import unittest

from factory.ship_batch import (
    OVIINBYRD_DB_ID,
    _ancestor_holds_lock,
    _parse_ps_table,
    _write_summary_atomic,
    select_courses,
    wait_for_capacity,
)


class SelectCoursesTests(unittest.TestCase):
    def test_oviinbyrd_is_skipped_by_db_id_even_if_renamed(self):
        played = {'courses': [{'dbCourseId': OVIINBYRD_DB_ID, 'name': 'Oviinbyrd (renamed)', 'layouts': ['oviinbyrd']}]}
        rows = select_courses(played, catalog_layout_ids={'oviinbyrd'})
        self.assertEqual(rows, [{'dbCourseId': OVIINBYRD_DB_ID, 'name': 'Oviinbyrd (renamed)', 'rounds': None,
                                'status': 'SKIPPED', 'skippedReason': 'out_of_scope', 'layouts': []}])

    def test_oviinbyrd_is_skipped_by_name_if_db_id_ever_differs(self):
        played = {'courses': [{'dbCourseId': 'some-other-id', 'name': 'Oviinbyrd Golf Club', 'layouts': ['oviinbyrd']}]}
        rows = select_courses(played, catalog_layout_ids={'oviinbyrd'})
        self.assertEqual(rows[0]['skippedReason'], 'out_of_scope')

    def test_course_with_no_layouts_is_skipped_as_uncatalogued(self):
        played = {'courses': [{'dbCourseId': 'x', 'name': 'Uncatalogued Course', 'layouts': []}]}
        rows = select_courses(played, catalog_layout_ids=set())
        self.assertEqual(rows[0]['status'], 'SKIPPED')
        self.assertEqual(rows[0]['skippedReason'], 'no_catalog_entry')

    def test_layout_not_yet_in_catalog_is_skipped_even_if_listed(self):
        played = {'courses': [{'dbCourseId': 'x', 'name': 'Pending Intake', 'layouts': ['not-catalogued-yet']}]}
        rows = select_courses(played, catalog_layout_ids={'some-other-layout'})
        self.assertEqual(rows[0]['status'], 'SKIPPED')
        self.assertEqual(rows[0]['skippedReason'], 'no_catalog_entry')

    def test_normal_catalogued_course_is_selected_with_its_layouts(self):
        played = {'courses': [{'dbCourseId': 'x', 'name': 'Peek n Peak', 'rounds': 12, 'layouts': ['peek-n-peak-upper']}]}
        rows = select_courses(played, catalog_layout_ids={'peek-n-peak-upper'})
        self.assertEqual(rows, [{'dbCourseId': 'x', 'name': 'Peek n Peak', 'rounds': 12, 'status': None, 'skippedReason': None,
                                'layouts': [{'layoutId': 'peek-n-peak-upper'}]}])

    def test_multi_layout_course_keeps_only_catalogued_layouts(self):
        played = {'courses': [{'dbCourseId': 'x', 'name': 'Two Courses', 'layouts': ['ready-one', 'not-ready-yet']}]}
        rows = select_courses(played, catalog_layout_ids={'ready-one'})
        self.assertEqual(rows[0]['layouts'], [{'layoutId': 'ready-one'}])


class WaitForCapacityTests(unittest.TestCase):
    def test_default_free_gb_measures_the_pause_file_volume(self):
        # The real default must be callable with no injected stub (it once
        # called free_gb() without its path and crashed the first batch).
        with tempfile.TemporaryDirectory() as d:
            sleeps = []
            wait_for_capacity(os.path.join(d, 'PAUSE'), 0.0, _Sink(), sleep_fn=sleeps.append)
            self.assertEqual(sleeps, [])

    def test_returns_immediately_when_not_paused_and_enough_free_disk(self):
        sleeps = []
        wait_for_capacity('/no/such/PAUSE', 9.0, _Sink(), free_gb_fn=lambda: 20.0, sleep_fn=sleeps.append)
        self.assertEqual(sleeps, [])

    def test_polls_until_disk_recovers(self):
        free_values = iter([3.0, 3.0, 12.0])
        sleeps = []
        wait_for_capacity('/no/such/PAUSE', 9.0, _Sink(), free_gb_fn=lambda: next(free_values), sleep_fn=sleeps.append)
        self.assertEqual(len(sleeps), 2)

    def test_waits_while_pause_file_exists_even_with_ample_disk(self):
        with tempfile.TemporaryDirectory() as tmp:
            pause_path = os.path.join(tmp, 'PAUSE')
            open(pause_path, 'w').close()
            calls = {'n': 0}

            def sleep_fn(_seconds):
                calls['n'] += 1
                if calls['n'] >= 2:
                    os.remove(pause_path)

            wait_for_capacity(pause_path, 9.0, _Sink(), free_gb_fn=lambda: 50.0, sleep_fn=sleep_fn)
            self.assertGreaterEqual(calls['n'], 2)


class SummaryWriterTests(unittest.TestCase):
    def test_writes_atomically_and_computes_totals(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, 'batch-summary.json')
            courses = [{'status': 'READY_FOR_APPROVAL'}, {'status': 'NOT_READY'}, {'status': 'SKIPPED'}, {'status': 'ERROR'}]
            body = _write_summary_atomic(path, courses)
            self.assertEqual(body['totals'], {'courses': 4, 'ready': 1, 'notReady': 1, 'error': 1, 'skipped': 1})
            with open(path, encoding='utf-8') as f:
                on_disk = json.load(f)
            self.assertEqual(on_disk['totals']['courses'], 4)
            self.assertFalse(os.path.exists(path + '.tmp'))


class AncestorLockTests(unittest.TestCase):
    def test_detects_a_lockf_ancestor_holding_the_same_path(self):
        by_pid = {100: (1, '-zsh'), 200: (100, 'lockf -k /repo/output/course-geometry/overnight/BUILD.lock python3 course-factory.py ship --all-played'),
                 300: (200, 'python3 course-factory.py --output X ship --all-played')}
        hit = _ancestor_holds_lock(by_pid, 300, '/repo/output/course-geometry/overnight/BUILD.lock')
        self.assertIsNotNone(hit)
        self.assertEqual(hit[0], 200)

    def test_no_hit_when_no_ancestor_holds_the_lock(self):
        by_pid = {100: (1, '-zsh'), 300: (100, 'python3 course-factory.py ship --all-played')}
        self.assertIsNone(_ancestor_holds_lock(by_pid, 300, '/repo/output/course-geometry/overnight/BUILD.lock'))

    def test_a_different_course_factory_job_holding_the_lock_is_not_an_ancestor(self):
        # Two sibling factory jobs may each briefly hold BUILD.lock; that is
        # fine (that's the whole point of per-step locking) -- only an
        # ancestor of THIS process matters.
        by_pid = {1: (0, 'launchd'), 300: (1, 'python3 course-factory.py ship --all-played')}
        self.assertIsNone(_ancestor_holds_lock(by_pid, 300, '/repo/output/course-geometry/overnight/BUILD.lock'))

    def test_parses_ps_table_ignoring_malformed_lines(self):
        text = "  100     1 -zsh\n200   100 lockf -k /path/BUILD.lock python3 x.py\nnot a valid line\n"
        table = _parse_ps_table(text)
        self.assertEqual(table[100], (1, '-zsh'))
        self.assertEqual(table[200], (100, 'lockf -k /path/BUILD.lock python3 x.py'))
        self.assertEqual(len(table), 2)


class _Sink:
    def write(self, _text):
        pass


if __name__ == '__main__':
    unittest.main()
