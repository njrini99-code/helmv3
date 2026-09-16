"""Contact sheet for one canary label (master plan §8): rows = holes, columns = presets.

Usage: python3 build-canary-sheet.py <canary-dir> <viewport> <output.png>
Example: python3 build-canary-sheet.py output/playwright/course-geometry/visual-system/canaries/v0-baseline 390x844 sheet.png
"""
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw

directory, viewport, output = Path(sys.argv[1]), sys.argv[2], Path(sys.argv[3])
report = json.loads((directory / 'canaries.json').read_text())
captures = [c for c in report['captures'] if c['viewport'] == viewport]
holes = sorted({c['hole'] for c in captures})
presets = [p for p in report['presets'] if any(c['preset'] == p for c in captures)]
thumb_height = 360
cells = {}
for capture in captures:
    image = Image.open(directory / capture['file'])
    ratio = thumb_height / image.height
    cells[(capture['hole'], capture['preset'])] = (image.resize((round(image.width * ratio), thumb_height)), capture['metadata'])
cell_width = max(image.width for image, _ in cells.values()) + 16
sheet = Image.new('RGB', (cell_width * len(presets) + 16, (thumb_height + 44) * len(holes) + 40), '#1E2420')
draw = ImageDraw.Draw(sheet)
draw.text((12, 10), f"{report['label']} · {report['course']} · {viewport} · package {report['packageHash'][:8]}", fill='#E8EDE6')
for row, hole in enumerate(holes):
    for column, preset in enumerate(presets):
        image, meta = cells[(hole, preset)]
        x, y = 8 + column * cell_width, 40 + row * (thumb_height + 44)
        sheet.paste(image, (x, y))
        summary = f"H{hole} {preset} · {meta.get('terrainProjection') or 'ortho'} · draw {meta.get('drawCalls')} · tri {meta.get('renderTriangles')} · trees {meta.get('terrainTrees')}"
        draw.text((x, y + thumb_height + 4), summary, fill='#C9D2C4')
        draw.text((x, y + thumb_height + 22), f"style {meta.get('visualStyleVersion') or 'n/a'} · dpr {meta.get('pixelRatio')} · shadow {meta.get('shadowMapSize') or 'n/a'}", fill='#8FA08A')
output.parent.mkdir(parents=True, exist_ok=True)
sheet.save(output)
print(output, sheet.size)
