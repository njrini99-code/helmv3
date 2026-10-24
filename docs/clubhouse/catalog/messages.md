# Messages catalog (7xxx)

<!-- clubhouse:release-audit:start -->
## Catalog audit — 2026-10-06

Conversation rail, phone thread, growing composer, reply and group dialogs.
Check reader-position preservation, Return/newline versus desktop Enter,
keyboard height, long messages and draft retention.

See [current all-page evidence](../ALL_PAGE_AUDIT.md#p007-messages). Existing
checklist ticks and catalog identifiers retain their recorded scope. Automated
browser checks do not replace physical keyboard, gesture or
assistive-technology acceptance.
<!-- clubhouse:release-audit:end -->

Route `/golf/dashboard/messages` (coach and player) · code
`src/clubhouse/screens/messages/`, loader `src/clubhouse/data/messages.ts` ·
tests `src/clubhouse/__tests__/messages.test.tsx` · preview
`/clubhouse-preview/messages`
(`?state=empty|rail|failed|thread-failed|loading|loading-route|announcement|ann-failed|files-failed|add-failed`)
and `/clubhouse-preview/messages-player`. Below 820px the same numbers hold on
the phone design (`MessagesPhone`, `docs/clubhouse/phone/messages.md`); CH-7018
to CH-7021, 7214, 7215, 7306, 7307, 7409, 7410, 7604, 7704 and 7804 were added
with it.

Messages keeps the live realtime hooks (D-13). Every change runs through one
helper (`attempt` in `Messages.tsx`) with the same rules as `useAction`:
offline, nothing is sent (CH-1903); slow, it says so once (CH-1902); a failure
is reported and toasted with its number. A plain message that fails stays in
the thread with Retry (CH-7016), and the draft is never lost.

## 70xx Error toasts

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-7001 | A link opens a player (`?player=`) or a person (`?user=`, a player's Message coach) who isn't on the team | "Couldn't open that conversation" + "That player isn't on your team, or hasn't set up their account yet." ("That person…" for `?user=`) | `Messages` deep link | messages.test › CH-7001 |
| CH-7002 | Starting a direct thread fails | "Couldn't start the conversation" + "Try again in a moment." | `attempt('startDirect')` | messages.test › CH-7002 |
| CH-7003 | Creating a group fails | "Couldn't create the group". Done: "Group created · Pinehurst travel" | `attempt('createGroup')` | messages.test › CH-7003 |
| CH-7004 | Sending a message throws | "Couldn't send the message" + "It is in the thread, marked Not sent. Retry from there." The box stays empty: the bubble (CH-7016) is the one copy (owner 2026-10-01) | `api.send` | messages.test › CH-7004 |
| CH-7005 | The network drops mid-send (Safari's "Load failed", Chrome's "Failed to fetch", Firefox's "NetworkError…": the same test the bubble's CH-7017 uses, so the toast and the bubble agree; the browser's text is never shown) | "Couldn't confirm this message sent" + "It is in the thread: check it, then Retry from there if it did not arrive." | `api.send`, `isTransientNetworkErrorMessage` | messages.test › CH-7005; messages-audit.test › A-06 |
| CH-7006 | Sending attachments fails | "Couldn't send the attachment" + "Your message and files are still in the box. Try again." | `attempt('sendFiles')` | messages.test › CH-7006 |
| CH-7007 | Editing a message fails | "Couldn't edit the message" + "Your edit is still in the box." Done: "Message edited" | `attempt('edit')` | messages.test › CH-7007 |
| CH-7008 | Deleting a message fails | "Couldn't delete the message" + "It's back in the thread." Done: "Message deleted" | `attempt('remove')`, then refetch | messages.test › CH-7008 |
| CH-7009 | A reaction doesn't save | "Couldn't save the reaction" | `attempt('react')` | messages.test › CH-7009 |
| CH-7010 | Leaving a group fails | "Couldn't leave the group". Done: "You left the group" | `attempt('leave')` | messages.test › CH-7010 |
| CH-7011 | Muting or unmuting fails | "Couldn't mute the conversation" / "Couldn't turn notifications back on". Done: "Conversation muted" | `attempt('mute')` | messages.test › CH-7011 |
| CH-7012 | Acknowledging an announcement fails | "Couldn't send your acknowledgement". Done: "Acknowledged · coach can see you read it" | `attempt('acknowledge')` | messages.test › CH-7012 |
| CH-7013 | Marking an announcement task done fails | "Couldn't mark the task done". Done: "Task marked done" | `attempt('completeTask')` | messages.test › CH-7013 |
| CH-7014 | Posting an announcement fails | "Couldn't post the announcement" + "Your text is still here." Done: "Posted to Varsity · Bus times" | `attempt('createAnnouncement')` | messages.test › CH-7014 |
| CH-7015 | An open conversation disappears (left, or another team's) | "That conversation isn't available" + "You may have left it, or it belongs to another team." | `MessagesView` | messages.test › CH-7015 |
| CH-7016 | A message is refused | In the thread under the bubble: "Not sent." + Retry and Discard; the bubble is marked | `Msg` (`m.failed`) | messages.test › CH-7016 |
| CH-7017 | A message's send can't be confirmed | In the thread: "Couldn't confirm this message sent. Check before sending again." + Retry | `Msg` | messages.test › CH-7017 |
| CH-7018 | Adding someone to a group fails (the group's creator, desktop or phone Details › Add) | "Couldn't add Nora" + "Try again in a moment." Done: "Added Nora to Varsity team" | `attempt('addMember')` | messages.test › CH-7018 |
| CH-7019 | A coach's new group is created, but a coach picked for it couldn't be added (D-45) | "Group created, but Dan wasn't added" + "Add them from Details." (warning haptic) | `createGroup` | messages.test › CH-7019 |
| CH-7020 | Copying a message fails (phone, from the long-press sheet) | "Couldn't copy the message" + "Try again in a moment." Done: "Copied" | `PhoneThread` | messages.test › CH-7020 |
| CH-7021 | A shared file won't open (Details › Files, or an announcement's Files) | "Couldn't open Room list · Pinehurst.pdf" + "Try again in a moment."; an announcement file with no stored copy: "That file has no stored copy to open." | `FilesPanel`, `FilesSection`, announcements `openDoc` | messages.test › CH-7021, wiring-p007-messages.test |
| CH-7022 | Text delivered, attachment metadata refused | "Message sent; attachments not saved". Only unsaved files and the original reply remain; retry sends no copy of delivered text | `sendFiles`, `Composer` | messages.test › CH-7022 |
| CH-7023 | Attachment send cannot be confirmed | Frozen original text/files/reply, "Couldn’t confirm this send", Retry send; reload restores stored filenames/request identity; queued later draft survives pending Retry and resumes after confirmation | `sendFiles`, `Composer` | messages.test › CH-7023 |
| CH-7024 | Removing someone from a group fails (the group's creator, desktop or phone Details › Remove) | "Couldn’t remove Eli" + the server's reason, or "They’re still in the group. Try again in a moment." The row comes back. Done: "Removed Eli from Varsity team" | `attempt('removeMember')` | wiring-p007-messages.test › a refusal puts the row back |
| CH-7025 | Deleting a conversation from your inbox fails | "Couldn’t delete the conversation" + "Try again in a moment." Done: "Conversation deleted" (it had shared mute's CH-7011) | `attempt('deleteConversation')` | messages.test › CH-7025 |
| CH-7026 | A vote on a poll isn't saved (tap a choice in a poll card) | "Your vote wasn’t saved" + "Try again in a moment." The card goes back to the votes the server holds | `attempt('vote')`, `useMessageResponses.vote` | use-message-responses.test › a refused vote goes back |
| CH-7027 | Closing a poll fails (the sender's Close poll, after the confirm) | "Couldn’t close the poll" + the server's reason. The confirm stays open and the poll stays open | `attempt('closePoll')`, `closeGolfPoll` | messages-polls.test › the sender closes it after a confirm |
| CH-7028 | Sending a poll fails (New poll › Send poll) | A refusal shows its reason under the form and keeps the draft; a send that throws also toasts "Couldn’t send the poll" + "Try again in a moment." A retry of the same draft reuses its id, so it can't post twice | `attempt('sendPoll')`, `sendGolfPoll` | messages-polls.test › a refused send keeps the draft |

## 71xx Validation

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-7101 | A file of the wrong type or size | "Can't attach setup.exe" + the reason from the upload rules ("File type not supported…"); nothing is sent | `validateFile` | messages.test › CH-7101 |
| CH-7102 | An announcement with no title | "Give the announcement a title." | `NewMessage` | messages.test › CH-7102 |
| CH-7103 | An announcement with no body | "Write what the team needs to know." | `NewMessage` | messages.test › CH-7103 |
| CH-7104 | A group with no name | "Name the group so players know what it's for." | `NewMessage` | messages.test › CH-7104 |
| CH-7105 | Nobody chosen, or a coach's group with no player | "Choose who to message." / "Choose at least one person." / "Choose at least one player. Coaches join the group once it exists." (a coach group of coaches only) | `NewMessage` | messages.test › CH-7105, wiring-p007-messages.test |
| CH-7106 | More than ten files picked for one message (desktop or phone composer, phone New message) | Ten are kept, and a toast: "Up to 10 files per message" + "1 file wasn’t added. Send these, then attach the rest." (warning haptic) | `useAddAttachments` | messages.test › #6 CH-7106 |

## 72xx Didn't load

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-7201 | Conversations don't load | "Conversations didn’t load" + "Your messages are safe…" Try again | `Rail` | messages.test › CH-7201 |
| CH-7202 | A conversation's messages don't load | "This conversation didn’t load" + "Nothing was lost…" Try again; the composer is off (read-only box, "Replies are off until this loads", Send and Attach disabled, one line under it) | `Thread`, `Composer` | messages.test › CH-7202 |
| CH-7203 | Message search doesn't load | "Message search didn’t load" + "Conversations above still match by name." Try again | `MessageHits` | messages.test › CH-7203 |
| CH-7204 | Group members don't load | "Members didn’t load" Try again | `Details` | messages.test › CH-7204 |
| CH-7205 | The team list doesn't load (New message) | "Your team list didn’t load" Try again | `NewMessage` | messages.test › CH-7205 |
| CH-7206 | Announcements don't load | "Announcements didn’t load" Try again | `Announcements` | messages.test › CH-7206 |
| CH-7207 | An announcement's replies, tasks and files don't load | "The details didn’t load" + "The announcement above is complete." Try again | `AnnouncementPane` | messages.test › CH-7207 |
| CH-7208 | The mute setting doesn't load | "The mute setting didn’t load" Try again | `Details` | messages.test › CH-7208 |
| CH-7209 | A message's attachments don't load | "Attachment didn’t load" + "Tap to try again" in place of the file tile | `Attachments` | messages.test › CH-7209 |
| CH-7210 | The conversation list crashes | "Your conversations couldn't be shown." + "The rest of the page is fine…" Try again | `SectionBoundary messages.rail` | messages.test › CH-7210 |
| CH-7211 | An announcement crashes | "This announcement couldn't be shown." … | `SectionBoundary messages.announcement` | messages.test › CH-7211 |
| CH-7212 | The thread crashes | "This conversation couldn't be shown." …; the rail stays | `SectionBoundary messages.thread` | messages.test › CH-7212 |
| CH-7213 | Details crash | "Details couldn't be shown." … | `SectionBoundary messages.details` | messages.test › CH-7213 |
| CH-7214 | The shared files don't load (Details) | "Files didn’t load" + "Your messages are safe…" Try again | `FilesPanel`, `FilesSection` | messages.test › CH-7214 |
| CH-7215 | The Add sheet's team list doesn't load | "The team list didn’t load" Try again | `AddMembersModal` | messages.test › CH-7215 |
| CH-7216 | A conversation's messages don't refresh while an earlier copy is shown | The messages stay; above them "This conversation may be out of date" + "It didn’t refresh…" Try again | `Thread`, `PhoneThread` | messages.test › CH-7216 |
| CH-7217 | Pending attachment recovery cannot be checked | "Couldn’t check a pending send" + "Try again before sending another message." Try again; ordinary Send stays locked | `Composer` | messages.test › CH-7217 |

## 73xx Empty

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-7301 | No conversations yet | "No conversations yet" + (coach) "Start one with a player, or create a team group." | `Rail` | messages.test › CH-7301 |
| CH-7302 | A rail search or a filter has nothing | Search: "No conversation names match" + Clear search (message hits may follow below); Groups: "No group conversations yet"; Unread: "Nothing unread" + "You’re caught up." + Show all | `Rail`, `PhoneInbox` (`RailEmpty`) | messages.test › CH-7302, #12 |
| CH-7303 | No message mentions the search | "No messages mention “bus”" (the shared filtered state) | `MessageHits` | messages.test › CH-7303 |
| CH-7304 | A thread with no messages | "No messages yet" + "Say hello to the group." (or the person’s first name) | `Thread` | messages.test › CH-7304 |
| CH-7305 | Nothing open | "Start your first conversation" / "Pick a conversation" | `MessagesView` | messages.test › CH-7305 |
| CH-7306 | Nothing has been shared in the conversation (Details) | "No files shared yet." | `FilesPanel`, `FilesSection` | messages.test › CH-7306 |
| CH-7307 | Everyone on the team is already in the group (Add) | "Everyone on the team is already in this group." | `AddMembersModal` | messages.test › CH-7307 |
| CH-7308 | Signed in with no team (coach or player) | The page empty state: "You aren’t on a team yet" + "Messages open once you’re on a team roster, with your coaches and teammates." + Open team settings (a coach's Team, a player's Golf profile; the route passes the role) | `MessagesNoTeam`, from the route | messages.test › CH-7308 |
| CH-7309 | Nothing at all yet: no conversation and no announcement (D-71) | The page empty state: "No conversations yet" + (coach) "Start a thread with the whole team or message a player directly." / (player) "Message a coach or a teammate. Team announcements show up here too." + New message; the rail and thread empties (CH-7301, CH-7305) show only once something is listed | `MessagesFirstRun` (desktop and phone) | messages.test › CH-7309 |

## 74xx Loading

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-7401 | Messages is loading | Rail and thread as skeletons | `MessagesSkeleton` | messages.test › CH-7401 |
| CH-7402 | Conversations are loading | Five skeleton rows in the rail | `Rail` | messages.test › CH-7402 |
| CH-7403 | A thread is loading | Skeleton bubbles, both sides | `Thread` | messages.test › CH-7403 |
| CH-7404 | Message search is running | A skeleton result row | `MessageHits` | messages.test › CH-7404 |
| CH-7405 | Members are loading | Three skeleton rows | `Details` | messages.test › CH-7405 |
| CH-7406 | An announcement's details are loading | Skeletons where replies and tasks go | `AnnouncementPane` | messages.test › CH-7406 |
| CH-7407 | The mute setting is loading | A skeleton row | `Details` | messages.test › CH-7407 |
| CH-7408 | A message's attachments are loading | A skeleton file tile | `Attachments` | messages.test › CH-7408 |
| CH-7409 | The shared files are loading (Details) | A skeleton row | `FilesPanel`, `FilesSection` | messages.test › CH-7409 |
| CH-7410 | The Add sheet's list is loading | Three skeleton rows | `AddMembersModal` | messages.test › CH-7410 |

## 75xx Confirm

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-7501 | Delete a message | "Delete this message?" + "It's removed for everyone in the conversation. This can't be undone." + the message quoted, clamped to three lines ("Attachment" for a file alone). Keep it / Delete message | `Modal` | messages.test › CH-7501, #14 |
| CH-7502 | Leave a group | "Leave Varsity team?" + "You stop getting its messages. Someone in the group can add you back." | `Modal` | messages.test › CH-7502 |
| CH-7503 | Delete a conversation | "Delete 26-27 Group Chat?" + "It leaves your inbox. The other people keep their copy, and it comes back if someone sends a new message." Keep conversation / Delete conversation | `Modal` | messages.test › CH-7503, #19; hide-golf-conversation.test |
| CH-7504 | Remove a member (the group's creator, never their own row) | "Remove Eli from Varsity team?" + "Eli stops getting its messages. You can add them back from Add." Keep Eli / Remove (warning haptic) | `Modal` (`RemoveMemberModal`) | wiring-p007-messages.test › asks first |

## 76xx Motion

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-7601 | A message arrives or is sent | It appears in place, no count-up or stagger; the thread keeps its scroll unless you're at the bottom. Scrolled up, "N new messages" (or, with nothing new, "Jump to latest") takes you down; a thread opened with something unread marks its first unread message with a "New" divider that stays put | `Thread`, `PhoneThread` (`ThreadBelow`, `useNewDivider`) | messages.test › #17; thread-anchor.test; preview |
| CH-7602 | Someone is typing | Three dots pulse under the last message | `.ch-ms-typing` | preview |
| CH-7603 | Opening details or a reaction bar | It opens from its button (180ms); the reaction bar rises from the bubble's edge and leaves the same way. A fade alone with reduced motion | `CH_POP`; `Bubble` reaction bar (`AnimatePresence`, `chTween('quick')`) | preview |
| CH-7604 | A long press on a message (phone) | The message sheet rises (260ms), retaining selected text, whose it is and its actual timestamp ("Jonah · 2:05 PM", "You · …"): six reactions, Reply, Copy, and Edit and Delete on your own. Screens push and pop as the shell's CH-1610 | `PhoneThread`, `Modal` | messages.test › CH-7804 (the sheet and its actions); preview (the rise) |
| CH-7605 | Opening another conversation or announcement (desktop) | The new one settles in with a 6px rise (260ms) while the last fades out (180ms), hidden from assistive tech; each keeps its own scroll and a thread opens at its end. The first one a visit opens (the newest thread, or a link's) appears at once. Instant with reduced motion | `Swap` keyed on the pane's turn in `MessagesDesktop` | messages.test › CH-7605; preview (the timing) |
| CH-7606 | Changing the inbox filter on the phone (All, Unread, Groups) | The chosen chip takes the green fill and ink (a layer that fades in over the quick beat) while the last one lets go; the list under it settles in with a 6px rise (260ms) as the last fades out (180ms), hidden from assistive tech. Typing in Search filters in place. Instant with reduced motion | `.ch-msp-chip` transitions; `Swap` keyed on the filter in `PhoneInbox` | preview (the timing, WebKit 390) |

## 77xx Haptics

| # | When | They feel | How | Test |
| --- | --- | --- | --- | --- |
| CH-7701 | A change fails | The OS error pattern | `fail()` | messages.test › CH-7701 |
| CH-7702 | A change lands (edited, deleted, muted, group created; acknowledging uses the success pattern) | The OS success pattern (D-70) | `haptic('commit')` | preview |
| CH-7703 | Picking a reaction, a filter or a conversation | A selection tick | `haptic('select')` | preview |
| CH-7704 | A long press on a message (phone) | A light tap as the sheet opens | `useLongPress` → `haptic('press')` | messages.test › CH-7704 |

## 78xx Accessibility

| # | What | How | Test |
| --- | --- | --- | --- |
| CH-7801 | The composer is named for the conversation ("Message Varsity team"); a message that didn't send is an alert | `aria-label`, `role="alert"` | messages.test › CH-7801 |
| CH-7802 | Search results are announced as they arrive; desktop Enter sends and Shift+Enter adds a line; phone Return adds a line and Send sends. Desktop React: the reaction bar takes focus on its first reaction, ← → Home End move along it, Esc or a pick returns focus to React, Tab moves on | `aria-live`, key handlers | messages-audit.test › A-26; preview |
| CH-7803 | No axe violations in any preview state, 1280px and 390px | `npm run clubhouse:a11y` | a11y scan |
| CH-7804 | Phone: a message's actions have a path besides the long press (a "Message actions" button VoiceOver and keyboards reach, or a right click); each pushed screen is named by its title, and its back link names where it goes ("Back to Messages", "Back to Chat"). New message opens on its title; a hardware keyboard's Esc is Cancel, and focus returns to New message | `Bubble` `onActions`, `PhoneScreen`, `PhoneBar` | messages.test › CH-7804; messages-audit.test › A-28 |
