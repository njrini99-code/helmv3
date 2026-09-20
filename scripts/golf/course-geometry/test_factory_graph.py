"""Graph tests for the course factory: scope-keyed nodes, shared facility
nodes, fan-in over holes, optional dependencies, and cycle detection with a
message that names the stuck nodes. Network-free."""
import os
import shutil
import tempfile
import unittest

from factory.catalog import load_catalog
from factory.graph import CycleError, build_graph, toposort
from factory.model import TaskSpec
from factory.tasks import default_specs
from factory.tasks.common import evaluation
from factory_testkit import write_catalog


def spec(task_id, kind, deps=(), impl=()):
    return TaskSpec(task_id, '1', kind, tuple(deps), lambda node, ctx: evaluation(), tuple(impl))


class GraphTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix='factory-graph-')
        write_catalog(os.path.join(self.tmp, 'catalog'))
        self.catalog = load_catalog(os.path.join(self.tmp, 'catalog'))
        self.assertEqual(self.catalog.problems, [])

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_two_layouts_share_one_set_of_facility_nodes(self):
        graph = build_graph(self.catalog, default_specs())
        facility_nodes = [k for k in graph.order if graph.nodes[k].scope.kind == 'facility']
        self.assertEqual(sorted(facility_nodes), sorted(['catalog.validate[synthetic]', 'facility.aoi.resolve[synthetic]', 'facility.osm.snapshot[synthetic]', 'facility.context.snapshot[synthetic]']))
        # Every layout's identity task hangs off the same catalog node.
        for layout_id in ('synthetic-a', 'synthetic-b'):
            self.assertIn('catalog.validate[synthetic]', graph.nodes[f'layout.identity.resolve[{layout_id}]'].deps)
        self.assertEqual(len(graph.nodes), 198)

    def test_selecting_a_layout_still_brings_its_facility(self):
        graph = build_graph(self.catalog, default_specs(), layout_ids=['synthetic-b'])
        self.assertIn('facility.osm.snapshot[synthetic]', graph)
        self.assertNotIn('layout.identity.resolve[synthetic-a]', graph)
        self.assertEqual(graph.layout_holes['synthetic-b'][:2], ['synthetic-b:01', 'synthetic-b:02'])

    def test_hole_selection_shrinks_fan_in_aggregates(self):
        graph = build_graph(self.catalog, default_specs(), layout_ids=['synthetic-a'], hole_ordinals={7, 8})
        agg = graph.nodes['layout.terrain.aggregate[synthetic-a]']
        self.assertEqual(sorted(d for d in agg.deps if d.startswith('hole.terrain.compile')), ['hole.terrain.compile[synthetic-a:07]', 'hole.terrain.compile[synthetic-a:08]'])

    def test_order_is_topological_and_stable(self):
        first = build_graph(self.catalog, default_specs()).order
        second = build_graph(self.catalog, default_specs()).order
        self.assertEqual(first, second)
        graph = build_graph(self.catalog, default_specs())
        position = {k: i for i, k in enumerate(graph.order)}
        for key, node in graph.nodes.items():
            for dep in node.deps:
                self.assertLess(position[dep], position[key], f'{dep} must precede {key}')

    def test_every_dependency_names_a_known_task(self):
        specs = default_specs()
        for s in specs.values():
            for dep in s.deps:
                self.assertIn(dep.rstrip('?*'), specs, f'{s.id} depends on unknown {dep}')

    def test_cycle_is_detected_and_named(self):
        specs = {'a.one': spec('a.one', 'facility', ('a.two',)), 'a.two': spec('a.two', 'facility', ('a.one',))}
        with self.assertRaises(CycleError) as caught:
            build_graph(self.catalog, specs)
        self.assertIn('a.one[synthetic]', str(caught.exception))
        self.assertIn('a.two[synthetic]', str(caught.exception))

    def test_unknown_dependency_is_an_error_and_optional_marks_are_kept_off_the_key(self):
        with self.assertRaises((KeyError, ValueError)):
            build_graph(self.catalog, {'l.needs': spec('l.needs', 'layout', ('l.missing',))})
        graph = build_graph(self.catalog, {'l.opt': spec('l.opt', 'layout'), 'l.needs': spec('l.needs', 'layout', ('l.opt?',))}, layout_ids=['synthetic-a'])
        self.assertEqual(graph.nodes['l.needs[synthetic-a]'].deps, ['l.opt[synthetic-a]'])

    def test_layout_task_cannot_depend_on_a_hole_task_without_fan_in(self):
        with self.assertRaises(ValueError):
            build_graph(self.catalog, {'h.one': spec('h.one', 'hole'), 'l.agg': spec('l.agg', 'layout', ('h.one',))})
        graph = build_graph(self.catalog, {'h.one': spec('h.one', 'hole'), 'l.agg': spec('l.agg', 'layout', ('h.one*',))})
        self.assertEqual(len(graph.nodes['l.agg[synthetic-a]'].deps), 18)

    def test_descendants_and_ancestors(self):
        graph = build_graph(self.catalog, default_specs(), layout_ids=['synthetic-a'])
        down = graph.descendants('facility.osm.snapshot[synthetic]')
        self.assertIn('hole.terrain.compile[synthetic-a:07]', down)
        self.assertIn('layout.capability.evaluate[synthetic-a]', down)
        up = graph.ancestors('hole.world.build[synthetic-a:07]')
        self.assertIn('facility.aoi.resolve[synthetic]', up)
        self.assertNotIn('hole.world.build[synthetic-a:08]', up)
        self.assertEqual(toposort(graph), graph.order)


if __name__ == '__main__':
    unittest.main()
