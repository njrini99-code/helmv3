# Clubhouse shared — Changelog

## 2026-11-20 — Phone feel (premium plan, batch 6)

```text
Design package: premium plan 2026-11-19, batch 6
PR/commit: agent/clubhouse-phone-feel-b6
Contract IDs: none
Actions: none
Data impact: none
Held items: none
```

### Changed

- M2: a pushed phone screen swipes back from anywhere on it, not only
  from the 20px edge. A content touch must travel 12px, twice as far
  across as down. It is read passively, so it never holds up a scroll
  (MOT-02). It is never taken from a field, a slider, a switch, a
  segmented control, a swipe row, a `touch-action: pan-y` element, a
  `data-ch-no-back` element, or a sideways scroller that can still
  scroll back.
- GES-12: the Switch thumb and the Segmented plate can be dragged,
  with a selection haptic per stop. A drag is never also a tap.
- GES-17: a checkbox's check draws in left to right (transform only)
  when it is ticked. Reduce Motion shows it at once.
- B7 (decision 11, applied as recommended): when a `Swap` changes
  height, what sits below it glides on the base beat by a transform
  (FLIP).
- OC-3 / G10: `--ch-on-green-ink-soft` and `-muted` are opaque. They
  hold 5.4 and 4.5 on the raised green's top stop, and 7.7 to 10.5 on
  the plates. Increase Contrast lifts both a step.
- AX-4: phone Month has Previous month and Next month keys. Each Bell
  card has a Mark read key, out of sight until it has keyboard focus.
- AX-9: the hole-out key's spoken name starts with its visible label
  ("Hole out, score 4"), and Next shot is "Next shot".
- AX-10: `ui/Abbr.tsx` reads FIR, GIR and SG in full to VoiceOver.
  It is used on Home, Rounds, Round review and Stats.
- J-4: posting a round replaces into its review, so Back does not land
  on a blank New round.
- J-5: a putt that stays on the green reads "Missed", not "Green".
- ST-10: a route skeleton that stands for 8 seconds shows one status
  line saying the page is still loading.

### Not done

- POP-02 (motion on the tap's frame) changes when every pushed screen
  renders its content. It needs an iPhone measurement before and
  after.
- GES-13 (the stretch while dragging) waits on the owner.
- ST-1 (one truncate policy) and ST-5 (person fallbacks) are open.
- The "Saved" check on a busy key (GES-17 done state) waits on the
  owner.
