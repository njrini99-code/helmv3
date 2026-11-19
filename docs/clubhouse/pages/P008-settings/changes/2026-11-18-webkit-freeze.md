# 2026-11-18 — Desktop Settings no longer freezes WebKit

## 2026-11-18 — No push-engine call before permission; no phone tree on desktop

```text
Design package: none
PR/commit: #2584, branch agent/fix-settings-webkit-freeze
Contract IDs: none
Actions: none
Data impact: none
Held items: none
```

### Changed

- Opening Settings no longer calls `pushManager.getSubscription()` unless
  notification permission is already granted (`usePushSubscription`); without
  permission no subscription can exist, so the answer is `unsubscribed`.
- `.ch-setm` (the phone tree) is hidden by default in `settings.css`; the
  phone media query still shows it, so a server-rendered phone tree cannot
  paint as unstyled text on desktop before hydration.

### Why

- In a production build, Playwright WebKit locked the page's main thread on
  desktop Settings: the engine's `getSubscription()` never returned after a
  service worker was ready (reproduced on a bare page with no Helm code).

### Verification

- `src/hooks/golf/__tests__/use-push-subscription.test.tsx` (fails without
  the fix) and `src/clubhouse/styles/__tests__/settings-phone-tree-hidden.test.ts`.
- Production build, Playwright WebKit 1440 and 402 px: the page answers
  `page.evaluate` after load. Real Safari not checked.
