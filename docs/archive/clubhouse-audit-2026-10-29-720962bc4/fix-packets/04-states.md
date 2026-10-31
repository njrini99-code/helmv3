# Fix packet 04 · states

9 findings, 3 block the flag flip.

## F-0011 · S1 · blocks-flip · P011
**Going offline mid-round hides Exit, Scorecard and three result chips until the golfer scrolls**

- Observed: The 53 px banner covers Exit and Scorecard and pushes Green, Holed, Other under the bottom bar; after a 53 px scroll the banner covers holes 4-7.
- Expected: Every chip and exit reachable offline (CH-1901 intent).
- Fix: Expose the banner height as a CSS variable from OfflineBanner and subtract it in the track layout, or show a compact offline pill in the tracking header.
- Files: src/clubhouse/shell/OfflineBanner.tsx, src/clubhouse/screens/rounds/track/ShotEntry.tsx, src/clubhouse/styles/rounds-track.css
- Evidence: ev/states/track-offline.png, ev/states/track-offline-hit.png, ev/states/track-offline-scrolled.png, ev/states/track-offline-hit.json
- Acceptance: rerun the instrument named in the evidence; it must pass (ST-05).

## F-0012 · S1 · blocks-flip · P011
**When the live feed fails, Live says nobody is on the course**

- Observed: live?state=failed is pixel-identical to ?state=empty; no Try again; pill still 'Live · updated 1:03 AM'. Possibly fixture-only.
- Expected: InlineNotice CH-16604 with Try again (LiveView.tsx:51).
- Fix: Carry snapshot.error through the live hook so the notice branch renders.
- Files: src/clubhouse/screens/live/LiveView.tsx
- Evidence: ev/states/live-failed.png, ev/states/live-empty.png
- Acceptance: rerun the instrument named in the evidence; it must pass (ST-03).

## F-0013 · S1 · blocks-flip · P011
**If the qualifier list fails to load, setup looks as if there is no open qualifier**

- Observed: qualifiersfailed and noqualifiers have identical main text; the Open qualifier card disappears silently. A player could start a qualifier round as Practice.
- Expected: Inline notice with Try again.
- Fix: Render an InlineNotice with retry for qualifiers === null in RoundSetup.tsx.
- Files: src/clubhouse/screens/rounds/setup/RoundSetup.tsx
- Evidence: ev/states/setup-qualifiersfailed.png, ev/states/setup-noqualifiers.png, p4-states/lean-states/followup.json
- Acceptance: rerun the instrument named in the evidence; it must pass (ST-03).

## F-0027 · S2 · after · P006
**An RSVP made offline is refused rather than queued**

- Observed: Toast 'Couldn't send your reply… you're offline. Reconnect, then try again'; not sent on reconnect; no duplicate.
- Expected: Queue, show pending, send on reconnect.
- Fix: Route RSVP through the offline write queue; show a pending tick.
- Files: src/clubhouse/screens/calendar/*, src/clubhouse/shell/OfflineBanner.tsx
- Evidence: ev/P006/write-p-rsvp-offline.png, writes.jsonl#W-012
- Acceptance: rerun the instrument named in the evidence; it must pass (ST-05).

## F-0028 · S2 · after · P006
**The event inspector squeezes a long title and place into a one-word-wide column**

- Observed: 'Now at …' and Place wrapped at 4-6 characters a line beside 'Message players'.
- Expected: Value column takes remaining width; long tokens break with overflow-wrap.
- Fix: min-width: 0 and flex: 1 on the value cell; move 'Message players' below when narrow.
- Files: src/clubhouse/styles/calendar.css
- Evidence: ev/P006/write-c-ev-more.png
- Acceptance: rerun the instrument named in the evidence; it must pass (ST-06).

## F-0030 · S2 · after · P011
**Team rounds empty states give the coach nothing to do**

- Observed: No-roster and no-rounds states have zero controls; Home's empty offers Invite players.
- Expected: Invite players / a roster link.
- Fix: Add the EmptyState action in src/clubhouse/screens/rounds/TeamRounds.tsx.
- Files: src/clubhouse/screens/rounds/TeamRounds.tsx
- Evidence: ev/states/team-rounds-noroster.png, ev/states/team-rounds-empty.png
- Acceptance: rerun the instrument named in the evidence; it must pass (ST-02).

## F-0056 · S3 · after · P001
**A coach qualifying link opened by a player lands on a qualifier page with an empty heading**

- Observed: Lands on /golf/dashboard/qualifiers/<id> with h1 ''. No coach data seen; downgraded from S2.
- Expected: The player's qualifier view with its heading, or CH-1301.
- Fix: Map the alias to the player qualifier route in src/clubhouse/routes/alias.ts and render the title before data lands.
- Files: src/clubhouse/routes/alias.ts
- Evidence: ev/p1/player/coachhelm_qualifying_0a0d1700-0000-4000-8000-0000000000a1-pro.png
- Acceptance: rerun the instrument named in the evidence; it must pass (CO-04).

## F-0060 · S3 · after · P011
**Round review skeleton draws a pale hero where the loaded hero is dark green**

- Observed: First block light grey; loaded hero dark green. Home's skeleton is green.
- Expected: Skeleton in the hero's tone.
- Fix: Use the dark hero skeleton variant in RoundsSkeleton.tsx.
- Files: src/clubhouse/screens/rounds/RoundsSkeleton.tsx
- Evidence: ev/states/round-loading.png, ev/states/round-default.png
- Acceptance: rerun the instrument named in the evidence; it must pass (ST-01).

## F-0061 · S3 · after · P005
**Two failed reads say what happened but give no Try again button**

- Observed: player?readsfailed '…Try again in a moment.' with no button; round?notefailed '…Reload to try again.'
- Expected: A Try again control in place.
- Fix: Pass onRetry to the InlineNotice in both branches.
- Files: n/a
- Evidence: ev/states/player-readsfailed.png, ev/states/round-notefailed.png
- Acceptance: rerun the instrument named in the evidence; it must pass (ST-03).
