# Live rounds catalog (16xxx)

Route `/golf/dashboard/live` (coaches) · surfaces Coach Home (`LiveNowCard`), the live view, the player's sheet, the player's own card, the Teammates card, Round setup and the in-round sheet, Team rounds, the player's library, Calendar and Qualifiers · code `src/clubhouse/live/` (the lane, beads, feed, queries and model), `src/clubhouse/screens/live/` · loader `src/clubhouse/data/live-rounds.ts` · tests `src/clubhouse/__tests__/live-rounds-copy.test.ts`, `src/clubhouse/live/__tests__/` · preview `/clubhouse-preview/live` (`?state=busy|one|many|finished|starts|event|longnames|empty|failed|denied`) and `/clubhouse-preview/home?live=busy|one|many|finished|event|failed`.

Live rounds (build plan P-6, handoff 4.34.6): who is on the course now, hole by hole, for the coach; the player's own round and the practice rounds teammates share. It only reads what the save path already writes: how shots and scores are entered and stored does not change. The numbers follow the plan's copy deck, so the second digit of a code here does not follow the kinds in [the catalog README](README.md): every CH-166xx row is the words of a live surface, and the checker does not require them to be used or tested by kind. A test names each of them regardless (`live-rounds-copy.test.ts`). The sharing words use open-call version 2 until the owner answers: the first level reads "Not live" (stored `off`), and rounds that a tournament tracks are shown by the tournament's own live view.

Where things live:
- The lane (`live/PlayerLane.tsx`), the bead row (`live/HoleBeads.tsx`), the momentum line, the feed chip (`live/FreshnessChip.tsx`) and the polite live region (`live/LiveAnnouncer.tsx`) are shared by every live surface; the stylesheet is `styles/live.css` (`.ch-lv-*`).
- `live/model.ts` holds the pure rules (freshness, groups, sort, moments, the late rule, the next hole); `live/live-rounds-adapter.ts` turns a `golf_round_live` row or a v0 poll row into one lane; `live/live-queries.ts` is the read, run on the server for the first paint and in the browser for the 20 second poll.
- Until held migration `20261025050000_golf_round_live.sql` is applied the live table is absent and the page reads the v0 poll (qualifier and tournament rounds only; no practice, no sharing).

## 166xx Copy: the live surfaces

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-16600 | Coach Home, someone is on the course | "Live now · {n} on the course" with a static green dot, a chevron to open the live view on the phone, "Open live view" on a wide screen. Up to four lanes on a phone, six on a wide screen | `LiveNowCard` (`screens/home`), `LIVE_COPY.homeTitle` | live-rounds-copy.test › CH-16600 |
| CH-16601 | More lanes than the card shows | "See all {n}", a 44px key to the live view | `LiveNowCard` | live-rounds-copy.test › CH-16601 |
| CH-16602 | Coach Home, only finished lanes remain (each stays 30 minutes after it posted) | "Finished today · {n}" as the title, without the dot | `LiveNowCard` | live-rounds-copy.test › CH-16602 |
| CH-16603 | The head of the card | "Open live view": the chevron's VoiceOver name on a phone, a text button on a wide screen | `LiveNowCard` | live-rounds-copy.test › CH-16603 |
| CH-16604 | A live read failed or the feed dropped | "Can’t refresh right now" in the card head in place of the dot, with the lanes it has. In the live view, before any lane has loaded, a notice with the same title, "Nothing you saved is lost. Try again." and Try again; the feed chip reads "No signal" with Retry | `feedProblem`, `FreshnessChip`, `InlineNotice`, `FAILURE_COPY.page` | live-rounds-copy.test › CH-16604 |
| CH-16605 | The device is offline while the card or the live view is open | "You’re offline" in the card head; the feed chip reads "Paused · {time}" | `feedProblem`, `FreshnessChip` | live-rounds-copy.test › CH-16605 |
| CH-16609 | The coach has no team, or lost access to it | "You don’t have access to this team’s live rounds." | `LiveDenied` (`ClubhouseLiveRoute`) | live-rounds-copy.test › CH-16609 |
| CH-16610 | The live view | Title "Live" | `LiveView`, `LiveViewPhone` | live-rounds-copy.test › CH-16610 |
| CH-16611 | Two or more round types have lanes | A filter: All, Qualifier, Practice, Tournament, showing only the types that have lanes. Hidden when only one type is live | `LiveFilter` (`Segmented`) | live-rounds-copy.test › CH-16611 |
| CH-16612 | Lanes on the course | Group "On the course · {n}" | `LiveGroupsList` | live-rounds-copy.test › CH-16612 |
| CH-16613 | Lanes that posted or stopped today | Group "Finished today · {n}" | `LiveGroupsList` | live-rounds-copy.test › CH-16613 |
| CH-16614 | Lanes with no word for 90 minutes | Group "Not heard from · {n}", so they do not sit among the live ones | `LiveGroupsList` | live-rounds-copy.test › CH-16614 |
| CH-16615 | The sort control | "Sort: To par" and its options To par, Thru, Name, Tee time; the choice is kept on this device. The menu also holds Announce updates and Refresh now (R) | `LiveSortMenu` (`Menu`) | live-rounds-copy.test › CH-16615 |
| CH-16616 | A player's sheet, the hole they play next | "12 · Par 4 · 412 yds"; yards are left out when unknown | `PlayerLiveBody`, `LIVE_COPY.nextHole` | live-rounds-copy.test › CH-16616 |
| CH-16617 | A player's sheet, Moments | A list of up to eight lines, newest first: "Birdie on 12", "Double on 13", "Caught up · thru 15", "{name} posted {total} ({toPar})", each with its time | `PlayerLiveBody`, `momentsFrom` | live-rounds-copy.test › CH-16617 |
| CH-16618 | Wide live view, nobody selected | "Where everyone is": the course in two rows of nine, a token on the hole each player plays next | `CourseRibbon` | live-rounds-copy.test › CH-16618 |
| CH-16619 | Nobody is on the course | "No one is on the course right now." and "Rounds show up here as soon as a player starts one." | `LiveEmpty` | live-rounds-copy.test › CH-16619 |
| CH-16620 | Qualifier detail (built in slice 4) | "On the course · {n}" above the board: compact lanes for this qualifier's rounds in progress | `QualifierLiveSection` | live-rounds-copy.test › CH-16620 |
| CH-16621 | A player with their own round on this qualifier (slice 4) | "Standings update when your round is posted." The board holds its state at the start of their round | `QualifierDetail` | live-rounds-copy.test › CH-16621 |
| CH-16622 | The qualifier list (slice 4) | "Round {r} live · {n} on the course" under the qualifier's name | `QualifiersList` | live-rounds-copy.test › CH-16622 |
| CH-16630 | The Team rounds band (slice 4); Home when only tournaments are live | "Live now" | `LiveNowCard` | live-rounds-copy.test › CH-16630 |
| CH-16631 | The share chip on an in-progress round in the player's library (slice 4) | The level in words: Not live, Coaches, Coaches and team. It opens the share sheet | `RoundsLibrary` | live-rounds-copy.test › CH-16631 |
| CH-16640 | Calendar peek and inspector, an event with lanes linked to it (slice 4) | "Live · {n} on the course", a 44px row with the live dot, opening the live view for the event | `peek.tsx`, `inspector.tsx` | live-rounds-copy.test › CH-16640 |
| CH-16641 | Calendar grid block (slice 4) | A 6px static live dot in the block's corner; VoiceOver adds "{n} on the course" | `views.tsx` | live-rounds-copy.test › CH-16641 |
| CH-16660 | Round setup (slice 2) | "Show this round live to" | `LiveShareField` | live-rounds-copy.test › CH-16660 |
| CH-16661 | Round setup (slice 2) | Three choices: "Not live", "Coaches", "Coaches and team". The stored value of the first is still `off` | `LiveShareField` (`Segmented`) | live-rounds-copy.test › CH-16661 |
| CH-16662 | A qualifier round in setup (slice 2) | "Qualifier rounds are always shown to coaches." Not live is unavailable, and so is Coaches and team | `LiveShareField` | live-rounds-copy.test › CH-16662 |
| CH-16663 | Round setup (slice 2) | "They see your score and the hole you’re on, not your location." | `LiveShareField` | live-rounds-copy.test › CH-16663 |
| CH-16664 | Changing the share level fails (slice 2) | "Couldn’t change sharing. Try again." The control returns to the level it had | `setLiveShare`, `LiveShareField` | live-rounds-copy.test › CH-16664 |
| CH-16665 | A round's sharing was changed 30 times (slice 2) | "Sharing was changed too many times on this round." | `setLiveShare` | live-rounds-copy.test › CH-16665 |
| CH-16666 | The share function is not in the database yet (slice 2) | "Sharing isn’t available yet." The control is normally not drawn then | `setLiveShare` | live-rounds-copy.test › CH-16666 |
| CH-16670 | A qualifier lane's second line | "Qualifier · R2 · 12 · Par 4" | `laneSubline` | live-rounds-copy.test › CH-16670 |
| CH-16671 | A practice or tournament lane's second line | "Practice · 12 · Par 4" | `laneSubline` | live-rounds-copy.test › CH-16671 |
| CH-16672 | A lane silent for 10 minutes with the last hole at least as old | "Last update 14 min ago" in the warning ink; the lane keeps full contrast | `PlayerLane`, `laneFreshness` | live-rounds-copy.test › CH-16672 |
| CH-16673 | A lane silent for 90 minutes | "No update since 11:40", in the viewer's clock; the lane moves to Not heard from. Nothing is dimmed | `PlayerLane`, `laneFreshness` | live-rounds-copy.test › CH-16673 |
| CH-16674 | A round the player stopped | "Stopped thru 9" and "Stopped" in the thru column. The lane leaves after 30 minutes | `PlayerLane` | live-rounds-copy.test › CH-16674 |
| CH-16675 | All holes scored, not posted | "Finished · not posted", thru reads F | `PlayerLane` | live-rounds-copy.test › CH-16675 |
| CH-16676 | A round was posted | The Moment "{name} posted {total} ({toPar})" | `momentsFrom` | live-rounds-copy.test › CH-16676 |
| CH-16677 | Two or more holes land in one read (a phone that reconnected) | The Moment "Caught up · thru {n}", with no wash on the to-par | `momentsFrom`, `isLate` | live-rounds-copy.test › CH-16677 |

## 168xx Copy: the player's own cards and the sharing words

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-16680 | The player's own live card (slice 1) | "Round in progress" | `OwnLiveCard` | live-rounds-copy.test › CH-16680 |
| CH-16681 | The player's own live card (slice 1) | "Next: {hole} · Par {par} · {yds} yds" | `OwnLiveCard` | live-rounds-copy.test › CH-16681 |
| CH-16682 | The player's Teammates card (slice 4) | "Teammates on the course · {n}" | `TeammatesLiveCard` | live-rounds-copy.test › CH-16682 |
| CH-16683 | The player's own live card, not saved for 10 minutes (slice 1) | "Last saved {n} min ago" | `OwnLiveCard` | live-rounds-copy.test › CH-16683 |
| CH-16684 | Round setup, open call (a) version 2 (slice 2) | "Not live keeps this round off live views. Your team can still open it in Rounds." The raw round reads are unchanged until the owner decides | `LiveShareField` | live-rounds-copy.test › CH-16684 |
| CH-16685 | Coach Home, a tournament tracks a live round | One 44px row per live tournament: "{event} · live" with the static dot, linking to the tournament's own live view. Tracked rounds get no lane | `LiveNowCard`, `readLiveEvents` | live-rounds-copy.test › CH-16685 |
