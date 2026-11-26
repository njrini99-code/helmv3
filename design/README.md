# design/

The one home for design images and evidence in this repo.

| Folder | What it holds | Who cites it |
| --- | --- | --- |
| `handoff/` | The Clubhouse design handoff as received (HTML exports, boards, screenshots). Kept byte-exact (`handoff/VERSIONS.md`); `handoff/RETIRED.md` says which pages it no longer governs. | `src/clubhouse/**` and the Clubhouse docs, by path. Do not move or rename files here. |
| `refresh/` | The redesign package and its evidence: per-page plans and shots (`ask/`, `coachhelm-read/`, `stats-home/`, ...), the design system (`refresh/DESIGN_LANGUAGE.md`, token tables generated from `src/clubhouse/styles/tokens.css`), and dated sweeps such as `refresh/redesign-ui-sweep-2026-11-06/`. | `DESIGN.md`, `src/clubhouse/**`, `docs/clubhouse/**`, `scripts/clubhouse/**`. |

## Where new screenshots go

- Machine-local captures (a quick look, a before/after you will not cite) go in
  `.helm/screenshots/`, which is ignored. They never need a commit.
- Evidence that a doc, PR or page contract cites goes in a dated folder under
  `design/refresh/`, named `<topic>-YYYY-MM-DD/` (for example
  `design/refresh/redesign-ui-sweep-2026-11-06/`). PNGs under `design/refresh/`
  are tracked on purpose (`.gitignore`); in most other folders `*.png` is ignored.
- Do not add images to `design/handoff/`: it is the received handoff, not a
  working folder.

Older images that live next to archived docs under `docs/archive/` stay there,
because those docs link them relatively.
