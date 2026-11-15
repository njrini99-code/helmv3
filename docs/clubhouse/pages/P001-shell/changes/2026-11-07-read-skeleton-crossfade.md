# 2026-11-07 — P001

## 2026-11-07 — A skeleton can ask to crossfade with its page

```text
Design package: none
PR/commit:      agent/ch-read-team
Contract IDs:   CH-1619 (one marked skeleton takes the quick beat)
Actions:        none new
Data impact:    none
Held items:     none
```

A route skeleton marked `data-ch-arrive="crossfade"` fades out as its page
fades in, over the quick beat, in opacity alone. Only the CoachHelm read asks
for it (READ-S4). Every other skeleton keeps the 110ms fade of CH-1619, and
reduced motion and Animations off still swap at once.
