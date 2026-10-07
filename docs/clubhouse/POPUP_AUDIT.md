# Clubhouse popup audit — 2026-10-06

Targets the current Clubhouse implementation on PR #2155, starting from
43a146a. It follows the owner's request to inspect every popup and correct
formatting, sizing and responsiveness. It changes no production flags, writes,
approved layout structure, motion tokens or dismissal policy. The owner’s
subsequent depth review explicitly rejects the earlier broad stacked shadows;
the shared depth scale is reduced as recorded in [DEPTH_AUDIT](DEPTH_AUDIT.md).

## Source coverage

The source review includes **117 modal, sheet, menu, drawer and pushed-screen
call sites across 59 files**. This counts primitive wrappers as well as their
callers; it is not a claim of 117 unique customer-visible popups. Preview
fixtures and tests are excluded. Titles, descriptions, widths, footer layouts,
keyboard-aware screens and nested/busy/dirty dismissal paths were inspected.
The individual owners below remain responsible for their forms and actions;
shared primitives own placement, overflow, focus and animation lifetime.

Knowledge mapping resolves Settings, Recruiting and Qualifier changes to their
feature docs. Shared Clubhouse primitives/styles, Calendar, Home and Ask's
composer have no business-feature match in that registry; their contracts and
verification are maintained in the existing Clubhouse page docs instead.

Additional custom surfaces: Shell's desktop/phone notification panels, More
sheet and desktop team listbox; Calendar's date-jump and people popovers;
Messages' reaction menu and recipient suggestion lists; CoachHelm's inline
player mentions. Inline listboxes are part of their parent form, not separate
modal dialogs. Toasts are status/alert announcements with the existing native
dialog portal owner. HTML select, date/time and file controls use browser/OS
pickers and need physical-device acceptance; a code scan cannot audit the OS
picker's rendering.

## Reproduced defects and repairs

| Finding | Before | Repair |
| --- | --- | --- |
| Nested menu below native top layer | Calendar event menu existed but elementFromPoint could not hit it | Portal to the trigger's open native dialog; keep keyboard/pointer access inside that layer |
| Tall menu overflow | Menu placement flipped upward without limiting its height | Choose available side, bound height, scroll internally, retain icons and reserve native keyboard/visual viewport space |
| Menu closed after tapping from a text field | WebKit horizontally scrolled the field on blur and the document scroll handler dismissed the menu | Ignore native field text scroll events; surrounding page/container scroll still dismisses |
| Delayed focus after dismissal | Initial menu focus callback outlived its open effect | Cancel scheduled frame; initial focus does not scroll the background |
| Missing accessible description | Modal and Recruiting deletion message were visually present but not linked | Unique aria-describedby IDs on descriptions; title IDs remain distinct |
| Narrow sheet title overflow | Settings and Recruiting form/list/picker titles overflowed 320/390px panels | Bounded middle grid track, wrapping title/notes and fixed action space |
| Long action sheet outside screen | 320×400 panels extended upward to y=−857/−795 | Available-height scrolling with action rows that retain their full height |
| Calendar custom popovers below short screens | Date-jump/people panels ended at y=416/694 at 1280×400 | Choose available anchor side, clamp horizontally and scroll; both now end at y=392 |
| Team list not bounded | Sidebar list had no available-height bound | Clamp width and available height; internal scrolling, covered by a regression |
| Loading labels on generic containers | Course/tee loading divs failed aria-prohibited-attr | Status semantics for loading regions in Setup and Qualifier course pickers |
| Excessive card depth | Simple form rows used four shadow layers, including broad 44px ambient shade | Quiet shared reading/control depth, no drop shadow on Settings form groups; menus/sheets keep stronger separation |
| Scrolling menu had no Tab entry | Short-screen Ask menu failed scrollable-region-focusable | First actionable menu row enters the Tab order; arrow/Home/End behavior retained |
| Nested player options | Desktop Ask roster options contained interactive buttons | Clickable row owns option semantics; composing field identifies its active option |
| Green box on reading titles | Global focus selector overrode heading/button styles | Noninteractive focused headings have no control outline; rounded button focus remains; Settings forms/lists focus their title |
| Long modal description hid controls | Footer buttons reached y=1551 in a 400px viewport | Header may shrink and scroll; body remains independently scrollable and footer stays reachable |

All prior motion repairs remain: normal shared tokens, zero duration with OS
reduced motion/Animations off, retained content and scroll locks through exits,
and one-frame streaming follow-scroll. These formatting repairs do not add new
animation sequences, polling, data requests or expensive per-frame measurement.
Menu placement observes resize and keyboard-class/style changes only while open.

## Repeatable diagnostics

Run the local development server and open
/clubhouse-preview/popup-lab. The route returns notFound in production.
It exercises the actual Modal, Settings Form/List/Picker/Action sheets and
Recruiting Form/Picker/Action sheets. Long content supplies an unbroken imported
name, 24 fields/choices and 20 menu items. Every action stays local to this
fixture; no profile, recruit or preference is written.

Stress runs use Playwright WebKit at 320×568, 390×667, 768×600 and 1280×720.
Before repairs, **17 of 25 applicable primitive/viewport cases** overflowed or
clipped text. The repaired run passes all 25. Custom phone sheets are not tested
as desktop controls because desktop uses Modal instead.

At 320×400, injected 2,450-character descriptions reproduce the two action-sheet
height defects and the modal header defect. After correction, panels fit and
content/actions can be reached by scrolling. Native keyboard layout is emulated
with the existing keyboard-open/--keyboard-height contract: five nested-menu
families at 390×667 reserve 300px, keep the last form field above the keyboard,
permit End to reach the last action, and Escape closes the menu while preserving
its parent dialog. This is layout emulation, not an iPhone keyboard test.

Focused regressions cover native-layer menu containment, Modal/Recruiting
accessible descriptions, tall-menu placement and keyboard space. Existing
dialog lifetime tests cover retained content, focus restoration, scroll locks,
rapid reopen and zero-duration preference changes.

## Runtime evidence and remaining acceptance

Browser evidence below is collected from local synthetic fixtures with API and
external network requests blocked. It validates rendering and local interaction;
it does not prove durable server writes or physical Safari/iPhone behavior.
Before/after screenshots are filed in the local screenshot store and logged in
Shell, Home, Calendar, Settings and Recruiting VERIFY records. See
[all-page evidence](ALL_PAGE_AUDIT.md) for the earlier 305 accessibility/state
cases and [motion evidence](SMOOTHNESS_AUDIT.md) for measured transition timings.

<!-- popup-runtime:start -->
- Discovery recorded 178 overlay observations across phone and desktop routes.
  Repeated people, objects and parent overlays are included in that count.
- Replayed 150 distinct popup/page/viewport cases at 390/1280×667 with Chromium
  and Axe WCAG 2/2.1/2.2 AA. Final results have no detected violations or
  overflowing/out-of-viewport panels. Two harness timing gaps and the Setup
  loading-region violation were retried after diagnosis and correction.
- WebKit stress: all 25 shared-primitive viewport cases pass; three 320×400
  long-description cases retain reachable, pointer-hit actions. Five emulated
  keyboard/nested-menu families retain their parent on Escape and reach Action 20.
- Targeted WebKit checks cover notification/More panels, recovery/practice,
  recruiting deletion/upload and Ask menu/date/player pickers (five targeted cases, no detected violations). Calendar's two
  custom 1280×400 popovers fit with no scoped Axe violations. The final full-page checks pass both
  open-popover and closed states at 1280×400. The earlier three background
  target-size warnings disappeared after placement was repaired. A hover-state
  contrast failure on the calendar year was reproduced and fixed with the
  existing secondary text token.
- Authenticated multi-team switching is covered by source and unit tests;
  the preview has no multi-team runtime fixture. Native OS pickers, every
  persistence/error permutation and physical-device behavior are not certified.
<!-- popup-runtime:end -->

Physical Safari and iPhone keyboard, Dynamic Type/zoom, VoiceOver, gestures,
OS pickers and authenticated persistence remain release acceptance. No manual
contract gate is marked accepted by source review or browser emulation alone.

## CI checkout repair

The PR’s cancelled detector spent its five-minute limit fetching all branches
and tags before classification. A two-deep PR merge checkout retains both
base/head trees; the local Git fixture confirms its diff matches full history.
The detector timeout and fail-closed required checks are preserved. See
[CI runbook](../CI_RUNBOOK.md).

## Final local verification

- 3,133 tests pass across 120 files, including all Clubhouse tests and mapped
  settings-notification/qualifier tests. Full TypeScript and scoped ESLint pass. The shallow-checkout Git regression also passes.
- Production Next build passes in the isolated source snapshot (exit 0), with
  local dummy service configuration and external telemetry credentials blanked.
  Preview servers were stopped first. No production app or flags were changed.
- Clubhouse check passes (67 tooling tests); screenshot convention check passes
  with 56 filed captures. Additional exploratory scratch captures remain local.
  Generated inventories, knowledge ownership, path/schema drift and markdown
  ratchet pass. The markdown baseline is unchanged.
- Six authenticated qualifier E2E tests are skipped without seeded auth, not
  counted as passing. Physical-device and owner acceptance remain open above.

## Complete source call-site inventory

Six authenticated qualifier E2E cases were invoked but skipped because this
checkout has no seeded golf auth; no persistence verification is claimed.

Every row is source-reviewed. Runtime observations are reported separately;
sharing a primitive is not equivalent to opening every content/error/save state.
Lines identify the audited source snapshot and can shift as implementation evolves.

| Family | Owner | Primitive | Source |
| --- | --- | --- | --- |
| calendar | Calendar | Modal | [Calendar.tsx](../../src/clubhouse/screens/calendar/Calendar.tsx), line 461 |
| calendar | Calendar | Menu | [Calendar.tsx](../../src/clubhouse/screens/calendar/Calendar.tsx), line 510 |
| calendar | EventEditor | Modal | [editor.tsx](../../src/clubhouse/screens/calendar/editor.tsx), line 449 |
| calendar | EventEditor | Modal | [editor.tsx](../../src/clubhouse/screens/calendar/editor.tsx), line 667 |
| calendar | CancelEvent | Modal | [editor.tsx](../../src/clubhouse/screens/calendar/editor.tsx), line 711 |
| calendar | SubscribeSheet | Modal | [editor.tsx](../../src/clubhouse/screens/calendar/editor.tsx), line 891 |
| calendar | BusyDetail | Modal | [extras.tsx](../../src/clubhouse/screens/calendar/extras.tsx), line 101 |
| calendar | BusySheet | Modal | [extras.tsx](../../src/clubhouse/screens/calendar/extras.tsx), line 166 |
| calendar | FilePicker | Modal | [extras.tsx](../../src/clubhouse/screens/calendar/extras.tsx), line 441 |
| calendar | EventDetail | Menu | [inspector.tsx](../../src/clubhouse/screens/calendar/inspector.tsx), line 397 |
| classes | ClassDetail | Modal | [ClassDetail.tsx](../../src/clubhouse/screens/classes/ClassDetail.tsx), line 72 |
| classes | ClassForm | Modal | [ClassForm.tsx](../../src/clubhouse/screens/classes/ClassForm.tsx), line 133 |
| classes | ClassForm | Modal | [ClassForm.tsx](../../src/clubhouse/screens/classes/ClassForm.tsx), line 313 |
| classes | ClassesView | Modal | [ClassesView.tsx](../../src/clubhouse/screens/classes/ClassesView.tsx), line 438 |
| classes | ClassesView | Modal | [ClassesView.tsx](../../src/clubhouse/screens/classes/ClassesView.tsx), line 463 |
| classes | ImportSchedule | Modal | [ImportSchedule.tsx](../../src/clubhouse/screens/classes/ImportSchedule.tsx), line 163 |
| coachhelm | AskChat | Modal | [Ask.tsx](../../src/clubhouse/screens/coachhelm/chat/Ask.tsx), line 322 |
| coachhelm | AskComposer | Menu | [Composer.tsx](../../src/clubhouse/screens/coachhelm/chat/Composer.tsx), line 202 |
| coachhelm | AskComposer | Menu | [Composer.tsx](../../src/clubhouse/screens/coachhelm/chat/Composer.tsx), line 267 |
| coachhelm | AskComposer | Modal | [Composer.tsx](../../src/clubhouse/screens/coachhelm/chat/Composer.tsx), line 323 |
| coachhelm | AskEvidencePanel | Modal | [EvidencePanel.tsx](../../src/clubhouse/screens/coachhelm/chat/EvidencePanel.tsx), line 40 |
| coachhelm | HistoryDrawer | dialog | [History.tsx](../../src/clubhouse/screens/coachhelm/chat/History.tsx), line 143 |
| coachhelm | DeepDive | PhoneScreen | [DeepDive.tsx](../../src/clubhouse/screens/coachhelm/views/DeepDive.tsx), line 502 |
| home | RoundSheet | Modal | [HomePhone.tsx](../../src/clubhouse/screens/home/HomePhone.tsx), line 437 |
| hub | Announcement | Menu | [parts.tsx](../../src/clubhouse/screens/hub/parts.tsx), line 200 |
| hub | TripPass | Menu | [parts.tsx](../../src/clubhouse/screens/hub/parts.tsx), line 267 |
| hub | TaskRow | Menu | [parts.tsx](../../src/clubhouse/screens/hub/parts.tsx), line 471 |
| hub | inline | Menu | [parts.tsx](../../src/clubhouse/screens/hub/parts.tsx), line 583 |
| hub | ComposeSheet | Modal | [sheets.tsx](../../src/clubhouse/screens/hub/sheets.tsx), line 298 |
| hub | TripSheet | Modal | [sheets.tsx](../../src/clubhouse/screens/hub/sheets.tsx), line 533 |
| hub | AssignSheet | Modal | [sheets.tsx](../../src/clubhouse/screens/hub/sheets.tsx), line 752 |
| hub | ConfirmDelete | Modal | [sheets.tsx](../../src/clubhouse/screens/hub/sheets.tsx), line 820 |
| hub | TripEditSheet | Modal | [trip-edit.tsx](../../src/clubhouse/screens/hub/trip-edit.tsx), line 103 |
| messages | MessagesPhone | PhoneScreen | [MessagesPhone.tsx](../../src/clubhouse/screens/messages/MessagesPhone.tsx), line 163 |
| messages | PhoneThread | PhoneScreen | [MessagesPhone.tsx](../../src/clubhouse/screens/messages/MessagesPhone.tsx), line 366 |
| messages | PhoneThread | Modal | [MessagesPhone.tsx](../../src/clubhouse/screens/messages/MessagesPhone.tsx), line 471 |
| messages | PhoneDetails | PhoneScreen | [MessagesPhone.tsx](../../src/clubhouse/screens/messages/MessagesPhone.tsx), line 574 |
| messages | PhoneNewMessage | PhoneScreen | [MessagesPhone.tsx](../../src/clubhouse/screens/messages/MessagesPhone.tsx), line 810 |
| messages | PhoneAnnouncementForm | PhoneScreen | [MessagesPhone.tsx](../../src/clubhouse/screens/messages/MessagesPhone.tsx), line 986 |
| messages | Bubble | Menu | [MessagesView.tsx](../../src/clubhouse/screens/messages/MessagesView.tsx), line 726 |
| messages | EditMessageModal | Modal | [MessagesView.tsx](../../src/clubhouse/screens/messages/MessagesView.tsx), line 1385 |
| messages | DeleteMessageModal | Modal | [MessagesView.tsx](../../src/clubhouse/screens/messages/MessagesView.tsx), line 1427 |
| messages | LeaveGroupModal | Modal | [MessagesView.tsx](../../src/clubhouse/screens/messages/MessagesView.tsx), line 1463 |
| messages | AddMembersModal | Modal | [MessagesView.tsx](../../src/clubhouse/screens/messages/MessagesView.tsx), line 1524 |
| messages | NewMessage | Modal | [MessagesView.tsx](../../src/clubhouse/screens/messages/MessagesView.tsx), line 1910 |
| qualifiers | CoursePicker | Modal | [CoursePicker.tsx](../../src/clubhouse/screens/qualifiers/CoursePicker.tsx), line 108 |
| qualifiers | QualifierDetail | Modal | [QualifierDetail.tsx](../../src/clubhouse/screens/qualifiers/QualifierDetail.tsx), line 114 |
| qualifiers | QualifierDetailPhone | Modal | [QualifierDetailPhone.tsx](../../src/clubhouse/screens/qualifiers/QualifierDetailPhone.tsx), line 149 |
| qualifiers | PlayerRounds | Modal | [QualifierDetailPhone.tsx](../../src/clubhouse/screens/qualifiers/QualifierDetailPhone.tsx), line 344 |
| qualifiers | QualifierForm | Modal | [QualifierForm.tsx](../../src/clubhouse/screens/qualifiers/QualifierForm.tsx), line 471 |
| qualifiers | QualifierSelection | Modal | [QualifierSelection.tsx](../../src/clubhouse/screens/qualifiers/QualifierSelection.tsx), line 387 |
| qualifiers | QualifierSelection | Modal | [QualifierSelection.tsx](../../src/clubhouse/screens/qualifiers/QualifierSelection.tsx), line 411 |
| qualifiers | QualifierSelection | Modal | [QualifierSelection.tsx](../../src/clubhouse/screens/qualifiers/QualifierSelection.tsx), line 435 |
| qualifiers | PickDialog | Modal | [QualifierSelection.tsx](../../src/clubhouse/screens/qualifiers/QualifierSelection.tsx), line 593 |
| recruiting | Documents | Modal | [Documents.tsx](../../src/clubhouse/screens/recruiting/Documents.tsx), line 321 |
| recruiting | UploadDialog | Modal | [Documents.tsx](../../src/clubhouse/screens/recruiting/Documents.tsx), line 373 |
| recruiting | ProspectForm | RecFormSheet | [ProspectForm.tsx](../../src/clubhouse/screens/recruiting/ProspectForm.tsx), line 153 |
| recruiting | ProspectForm | Modal | [ProspectForm.tsx](../../src/clubhouse/screens/recruiting/ProspectForm.tsx), line 159 |
| recruiting | RecFormSheet | dialog | [RecSheet.tsx](../../src/clubhouse/screens/recruiting/RecSheet.tsx), line 67 |
| recruiting | RecPickSheet | dialog | [RecSheet.tsx](../../src/clubhouse/screens/recruiting/RecSheet.tsx), line 115 |
| recruiting | RecActionSheet | dialog | [RecSheet.tsx](../../src/clubhouse/screens/recruiting/RecSheet.tsx), line 162 |
| recruiting | RecruitingPhone | Menu | [RecruitingPhone.tsx](../../src/clubhouse/screens/recruiting/RecruitingPhone.tsx), line 80 |
| recruiting | RecruitingPhone | PhoneScreen | [RecruitingPhone.tsx](../../src/clubhouse/screens/recruiting/RecruitingPhone.tsx), line 116 |
| recruiting | StageSheet | RecPickSheet | [RecruitingPhone.tsx](../../src/clubhouse/screens/recruiting/RecruitingPhone.tsx), line 197 |
| recruiting | RecruitingView | RecActionSheet | [RecruitingView.tsx](../../src/clubhouse/screens/recruiting/RecruitingView.tsx), line 309 |
| recruiting | RecruitingView | Modal | [RecruitingView.tsx](../../src/clubhouse/screens/recruiting/RecruitingView.tsx), line 320 |
| roster | Roster | Modal | [Roster.tsx](../../src/clubhouse/screens/roster/Roster.tsx), line 208 |
| roster | inline | Menu | [Roster.tsx](../../src/clubhouse/screens/roster/Roster.tsx), line 561 |
| roster | InviteModal | Modal | [Roster.tsx](../../src/clubhouse/screens/roster/Roster.tsx), line 606 |
| roster | RosterPhone | PhoneScreen | [RosterPhone.tsx](../../src/clubhouse/screens/roster/RosterPhone.tsx), line 194 |
| roster | RequestsSheet | Modal | [RosterPhone.tsx](../../src/clubhouse/screens/roster/RosterPhone.tsx), line 349 |
| roster | PlayerActions | Modal | [RosterPhone.tsx](../../src/clubhouse/screens/roster/RosterPhone.tsx), line 417 |
| rounds | RoundsLibrary | Modal | [RoundsLibrary.tsx](../../src/clubhouse/screens/rounds/RoundsLibrary.tsx), line 268 |
| rounds | InProgressConflictDialog | Modal | [InProgressConflictDialog.tsx](../../src/clubhouse/screens/rounds/entry/InProgressConflictDialog.tsx), line 93 |
| rounds | QualifierRoundSheet | Modal | [QualifierRoundSheet.tsx](../../src/clubhouse/screens/rounds/entry/QualifierRoundSheet.tsx), line 45 |
| rounds | RecoveryDialog | Modal | [RecoveryDialog.tsx](../../src/clubhouse/screens/rounds/entry/RecoveryDialog.tsx), line 96 |
| rounds | SaveAsPracticeSheet | Modal | [SaveAsPracticeSheet.tsx](../../src/clubhouse/screens/rounds/entry/SaveAsPracticeSheet.tsx), line 85 |
| rounds | RoundRecover | Modal | [RoundRecover.tsx](../../src/clubhouse/screens/rounds/recover/RoundRecover.tsx), line 273 |
| rounds | AddCourseSheet | Modal | [AddCourseSheet.tsx](../../src/clubhouse/screens/rounds/setup/AddCourseSheet.tsx), line 87 |
| rounds | CoursePicker | Modal | [CoursePicker.tsx](../../src/clubhouse/screens/rounds/setup/CoursePicker.tsx), line 58 |
| rounds | ScorecardSheet | Modal | [round-sheets.tsx](../../src/clubhouse/screens/rounds/track/round-sheets.tsx), line 92 |
| rounds | ExitSheet | Modal | [round-sheets.tsx](../../src/clubhouse/screens/rounds/track/round-sheets.tsx), line 137 |
| rounds | RoundCompleteSheet | Modal | [round-sheets.tsx](../../src/clubhouse/screens/rounds/track/round-sheets.tsx), line 245 |
| rounds | PenaltySheet | Modal | [sheets.tsx](../../src/clubhouse/screens/rounds/track/sheets.tsx), line 81 |
| rounds | UnsavedSheet | Modal | [sheets.tsx](../../src/clubhouse/screens/rounds/track/sheets.tsx), line 130 |
| rounds | EditShotSheet | Modal | [sheets.tsx](../../src/clubhouse/screens/rounds/track/sheets.tsx), line 213 |
| settings | SessionCard | Modal | [Account.tsx](../../src/clubhouse/screens/settings/Account.tsx), line 292 |
| settings | PowerCard | Modal | [CoachHelm.tsx](../../src/clubhouse/screens/settings/CoachHelm.tsx), line 367 |
| settings | MembershipCard | Modal | [Golf.tsx](../../src/clubhouse/screens/settings/Golf.tsx), line 75 |
| settings | RoutingCard | Modal | [Notifications.tsx](../../src/clubhouse/screens/settings/Notifications.tsx), line 186 |
| settings | SettingsView | Modal | [SettingsView.tsx](../../src/clubhouse/screens/settings/SettingsView.tsx), line 204 |
| settings | InviteCard | Modal | [Team.tsx](../../src/clubhouse/screens/settings/Team.tsx), line 122 |
| settings | useUnsavedGuard | Modal | [parts.tsx](../../src/clubhouse/screens/settings/parts.tsx), line 221 |
| settings | AccountPhone | ActionSheet | [AccountPhone.tsx](../../src/clubhouse/screens/settings/phone/AccountPhone.tsx), line 65 |
| settings | AccountPhone | FormSheet | [AccountPhone.tsx](../../src/clubhouse/screens/settings/phone/AccountPhone.tsx), line 82 |
| settings | ProfileSheet | FormSheet | [AccountPhone.tsx](../../src/clubhouse/screens/settings/phone/AccountPhone.tsx), line 130 |
| settings | EmailSheet | FormSheet | [AccountPhone.tsx](../../src/clubhouse/screens/settings/phone/AccountPhone.tsx), line 213 |
| settings | PasswordSheet | FormSheet | [AccountPhone.tsx](../../src/clubhouse/screens/settings/phone/AccountPhone.tsx), line 266 |
| settings | PowerGroup | ActionSheet | [CoachHelmPhone.tsx](../../src/clubhouse/screens/settings/phone/CoachHelmPhone.tsx), line 207 |
| settings | GolfSheet | FormSheet | [GolfPhone.tsx](../../src/clubhouse/screens/settings/phone/GolfPhone.tsx), line 50 |
| settings | MembershipPhone | ActionSheet | [GolfPhone.tsx](../../src/clubhouse/screens/settings/phone/GolfPhone.tsx), line 97 |
| settings | MembershipPhone | FormSheet | [GolfPhone.tsx](../../src/clubhouse/screens/settings/phone/GolfPhone.tsx), line 131 |
| settings | DeliveryPhone | ListSheet | [NotificationsPhone.tsx](../../src/clubhouse/screens/settings/phone/NotificationsPhone.tsx), line 85 |
| settings | RoutingPhone | ListSheet | [NotificationsPhone.tsx](../../src/clubhouse/screens/settings/phone/NotificationsPhone.tsx), line 171 |
| settings | InvitePhone | ActionSheet | [TeamPhone.tsx](../../src/clubhouse/screens/settings/phone/TeamPhone.tsx), line 84 |
| settings | TeamSheet | FormSheet | [TeamPhone.tsx](../../src/clubhouse/screens/settings/phone/TeamPhone.tsx), line 158 |
| settings | ReminderSheet | FormSheet | [TeamPhone.tsx](../../src/clubhouse/screens/settings/phone/TeamPhone.tsx), line 279 |
| settings | FormSheet | dialog | [sheets.tsx](../../src/clubhouse/screens/settings/phone/sheets.tsx), line 97 |
| settings | FormSheet | ActionSheet | [sheets.tsx](../../src/clubhouse/screens/settings/phone/sheets.tsx), line 129 |
| settings | ListSheet | dialog | [sheets.tsx](../../src/clubhouse/screens/settings/phone/sheets.tsx), line 171 |
| settings | PickerSheet | ListSheet | [sheets.tsx](../../src/clubhouse/screens/settings/phone/sheets.tsx), line 209 |
| settings | ActionSheet | dialog | [sheets.tsx](../../src/clubhouse/screens/settings/phone/sheets.tsx), line 262 |
| settings | PickerRow | PickerSheet | [ui.tsx](../../src/clubhouse/screens/settings/phone/ui.tsx), line 142 |
| stats | FilterSheet | Modal | [StatsFilter.tsx](../../src/clubhouse/screens/stats/StatsFilter.tsx), line 277 |
| stats | FocusAreaSheet | Modal | [StatsPlayer.tsx](../../src/clubhouse/screens/stats/StatsPlayer.tsx), line 635 |
| shared shell | Bell | Menu | [Bell.tsx](../../src/clubhouse/shell/Bell.tsx), line 218 |
| shared shell | Modal | dialog | [Modal.tsx](../../src/clubhouse/ui/Modal.tsx), line 51 |
