# Wiring report: messages (incl. pin-sync), 4 Nov 2026

Checked against helmv3 03d9087, read only. The clone is shallow, so 75b4956 isn't in it and every citation was checked on 03d9087. I added `## Wiring, 4 Nov 2026` to 06 (W1 to W8) and 08 (W-MSG-1 to 21), pointers under the H1s of 02, 05, 06 and 08, and in-place fixes in 02, 03 and 05, each marked "(fixed 4 Nov wiring: ...)". I also gave the pin migration the brief's STATUS first line (a comment only).

## 1. Gaps by kind (32)

- **Data (11):**
  - Video length is stored (`duration_seconds`) but `loadAttachments` drops it. Fix: map it.
  - Upload progress exists; the spinner stays indeterminate.
  - The poll bar is `pollShare` (people who voted). "Most votes" means `leaders.length === 1`. The footer counts people.
  - Multi-answer votes are one row per person, with option ids joined by commas.
  - The unread divider comes from `conv.unread` at open.
  - There's no older-message paging (newest 200 only).
  - Deleted messages never reach the thread.
  - A missing person reads "Member".
  - The mute glyph reuses the existing participant select (use-golf-messages.ts:1519-1533), so no extra read.
- **Actions (9):**
  - L3 confirmed (`paramsDone`, Messages.tsx 185).
  - M1 confirmed; fixed client side by dropping hits that aren't in `convs`.
  - M3 confirmed (`badges.refetch`).
  - H1 is already fixed on main.
  - Removed state: today it shows CH-7015 and closes the thread. v2 keeps the thread and shows the pill.
  - Typing: a set of typer ids plus a `typingExpiryMs` option.
  - `?announcement=` is read on the client.
  - Reactions aren't optimistic, as today.
  - Re-sign after 50 minutes means calling `getGolfMessageAttachments` again.
- **Privacy (2):** Class status, Profile and New announcement are gated on the server role and absent from the DOM. The typing topic is public today, and the lane doesn't widen it.
- **Notifications (3):** The bell's deep link is at fanout :214. The bell ignores settings, but mute removes it. Announcement pushes land on `/announcements`, unchanged.
- **Flags (3):** `isFlagEnabled` is synchronous. The flag is carried on `ChMessagesData`. The typing expiry is chosen per flag.
- **Handoffs (4, Ask AK11c):**
  - `takePrefill` rejects an entry with no players (prefill.ts:79).
  - `keyOf` must hash the new fields.
  - `PollSheet` needs a `seed` prop.
  - `returnTo: 'ask'` is now read; 05's "contradiction" note is fixed.

## 2. Citations moved, fixed

- searchGolfMessages: `actions/messages.ts:1412-1440` is now `src/app/actions/messages.ts:1465-1560`.
- Fanout `:135` is now `:214`; the push URL is built at push.ts 113-124.
- Messages.tsx deep-link params 132-143 are now 173-238; the newest-thread fallback is now 161-168 and 185.
- `routes/messages.tsx` 21-44 is now 22-49.
- data/messages.ts: team name is now 52/100, role 91.
- seen-by `seenTitle` 110 is now `listTitle` 111.

The other line numbers in 02 still match.

## 3. New held migrations

None. Pin sync stays `pin-sync/20261031150000_golf_conversation_pins.sql`, with its HELD.md row in PIN-SYNC §11.

## 4. Product calls (I made each; each flips in one line)

- **Older messages:** not built (newest 200). Flip: `loadOlder()` as a third additive commit in `use-golf-messages.ts`.
- **Deleted placeholder in the thread:** deleted messages close in place, as today. Flip: change the read to include deleted rows.
- **Reaction pop:** plays when the saved row lands, as today. Flip: an optimistic overlay in Messages.tsx.

## 5. Shared-file text for the lead

- **Held list in START_HERE or BUILD_BRIEF:** "Messages: a poll can't be deleted on production until `20261028140800` is applied (CH-7008); apply it before Clubhouse polls are used."
- **COMPLETENESS, Ask handoff row, append:** "AK11c also lets `takePrefill` accept `conversationId` with no players, hashes the new fields in `keyOf`, and adds `seed` to `PollSheet`."
