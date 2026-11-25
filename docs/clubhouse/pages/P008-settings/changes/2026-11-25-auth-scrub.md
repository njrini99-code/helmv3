# P008-settings — Changelog

## 2026-11-25 — Password and email changes (auth scrub)

```text
Design package: none (correctness audit)
PR/commit: agent/auth-scrub
Contract IDs: CH-8106
Actions: changePassword, changeEmail
Data impact: none
Held items: supabase/migrations/20261125130000_golf_auth_integrity.sql (copies a changed email to the app's tables)
```

### Changed

- A new password meets the same rules as sign up and the reset link:
  upper and lower case, a number, a symbol, not a common password, and
  not the current one. The field's help says so.
- A failed check of the current password says "incorrect" only when the
  password was refused. A throttle or an outage says so instead.
- The email-change link returns through the app's sign-in callback. The
  notice says to open a link at the current address too, when one comes.
