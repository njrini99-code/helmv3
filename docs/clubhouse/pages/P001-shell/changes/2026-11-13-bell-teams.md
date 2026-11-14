# 2026-11-13 — the bell names another team's item, and opens it on that team

## 2026-11-13 — Another team's notification is labelled; opening it switches team first

```text
Design package: none (coach audit, 13 Nov 2026, §2 Notifications)
PR/commit:      agent/coach-fix-shell
Contract IDs:   CH-1003 (reused: switching team fails)
Actions:        getUnifiedNotifications (each item gains an optional team)
Data impact:    two reads per feed load (conversations with their team, teams a row names); no writes
Held items:     none
```

### Changed

- `getUnifiedNotifications` attaches `team: {id, name} | null` to each item.
  Neither notifications table has a team: a message's team is its
  conversation's (read with the team's name in one embedded read), and a row
  whose data names a team (`team_join`) uses that. A direct message has none.
  A read that fails leaves every item with no team and the feed loads as
  before. Fairway ignores the field.
- The bell (desktop rows and the phone's cards) puts a flat chip with the team's
  name on another team's item. With Guilford active, every item had been Demo
  University's, unlabelled.
- Opening another team's item switches to it first (`setActiveTeam`, the
  switcher's action), toasts "Switched to Demo University Golf", then opens it.
  Before, Guilford's Messages opened on Demo's conversation and said "Pick a
  conversation". A coach who can't switch to that team (an assistant) gets
  CH-1003 with the reason, and the item stays unread; a refused or failed switch
  opens nothing.
- Events (`golf_calendar_notifications.event_id`) are not read for a team yet:
  none of the audited coach's rows had one.
