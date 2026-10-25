# 2026-10-25 — Class awareness (P-10): the player's Class status panel

```text
Design package: P-10 Class awareness (plan 2026-10-24, changelog 2026-10-25)
PR/commit: branch claude/clubhouse-class-awareness
Contract IDs: new CH-12070..12077, 12170..12172, 12270, 12271, 12570, 12870 (Bridge IDs in CONTRACT.md)
Actions: releaseMyHeldPushes (Deliver now, a server action); the player's own RLS-scoped writes (class-status-writes.ts)
Data impact: reads golf_my_class_day; writes golf_player_class_settings, golf_class_exceptions and golf_player_classes.status_enabled / semester. loadClasses selects status_enabled only with class_awareness_v1 on, and repeats the read without it if the column is missing
Held items: the migrations; with the flag off the page is unchanged
```

### Changed

- A Class status panel sits at the top of Classes (a card: card radius, a full hairline ring, no left edge or tint). Top line: the player's own state ("In class until 11:25 AM", "Class at 1:25 PM", "No class right now", "Exams · next exam Tue 9:00 AM", or "Class status starts when your coach sets this term's dates"), with the class in full under it. "Coaches see": the exact row a coach reads for them, from the same payload (`golf_my_class_day.player`) and the same text function, so the preview cannot drift; "No class status" when sharing is off.
- The sharing switch ("Share class status with coaches", on by default) flips at once and goes back with a toast if the write is refused. Turning it off offers Undo ("Coaches no longer see when you're in class"). Its help says what is true: the classes, with their times and rooms, are on the team calendar, which coaches and teammates can see.
- "No class today" lists today's remaining and current classes and "All my classes today"; it writes one `off` exception and offers Undo.
- Quiet notices: classes with no term can be tagged with the confirmed term in one tap; a class that cannot be used says why and opens its form; a class whose calendar times disagree re-syncs through the existing class calendar sync.
- Class detail gains "Use for class status" (a flexible class starts off) and "Add an exam" with the exams listed and removable (asks first).
- With the flag on, the "What your coach sees" note no longer says teammates don't see the classes (they can read them on the team calendar), and the empty state says coaches will see when the player is in class.
- The `.is-team` week cells no longer use insets on both sides; they take a full hairline ring and a quiet fill (plan 4.0).

- A "Pushes during class" row (CH-12271): "Held · Change" (or "Not held", "Off while sharing is off"), where Change opens Settings > Notifications. With pushes waiting it counts them and offers Deliver now (44 px, the dark-safe green `--ch-green-600`, never `--ch-accent` for text); it sends them at once, ticks, and reads "Delivered" for 2 seconds. A refusal toasts CH-12077. Turning sharing off, and marking No class today, also send what is waiting now.

### Verification

- The held-pushes row is in class-awareness-player.test.tsx (CH-12077, CH-12271); the words are in panel-model.test.ts and class-awareness-holds.test.tsx.
- panel-model.test.ts, exam-form.test.ts, class-awareness-player.test.tsx, class-awareness-writes.test.ts, class-awareness-loader.test.ts.
