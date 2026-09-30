# 08 — CI, Progress, and Verification

## Principle

Organization only works if CI can detect lying documentation.

The Clubhouse registry must be mechanically checked.

## Keep existing `clubhouse:check`

It already enforces valuable rules:

- no Fairway UI imports
- no Fairway tokens
- Clubhouse CSS scoping
- doctrine constraints
- progress gate validity
- phone spec approval dependency
- screen checklist completion

Do not replace it.

Extend the Clubhouse check pipeline with registry validation.

## Proposed checks

### `clubhouse:registry:check`

Validates:

- unique Page IDs
- unique Bridge namespaces
- route format
- semantic feature refs exist in `memory/registry.yml`
- implementation paths exist when status says implemented
- docs paths exist
- controlled statuses only
- no orphan action IDs

### `clubhouse:contracts:check`

Validates:

- every page has category disposition 01–25
- each applicable contract has an ID
- IDs match page namespace/category
- no duplicate Bridge ID
- no reused tombstone
- contract-referenced tests exist when status is complete

### `clubhouse:held:check`

Validates:

- prepared migration references a held plan
- prepared migration is listed in `HELD.md`
- held feature/data items are not marked active
- page cannot claim complete if a blocking held item is unresolved
- held SQL header contains NOT APPLIED marker

### `clubhouse:docs:check`

Validates:

- every registered page has its docs
- generated projections are current
- page name/route match manifest
- `PROGRESS.md` is compatible with page status

## Proposed composite

```text
npm run clubhouse:check
  existing source doctrine
  + progress validation
  + registry
  + contracts
  + held
  + generated-doc drift
```

## Page completion gate

A page may only reach `complete` when all applicable checks are satisfied.

### Identity
- [ ] permanent Page ID
- [ ] route
- [ ] role(s)
- [ ] purpose

### Design
- [ ] approved package
- [ ] desktop reference
- [ ] phone spec where applicable

### Registry
- [ ] semantic feature mapping
- [ ] actions
- [ ] components
- [ ] hooks
- [ ] services
- [ ] data resources

### Contracts
- [ ] all 01–25 reviewed
- [ ] applicable events numbered
- [ ] Bridge actions registered

### States
- [ ] initial loading
- [ ] background loading
- [ ] empty
- [ ] filtered empty
- [ ] partial failure
- [ ] route failure
- [ ] offline
- [ ] permissions
- [ ] success
- [ ] destructive
- [ ] optimistic/rollback if relevant

### Experience
- [ ] motion
- [ ] reduced motion
- [ ] haptics
- [ ] keyboard
- [ ] accessibility
- [ ] responsive
- [ ] performance

### Verification
- [ ] tests passing
- [ ] visual pass
- [ ] phone pass
- [ ] no console errors
- [ ] forced failure paths tested
- [ ] registry checks clean

### Documentation
- [ ] WIRING current
- [ ] VERIFY current
- [ ] CHANGELOG updated
- [ ] PROGRESS updated

## Status reporting

Generate factual status.

Example:

```text
P004 Messages

Design ............... approved
Implementation ....... in_progress
Contract ............. 23/25 applicable done
Bridge ................ 8/10 wired
Tests ................. 17/18 passing
Held .................. 2 non-blocking
Verification .......... partial

Blockers
- phone spec not approved
- offline send integration test missing
```

This is more useful than an arbitrary percentage.

## Verification evidence

`VERIFY.md` should record:

```text
Date:
Commit/PR:
Viewport:
Role:
Scenario:
Command:
Exit code:
Visual reference:
Result:
Notes:
```

## Contract-first CI philosophy

A test should name the contract it protects.

Example:

```text
TEST-P004-SEND-FAILURE
protects: 4061
```

This lets Bridge, docs and tests all point to one semantic behavior.

## Visual regression

Critical pages should capture at minimum:

- default
- skeleton
- first-run empty
- filtered empty
- partial failure
- modal/sheet if core
- phone layout

This complements the existing high-fidelity design screenshot workflow.

## Failure forcing

Every failure contract marked complete should be deliberately forced at least once during verification.

Examples:

- loader throws
- action returns error
- browser offline
- invalid input
- permission denied
- optimistic rollback
- stale action/chunk recovery

A failure state that has never been observed is not verified.
