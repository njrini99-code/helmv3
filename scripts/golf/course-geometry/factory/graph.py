"""Facility → layout → hole task DAG (Factory v2 §8). Scope is part of a
node's identity; two layouts at one facility share its facility nodes."""
from .model import Node, Scope


class CycleError(Exception):
    pass


class Graph:
    def __init__(self):
        self.nodes = {}
        self.order = []
        self.layout_holes = {}

    def __contains__(self, key):
        return key in self.nodes

    def dependents(self, key):
        return [n.key for n in self.nodes.values() if key in n.deps]

    def descendants(self, key):
        seen, stack = set(), [key]
        while stack:
            k = stack.pop()
            for d in self.dependents(k):
                if d not in seen:
                    seen.add(d)
                    stack.append(d)
        return seen

    def ancestors(self, key):
        seen, stack = set(), list(self.nodes[key].deps)
        while stack:
            k = stack.pop()
            if k in seen:
                continue
            seen.add(k)
            stack.extend(self.nodes[k].deps)
        return seen


def hole_scopes(layout):
    return [Scope('hole', layout['facilityId'], layout['layoutId'], key, ordinal=i + 1) for i, key in enumerate(layout['holeOrder'])]


def build_graph(catalog, specs, facility_ids=None, layout_ids=None, hole_ordinals=None):
    """Nodes for every (spec, scope) the selection touches. Selecting a
    layout brings its facility; selecting a facility brings every layout."""
    graph = Graph()
    layouts = list(catalog.layouts.values())
    if layout_ids:
        layouts = [l for l in layouts if l['layoutId'] in layout_ids]
    if facility_ids:
        layouts = [l for l in layouts if l['facilityId'] in facility_ids] if not layout_ids else layouts
    facilities = sorted({l['facilityId'] for l in layouts} | set(facility_ids or []))
    by_kind = {'facility': [], 'layout': [], 'hole': []}
    for spec in specs.values():
        by_kind[spec.scope_kind].append(spec)
    for fid in facilities:
        if fid not in catalog.facilities:
            continue
        fscope = Scope('facility', fid)
        for spec in by_kind['facility']:
            _add(graph, spec, fscope)
    for layout in sorted(layouts, key=lambda l: l['layoutId']):
        lscope = Scope('layout', layout['facilityId'], layout['layoutId'])
        holes = [h for h in hole_scopes(layout) if not hole_ordinals or h.ordinal in hole_ordinals]
        graph.layout_holes[layout['layoutId']] = [h.key_part for h in holes]
        for spec in by_kind['layout']:
            _add(graph, spec, lscope)
        for hscope in holes:
            for spec in by_kind['hole']:
                _add(graph, spec, hscope)
    _resolve_deps(graph, specs)
    graph.order = toposort(graph)
    return graph


def _add(graph, spec, scope):
    node = Node(spec=spec, scope=scope)
    graph.nodes[node.key] = node


def dep_scope(dep_kind, scope):
    if dep_kind == scope.kind:
        return scope
    if dep_kind == 'facility':
        return Scope('facility', scope.facility_id)
    if dep_kind == 'layout':
        return Scope('layout', scope.facility_id, scope.layout_id)
    return None


def parse_dep(dep):
    optional = dep.endswith('?')
    fan_in = dep.rstrip('?').endswith('*')
    return dep.rstrip('?*'), optional, fan_in


def _resolve_deps(graph, specs):
    for node in graph.nodes.values():
        resolved = []
        for dep in node.spec.deps:
            dep_id, optional, fan_in = parse_dep(dep)
            dep_spec = specs[dep_id]
            if fan_in:
                # A layout aggregate over every hole node of that layout.
                for part in graph.layout_holes.get(node.scope.layout_id, []):
                    key = f'{dep_id}[{part}]'
                    if key in graph.nodes:
                        resolved.append(key)
                continue
            scope = dep_scope(dep_spec.scope_kind, node.scope)
            if scope is None:
                raise ValueError(f'{node.key}: a {node.scope.kind} task cannot depend on hole task {dep_id} without *')
            key = f'{dep_id}[{scope.key_part}]'
            if key in graph.nodes:
                resolved.append(key)
            elif not optional:
                raise ValueError(f'{node.key}: dependency {key} is not in the graph')
        node.deps = resolved


def toposort(graph):
    indegree = {k: len(n.deps) for k, n in graph.nodes.items()}
    ready = sorted(k for k, d in indegree.items() if d == 0)
    order = []
    while ready:
        key = ready.pop(0)
        order.append(key)
        for dep_key in sorted(graph.dependents(key)):
            indegree[dep_key] -= 1
            if indegree[dep_key] == 0:
                ready.append(dep_key)
        ready.sort()
    if len(order) != len(graph.nodes):
        stuck = sorted(k for k, d in indegree.items() if d > 0)
        raise CycleError(f'dependency cycle among {", ".join(stuck[:8])}')
    return order
