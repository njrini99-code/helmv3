# Feature: <Feature Name>

## Status

- active | experimental | deprecated | planned

## Owner

- <owner>

## Purpose

Explain why this feature exists.

## User Outcomes

- <outcome>

## Business Outcomes

- <outcome>

## Entry Points

### Routes

- <route>

### Components

- <component>

### Actions / APIs

- <action-or-api>

### Jobs / Workers

- <job>

## Data Model

- <table-or-entity>

## Data Flow

```txt
User action
  -> UI state
  -> server action or API
  -> validation and authorization
  -> database read/write
  -> cache invalidation or background work
  -> UI update
```

## Business Rules

- Rule:
  - Why:
  - Enforced where:
  - Tests:

## Permissions

- <actor>: <capability>

## UI Contract

- loading:
- empty:
- error:
- success:
- permission denied:
- disabled:
- mobile:
- desktop:

## Failure Modes

- <failure>

## Observability

- logs:
- metrics:
- Sentry:
- Datadog:

## Test Matrix

- unit:
- integration:
- e2e:
- visual:
- regression:

## Related Docs

- flows:
- business logic:
- systems:
- integrations:
- incidents:

## Unknowns

- <unknown>
