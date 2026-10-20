# 03 — Directory and Registry Architecture

## Recommended repo placement

Do not introduce `/helm-atlas` as a parallel knowledge root.

Use the existing Clubhouse area and config layer.

```text
config/
└── clubhouse/
    ├── pages/
    │   ├── P001-foundation.json
    │   ├── P002-home.json
    │   ├── P003-calendar.json
    │   ├── P004-messages.json
    │   ├── P005-roster.json
    │   ├── P006-stats-team.json
    │   └── P007-stats-player.json
    │
    ├── bridge-contracts.json
    ├── bridge-tombstones.json
    └── registry.schema.json

docs/
└── clubhouse/
    ├── PROGRESS.md                    # existing overview authority
    ├── CHECKLIST_TEMPLATE.md          # existing quality contract
    │
    ├── pages/
    │   ├── P002-home/
    │   │   ├── PAGE.md
    │   │   ├── DESIGN.md
    │   │   ├── CONTRACT.md
    │   │   ├── WIRING.md
    │   │   ├── VERIFY.md
    │   │   └── CHANGELOG.md
    │   └── ...
    │
    ├── screens/                       # keep existing checklists
    ├── phone/                         # keep existing phone specs
    │
    ├── held/
    │   ├── features/
    │   └── data/
    │
    └── generated/
        ├── CLUBHOUSE_PAGE_MAP.md
        ├── CLUBHOUSE_ACTION_MAP.md
        ├── CLUBHOUSE_BRIDGE_MAP.md
        ├── CLUBHOUSE_HELD_MAP.md
        └── CLUBHOUSE_STATUS.md

scripts/
└── clubhouse/
    ├── check.mjs                      # existing; extend, do not replace
    ├── check-registry.mjs             # proposed
    ├── check-contracts.mjs            # proposed
    ├── generate-docs.mjs              # proposed
    └── status.mjs                     # proposed
```

## Why `config/clubhouse/pages/*.json`

This layer is:

- machine-readable
- outside the runtime UI bundle
- easy for Node scripts to validate
- diff-friendly
- simple for Claude/Codex to edit
- safe to generate docs from
- not a competing feature registry

## Page manifest shape

See `/starter-scaffold/config/clubhouse/registry.schema.json`.

Conceptually:

```json
{
  "id": "P004",
  "name": "Messages",
  "route": "/golf/dashboard/messages",
  "bridgeNamespace": 4,

  "roles": ["coach", "player"],

  "semanticFeatures": [
    "team_communications"
  ],

  "design": {
    "status": "approved",
    "package": "design/handoff/Messages.html"
  },

  "implementation": {
    "status": "in_progress",
    "root": "src/clubhouse/screens/messages"
  },

  "actions": [],
  "components": [],
  "hooks": [],
  "services": [],
  "dataResources": [],
  "contracts": [],
  "tests": [],
  "held": []
}
```

## Action records

Every meaningful interaction should have a readable ID.

Example:

```json
{
  "id": "ACT-P004-SEND-MESSAGE",
  "label": "Send message",
  "component": "Message composer send button",
  "handler": "send",
  "hook": "existing messages mutation/realtime plumbing",
  "bridge": {
    "start": null,
    "success": 4091,
    "failure": 4061,
    "offline": 4071
  }
}
```

Do not register every tab click unless it matters for:

- product semantics
- Bridge control
- state contract
- debugging
- analytics
- testing

## Components

The page manifest should link the real implementation:

```json
{
  "id": "CMP-P004-MESSAGE-COMPOSER",
  "path": "src/clubhouse/screens/messages/..."
}
```

Do not turn this into a universal design-system registry unless needed.

The goal is discoverability.

## Hooks and services

Record both:

```text
Clubhouse-specific implementation
Existing shared/headless logic
```

Example:

```text
UI
src/clubhouse/screens/messages/MessagesView.tsx

Shared non-UI plumbing
existing message realtime hook
existing message server actions
```

This is important because the fresh-build rule bans old **presentation**, not good business logic.

## Data resources

Use logical labels:

```text
DATA-MESSAGES
DATA-CALENDAR-EVENTS
DATA-ROSTER
DATA-STATS
```

Each page's `WIRING.md` can map the logical resource to:

- tables
- RPCs
- loaders
- server actions
- cache behavior
- realtime
- permissions

Do not create a second global database schema document.

## Existing UI Atlas integration

Do not reimplement route discovery.

The new generator should optionally read:

```text
ui-intelligence/catalog.json
```

and validate:

```text
every Clubhouse manifest route exists in known route inventory
```

The current UI Atlas can remain a visual/route analysis artifact.

The Clubhouse registry adds runtime implementation traceability.

## Existing feature registry integration

The registry checker should validate:

```text
every semanticFeatures[] value exists in memory/registry.yml
```

This creates a hard link between page docs and Helm semantic knowledge.

## Existing progress integration

`PROGRESS.md` remains the overview.

The new checker should validate:

```text
page status says complete
→ corresponding progress gates support that claim

verified gate says done
→ page manifest contract/verification must be complete
```

No second progress table should become authoritative.

Generated status views are fine.
