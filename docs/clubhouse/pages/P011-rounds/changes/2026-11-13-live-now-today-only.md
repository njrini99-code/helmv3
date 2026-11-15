# 2026-11-13 — Live now lists a tournament only on its round's day

## 2026-11-13 — The Live now band drops a tournament round left live after its day

```text
Design package: none (coach audit, 13 Nov 2026, §2 and §11)
PR/commit:      agent/coach-fix-tournaments
Contract IDs:   none new
Actions:        none new
Data impact:    none (one embed added to a read)
Held items:     none
```

### Changed

- `live/live-queries.ts`: `readLiveEvents` reads each live tournament round's
  calendar day (`event:golf_events(start_time, all_day)`) and keeps it only when
  that day is today on the team's clock (an all-day round by its date). Tar
  Heel R1, left live on 25 Oct, no longer puts "Live now · Tar Heel Shootout"
  on Home and Team rounds while the live view says nobody is playing. A round
  whose day can't be read keeps the stored status.
