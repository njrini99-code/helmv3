# 2026-11-05 — Shared pieces

## 2026-11-05 — Zone and LargeTitle: empty readings and skeleton height

```text
Design package: none
PR/commit:      agent/clubhouse-open-items
Contract IDs:   none new
Actions:        none new
Data impact:    none
Held items:     none
```

`ui/Zone.tsx`: a zone's big reading shows its unit only beside a number, so an
empty one reads "—" rather than "— %". `styles/ui.css`: a zone holding only its
note gives the note the picture's whole place, level with the sentence beside
it.

`styles/shell.css`: on a phone, `LargeTitleSkeleton` holds the loaded title's
own 41px line, so what sits under it stays put when the words land. This reaches
every page that uses it, not only the ones in this pass.

Verified in headless WebKit on preview fixtures at 390, 430 and 1440. Not
checked on an iPhone. No screenshots stored.
