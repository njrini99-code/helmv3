#!/usr/bin/env python3
"""List the hitches in an Instruments "Animation Hitches" trace.

  hitches.py <trace> [steps.log]

Prints each hitch: seconds from trace start, duration, process, cause, and
(with run.py's steps.log) the step that was running. Ends with a count.
"""
import datetime
import re
import subprocess
import sys
import xml.etree.ElementTree as ET


def export(*args):
    return subprocess.run(['xcrun', 'xctrace', 'export', *args], capture_output=True, text=True).stdout


def main(argv):
    if not argv or argv[0] in ('-h', '--help'):
        print(__doc__)
        return 0
    trace = argv[0]
    toc = export('--input', trace, '--toc')
    t0 = datetime.datetime.fromisoformat(re.search(r'<start-date>([^<]+)', toc).group(1)).timestamp()
    xml = export('--input', trace, '--xpath',
                 '/trace-toc/run[@number="1"]/data/table[@schema="hitches"]')
    root = ET.fromstring(xml)
    ids = {}

    # xctrace dedupes repeated values: the first carries id=, later ones ref= it.
    def val(el):
        if el is None:
            return ''
        if 'ref' in el.attrib:
            return ids.get(el.attrib['ref'], '')
        v = el.attrib.get('fmt') or (el.text or '')
        if 'id' in el.attrib:
            ids[el.attrib['id']] = v
        for c in el:
            val(c)
        return v

    steps = []
    if len(argv) > 1:
        with open(argv[1]) as f:
            for line in f:
                t, name = line.split(' ', 1)
                steps.append((float(t), name.strip()))

    count = 0
    for row in root.iter('row'):
        cols = list(row)
        vals = [val(e) for e in cols]
        raw = cols[0].text or ''
        if not raw and 'ref' in cols[0].attrib:
            raw = root.find(f".//*[@id='{cols[0].attrib['ref']}']").text
        s = int(raw) / 1e9
        running = [n for t, n in steps if t <= t0 + s]
        step = running[-1] if running else '-'
        print(f'{s:7.2f}s  {vals[1]:>10}  {vals[2][:28]:28}  step={step:24} {vals[7][:90]}')
        count += 1
    print(f'{count} hitch(es)')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
