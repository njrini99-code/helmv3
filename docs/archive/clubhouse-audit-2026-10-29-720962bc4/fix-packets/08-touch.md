# Fix packet 08 · touch

5 findings, 1 block the flag flip.

## F-0021 · S2 · after · P001
**Phone fields, selects and secondary buttons have hit areas of 20–43 pt instead of 44**

- Observed: select 153x34 (P004); event title input 354x32, All day input 16x16, lane band 38x26 (P006 new event / week); search inputs 328x20 (P007, P009), 139x20 (P011); course pin input 160x24 (P008 team); button.ch-hl-since__b 196x32, Ask textarea 206x37, button.ch-hs-ld__why 370x36, a.ch-th-mention 83x20 (P013); a.ch-tour-home-feat__t 261x43, tab 37x44, selects 345x38 / 370x38 (P016).
- Expected: 44x44 pt incl. ::before/::after extenders (TO-01, Apple HIG).
- Fix: Make the visible field the target: put the input's padding on the input itself (min-height: 44px) or make the pill a <label> wrapping it; raise .ch-ed__title, selects and .ch-hl-since__b to min-height 44px; give tab and chip buttons an ::after inset to 44.
- Files: src/clubhouse/styles/controls.css
- Evidence: ev/P006/calendar__new-1-pro-light.png, ev/t2/player-messages-light.png, ev/P016/tournaments-new-pro-light.png, p8-sim/rows.jsonl, p2p3-lean/lean-coach/drafts.jsonl, p2p3-lean/lean-player/drafts.jsonl
- Acceptance: rerun the instrument named in the evidence; it must pass (TO-01 hit area >= 44x44 (phone)).

## F-0022 · S2 · after · P001
**Desktop links, chips, inputs and drag handles under 24 px**

- Observed: a.ch-h-legs__who 45x16, a.ch-h-lb__go 163x20, Waiting-on-you buttons 19 tall (P002); search input 278x15 (P003); a.ch-lg__a 85x19, a.ch-tr__link 86x19 (P004/P005); month chips 90x16, ribbon 313x20, All day 16x16 (P006); search 265x15 (P007); coachhelm settings inputs 760x22 x7 (P008); search 318x15 (P009); .ch-hw-more 18 tall x4 (P010); round links 19 tall, search 218x15 (P011); mention 83x20, role link 72x16 (P013); compare thumb 22x22, divider 22x418 (P016).
- Expected: 24x24 CSS px or the 2.5.8 spacing exception (TO-01).
- Fix: min-height: 24px (28 for chips) on .ch-mo__ev/.ch-mo__ribbon, .ch-hw-more, .ch-tr__link; put the search field's padding on the input; widen .ch-tour-cmp-tl__thumb and the divider's hit area with an ::after to 24.
- Files: src/clubhouse/styles/calendar.css, src/clubhouse/styles/hub.css
- Evidence: ev/P002/home-mba15-light.png, ev/calendar/calendar~event=0e27cb7b-b5fa-4bdc-9f39-2c37ec31ddf9-mba15-light.png, p2p3-lean/lean-coach/drafts.jsonl, p2p3-lean/lean-player/drafts.jsonl
- Acceptance: rerun the instrument named in the evidence; it must pass (TO-01 hit area >= 24x24 (desktop)).

## F-0023 · S2 · blocks-flip · P006
**Going shows as chosen about a second after the tap**

- Observed: Going radio aria-checked 1037 ms after the tap; the toast followed; no optimistic selection.
- Expected: Selection visible within 100 ms (optimistic), rolled back on failure (TO-02, SP write row).
- Fix: Set the RSVP choice optimistically on press and roll back with the existing 'Couldn't send your reply' toast on failure.
- Files: n/a
- Evidence: p2p3-lean/lean-coach/drafts-manual.jsonl, writes.jsonl#W-012
- Acceptance: rerun the instrument named in the evidence; it must pass (TO-02 feedback; SP write -> optimistic visible).

## F-0049 · S3 · after · P011
**On desktop New round, the sticky Start round footer covers the 'Not live' control when it is scrolled to**

- Observed: Press of 'Not live' failed: the sticky footer sat over it after scroll-into-view.
- Expected: scroll-padding-bottom equal to the footer height so scrolled-to controls clear it.
- Fix: Add scroll-padding-bottom: var(footer height) on the setup scroller.
- Files: src/clubhouse/screens/rounds
- Evidence: p2p3-lean/lean-player/rows/rounds.jsonl, p2p3-lean/lean-player/DONE.md
- Acceptance: rerun the instrument named in the evidence; it must pass (TO-06 scroll / focused control never hidden).

## F-0072 · S4 · after · P001
**Legacy :hover rules outside (hover: hover) ship in the CSS the phone loads**

- Observed: 30+ rules (e.g. .baseball-auth-panel button:hover, .glass-card:hover, .group:hover .group-hover:*); no stuck hover in 162 tap checks.
- Expected: Every :hover inside @media (hover: hover) (TO-03).
- Fix: Drop the legacy Fairway/baseball CSS from the Clubhouse bundle, or wrap the remaining :hover rules in @media (hover: hover).
- Files: n/a
- Evidence: p8-sim/rows.jsonl, p2p3-lean/lean-player/DONE.md, p2p3-lean/lean-player/drafts.jsonl
- Acceptance: rerun the instrument named in the evidence; it must pass (TO-03 hover styles only under (hover: hover)).
