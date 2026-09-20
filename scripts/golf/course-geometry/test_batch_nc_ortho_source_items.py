import importlib.util
from pathlib import Path
import unittest

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('batch_nc_source_items', HERE / 'batch-nc-ortho-source-items.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class BatchNcOrthoSourceItemsTests(unittest.TestCase):
    def test_build_jobs_requires_a_complete_native_imagery_index(self):
        root = Path('/factory')
        jobs = module.build_jobs(['complete', 'missing'], root, lambda facility: facility == 'complete')
        self.assertEqual(jobs[0]['status'], 'ready_source_item_annotation')
        self.assertEqual(jobs[1]['status'], 'imagery_index_required')
        self.assertIn('source-items-v1', jobs[0]['output'])


if __name__ == '__main__':
    unittest.main()
