# Go-live bug hunt, 5 Nov 2026

Fixes from the hunt across data, navigation and client state before Clubhouse
replaces Fairway.

- Shell: Practice plan and format pages open, with a Back. An address with no
  screen no longer promises a rebuild. Demo links run the demo funnel.
- Roster: a held migration lets a coach read their inactive members, so they
  stay on the Inactive tab and can be marked active again.
- CoachHelm: the Team story skips unfinished and test rounds. A failed plan
  save or undo reports back rather than spinning. Reopening a chat doesn't open
  a pane per plan. New chat closes the pane. Edit in builder works once saved.
- Home: open tasks can't be crowded out by finished ones.
- Calendar: class details page past 1,000 rows. RSVP counts page too.
- Shell: the next event looks further past hidden meetings.
- Recruiting: a passing timeout no longer hides next steps.
- Messages: search doesn't show the last term's results under a new one.
- Stats: rapid window switches don't flash an older page.
- Motion: iOS before 17.2 gets a plain curve, as linear() throws there.
- Stats: a filter down to one round no longer draws an invalid chart path.
- Older iPhones: no lookbehind regex, which iOS before 16.4 can't parse and
  which stops the whole script it ships in. A test keeps them out.
