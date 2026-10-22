# Clubhouse cross-page changes

One file per change to a shared piece: a file under `src/clubhouse/ui`, `lib`
or `styles` that no page owns, or a component several pages name. A change to
one page goes in that page's own `docs/clubhouse/pages/<P###-slug>/changes/`.

Name the file `<YYYY-MM-DD>-<slug>.md` and write one entry in it, the
`## YYYY-MM-DD` block from `docs/clubhouse/templates/CHANGELOG.md`. Each branch
adds its own file, so parallel branches never conflict on a log.
`clubhouse:check` accepts a new file here, or an edit to
`docs/clubhouse/CHANGELOG.md`, which keeps the history from before 2026-10-22.
