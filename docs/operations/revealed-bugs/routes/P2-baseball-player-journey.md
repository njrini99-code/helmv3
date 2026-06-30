# [Route Hygiene]: /baseball/player/journey

## Severity
P2

## Confidence
medium

## Finding type
stale-link

## Evidence
- Source file: src/components/layout/mobile-bottom-nav.tsx
- Canonical route: /baseball/player/journey
- Referenced route: /baseball/player/journey
- Detected by: routes:check:links

## Why it matters
Link target /baseball/player/journey not found in route inventory.

## Suggested resolution
- needs-decision

## Verification
```bash
npm run routes:check
npm run routes:crawl
npm run e2e:critical
npm run typecheck
```
