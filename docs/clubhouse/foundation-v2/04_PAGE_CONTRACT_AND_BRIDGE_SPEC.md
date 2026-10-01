# 04 — Page Contract + Helm Bridge Numbering Specification

## Goal

Every page gets a stable numeric namespace.

Within that namespace, every meaningful state/action has a deterministic number.

That number can become a Helm Bridge key.

## Number model

Use:

```text
<page namespace><category><item>
```

For page namespace `4`:

```text
4051
```

means:

```text
4  = page namespace
05 = validation
1  = first validation contract on this page
```

For a two-digit namespace:

```text
12051
```

means:

```text
12 = page namespace
05 = validation
1  = first validation contract
```

Do not force fixed string width.

Treat the canonical representation as a decimal integer plus explicit metadata.

## Category table

| Code | Category |
|---|---|
| 01 | Default / core UI |
| 02 | Initial loading / skeleton |
| 03 | Background loading / refresh |
| 04 | Empty state |
| 05 | Validation error |
| 06 | Server / system error |
| 07 | Network / offline |
| 08 | Permission / authorization |
| 09 | Success feedback |
| 10 | Warning |
| 11 | Destructive action |
| 12 | State preservation / unsaved state |
| 13 | Optimistic UI |
| 14 | Retry / recovery |
| 15 | Data freshness / sync |
| 16 | Micro animation |
| 17 | Haptic |
| 18 | Accessibility |
| 19 | Responsive layout |
| 20 | Keyboard / input |
| 21 | Performance |
| 22 | Analytics |
| 23 | Logging / observability |
| 24 | CI / automated test |
| 25 | Helm Bridge action |

## Category semantics are immutable

If `05` means validation on P004, it means validation everywhere.

Never repurpose a category.

## IDs represent meaning, not UI

Bad:

```text
4051 = red toast
```

Good:

```text
4051 = send attempted with empty message body
```

The UI for that event may evolve:

```text
inline hint
+ focus
+ haptic
```

without changing `4051`.

## Canonical Bridge record

```json
{
  "id": 4051,
  "page": "P004",
  "category": 5,
  "item": 1,
  "name": "MESSAGE_BODY_REQUIRED",
  "meaning": "User attempted to send a message with no sendable content.",
  "severity": "validation",
  "recoverable": true,
  "presentation": {
    "inline": true,
    "toast": false,
    "haptic": "error",
    "focus": "message-composer"
  },
  "tests": [
    "TEST-P004-MESSAGE-BODY-REQUIRED"
  ]
}
```

## Readable constants

Application code should not contain naked numbers.

Preferred:

```ts
bridge.emit(CH_BRIDGE.MESSAGES.MESSAGE_BODY_REQUIRED)
```

Generated constant:

```ts
MESSAGE_BODY_REQUIRED: 4051
```

## Tombstones

Once an ID has shipped, never reuse it.

If removed:

```json
{
  "id": 4057,
  "removedAt": "2026-11-01",
  "reason": "Old attachment validation retired.",
  "replacement": 4059
}
```

Store in:

```text
config/clubhouse/bridge-tombstones.json
```

CI rejects reuse.

## Page Contract documentation

Each page gets `CONTRACT.md`.

Every category must be:

```text
DEFINED
```

or:

```text
N/A — reason
```

Silence is not allowed.

## Example — Messages page, proposed P004 / 4xxx

### 4021 — initial messages skeleton

Trigger:
Initial route data not resolved.

UI:
Use the real Messages skeleton geometry.

Rules:
- no giant spinner
- no layout shift
- only for initial load
- background refresh does not blank existing thread

### 4041 — no conversations

Meaning:
User legitimately has zero visible conversations.

Copy:
Explain what appears here and the available next action.

Do not use this state for a failed read.

### 4042 — no search results

Meaning:
Search succeeded with zero matches.

Recovery:
Clear query.

Distinct from `4041`.

### 4051 — invalid empty message send

Trigger:
Send attempted with neither text nor attachment.

Presentation:
Inline composer feedback.

Haptic:
error.

Do not use a global error toast unless needed.

### 4061 — send failed

Meaning:
Mutation reached the action path but did not succeed.

Presentation:
Error toast with exact action context and Retry.

State:
Draft remains intact.

Observability:
Existing `chReport`/error pipeline.

### 4071 — send unavailable offline

Meaning:
No usable network for message mutation.

Presentation:
Specific connectivity wording.

State:
Draft preserved.

### 4091 — message send committed

Meaning:
Send accepted.

Presentation:
Do not necessarily toast every message send if the new message visibly appears.

Haptic:
commit/success only if consistent with the interaction doctrine.

### 4131 — optimistic message insertion

Meaning:
Pending local message appears before final reconciliation if this behavior is used.

Failure:
Rollback or mark unsent; never silently disappear.

### 4161 — message insertion motion

Use Clubhouse motion tokens only.

### 4171 — send commit haptic

Use shared Clubhouse haptic abstraction.

### 4181 — composer accessibility

- labeled input
- send button label
- live error announcement
- focus behavior

### 4231 — send failure observability

Must preserve:
- page/surface
- action
- Bridge ID
- safe error class
- connectivity context where useful

### 4241 — empty composer test

Protects `4051`.

### 4251 — Bridge action: focus composer

Target:
Message composer.

Precondition:
Messages route mounted.

Expected result:
Composer receives focus.

## Bridge action rules

Bridge action IDs are commands.

Examples:

```text
4251 focus:message-composer
4252 open:new-message
4253 retry:last-send
```

Every Bridge action defines:

```text
precondition
target
effect
success event
failure event
```

## Avoid over-registration

Do not assign an ID to:

- decorative icon
- divider
- static label
- every hover
- every CSS transition

Register things that matter to:

- behavior
- recovery
- automation
- observability
- tests
- user state
