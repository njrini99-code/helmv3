# [Route Hygiene]: /baseball/player/videos

## Severity
P2

## Confidence
medium

## Finding type
stale-link

## Evidence
- Source file: src/components/layout/mobile-bottom-nav.tsx
- Canonical route: /baseball/player/videos
- Referenced route: /baseball/player/videos
- Detected by: routes:check:links

## Why it matters
Link target /baseball/player/videos not found in route inventory.

## Suggested resolution
- needs-decision

## Verification
```bash
npm run routes:check
npm run routes:crawl
npm run e2e:critical
npm run typecheck
```
