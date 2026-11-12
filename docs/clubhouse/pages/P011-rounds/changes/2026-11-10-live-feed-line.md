# 2026-11-10 — P011

## 2026-11-10 — The live view's feed chip has its own line on the phone

```text
Design package: none (design review, 10 Nov 2026)
PR/commit:      afe7351b29
Contract IDs:   none new
Actions:        none
Data impact:    none
Held items:     none
```

On a phone the live view's feed chip ("Live · updated 4:12 PM") was the top
bar's action, where the CoachHelm key sat on top of it. The bar's right side
holds 44pt keys and the chip is not one, so it now stands on its own line
directly under the bar (`.ch-lv-feed`, `src/clubhouse/styles/live.css`;
`src/clubhouse/screens/live/LiveViewPhone.tsx`). Refresh still runs from the
chip.

Checked in WebKit at 390 and 320, light and dark, by the commit's author.
This note was written afterwards from that commit, to log the change.
