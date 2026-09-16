"""Before/after sheet for a Meridian spike (§121–122): rows = labels, columns = hole × preset.

Usage: python3 build-spike-sheet.py <canary-root> <viewport> <output.png> <labelA,labelB> <holes> <presets>
Example: python3 build-spike-sheet.py output/playwright/course-geometry/visual-system/canaries 390x844 \
  spike.png v2-material,v3-bunkers 7,11 Terrain,Side
"""
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw

root, viewport, output = Path(sys.argv[1]), sys.argv[2], Path(sys.argv[3])
labels, holes, presets = sys.argv[4].split(','), [int(h) for h in sys.argv[5].split(',')], sys.argv[6].split(',')
thumb_height = 520
cells, meta = {}, {}
for label in labels:
    report = json.loads((root / label / 'canaries.json').read_text())
    for capture in report['captures']:
        if capture['viewport'] != viewport or capture['hole'] not in holes or capture['preset'] not in presets:
            continue
        image = Image.open(root / label / capture['file'])
        ratio = thumb_height / image.height
        cells[(label, capture['hole'], capture['preset'])] = image.resize((round(image.width * ratio), thumb_height))
        meta[(label, capture['hole'], capture['preset'])] = capture['metadata']
columns = [(hole, preset) for hole in holes for preset in presets]
cell_width = max(image.width for image in cells.values()) + 16
sheet = Image.new('RGB', (cell_width * len(columns) + 16, (thumb_height + 44) * len(labels) + 40), '#1E2420')
draw = ImageDraw.Draw(sheet)
draw.text((12, 10), f"spike · {viewport} · {' vs '.join(labels)}", fill='#E8EDE6')
for row, label in enumerate(labels):
    for column, (hole, preset) in enumerate(columns):
        image = cells.get((label, hole, preset))
        if not image:
            continue
        x, y = 8 + column * cell_width, 40 + row * (thumb_height + 44)
        sheet.paste(image, (x, y))
        m = meta[(label, hole, preset)]
        draw.text((x, y + thumb_height + 4), f"{label} · H{hole} {preset} · draw {m.get('drawCalls')} · {m.get('visualStyleHash') or m.get('visualStyleVersion')}", fill='#C9D2C5')
        draw.text((x, y + thumb_height + 22), f"bunkers {m.get('visualBunkers', '—')} · artifact {m.get('visualArtifactHash', '—')}", fill='#8FA08A')
sheet.save(output)
print(output, sheet.size)
