# 2026-11-13 — Team Hub's Updates are this team's

## 2026-11-13 — Another team's notifications stay in the bell

```text
Design package: none (coach audit, 13 Nov 2026, §7 Team Hub)
PR/commit:      agent/coach-fix-shell
Contract IDs:   none new
Actions:        getUnifiedNotifications (reads a page of 30, was 6)
Data impact:    none
Held items:     none
```

### Changed

- Updates leaves out items whose team is another team's (`forTeam`), and the
  "N new" count with them. Guilford's Updates had shown "Audit Testplayer has
  joined Demo University Golf" and Demo's messages. Those stay in the bell,
  where they are labelled.
- The hub reads 30 notifications to find this team's newest six, since another
  team's may sit above them.
