# 2026-10-24 — Failure copy: a save template, and no guessed cause

## 2026-10-24 — "Couldn’t save. Your changes are kept." and no more "Check your connection" on a guess

```text
Design package: none (Clubhouse A+ Round 1, S3 item 4; B10.3, row 62 remainder)
PR/commit:      agent/aplus-s3
Contract IDs:   CH-1205, CH-1002, CH-8001, CH-8002, CH-8005, CH-8011, CH-8022, CH-8024, CH-8029, CH-11005, CH-11010, CH-12001, CH-12004, CH-12005, CH-14001, CH-14002, CH-14004, CH-14005, CH-14007, CH-14201, CH-15014, CH-15031, CH-15033, CH-15034, CH-15962
Actions:        none
Data impact:    none
Held items:     the reset password line keeps "Check your connection" where the code classified a fetch failure, on a ratchet that only falls
```

### Changed

- ui/Notices `FAILURE_COPY` gains `save` ("Couldn’t save. Your changes are
  kept. Try again.") and `kept` ("Your changes are kept. Try again.", under a
  title that already says what didn't save).
- CH-1205 (a page that didn't finish loading) drops "The connection dropped…
  Check your signal" for "Nothing you saved is lost. Try again."
- "Check your connection and try again." is gone where the cause was a guess:
  - Settings: a form save with no answer says `kept`; a switch or autosave,
    which has already gone back, says "It is back where it was. Try again.";
    a test push "Nothing was sent."; a photo "Your photo wasn’t changed."
  - Sign-out failure (toast and Coach pending): "Try again." (whether the
    session survived a failed sign-out isn't known, so it isn't claimed).
  - Join a team and the staff invite, whose catch-all said "Network error":
    "Couldn’t join the team. Try again."; request access: "Your request didn’t
    send. Your details are still here. Try again."
  - useAction's last-resort body, Classes and Recruiting hints, uploads, the
    recruiting list notice, round entry ("Your shots are still on this device.")
    and the round submit line, onboarding's session check, and the reset
    password throw (`save`).
- error-copy.test: a ratchet on "check your connection" (only reset-state.ts,
  which classifies a fetch failure), no "connection dropped", and the two new
  templates end on "Try again." Auth's "check your internet connection" lines
  (auth-logic `getErrorMessage`, onboarding finish) are classified from the
  error message and left as they are.

### Why

- Row 62: a failure says what didn't happen, what was kept and what to do; it
  never guesses at a cause. Offline already has its own line (CH-1905), named
  because the browser says so.

### Verification

- error-copy.test; settings.test › CH-8005, CH-8021, CH-8022 (whole toast
  body pinned: a switch goes back, a form keeps), CH-8011; auth-join.test ›
  CH-15033; shell.test › CH-1205; classes.test › CH-12001, CH-12004,
  CH-12005; recruiting.test › CH-14005, CH-14201; recruiting-upload.test ›
  CH-14903. The old copy was asserted in those tests; they now assert the new.
