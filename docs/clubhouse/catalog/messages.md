# Messages catalog (7xxx)

Route `/golf/dashboard/messages` (coach and player) · code `src/clubhouse/screens/messages/`, loader
`src/clubhouse/data/messages.ts` · tests `src/clubhouse/__tests__/messages.test.tsx` · preview
`/clubhouse-preview/messages` (`?state=empty|rail|failed|thread-failed|loading|loading-route|announcement|ann-failed|files-failed|add-failed`) and
`/clubhouse-preview/messages-player`. Below 820px the same numbers hold on the phone
design (`MessagesPhone`, `docs/clubhouse/phone/messages.md`); CH-7018 to CH-7021,
7214, 7215, 7306, 7307, 7409, 7410, 7604, 7704 and 7804 were added with it.

Messages keeps the live realtime hooks (D-13). Every change runs through one
helper (`attempt` in `Messages.tsx`) with the same rules as `useAction`:
offline, nothing is sent (CH-1903); slow, it says so once (CH-1902); a failure
is reported and toasted with its number. A plain message that fails stays in
the thread with Retry (CH-7016), and the draft is never lost.

## 70xx Error toasts

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-7001 | A link opens a player who isn't on the team | "Couldn't open that conversation" + "That player isn't on your team, or hasn't set up their account yet." | `Messages` deep link | messages.test › CH-7001 |
| CH-7002 | Starting a direct thread fails | "Couldn't start the conversation" + "Try again in a moment." | `attempt('startDirect')` | messages.test › CH-7002 |
| CH-7003 | Creating a group fails | "Couldn't create the group". Done: "Group created · Pinehurst travel" | `attempt('createGroup')` | messages.test › CH-7003 |
| CH-7004 | Sending a message throws | "Couldn't send the message" + "Your message is still in the box. Try again." | `api.send` | messages.test › CH-7004 |
| CH-7005 | The network drops mid-send | "Couldn't confirm this message sent" + "Check the thread before sending again." | `api.send` | messages.test › CH-7005 |
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
| CH-7017 | A message's send can't be confirmed | In the thread: "Couldn't confirm this sent. Check before sending again." + Retry | `Msg` | messages.test › CH-7017 |
| CH-7018 | Adding someone to a group fails (the group's creator, desktop or phone Details › Add) | "Couldn't add Nora" + "Try again in a moment." Done: "Added Nora to Varsity team" | `attempt('addMember')` | messages.test › CH-7018 |
| CH-7019 | A coach's new group is created, but a coach picked for it couldn't be added (D-45) | "Group created, but Dan wasn't added" + "Add them from Details." (warning haptic) | `createGroup` | messages.test › CH-7019 |
| CH-7020 | Copying a message fails (phone, from the long-press sheet) | "Couldn't copy the message" + "Try again in a moment." Done: "Copied" | `PhoneThread` | messages.test › CH-7020 |
| CH-7021 | A shared file won't open (phone Details › Files) | "Couldn't open Room list · Pinehurst.pdf" + "Try again in a moment." | `FilesPanel` | messages.test › CH-7021 |

## 71xx Validation

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-7101 | A file of the wrong type or size | "Can't attach setup.exe" + the reason from the upload rules ("File type not supported…"); nothing is sent | `validateFile` | messages.test › CH-7101 |
| CH-7102 | An announcement with no title | "Give the announcement a title." | `NewMessage` | messages.test › CH-7102 |
| CH-7103 | An announcement with no body | "Write what the team needs to know." | `NewMessage` | messages.test › CH-7103 |
| CH-7104 | A group with no name | "Name the group so players know what it's for." | `NewMessage` | messages.test › CH-7104 |
| CH-7105 | Nobody chosen | "Choose who to message." / "Choose at least one person." | `NewMessage` | messages.test › CH-7105 |

## 72xx Didn't load

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-7201 | Conversations don't load | "Conversations didn't load." + "Your messages are safe…" Try again | `Rail` | messages.test › CH-7201 |
| CH-7202 | A conversation's messages don't load | "This conversation didn't load." + "Nothing was lost…" Try again | `Thread` | messages.test › CH-7202 |
| CH-7203 | Message search doesn't load | "Message search didn't load." + "Conversations above still match by name." Try again | `MessageHits` | messages.test › CH-7203 |
| CH-7204 | Group members don't load | "Members didn't load." Try again | `Details` | messages.test › CH-7204 |
| CH-7205 | The team list doesn't load (New message) | "Your team list didn't load." Try again | `NewMessage` | messages.test › CH-7205 |
| CH-7206 | Announcements don't load | "Announcements didn't load." Try again | `Announcements` | messages.test › CH-7206 |
| CH-7207 | An announcement's replies, tasks and files don't load | "The details didn't load." + "The announcement above is complete." Try again | `AnnouncementPane` | messages.test › CH-7207 |
| CH-7208 | The mute setting doesn't load | "The mute setting didn't load." Try again | `Details` | messages.test › CH-7208 |
| CH-7209 | A message's attachments don't load | "Attachment didn't load" + "Tap to try again" in place of the file tile | `Attachments` | messages.test › CH-7209 |
| CH-7210 | The conversation list crashes | "Your conversations couldn't be shown." + "The rest of the page is fine…" Try again | `SectionBoundary messages.rail` | messages.test › CH-7210 |
| CH-7211 | An announcement crashes | "This announcement couldn't be shown." … | `SectionBoundary messages.announcement` | messages.test › CH-7211 |
| CH-7212 | The thread crashes | "This conversation couldn't be shown." …; the rail stays | `SectionBoundary messages.thread` | messages.test › CH-7212 |
| CH-7213 | Details crash | "Details couldn't be shown." … | `SectionBoundary messages.details` | messages.test › CH-7213 |
| CH-7214 | The shared files don't load (phone Details) | "Files didn't load." + "Your messages are fine…" Try again | `FilesPanel` | messages.test › CH-7214 |
| CH-7215 | The Add sheet's team list doesn't load | "The team list didn't load." Try again | `AddMembersModal` | messages.test › CH-7215 |

## 73xx Empty

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-7301 | No conversations yet | "No conversations yet." + (coach) "Start one with a player, or create a team group." | `Rail` | messages.test › CH-7301 |
| CH-7302 | A rail search or the Unread filter has nothing | "No conversation matches "zzz"." / "Nothing unread. You're caught up." | `Rail` | messages.test › CH-7302 |
| CH-7303 | No message mentions the search | "No messages mention "bus"." | `MessageHits` | messages.test › CH-7303 |
| CH-7304 | A thread with no messages | "No messages yet. Say hello to the group." (or the person's first name) | `Thread` | messages.test › CH-7304 |
| CH-7305 | Nothing open | "Start your first conversation." / "Pick a conversation." | `MessagesView` | messages.test › CH-7305 |
| CH-7306 | Nothing has been shared in the conversation (phone Details) | "No files shared yet." | `FilesPanel` | messages.test › CH-7306 |
| CH-7307 | Everyone on the team is already in the group (Add) | "Everyone on the team is already in this group." | `AddMembersModal` | messages.test › CH-7307 |

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
| CH-7409 | The shared files are loading (phone Details) | A skeleton row | `FilesPanel` | messages.test › CH-7409 |
| CH-7410 | The Add sheet's list is loading | Three skeleton rows | `AddMembersModal` | messages.test › CH-7410 |

## 75xx Confirm

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-7501 | Delete a message | "Delete this message?" + "It's removed for everyone in the conversation. This can't be undone." | `Modal` | messages.test › CH-7501 |
| CH-7502 | Leave a group | "Leave Varsity team?" + "You stop getting its messages. Someone in the group can add you back." | `Modal` | messages.test › CH-7502 |

## 76xx Motion

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-7601 | A message arrives or is sent | It appears in place, no count-up or stagger; the thread keeps its scroll unless you're at the bottom | `Thread` | preview |
| CH-7602 | Someone is typing | Three dots pulse under the last message | `.ch-ms-typing` | preview |
| CH-7603 | Opening details or a reaction bar | It opens from its button (180ms) | `CH_POP` | preview |
| CH-7604 | A long press on a message (phone) | The message sheet rises (260ms): the six reactions, Copy, and Edit and Delete on your own. Screens push and pop as the shell's CH-1610 | `PhoneThread`, `Modal` | messages.test › CH-7804 (the sheet and its actions); preview (the rise) |

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
| CH-7802 | Search results are announced as they arrive; Enter sends, Shift+Enter adds a line | `aria-live`, key handler | preview |
| CH-7803 | No axe violations in any preview state, 1280px and 390px | `npm run clubhouse:a11y` | a11y scan |
| CH-7804 | Phone: a message's actions have a path besides the long press (a "Message actions" button VoiceOver and keyboards reach, or a right click); each pushed screen is named by its title, and its back link names where it goes ("Back to Messages", "Back to Chat") | `Bubble` `onActions`, `PhoneScreen`, `PhoneBar` | messages.test › CH-7804 |
