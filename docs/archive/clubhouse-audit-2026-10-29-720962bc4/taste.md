# Taste notes (lean run, two graders)

## iOS purist + motion
# Taste notes · iOS purist + motion · pass 1 (lean)

No `ref/` captures were made this run, so each reference below is named but not captured. Under 06 §3 these stay taste notes until a second grader agrees and a reference pair exists.

**P001 Shell & navigation.** The reference is iOS 26 Settings and Fitness navigation. A UIKit push holds every frame on a mid-tier phone. The new page is ready before the slide starts and the old page is snapshotted on the tap frame, so nothing renders during the slide. Clubhouse's push geometry is already that good (RMS 0.05 %). What it lacks is the frame budget: it renders the destination inside the slide. On a section switch, Fitness's tab plate moves while the row stays still. Clubhouse jumps the row 390 px and then flies the plate back in.

**P002 Home.** The references are Apple Fitness Summary and Things Today.
- Fitness's segmented control retargets mid-glide from where the thumb is. Clubhouse's pill jumps 45–62 px when a second tap lands.
- Things Today never strands a separator at a line end. Its metadata wraps whole items.
- The coach Home's score row ("75.7 / +0.3 No clear change") is the one block that reads as a dashboard rather than a page. Fitness puts the trend inline with a single coloured glyph.

**P003 Roster.** The reference is Contacts. Long-press on a row opens a context menu with a preview, and swipe reveals actions. Neither was exercised here. Contacts' search field is the full 44 pt pill and the whole pill takes the tap.

**P004 Stats (team).** The references are Apple Health trends and Stripe on desktop. Health draws chart labels at caption size and scales them with Dynamic Type. Clubhouse pins them at 11 px. Health's range picker is a segmented control with no select, where Clubhouse uses a 34 pt select.

**P005 Stats (player profile).** The reference is Apple Health highlights. Clubhouse's "No clear change" card and the strokes-gained meters are close to Health in tone. Health goes further by letting the user tap a metric for a full-screen chart with a shared-element zoom. Clubhouse's "Tap a leg to see its likely range" would earn the same continuity if it zoomed from the meter.

**P006 Calendar.**
- Switching Day ↔ Month in Apple Calendar iOS 26 is a zoom of the month grid, done on transform only. Clubhouse animates `height`, so the page below reflows and one switch dropped a 140 ms frame.
- Apple calls the same view "List" on both platforms.
- RSVP in Apple Invites shows the choice the instant it is tapped, where Clubhouse waits a second.

**P007 Messages.** The reference is iMessage. A conversation preview is always one or two lines with the sender and attachment glyph inline and an ellipsis. Clubhouse stacks "Coach:", a glyph and the text on three lines. iMessage's list cards also never step outside the page edge, while Clubhouse's Announcements card sits 3 pt wide of it.

**P008 Settings.** The reference is iOS Settings. Every row is a 44 pt grouped cell, and text fields live inside the cell, which takes the tap. The team course-pin field is 24 pt tall.

**P009 Qualifiers.** The reference is the Apple Sports leaderboard. Reordering and standings changes move rows with a spring on transform. MOT-73 wasn't run, so this is unjudged. The search field has the same 20 px input-inside-a-pill gap as Messages.

**P010 Team Hub.** The reference is Apple Invites. Captions never drop below the 12 pt caption floor, and the row "More" responds on the first touch. The 11 px caption here reads like a footnote squeezed in.

**P011 Rounds, Live and shot tracking.** This note covers presentation only and nothing about what is collected.
- In an Apple Fitness workout in progress, the metric card never moves under the thumb.
- When a lap is logged, the new row eases into the list and the live card stays anchored.
- Clubhouse's shot card jumps 150 px when a result is picked and snaps 258 px on Next shot. A golfer with gloves on loses their place.

**P012 Classes (player).** The reference is Apple Calendar's day list. It was unreviewed beyond the scan. The idea worth testing: classes appear as the same blocks as practices, with "class" as the only label difference.

**P013 CoachHelm (Ask and Board).** The references are the Claude iOS app and ChatGPT iOS. Every list row there (history, sources, follow-ups) is a 44 pt cell. CoachHelm's "where strokes go" rows are 19 pt text links stacked tight, so they are the hardest control on the phone to hit.

**P014 Recruiting (coach).** The reference is Attio's pipeline on desktop, with dense rows, hover-revealed actions and right-click menus. None of that was exercised. The grade is evidence-limited, not a judgment.

**P015 Sign-in and onboarding.** The reference is Apple Account sign-in. It launches with no colour step and uses the system keyboard with correct `textContentType`, so autofill works. Neither the cold-start colour step nor the field attributes were observed this run. The legacy Fairway hover CSS loads on this very surface.

**P016 Tournaments.** The reference is the iOS navigation bar. A pushed page shows the large title at rest and only shows the small bar title once the large title scrolls under the bar. "New event" here sits in the bar and as the large title at the same time, with an extra "Tournaments" eyebrow, so the screen says the same thing three times.


## Accessibility + golf coach/player
# Taste notes: a11y + golf coach/player + speed (pass 1, lean)

No `ref/` captures this run. Each reference is named, not captured, so none of these notes can become a finding until a second grader agrees and a capture exists (06 §3).

**P001 Shell.** The coach's job here is to trust what the bell says. Apple Calendar's notifications show the time in your own zone, word for word as it appears on the event. The Clubhouse bell gave a 10 AM practice as 2 PM (UTC), and one wrong time teaches a team to ignore the bell.

**P002 Home.** The coach should be able to see who needs a look and act on it in one tap. Apple Fitness Summary shows its numbers on the first frame. Coach Home takes 5.7 s cold on an iPhone-class CPU, while the player's Home takes 2.4 s. A double tap on "Message team" also stacks the page three times, where iOS ignores a second tap while a push is in flight.

**P003 Roster.** The coach wants to know which season they are looking at. Contacts never makes you wonder which list you are in. The Roster header says 2025-26 two months after the 1 August turnover, and Tournaments on the next tab says 2026–27.

**P004 Stats (team).** The coach compares legs of the game across the team. Stripe's dashboard charts put callouts on a plate in the chart's own surface colour, so they read on any ground. The Clubhouse callouts ("Best", "−5.4") sit at 2.6–3.4:1 on the chart.

**P005 Stats (player profile).** The coach reads one player before a 1:1. The "Early read" notice ("Mason has 2 countable rounds…") is better than Apple Health, which just shows a sparse chart. But the hero mixes windows ("Rounds 2 · This season" next to Last 10), and the "+3.3 better than previous 10" chip mirrors a −3.3 SG value. Apple Health always labels the window each figure uses. The tab count is Nick's named contrast gate, and it misses in dark.

**P006 Calendar.** The player's job is "am I going, and when?" Apple Invites marks Going under the finger. Clubhouse takes a second, and it refuses the RSVP offline where Invites would queue it. On desktop the coach saw "moved / Was 9:00 AM" on an event nobody moved, and that chip is the one thing players act on.

**P007 Messages.** The player needs a private line to the coach. iMessage would never send a one-to-one message to the group. Clubhouse did, and on desktop the coach's Start conversation opens nothing. A cold list that shows skeletons for 14 s is far from iMessage, which opens on cached threads at once.

**P008 Settings.** The job is to set notifications once and forget them. iOS Settings greys a row and says why in the footer, and Clubhouse does the same ("Email is paused for everyone right now"). That is the right call, so the disabled-label drafts were rejected.

**P009 Qualifiers.** The coach picks who travels. Apple Sports never shows "Final" under "Live". Clubhouse puts an "Ended · 5 rounds outstanding" card under the "Active" heading. Nick's rules (a card a round short ranks below full cards; Confirm squad saves in the board's order) were not exercised this run, and they are the first thing to test next.

**P010 Team Hub.** The coach posts and checks who has read it. The Linear projects page loads its list before its counts. Team Hub takes 6.4 s cold, and a row's More menu ignores the first click, which makes a coach click twice and doubt the tool.

**P011 Rounds, Live, shot tracking.** The player's job is to score a shot without thinking. Apple Fitness keeps a workout's controls on screen whatever banner appears. Here, going offline hides Exit, Scorecard and three result chips until the player scrolls. On the coach side, Live tells the coach "No one is on the course" when the feed has failed. Apple Sports says "Couldn't update", and that difference changes what the coach does.

**P012 Classes.** The player only needs the time and place. Apple Calendar's secondary text clears 4.5:1 in light mode, and the Clubhouse key text does not (4.38:1). Nothing else was exercised.

**P013 CoachHelm.** The coach wants one sentence to act on. A Claude iOS answer states a number once. The Board card says 35 % vs 62.2 vs "~62%" three times, with three stacked parentheticals. Shortening it is the cheapest gain on the page.

**P014 Recruiting.** The player's view ("Only coaches use Recruiting") explains itself, as Contacts does for a restricted list. Beyond that there was no evidence: not pressed, copy not sampled.

**P015 Sign-in and onboarding.** "Since you last signed in" is a good return summary, closer to Arc than to a generic welcome. The dark-mode S0 drafts were instrument noise, because the PNG reads cleanly.

**P016 Tournaments.** The coach compares two events side by side. On the ESPN and PGA Tour leaderboards, a screen reader reads the comparison as a table. Clubhouse's compare view has an axe critical (wrong children for its role), so VoiceOver can't navigate it as a table at all.
