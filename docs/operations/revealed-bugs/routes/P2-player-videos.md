# [Route Hygiene]: /player/videos

## Severity
P2

## Confidence
medium

## Finding type
stale-link

## Evidence
- Source file: src/components/layout/mobile-bottom-nav.tsx
- Canonical route: /player/videos
- Referenced route: /player/videos
- Detected by: routes:check:links

## Why it matters
Link target /player/videos not found in route inventory.

## Suggested resolution
- needs-decision

## Verification
```bash
npm run routes:check
npm run routes:crawl
npm run e2e:critical
npm run typecheck
```
