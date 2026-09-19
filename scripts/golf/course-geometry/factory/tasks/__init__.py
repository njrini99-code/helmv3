"""The task registry: every spec the factory knows, by id."""
from . import aggregate_tasks, facility_tasks, hole_tasks, layout_tasks

INLINE = 'inline'   # executor sentinel: validated while planning, recorded on run


def default_specs(overrides=None):
    specs = {}
    for module in (facility_tasks, layout_tasks, hole_tasks, aggregate_tasks):
        for spec in module.SPECS:
            specs[spec.id] = spec
    for task_id, changes in (overrides or {}).items():
        spec = specs[task_id]
        specs[task_id] = spec.__class__(**{**spec.__dict__, **changes})
    return specs
