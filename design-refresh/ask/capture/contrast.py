#!/usr/bin/env python3
"""Contrast table for the CoachHelm Ask redesign, read from the design page's own tokens.

Run: python3 capture/contrast.py > capture/contrast-table.txt
     python3 capture/contrast.py --page path/to/coachhelm-ask.html

It parses the light :root block and the :root[data-theme="dark"] block of redesign/coachhelm-ask.html,
composites translucent tokens over the surface they sit on, and prints WCAG 2.x ratios for every text
pair the page draws (and the chart marks that need 3:1). Text must reach 4.9:1 (the house target;
4.5:1 is the floor). Lines that miss are marked FLAG. Disabled controls, and the two pieces the design lead exempts
(the Undo ring track and the unlit Told coin), are listed with their reason but exempt.
Standard library only.
"""
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
page = HERE.parent / 'redesign' / 'coachhelm-ask.html'
if '--page' in sys.argv:
    page = Path(sys.argv[sys.argv.index('--page') + 1])
src = page.read_text(encoding='utf8')


def block(start_pat):
    m = re.search(start_pat, src)
    if not m:
        raise SystemExit(f'token block not found: {start_pat}')
    i = m.end()
    depth = 1
    j = i
    while depth:
        if src[j] == '{':
            depth += 1
        elif src[j] == '}':
            depth -= 1
        j += 1
    return src[i:j - 1]


def parse(body):
    out = {}
    for name, val in re.findall(r'--([\w-]+)\s*:\s*([^;]+);', body):
        out[name] = val.strip()
    return out


LIGHT = parse(block(r':root\{'))
DARK = {**LIGHT, **parse(block(r':root\[data-theme="dark"\]\{'))}


def rgba(v):
    """'#RRGGBB' or 'rgb(r g b/a)' -> (r, g, b, a) in 0..1."""
    v = v.strip()
    if v.startswith('#'):
        h = v[1:]
        return tuple(int(h[k:k + 2], 16) / 255 for k in (0, 2, 4)) + (1.0,)
    m = re.match(r'rgb\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*(?:/\s*([\d.]+))?\s*\)', v)
    if not m:
        raise ValueError(f'not a colour: {v}')
    r, g, b, a = m.groups()
    return (float(r) / 255, float(g) / 255, float(b) / 255, float(a) if a else 1.0)


def over(fg, bg):
    """Composite fg (with alpha) over an opaque bg."""
    a = fg[3]
    return tuple(f * a + b * (1 - a) for f, b in zip(fg[:3], bg[:3])) + (1.0,)


def fade(fg, op, bg):
    """A colour drawn at element opacity `op` over bg."""
    return over(fg[:3] + (fg[3] * op,), bg)


def lin(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def lum(c):
    r, g, b = (lin(x) for x in c[:3])
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def ratio(a, b):
    la, lb = sorted((lum(a), lum(b)), reverse=True)
    return (la + 0.05) / (lb + 0.05)


def C(T, spec):
    """Resolve a colour spec: a token name, a literal, or 'fg@surface' composites (alpha over surface)."""
    if spec.startswith('#') or spec.startswith('rgb'):
        return rgba(spec)
    return rgba(T[spec])


def surface(T, spec):
    """'card' | 'tint-acc>card' (translucent over card) | 'glass-strong>page' | literal."""
    parts = spec.split('>')
    col = C(T, parts[-1])
    for p in reversed(parts[:-1]):
        col = over(C(T, p), col)
    return col


# (label, fg, surface, kind, opacity) kind: text | large | mark | disabled ; opacity: element opacity on top of the surface
ROWS = [
    # card text
    ('Body text on card', 'ink', 'card', 'text', 1),
    ('Secondary text on card (step done label, meta, receipt sub)', 'ink2', 'card', 'text', 1),
    ('Tertiary text on card (done step detail, axis, hours)', 'ink3', 'card', 'text', 1),
    ('Body text on page (home greeting, history rows)', 'ink', 'page', 'text', 1),
    ('Secondary on page (scope line, home context line)', 'ink2', 'page', 'text', 1),
    ('Tertiary on page (desktop disclaimer, history "Today")', 'ink3', 'page', 'text', 1),
    ('Body text on well (pills, answer pills, mk chips)', 'ink', 'well', 'text', 1),
    ('Secondary on well (read chips, tags, Told row, scope chips)', 'ink2', 'well', 'text', 1),
    ('Tertiary on well (goal and strip axis labels)', 'ink3', 'well', 'text', 1),
    ('Secondary on track (busy blocks on the week grid)', 'ink2', 'track', 'text', 1),
    # semantic
    ('Loss figures on card', 'loss', 'card', 'text', 1),
    ('Loss on well (tied standings)', 'loss', 'well', 'text', 1),
    ('Gain figures on card', 'gain', 'card', 'text', 1),
    ('Accent links and labels on card (Open, Undo, hint, Change answers)', 'accent', 'card', 'text', 1),
    ('Accent on well (goal label)', 'accent', 'well', 'text', 1),
    ('Accent on accent tint over card (read chip on, Hypothesis tag, Draft chip done, location chip)', 'accent', 'tint-acc>card', 'text', 1),
    ('Ink on accent tint over card (picked option, chosen folder)', 'ink', 'tint-acc>card', 'text', 1),
    ('Accent on accent tint over well (stage bar current)', 'accent', 'tint-acc>card', 'text', 1),
    ('Under par red on card (hole strip only)', 'flag', 'card', 'mark', 1),
    # buttons and bubbles
    ('Primary button label (onbtn on btn)', 'onbtn', 'btn', 'text', 1),
    ('Event block label on the week grid (onbtn on btn, 11px)', 'onbtn', 'btn', 'text', 1),
    ('Event block time (onbtn at 85% on btn)', 'onbtn', 'btn', 'text', 0.85),
    ('Capsule label (accent on tint over card)', 'accent', 'tint-acc>card', 'text', 1),
    ('User bubble text, top of gradient', 'onuser', 'userbub', 'text', 1),
    ('User bubble text, bottom of gradient', 'onuser', 'userbub2', 'text', 1),
    ('Segmented on label (#F7F4EA on #155A39)', '#F7F4EA', '#155A39', 'text', 1),
    ('Segmented on label (#F7F4EA on #1d6a45, top of shade)', '#F7F4EA', '#1d6a45', 'text', 1),
    # glass
    ('Composer text on glass over page', 'ink', 'glass-strong>page', 'text', 1),
    ('Composer placeholder on glass over page', 'ink3', 'glass-strong>page', 'text', 1),
    ('Desktop top bar search placeholder (ink3 on card)', 'ink3', 'card', 'text', 1),
    # feature green
    ('Feature ink on feature card (pulse, plan hero)', 'fink', 'feature', 'text', 1),
    ('Feature secondary on feature card (pulse small, legend)', 'fink2', 'feature', 'text', 1),
    # green frame
    ('Green bar title (onframe on frame)', 'onframe', 'frame', 'text', 1),
    ('Green bar icons and desktop nav (onframe2 on frame)', 'onframe2>frame', 'frame', 'text', 1),
    ('Desktop nav group label (240 233 214 at 72% on frame)', 'rgb(240 233 214/.72)>frame', 'frame', 'text', 1),
    ('Desktop nav active (#0a331f on 95% ivory over frame)', '#0a331f', 'rgb(244 238 221/.95)>frame', 'text', 1),
    ('Badge count (#1C1B18 on champ)', '#1C1B18', 'champ', 'text', 1),
    ('Lock screen time and date (onframe2 on frame2)', 'onframe2>frame2', 'frame2', 'text', 1),
    # lock screen banner (fixed light in both themes)
    ('Lock banner title (#1C1B18 on 90% ivory over frame)', '#1C1B18', 'rgb(253 251 247/.9)>frame', 'text', 1),
    ('Lock banner meta (#46433D on 90% ivory over frame)', '#46433D', 'rgb(253 251 247/.9)>frame', 'text', 1),
    ('Lock banner Urgent (#8A4C00 on 90% ivory over frame)', '#8A4C00', 'rgb(253 251 247/.9)>frame', 'text', 1),
    # coins (white initials on year and player fills; same in both themes)
    ('Coin initials #fdfcf8 on #3D6787 (JO)', '#fdfcf8', '#3D6787', 'text', 1),
    ('Coin initials #fdfcf8 on #1F6B45 (TH)', '#fdfcf8', '#1F6B45', 'text', 1),
    ('Coin initials #fdfcf8 on #2F6F73 (JB)', '#fdfcf8', '#2F6F73', 'text', 1),
    ('Coin initials #fdfcf8 on #8A5A2B (EL)', '#fdfcf8', '#8A5A2B', 'text', 1),
    ('Coin initials #fdfcf8 on #5B5F8F (MA)', '#fdfcf8', '#5B5F8F', 'text', 1),
    ('Coin initials #fdfcf8 on #9A5700 (AN)', '#fdfcf8', '#9A5700', 'text', 1),
    ('Coin initials #fdfcf8 on #6B675F (SA)', '#fdfcf8', '#6B675F', 'text', 1),
    ('Coach mark CR #F4F1E8 on #155A39', '#F4F1E8', '#155A39', 'text', 1),
    # dimmed states (v12: no text drops opacity; the cancelled draft and seated coins lose colour instead)
    ('Cancelled draft, secondary (ink2 on well, saturate(0))', 'ink2', 'well', 'text', ('sat', 0)),
    ('Cancelled draft, title (ink on well, saturate(0))', 'ink', 'well', 'text', ('sat', 0)),
    ('Cancelled draft, loss mark (lossfill on well, saturate(0))', 'lossfill', 'well', 'mark', ('sat', 0)),
    ('Cancelled line (ink2 on card)', 'ink2', 'card', 'text', 1),
    ('Paused composer placeholder (ink3 on strong glass, box at full opacity)', 'ink3', 'glass-strong>page', 'text', 1),
    ('Lineup standings row already seated (name in ink2 on well)', 'ink2', 'well', 'text', 1),
    ('Seated coin #fdfcf8 on #2F6F73 at saturate(.25) (JB)', '#fdfcf8', '#2F6F73', 'text', ('sat', 0.25)),
    ('Seated coin #fdfcf8 on #3D6787 at saturate(.25) (JO)', '#fdfcf8', '#3D6787', 'text', ('sat', 0.25)),
    ('Seated coin #fdfcf8 on #1F6B45 at saturate(.25) (TH)', '#fdfcf8', '#1F6B45', 'text', ('sat', 0.25)),
    ('Seated coin #fdfcf8 on #8A5A2B at saturate(.25) (EL)', '#fdfcf8', '#8A5A2B', 'text', ('sat', 0.25)),
    ('Seated coin #fdfcf8 on #5B5F8F at saturate(.25) (MA)', '#fdfcf8', '#5B5F8F', 'text', ('sat', 0.25)),
    ('Seated coin #fdfcf8 on #9A5700 at saturate(.25) (AN)', '#fdfcf8', '#9A5700', 'text', ('sat', 0.25)),
    ('Told coin before it lights (initials at 35%)', '#fdfcf8', '#3D6787', 'exempt:the unlit coin is a transitional frame', 0.35),
    ('Folder list document row (ink2 on card, full opacity)', 'ink2', 'card', 'text', 1),
    ('Folder list document icon (ink3 at 70% on card)', 'ink3', 'card', 'mark', 0.7),
    ('Cancel after the confirm press (disabled, 50%)', 'ink2', 'card', 'disabled', 0.5),
    ('Back on the first brief question (disabled, 40%)', 'ink2', 'card', 'disabled', 0.4),
    # chart marks (3:1)
    ('Loss fill on track', 'lossfill', 'track', 'mark', 1),
    ('Gain fill on track', 'gainfill', 'track', 'mark', 1),
    ('Neutral fill on track', 'neutral', 'track', 'mark', 1),
    ('Loss fill on card (dots, tees)', 'lossfill', 'card', 'mark', 1),
    ('Gain fill on card', 'gainfill', 'card', 'mark', 1),
    ('Zero rule and season tick on card', 'zero', 'card', 'mark', 1),
    ('Active step dot (accent on card)', 'accent', 'card', 'mark', 1),
    ('Failed step ring (loss on card)', 'loss', 'card', 'mark', 1),
    ('Write head caret (accent on well)', 'accent', 'well', 'mark', 1),
    ('Undo ring drain (accent on card)', 'accent', 'card', 'mark', 1),
    ('Undo ring track against card', 'track', 'card', 'exempt:track is decorative (the drain carries the meaning, 8.15/8.45)', 1),
    ('Busy dot on the week (lossfill on card)', 'lossfill', 'card', 'mark', 1),
    ('Paused send button icon (ink3 on track)', 'ink3', 'track', 'mark', 1),
]


def saturate(c, s):
    """CSS filter saturate(s) on an sRGB colour (the filter matrix from Filter Effects 1)."""
    r, g, b, a = c
    m = [[0.213 + 0.787 * s, 0.715 - 0.715 * s, 0.072 - 0.072 * s],
         [0.213 - 0.213 * s, 0.715 + 0.285 * s, 0.072 - 0.072 * s],
         [0.213 - 0.213 * s, 0.715 - 0.715 * s, 0.072 + 0.928 * s]]
    out = [min(1, max(0, row[0] * r + row[1] * g + row[2] * b)) for row in m]
    return (*out, a)

TEXT_MIN, FLOOR, MARK_MIN = 4.9, 4.5, 3.0


def run(name, T):
    lines = [f'## {name}', f'{"Pair":86s} {"fg":>9s} {"ratio":>6s}  result']
    flags = []
    for label, fg_s, bg_s, kind, op in ROWS:
        bg = surface(T, bg_s)
        if '>' in fg_s:
            fg = surface(T, fg_s)
        else:
            fg = C(T, fg_s)
            if fg[3] < 1:
                fg = over(fg, bg)
        if isinstance(op, tuple):
            fg, bg = saturate(fg, op[1]), saturate(bg, op[1])
        elif op < 1:
            fg = fade(fg, op, bg)
        r = ratio(fg, bg)
        hexfg = '#%02X%02X%02X' % tuple(round(x * 255) for x in fg[:3])
        if kind == 'disabled':
            res = 'exempt (disabled)'
        elif kind.startswith('exempt:'):
            res = f'exempt: {kind[7:]}'
        elif kind == 'mark':
            res = 'ok (3:1 mark)' if r >= MARK_MIN else 'FLAG mark under 3:1'
        elif r >= TEXT_MIN:
            res = 'ok'
        elif r >= FLOOR:
            res = 'FLAG under 4.9 target (passes 4.5 floor)'
        else:
            res = 'FLAG under 4.5 floor'
        if res.startswith('FLAG'):
            flags.append(f'{name}: {label} {r:.2f}')
        lines.append(f'{label:86s} {hexfg:>9s} {r:6.2f}  {res}')
    return lines, flags


out, allflags = [], []
for nm, T in (('Light', LIGHT), ('Dark', DARK)):
    ls, fl = run(nm, T)
    out += ls + ['']
    allflags += fl
out.append(f'## Flags ({len(allflags)})')
out += [f'- {f}' for f in allflags] or ['- none']
print(f'# Contrast from {page.name} tokens (WCAG 2.x). Text target {TEXT_MIN}:1, floor {FLOOR}:1, marks {MARK_MIN}:1.\n')
print('\n'.join(out))
