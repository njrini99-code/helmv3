# 2026-11-12 — coachhelm

## 2026-11-12 — The plan sheets' ask is no longer a form inside a form

```text
Design package: none (capture-2c, 11 Nov 2026)
PR/commit:      agent/preview-fixes-ui
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- The practice thread's edit, swap and empty-bank sheets drew "<form> cannot be a descendant of
  <form>" (23 hydration issues, phone and desktop): "Ask about this block" and "Ask about this
  station" were forms inside FormSheet's own form. They are one `AskIn` group now. Enter sends the
  ask and is kept from submitting the sheet (whose submit is Done); the key is a plain button.

### Verification

- `plan/__tests__/ask-in-no-nested-form.test.tsx` (new): no form inside the sheet's form; Enter
  sends and the sheet's submit is not called; an empty ask sends nothing. Plan tests: 40 passed.
- Dev server, `/clubhouse-preview/coachhelm-practice-thread?state=edit|swap|empty-bank|published`
  at 1440 and 390: the sheet open with its ask, 0 nested forms, no console errors.
- Not reproduced: the "published" hydration text mismatch (C2) did not appear on the dev server.
