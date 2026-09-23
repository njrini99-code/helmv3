"""Contact sheet for a layout's player captures.

Usage: python3 build-player-sheet.py <player-dir> <viewport> <output.png> [--columns N] [--thumb-height PX]
The directory holds player-summary.json (written by the factory's
layout.player.aggregate, or synthesized by `ship`) whose rows name each
capture file relative to it.

With several views per hole the sheet is rows = holes, columns = views.
With one view per hole (ship's captures) a single column of 18 phone-shaped
thumbnails is unreadable, so the holes wrap into a grid of `--columns`
(default 6 -> 6x3 for 18 holes), in hole order, left to right.
"""
import argparse
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

parser = argparse.ArgumentParser()
parser.add_argument('directory', type=Path)
parser.add_argument('viewport')
parser.add_argument('output', type=Path)
parser.add_argument('--columns', type=int, default=6, help='grid width when there is one view per hole (default 6)')
parser.add_argument('--thumb-height', type=int, default=640)
args = parser.parse_args()

summary = json.loads((args.directory / 'player-summary.json').read_text())
rows = [r for r in summary['rows'] if r['capture'].split('-', 1)[0] == args.viewport]
holes = sorted({r['hole'] for r in rows})
views = sorted({r['capture'] for r in rows})
thumb_height = args.thumb_height
title_font = ImageFont.load_default(size=26)
label_font = ImageFont.load_default(size=17)
label_height = 58
cells = {}
for row in rows:
    image = Image.open(args.directory / row['file'])
    ratio = thumb_height / image.height
    cells[(row['hole'], row['capture'])] = (image.resize((round(image.width * ratio), thumb_height), Image.Resampling.LANCZOS), row)
cell_width = max((image.width for image, _ in cells.values()), default=thumb_height // 2) + 16

# (hole, view) -> (column, row) on the sheet.
if len(views) == 1:
    columns = max(1, min(args.columns, len(holes)))
    placement = {(hole, views[0]): (i % columns, i // columns) for i, hole in enumerate(holes)}
    grid_rows = -(-len(holes) // columns)
else:
    columns = len(views)
    placement = {(hole, view): (c, r) for r, hole in enumerate(holes) for c, view in enumerate(views)}
    grid_rows = len(holes)

header = 56
sheet = Image.new('RGB', (cell_width * columns + 16, (thumb_height + label_height) * grid_rows + header), '#1E2420')
draw = ImageDraw.Draw(sheet)
draw.text((12, 14), f"{summary['layoutId']} · player view · {args.viewport} · package {str(summary.get('packageHash'))[:8]}",
          fill='#E8EDE6', font=title_font)
for (hole, view), (c, r) in placement.items():
    if (hole, view) not in cells:
        continue
    image, row = cells[(hole, view)]
    x, y = 8 + c * cell_width, header + r * (thumb_height + label_height)
    sheet.paste(image, (x, y))
    draw.text((x, y + thumb_height + 4), f"H{hole} {row['view']} · draw {row.get('drawCalls')}/{row.get('drawCallBudget') or '?'} {row.get('drawCallStatus') or ''}",
              fill='#C9D2C4', font=label_font)
    draw.text((x, y + thumb_height + 26), f"tri {row.get('renderTriangles')} · chrome {len(row.get('chrome') or [])}"
              + (f" · {len(row['errors'])} page error(s)" if row.get('errors') else ''), fill='#8FA08A', font=label_font)
args.output.parent.mkdir(parents=True, exist_ok=True)
sheet.save(args.output)
print(args.output, sheet.size)
