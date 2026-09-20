"""Contact sheet for a layout's player captures: rows = holes, columns = views of one viewport.

Usage: python3 build-player-sheet.py <player-dir> <viewport> <output.png>
The directory holds player-summary.json (written by the factory's
layout.player.aggregate) whose rows name each capture file relative to it.
"""
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw

directory, viewport, output = Path(sys.argv[1]), sys.argv[2], Path(sys.argv[3])
summary = json.loads((directory / 'player-summary.json').read_text())
rows = [r for r in summary['rows'] if r['capture'].split('-', 1)[0] == viewport]
holes = sorted({r['hole'] for r in rows})
views = sorted({r['capture'] for r in rows})
thumb_height = 360
cells = {}
for row in rows:
    image = Image.open(directory / row['file'])
    ratio = thumb_height / image.height
    cells[(row['hole'], row['capture'])] = (image.resize((round(image.width * ratio), thumb_height)), row)
cell_width = max(image.width for image, _ in cells.values()) + 16
sheet = Image.new('RGB', (cell_width * len(views) + 16, (thumb_height + 44) * len(holes) + 40), '#1E2420')
draw = ImageDraw.Draw(sheet)
draw.text((12, 10), f"{summary['layoutId']} · player view · {viewport} · package {str(summary.get('packageHash'))[:8]}", fill='#E8EDE6')
for r, hole in enumerate(holes):
    for c, view in enumerate(views):
        if (hole, view) not in cells:
            continue
        image, row = cells[(hole, view)]
        x, y = 8 + c * cell_width, 40 + r * (thumb_height + 44)
        sheet.paste(image, (x, y))
        draw.text((x, y + thumb_height + 4), f"H{hole} {row['view']} · draw {row.get('drawCalls')}/{row.get('drawCallBudget') or '?'} {row.get('drawCallStatus') or ''} · tri {row.get('renderTriangles')}", fill='#C9D2C4')
        draw.text((x, y + thumb_height + 22), f"chrome {len(row.get('chrome') or [])} controls" + (f" · {len(row['errors'])} page error(s)" if row.get('errors') else ''), fill='#8FA08A')
output.parent.mkdir(parents=True, exist_ok=True)
sheet.save(output)
print(output, sheet.size)
