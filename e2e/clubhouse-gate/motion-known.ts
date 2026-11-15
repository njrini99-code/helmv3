// Known motion breaks per gate screen, keyed `<screen id>|motion` or `<screen id>|reduce`, exactly as
// e2e/clubhouse-motion-gate.spec.ts prints them. The list may only shrink: a break that no longer happens fails the gate
// until its line is removed. Recorded from the first full W run (Playwright WebKit 390, `next dev` fixtures, 15 Nov 2026,
// main db3a99ee1). Each entry is a finding against the motion doctrine for the owner and the page threads to judge:
// the bell stack and Team board blocks animating in on first paint, popups and the Team board still fading 180 ms under
// Reduce Motion, and fixtures that open a sheet or a pushed screen on load (quick chat, messages-stress). The CI step is
// advisory until a week of nightly runs on main shows the list is stable; then it gates.
export const MOTION_KNOWN: Record<string, string[]> = {
  "ask-v2|motion": [
    "first-paint: div.ch-bst Animation animates as the screen opens",
    "first-paint: span.ch-bst-shell Animation animates as the screen opens",
  ],
  "ask|motion": [
    "first-paint: div.ch-bst Animation animates as the screen opens",
    "first-paint: span.ch-bst-shell Animation animates as the screen opens",
  ],
  "classes-empty|motion": [
    "first-paint: div.ch-bst Animation animates as the screen opens",
    "first-paint: span.ch-bst-shell Animation animates as the screen opens",
  ],
  "classes|motion": [
    "first-paint: div.ch-bst Animation animates as the screen opens",
    "first-paint: span.ch-bst-shell Animation animates as the screen opens",
  ],
  "documents|motion": [
    "first-paint: div.ch-bst Animation animates as the screen opens",
    "first-paint: span.ch-bst-shell Animation animates as the screen opens",
  ],
  "documents|reduce": [
    "reduced: span.hkey__flag opacity runs 180 ms under Reduce Motion",
  ],
  "file-long|motion": [
    "first-paint: div.ch-bst Animation animates as the screen opens",
    "first-paint: div.wrap-collapse Animation animates as the screen opens",
    "first-paint: section.card box-shadow animates as the screen opens",
    "first-paint: span.ch-bst-shell Animation animates as the screen opens",
  ],
  "file-long|reduce": [
    "reduced: div.wrap-collapse Animation runs 260 ms under Reduce Motion",
  ],
  "file-player|motion": [
    "first-paint: div.ch-bst Animation animates as the screen opens",
    "first-paint: span.ch-bst-shell Animation animates as the screen opens",
  ],
  "file|motion": [
    "first-paint: div.ch-bst Animation animates as the screen opens",
    "first-paint: div.wrap-collapse Animation animates as the screen opens",
    "first-paint: section.card box-shadow animates as the screen opens",
    "first-paint: span.ch-bst-shell Animation animates as the screen opens",
  ],
  "file|reduce": [
    "reduced: div.wrap-collapse Animation runs 260 ms under Reduce Motion",
  ],
  "home-coach-empty|motion": [
    "first-paint: div.ch-bst Animation animates as the screen opens",
    "first-paint: span.ch-bst-shell Animation animates as the screen opens",
  ],
  "home-coach-empty|reduce": [
    "reduced: span.hkey__flag opacity runs 180 ms under Reduce Motion",
  ],
  "home-coach-stress|motion": [
    "first-paint: button.ch-btn.ch-btn--ghost background-color animates as the screen opens",
    "first-paint: button.ch-btn.ch-btn--ghost box-shadow animates as the screen opens",
    "first-paint: button.ch-btn.ch-btn--ghost color animates as the screen opens",
    "first-paint: div.ch-bst Animation animates as the screen opens",
    "first-paint: span.ch-bst-shell Animation animates as the screen opens",
  ],
  "home-coach-stress|reduce": [
    "reduced: span.hkey__flag opacity runs 180 ms under Reduce Motion",
  ],
  "home-coach|motion": [
    "first-paint: button.ch-btn.ch-btn--ghost background-color animates as the screen opens",
    "first-paint: button.ch-btn.ch-btn--ghost box-shadow animates as the screen opens",
    "first-paint: button.ch-btn.ch-btn--ghost color animates as the screen opens",
    "first-paint: div.ch-bst Animation animates as the screen opens",
    "first-paint: span.ch-bst-shell Animation animates as the screen opens",
  ],
  "home-coach|reduce": [
    "reduced: span.hkey__flag opacity runs 180 ms under Reduce Motion",
  ],
  "home-player-empty|motion": [
    "first-paint: div.ch-bst Animation animates as the screen opens",
    "first-paint: span.ch-bst-shell Animation animates as the screen opens",
  ],
  "home-player|motion": [
    "first-paint: button.ch-btn.ch-btn--ghost background-color animates as the screen opens",
    "first-paint: button.ch-btn.ch-btn--ghost box-shadow animates as the screen opens",
    "first-paint: button.ch-btn.ch-btn--ghost color animates as the screen opens",
    "first-paint: div.ch-bst Animation animates as the screen opens",
    "first-paint: span.ch-bst-shell Animation animates as the screen opens",
  ],
  "messages-empty|motion": [
    "first-paint: div.ch-bst Animation animates as the screen opens",
    "first-paint: span.ch-bst-shell Animation animates as the screen opens",
  ],
  "messages-empty|reduce": [
    "reduced: span.hkey__flag opacity runs 180 ms under Reduce Motion",
  ],
  "messages-stress|motion": [
    "first-paint: div.ch-bst Animation animates as the screen opens",
    "first-paint: div.ch-dock-spacer Animation animates as the screen opens",
    "first-paint: div.ch-msp-inbox Animation animates as the screen opens",
    "first-paint: div.ch-msv-datepill opacity animates as the screen opens",
    "first-paint: div.ch-msv-datepill.is-on opacity animates as the screen opens",
    "first-paint: div.ch-pscrim Animation animates as the screen opens",
    "first-paint: header.ch-topbar Animation animates as the screen opens",
    "first-paint: section.ch-pscreen.ch-msp-thread Animation animates as the screen opens",
    "first-paint: span.ch-bst-shell Animation animates as the screen opens",
  ],
  "messages-stress|reduce": [
    "reduced: div.ch-dock-spacer Animation runs 462 ms under Reduce Motion",
    "reduced: div.ch-msp-inbox Animation runs 462 ms under Reduce Motion",
    "reduced: div.ch-msv-datepill opacity runs 180 ms under Reduce Motion",
    "reduced: div.ch-msv-datepill.is-on opacity runs 180 ms under Reduce Motion",
    "reduced: header.ch-topbar Animation runs 462 ms under Reduce Motion",
    "reduced: section.ch-pscreen.ch-msp-thread opacity runs 180 ms under Reduce Motion",
  ],
  "messages|motion": [
    "first-paint: div.ch-bst Animation animates as the screen opens",
    "first-paint: span.ch-bst-shell Animation animates as the screen opens",
  ],
  "messages|reduce": [
    "reduced: span.hkey__flag opacity runs 180 ms under Reduce Motion",
  ],
  "popup-ActionSheet|reduce": [
    "reduced: dialog.ch-fsheet-act Animation runs 180 ms under Reduce Motion",
    "reduced: dialog.ch-fsheet-act opacity runs 180 ms under Reduce Motion",
  ],
  "popup-FormSheet|reduce": [
    "reduced: dialog.ch-fsheet-dlg.is-full opacity runs 180 ms under Reduce Motion",
    "reduced: form.ch-fsheet Animation runs 180 ms under Reduce Motion",
  ],
  "popup-ListSheet|reduce": [
    "reduced: dialog.ch-fsheet-dlg opacity runs 180 ms under Reduce Motion",
    "reduced: div.ch-fsheet Animation runs 180 ms under Reduce Motion",
  ],
  "popup-Modal|reduce": [
    "reduced: dialog.ch-modal opacity runs 180 ms under Reduce Motion",
    "reduced: div.ch-modal__panel Animation runs 180 ms under Reduce Motion",
  ],
  "popup-PickerSheet|reduce": [
    "reduced: dialog.ch-fsheet-dlg opacity runs 180 ms under Reduce Motion",
    "reduced: div.ch-fsheet Animation runs 180 ms under Reduce Motion",
  ],
  "popup-RecActionSheet|reduce": [
    "reduced: dialog.ch-fsheet-act Animation runs 180 ms under Reduce Motion",
    "reduced: dialog.ch-fsheet-act opacity runs 180 ms under Reduce Motion",
  ],
  "popup-RecFormSheet|reduce": [
    "reduced: dialog.ch-fsheet-dlg.is-full opacity runs 180 ms under Reduce Motion",
    "reduced: form.ch-fsheet Animation runs 180 ms under Reduce Motion",
  ],
  "popup-RecPickSheet|reduce": [
    "reduced: dialog.ch-fsheet-dlg opacity runs 180 ms under Reduce Motion",
    "reduced: div.ch-fsheet Animation runs 180 ms under Reduce Motion",
  ],
  "practice-card-stress|motion": [
    "first-paint: div.ch-bst Animation animates as the screen opens",
    "first-paint: span.ch-bst-shell Animation animates as the screen opens",
  ],
  "practice-format|motion": [
    "first-paint: button.hkey color animates as the screen opens",
    "first-paint: div.ch-bst Animation animates as the screen opens",
    "first-paint: span.ch-bst-shell Animation animates as the screen opens",
  ],
  "practice-format|reduce": [
    "reduced: span.hkey__flag opacity runs 180 ms under Reduce Motion",
  ],
  "practice-plan|motion": [
    "first-paint: button.hkey color animates as the screen opens",
    "first-paint: div.ch-bst Animation animates as the screen opens",
    "first-paint: span.ch-bst-shell Animation animates as the screen opens",
  ],
  "practice-plan|reduce": [
    "reduced: span.hkey__flag opacity runs 180 ms under Reduce Motion",
  ],
  "practice-player|motion": [
    "first-paint: div.ch-bst Animation animates as the screen opens",
    "first-paint: span.ch-bst-shell Animation animates as the screen opens",
  ],
  "practice-thread|motion": [
    "first-paint: button.ch-ak-jump ch-ak-rise6 animates as the screen opens",
    "first-paint: div.ch-ask-cmp__box box-shadow animates as the screen opens",
    "first-paint: div.ch-bst Animation animates as the screen opens",
    "first-paint: span.ch-bst-shell Animation animates as the screen opens",
    "first-paint: span.t ch-isl-word animates as the screen opens",
  ],
  "practice-thread|reduce": [
    "reduced: span.t ch-isl-word runs 180 ms under Reduce Motion",
  ],
  "quick-chat|motion": [
    "first-paint: div.ch-bst Animation animates as the screen opens",
    "first-paint: div.qc__body Animation animates as the screen opens",
    "first-paint: div.qc__comp Animation animates as the screen opens",
    "first-paint: div.scrim Animation animates as the screen opens",
    "first-paint: header.qc__h Animation animates as the screen opens",
    "first-paint: section#ch-qc-panel.qc Animation animates as the screen opens",
    "first-paint: span.ch-bst-shell Animation animates as the screen opens",
    "first-paint: ul.qc-starts ch-qc-fade animates as the screen opens",
  ],
  "quick-chat|reduce": [
    "reduced: div.scrim Animation runs 180 ms under Reduce Motion",
    "reduced: section#ch-qc-panel.qc Animation runs 180 ms under Reduce Motion",
  ],
  "read-player|motion": [
    "first-paint: div.ch-bst Animation animates as the screen opens",
    "first-paint: span.ch-bst-shell Animation animates as the screen opens",
  ],
  "read-stress|motion": [
    "first-paint: div.ch-bst Animation animates as the screen opens",
    "first-paint: span.ch-bst-shell Animation animates as the screen opens",
  ],
  "read|motion": [
    "first-paint: div.ch-bst Animation animates as the screen opens",
    "first-paint: span.ch-bst-shell Animation animates as the screen opens",
  ],
  "roster-long|motion": [
    "first-paint: div.ch-bst Animation animates as the screen opens",
    "first-paint: span.ch-bst-shell Animation animates as the screen opens",
  ],
  "roster-long|reduce": [
    "reduced: span.hkey__flag opacity runs 180 ms under Reduce Motion",
  ],
  "roster-player|motion": [
    "first-paint: div.ch-bst Animation animates as the screen opens",
    "first-paint: span.ch-bst-shell Animation animates as the screen opens",
  ],
  "roster|motion": [
    "first-paint: div.ch-bst Animation animates as the screen opens",
    "first-paint: span.ch-bst-shell Animation animates as the screen opens",
  ],
  "stats-player-early|motion": [
    "first-paint: button.hkey color animates as the screen opens",
    "first-paint: div.ch-bst Animation animates as the screen opens",
    "first-paint: span.ch-bst-shell Animation animates as the screen opens",
  ],
  "stats-player-early|reduce": [
    "reduced: span.hkey__flag opacity runs 180 ms under Reduce Motion",
  ],
  "stats-player|motion": [
    "first-paint: button.hkey color animates as the screen opens",
    "first-paint: div.ch-bst Animation animates as the screen opens",
    "first-paint: span.ch-bst-shell Animation animates as the screen opens",
  ],
  "stats-team-empty|motion": [
    "first-paint: div.ch-bst Animation animates as the screen opens",
    "first-paint: span.ch-bst-shell Animation animates as the screen opens",
  ],
  "stats-team-empty|reduce": [
    "reduced: span.hkey__flag opacity runs 180 ms under Reduce Motion",
  ],
  "stats-team|motion": [
    "first-paint: div.ch-bst Animation animates as the screen opens",
    "first-paint: span.ch-bst-shell Animation animates as the screen opens",
  ],
  "stats-team|reduce": [
    "reduced: span.hkey__flag opacity runs 180 ms under Reduce Motion",
  ],
  "team-empty|motion": [
    "first-paint: div.ch-bst Animation animates as the screen opens",
    "first-paint: span.ch-bst-shell Animation animates as the screen opens",
  ],
  "team-long|motion": [
    "first-paint: div.ch Animation animates as the screen opens",
    "first-paint: div.ch-bst Animation animates as the screen opens",
    "first-paint: div.pat Animation animates as the screen opens",
    "first-paint: div.rds Animation animates as the screen opens",
    "first-paint: div.subh Animation animates as the screen opens",
    "first-paint: span.ch-bst-shell Animation animates as the screen opens",
  ],
  "team-stress|motion": [
    "first-paint: div.ch Animation animates as the screen opens",
    "first-paint: div.ch-bst Animation animates as the screen opens",
    "first-paint: div.rds Animation animates as the screen opens",
    "first-paint: div.subh Animation animates as the screen opens",
    "first-paint: p.nopat Animation animates as the screen opens",
    "first-paint: span.ch-bst-shell Animation animates as the screen opens",
  ],
  "team-stress|reduce": [
    "reduced: div.ch Animation runs 180 ms under Reduce Motion",
    "reduced: div.rds Animation runs 180 ms under Reduce Motion",
    "reduced: div.subh Animation runs 180 ms under Reduce Motion",
    "reduced: p.nopat Animation runs 180 ms under Reduce Motion",
  ],
  "team|motion": [
    "first-paint: div.ch Animation animates as the screen opens",
    "first-paint: div.ch-bst Animation animates as the screen opens",
    "first-paint: div.pat Animation animates as the screen opens",
    "first-paint: div.rds Animation animates as the screen opens",
    "first-paint: div.subh Animation animates as the screen opens",
    "first-paint: span.ch-bst-shell Animation animates as the screen opens",
  ],
  "team|reduce": [
    "reduced: div.ch Animation runs 180 ms under Reduce Motion",
    "reduced: div.pat Animation runs 180 ms under Reduce Motion",
    "reduced: div.rds Animation runs 180 ms under Reduce Motion",
    "reduced: div.subh Animation runs 180 ms under Reduce Motion",
  ],
};
