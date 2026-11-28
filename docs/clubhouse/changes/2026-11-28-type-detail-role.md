# The detail type role, and phone sizes in a narrow 1x window

## 2026-11-28 — 14px text stays 14px on the phone

```text
Design package: design lab foundation 1 (follow-up to QUEUE dsx-07)
PR/commit: fix/ch-14px-detail-role
Contract IDs: none new
Actions: none
Data impact: none
Held items: none
```

### Changed

- A new role, the detail, `--ch-type-detail` (14/20, 500, the same on phone
  and desk; 560 on 1x screens like the callout). The 302 stylesheet rules that
  read the 14 step before dsx-07 (#2660) read it instead: 297 had moved to the
  callout, which is 15/20 on a phone, and 5 phone rules to the footnote (13).
  Each is 14 on a phone again. On a desk the detail renders as the callout did,
  so nothing changes there.
- The rules that read the callout before dsx-07 keep it, at 15 on a phone.
- A phone-width layout on a 1x screen (a narrow window on a desk monitor) keeps
  the phone body (17/24) and callout (15/20). The 1x block comes after the
  phone block, so dsx-07 had put the body back to 15/22 there.
- `legacy-type-roles.test.ts` and `one-x-text.test.ts` cover both.

### Why

Owner, 28 Nov 2026: keep 14px text at 14px on the phone. dsx-07 rounded the 14
step to the callout, the same kind of jump as the 15 to 17 one the subhead
fixed.
