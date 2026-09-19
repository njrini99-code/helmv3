"""Disk classes and the reserve guard (Factory v2 §13). The reserve is the
session's existing 8 GB floor; a heavy task is refused, with the numbers and
what could be evicted, instead of failing on ENOSPC halfway through."""
import os
import shutil

from .model import Blocker

DEFAULT_RESERVE_GB = 8.0
RETENTION_POLICY = {
    'A': 'retained source truth: never evicted automatically',
    'B': 'reacquirable heavy source cache: LRU eviction once derived outputs are verified',
    'C': 'derived reproducible output: delete after sign-off when space is needed',
    'D': 'published immutable asset: local copy evictable after remote verification',
}


def reserve_bytes():
    gb = float(os.environ.get('COURSE_FACTORY_DISK_RESERVE_GB', DEFAULT_RESERVE_GB))
    return int(gb * (1 << 30))


def free_bytes(path):
    probe = path
    while not os.path.exists(probe):
        parent = os.path.dirname(probe)
        if parent == probe:
            break
        probe = parent
    return shutil.disk_usage(probe).free


def gb(n):
    return round(n / (1 << 30), 2)


def guard(path, need_bytes, ledger=None, free=None):
    """None when `need_bytes` fits above the reserve; otherwise the blocker
    with free/reserve/need and suggested evictions."""
    free = free_bytes(path) if free is None else free
    reserve = reserve_bytes()
    if free - need_bytes >= reserve:
        return None
    evidence = {'freeGb': gb(free), 'reserveGb': gb(reserve), 'estimatedNeedGb': gb(need_bytes),
                'suggestedEvictions': ledger.evictable(need_bytes - max(0, free - reserve)) if ledger else []}
    return Blocker('DISK_GUARD_BLOCKED', evidence)


def status(path, ledger=None):
    retained = ledger.retained_bytes() if ledger else {'byClass': {}, 'byScope': {}}
    return {'path': path, 'freeGb': gb(free_bytes(path)), 'reserveGb': gb(reserve_bytes()),
            'retainedGbByClass': {k: gb(v) for k, v in sorted(retained['byClass'].items())},
            'retainedGbByScope': {k: gb(v) for k, v in sorted(retained['byScope'].items())},
            'policy': RETENTION_POLICY}
