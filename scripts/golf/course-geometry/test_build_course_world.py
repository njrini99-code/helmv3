"""Tests for failure-safe invocation of Blender world compilers."""
import importlib.util
import unittest
from pathlib import Path


SCRIPT = Path(__file__).with_name('build-course-world.py')
SPEC = importlib.util.spec_from_file_location('build_course_world', SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(MODULE)

NORMALIZE_SCRIPT = Path(__file__).with_name('normalize-study.py')
NORMALIZE_SPEC = importlib.util.spec_from_file_location('normalize_study', NORMALIZE_SCRIPT)
NORMALIZE = importlib.util.module_from_spec(NORMALIZE_SPEC)
assert NORMALIZE_SPEC and NORMALIZE_SPEC.loader
NORMALIZE_SPEC.loader.exec_module(NORMALIZE)


class BlenderInvocationTest(unittest.TestCase):
    def test_blender_commands_fail_when_a_python_compiler_raises(self):
        command = MODULE.blender_python_command(
            'blender', Path('generator.py'), ['input.json', 'terrain.tiff'],
        )
        self.assertEqual(
            command,
            ['blender', '--background', '--python-exit-code', '1', '--python', 'generator.py', '--', 'input.json', 'terrain.tiff'],
        )

    def test_canonical_positions_use_the_package_enu_frame(self):
        origin = [-79.9300, 36.1400]
        point = [-79.9250, 36.1420]
        east, north = NORMALIZE.local_enu(origin, point)
        self.assertAlmostEqual(east, 449.99, places=1)
        self.assertAlmostEqual(north, 221.96, places=1)


if __name__ == '__main__':
    unittest.main()
