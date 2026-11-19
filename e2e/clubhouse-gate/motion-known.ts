// Known motion breaks per gate screen, keyed `<screen id>|motion` or `<screen id>|reduce`, exactly as
// e2e/clubhouse-motion-gate.spec.ts prints them. The list may only shrink: a break that no longer happens fails the gate
// until its line is removed. Recorded from the first full W run (Playwright WebKit 390, `next dev` fixtures, 15 Nov 2026,
// main db3a99ee1). Each entry is a finding against the motion doctrine for the owner and the page threads to judge:
// the bell stack and Team board blocks animating in on first paint, popups and the Team board still fading 180 ms under
// Reduce Motion, and fixtures that open a sheet or a pushed screen on load (quick chat, messages-stress). The CI step is
// advisory until a week of nightly runs on main shows the list is stable; then it gates.
export const MOTION_KNOWN: Record<string, string[]> = {
  "ask-v2|motion": [
    "first-paint: div.ch-bst animates as the screen opens",
    "first-paint: span.ch-bst-shell animates as the screen opens",
  ],
  "ask|motion": [
    "first-paint: div.ch-bst animates as the screen opens",
    "first-paint: span.ch-bst-shell animates as the screen opens",
  ],
  "classes-empty|motion": [
    "first-paint: div.ch-bst animates as the screen opens",
    "first-paint: span.ch-bst-shell animates as the screen opens",
  ],
  "classes|motion": [
    "first-paint: div.ch-bst animates as the screen opens",
    "first-paint: span.ch-bst-shell animates as the screen opens",
  ],
  "documents|motion": [
    "first-paint: div.ch-bst animates as the screen opens",
    "first-paint: span.ch-bst-shell animates as the screen opens",
  ],
  "file-long|motion": [
    "first-paint: div.ch-bst animates as the screen opens",
    "first-paint: div.wrap-collapse animates as the screen opens",
    "first-paint: section.card animates as the screen opens",
    "first-paint: span.ch-bst-shell animates as the screen opens",
  ],
  "file-long|reduce": [
    "reduced: div.wrap-collapse moves under Reduce Motion",
  ],
  "file-player|motion": [
    "first-paint: div.ch-bst animates as the screen opens",
    "first-paint: span.ch-bst-shell animates as the screen opens",
  ],
  "file|motion": [
    "first-paint: div.ch-bst animates as the screen opens",
    "first-paint: div.wrap-collapse animates as the screen opens",
    "first-paint: section.card animates as the screen opens",
    "first-paint: span.ch-bst-shell animates as the screen opens",
  ],
  "file|reduce": [
    "reduced: div.wrap-collapse moves under Reduce Motion",
  ],
  "home-coach-empty|motion": [
    "first-paint: div.ch-bst animates as the screen opens",
    "first-paint: span.ch-bst-shell animates as the screen opens",
  ],
  "home-coach-stress|motion": [
    "first-paint: button.ch-btn.ch-btn--ghost animates as the screen opens",
    "first-paint: div.ch-bst animates as the screen opens",
    "first-paint: span.ch-bst-shell animates as the screen opens",
  ],
  "home-coach|motion": [
    "first-paint: button.ch-btn.ch-btn--ghost animates as the screen opens",
    "first-paint: div.ch-bst animates as the screen opens",
    "first-paint: span.ch-bst-shell animates as the screen opens",
  ],
  "home-player-empty|motion": [
    "first-paint: div.ch-bst animates as the screen opens",
    "first-paint: span.ch-bst-shell animates as the screen opens",
  ],
  "home-player|motion": [
    "first-paint: button.ch-btn.ch-btn--ghost animates as the screen opens",
    "first-paint: div.ch-bst animates as the screen opens",
    "first-paint: span.ch-bst-shell animates as the screen opens",
  ],
  "messages-empty|motion": [
    "first-paint: div.ch-bst animates as the screen opens",
    "first-paint: span.ch-bst-shell animates as the screen opens",
  ],
  "messages-stress|motion": [
    "first-paint: div.ch-bst animates as the screen opens",
    "first-paint: div.ch-dock-spacer animates as the screen opens",
    "first-paint: div.ch-msp-inbox animates as the screen opens",
    "first-paint: div.ch-msv-datepill animates as the screen opens",
    "first-paint: div.ch-msv-datepill.is-on animates as the screen opens",
    "first-paint: div.ch-pscrim animates as the screen opens",
    "first-paint: header.ch-topbar animates as the screen opens",
    "first-paint: section.ch-pscreen.ch-msp-thread animates as the screen opens",
    "first-paint: span.ch-bst-shell animates as the screen opens",
  ],
  "messages-stress|reduce": [
    "reduced: div.ch-dock-spacer moves under Reduce Motion",
    "reduced: div.ch-msp-inbox moves under Reduce Motion",
    "reduced: div.ch-msv-datepill moves under Reduce Motion",
    "reduced: div.ch-msv-datepill.is-on moves under Reduce Motion",
    "reduced: header.ch-topbar moves under Reduce Motion",
    "reduced: section.ch-pscreen.ch-msp-thread moves under Reduce Motion",
  ],
  "messages|motion": [
    "first-paint: div.ch-bst animates as the screen opens",
    "first-paint: span.ch-bst-shell animates as the screen opens",
  ],
  "popup-ActionSheet|reduce": [
    "reduced: dialog.ch-fsheet-act moves under Reduce Motion",
  ],
  "popup-FormSheet|reduce": [
    "reduced: dialog.ch-fsheet-dlg.is-full moves under Reduce Motion",
    "reduced: form.ch-fsheet moves under Reduce Motion",
  ],
  "popup-ListSheet|reduce": [
    "reduced: dialog.ch-fsheet-dlg moves under Reduce Motion",
    "reduced: div.ch-fsheet moves under Reduce Motion",
  ],
  "popup-Modal|reduce": [
    "reduced: dialog.ch-modal moves under Reduce Motion",
    "reduced: div.ch-modal__panel moves under Reduce Motion",
  ],
  "popup-PickerSheet|reduce": [
    "reduced: dialog.ch-fsheet-dlg moves under Reduce Motion",
    "reduced: div.ch-fsheet moves under Reduce Motion",
  ],
  "popup-RecActionSheet|reduce": [
    "reduced: dialog.ch-fsheet-act moves under Reduce Motion",
  ],
  "popup-RecFormSheet|reduce": [
    "reduced: dialog.ch-fsheet-dlg.is-full moves under Reduce Motion",
    "reduced: form.ch-fsheet moves under Reduce Motion",
  ],
  "popup-RecPickSheet|reduce": [
    "reduced: dialog.ch-fsheet-dlg moves under Reduce Motion",
    "reduced: div.ch-fsheet moves under Reduce Motion",
  ],
  "practice-card-stress|motion": [
    "first-paint: div.ch-bst animates as the screen opens",
    "first-paint: span.ch-bst-shell animates as the screen opens",
  ],
  "practice-format|motion": [
    "first-paint: button.hkey animates as the screen opens",
    "first-paint: div.ch-bst animates as the screen opens",
    "first-paint: span.ch-bst-shell animates as the screen opens",
  ],
  "practice-plan|motion": [
    "first-paint: button.hkey animates as the screen opens",
    "first-paint: div.ch-bst animates as the screen opens",
    "first-paint: span.ch-bst-shell animates as the screen opens",
  ],
  "practice-player|motion": [
    "first-paint: div.ch-bst animates as the screen opens",
    "first-paint: span.ch-bst-shell animates as the screen opens",
  ],
  "practice-thread|motion": [
    "first-paint: button.ch-ak-jump animates as the screen opens",
    "first-paint: div.ch-ask-cmp__box animates as the screen opens",
    "first-paint: div.ch-bst animates as the screen opens",
    "first-paint: span.ch-bst-shell animates as the screen opens",
    "first-paint: span.t animates as the screen opens",
  ],
  "practice-thread|reduce": [
    "reduced: span.t moves under Reduce Motion",
  ],
  "quick-chat|motion": [
    "first-paint: div.ch-bst animates as the screen opens",
    "first-paint: div.qc__body animates as the screen opens",
    "first-paint: div.qc__comp animates as the screen opens",
    "first-paint: div.scrim animates as the screen opens",
    "first-paint: header.qc__h animates as the screen opens",
    "first-paint: section#ch-qc-panel.qc animates as the screen opens",
    "first-paint: span.ch-bst-shell animates as the screen opens",
    "first-paint: ul.qc-starts animates as the screen opens",
  ],
  "quick-chat|reduce": [
    "reduced: div.scrim moves under Reduce Motion",
    "reduced: section#ch-qc-panel.qc moves under Reduce Motion",
  ],
  "read-player|motion": [
    "first-paint: div.ch-bst animates as the screen opens",
    "first-paint: span.ch-bst-shell animates as the screen opens",
  ],
  "read-stress|motion": [
    "first-paint: div.ch-bst animates as the screen opens",
    "first-paint: span.ch-bst-shell animates as the screen opens",
  ],
  "read|motion": [
    "first-paint: div.ch-bst animates as the screen opens",
    "first-paint: span.ch-bst-shell animates as the screen opens",
  ],
  "roster-long|motion": [
    "first-paint: div.ch-bst animates as the screen opens",
    "first-paint: span.ch-bst-shell animates as the screen opens",
  ],
  "roster-player|motion": [
    "first-paint: div.ch-bst animates as the screen opens",
    "first-paint: span.ch-bst-shell animates as the screen opens",
  ],
  "roster|motion": [
    "first-paint: div.ch-bst animates as the screen opens",
    "first-paint: span.ch-bst-shell animates as the screen opens",
  ],
  "stats-player-early|motion": [
    "first-paint: button.hkey animates as the screen opens",
    "first-paint: div.ch-bst animates as the screen opens",
    "first-paint: span.ch-bst-shell animates as the screen opens",
  ],
  "stats-player|motion": [
    "first-paint: button.hkey animates as the screen opens",
    "first-paint: div.ch-bst animates as the screen opens",
    "first-paint: span.ch-bst-shell animates as the screen opens",
  ],
  "stats-team-empty|motion": [
    "first-paint: div.ch-bst animates as the screen opens",
    "first-paint: span.ch-bst-shell animates as the screen opens",
  ],
  "stats-team|motion": [
    "first-paint: div.ch-bst animates as the screen opens",
    "first-paint: span.ch-bst-shell animates as the screen opens",
  ],
  "team-empty|motion": [
    "first-paint: div.ch-bst animates as the screen opens",
    "first-paint: span.ch-bst-shell animates as the screen opens",
  ],
  "team-long|motion": [
    "first-paint: div.ch-bst animates as the screen opens",
    "first-paint: span.ch-bst-shell animates as the screen opens",
  ],
  "team-stress|motion": [
    "first-paint: div.ch-bst animates as the screen opens",
    "first-paint: span.ch-bst-shell animates as the screen opens",
  ],
  "team|motion": [
    "first-paint: div.ch-bst animates as the screen opens",
    "first-paint: span.ch-bst-shell animates as the screen opens",
  ],
};
