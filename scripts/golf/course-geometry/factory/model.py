"""Task, scope, blocker and plan-row types (Factory v2 §6–8)."""
from dataclasses import dataclass, field

STATES = ('unknown', 'ready', 'running', 'success', 'cached', 'blocked', 'failed', 'stale', 'skipped')
RETENTION_CLASSES = ('A', 'B', 'C', 'D')


@dataclass(frozen=True)
class Scope:
    kind: str                     # 'facility' | 'layout' | 'hole'
    facility_id: str
    layout_id: str = None
    hole_key: str = None
    ordinal: int = None

    @property
    def label(self):
        if self.kind == 'facility':
            return f'facility:{self.facility_id}'
        if self.kind == 'layout':
            return f'layout:{self.layout_id}'
        return f'hole:{self.layout_id}:{self.nn}'

    @property
    def nn(self):
        return f'{self.ordinal:02d}' if self.ordinal else hole_ordinal(self.hole_key)

    @property
    def key_part(self):
        if self.kind == 'facility':
            return self.facility_id
        if self.kind == 'layout':
            return self.layout_id
        return f'{self.layout_id}:{self.nn}'


def hole_ordinal(hole_key):
    """`peek-n-peak-upper-07` → `07`; a key without a numeric tail is kept whole."""
    tail = hole_key.rsplit('-', 1)[-1]
    return tail if tail.isdigit() else hole_key


@dataclass(frozen=True)
class Blocker:
    code: str
    evidence: dict = field(default_factory=dict)

    def as_dict(self):
        return {'code': self.code, 'evidence': dict(self.evidence)}


@dataclass
class ArtifactRef:
    """One expected or recorded output. `verify` decides how the recorded
    hash is checked on reuse; None means the file only has to exist."""
    key: str
    path: str
    retention: str = 'C'
    sha256: str = None
    bytes: int = None

    def as_dict(self):
        return {'key': self.key, 'path': self.path, 'retention': self.retention, 'sha256': self.sha256, 'bytes': self.bytes}


@dataclass
class Evaluation:
    """What a task spec says about one node right now: its direct inputs
    (key → hash or None), the blockers it raises on its own, the outputs it
    expects, and whether an already-present output can be adopted."""
    inputs: dict = field(default_factory=dict)
    blockers: list = field(default_factory=list)
    artifacts: list = field(default_factory=list)
    adoptable: bool = False
    notes: list = field(default_factory=list)
    output: str = None            # the output's own identity (a contentHash) when the artifact records one


@dataclass(frozen=True)
class TaskSpec:
    id: str
    version: str
    scope_kind: str
    deps: tuple                   # task ids; scope resolves by kind (hole → its layout → its facility)
    evaluate: object              # (node, ctx) -> Evaluation
    impl_files: tuple = ()        # repo-relative files whose hashes enter the fingerprint
    retention: str = 'C'
    estimated_bytes: int = 0      # disk the task may need; guards heavy acquisition
    executor: object = None       # (node, ctx, run) -> list[ArtifactRef]; None until an adapter exists
    settings: dict = field(default_factory=dict)  # contract settings hashed into the fingerprint


@dataclass
class Node:
    spec: TaskSpec
    scope: Scope
    deps: list = field(default_factory=list)      # node keys

    @property
    def key(self):
        return f'{self.spec.id}[{self.scope.key_part}]'


@dataclass
class PlanRow:
    key: str
    task: str
    scope: str
    state: str
    reason: str
    fingerprint: str = None
    blockers: list = field(default_factory=list)
    changed_inputs: list = field(default_factory=list)
    inputs: dict = field(default_factory=dict)
    artifacts: list = field(default_factory=list)
    output_hash: str = None
    notes: list = field(default_factory=list)

    def as_dict(self):
        return {
            'key': self.key, 'task': self.task, 'scope': self.scope, 'state': self.state, 'reason': self.reason,
            'fingerprint': self.fingerprint, 'blockers': [b.as_dict() for b in self.blockers],
            'changedInputs': list(self.changed_inputs), 'inputs': dict(self.inputs),
            'artifacts': [a.as_dict() for a in self.artifacts], 'outputHash': self.output_hash, 'notes': list(self.notes),
        }
