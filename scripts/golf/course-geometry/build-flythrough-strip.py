"""Four-frame strip for one flythrough capture (renderer redesign §18).

Usage: python3 build-flythrough-strip.py <flythrough-dir> <hole-NN>
Reads <dir>/<hole-NN>-flythrough.json and the stills it names; writes
<dir>/<hole-NN>-strip.png with the state and telemetry under each frame.
"""
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw

directory, tag = Path(sys.argv[1]), sys.argv[2]
report = json.loads((directory / f'{tag}-flythrough.json').read_text())
frames = [(f, Image.open(directory / f['file']).convert('RGB')) for f in report['frames']]
height = 520
thumbs = [(f, im.resize((round(im.width * height / im.height), height))) for f, im in frames]
width = sum(im.width for _, im in thumbs) + 12 * (len(thumbs) + 1)
sheet = Image.new('RGB', (width, height + 64), '#1E2420')
draw = ImageDraw.Draw(sheet)
draw.text((12, 8), f"{report['course']} hole {report['hole']} · {report['viewport']} · {' -> '.join(report['states'])}", fill='#E8EDE6')
x = 12
for f, im in thumbs:
    sheet.paste(im, (x, 28))
    draw.text((x, height + 36), f"{f['state']} ({f.get('area', 'hole')}) · pitch {f.get('pitch')} · {f.get('drawCalls')} draws · {f.get('renderTriangles')} tri", fill='#C9D2C4')
    x += im.width + 12
sheet.save(directory / f'{tag}-strip.png')
print(directory / f'{tag}-strip.png')
