# Clubhouse separator faces

`ch-separator-400.otf` and `ch-separator-700.otf` hold one glyph each: the middle dot (U+00B7) from Instrument Sans
(weights 400 and 700), with 170 units of side bearing per side added (L-091, 2026-11-18). Instrument Sans draws the dot
with no side bearings, so "4 rounds · avg 74.7" set the dot against its words; these faces sit first in
`--ch-font-sans` with `unicode-range: U+00B7`, so only the dot comes from them and every other character is Instrument Sans.

Derived from Instrument Sans, Copyright 2022 The Instrument Sans Project Authors
(https://github.com/Instrument/instrument-sans), under the SIL Open Font License 1.1. Renamed "Clubhouse Separator" as
the license asks of modified versions.

Rebuild: opentype.js, outside the repo — load the Instrument Sans static TTF for the weight, move the `periodcentered`
outline right by 170 - its left edge, set its advance to the dot's width + 340, and write a font holding `.notdef` and that glyph.
