# Mockup motion pass, 5 Nov 2026

The owner's mockups set the intent for depth, motion and function, in Clubhouse's
own tokens. This pass closes the gaps found against them.

- Ask: words fade in as they stream, a confirmed draft flies to its home slot,
  a saved plan drops into its folder, the plan pane and pushed plan slide in and
  out.
- Team Board: the story bar runs the story's full 5200 ms. Sheets take 462 ms
  and story bodies 420 ms.
- Read: funnel bars, cause dots and path nodes run 360 ms. The menu sheet takes
  462 ms.
- Quick chat: the panel is opaque by 90 ms.
- Messages: typing dots run 1200 ms at 160 ms apart. Your bubble is one flat
  fill, so the tail has no seam.
- CoachHelm: a read and a player's page push and pop as pages, and the Team
  Board's links to them no longer reload the app.

Also fixed from the acceptance pass: a failed Undo hold no longer writes, a
prefill keeps its thread, poll and return to Ask, the coach is told when their
own draft wins, and the practice brief follows the practice flag.

Not built: the Practice builder and its helper (PP8, blocked on N-00), and
Ask's `/plan`, `/lineup` and `/recap` jobs.

Not verified on a device: every motion here needs the preview deploy and an
iPhone.
