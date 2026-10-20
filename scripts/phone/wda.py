#!/usr/bin/env python3
"""Drive a cabled iPhone through WebDriverAgent (see scripts/phone/README.md).

  wda.py shot <name>                  save a screenshot to $HELM_PHONE_OUT/<name>.png
  wda.py tap <x> <y>                  tap in points
  wda.py swipe <x1> <y1> <x2> <y2> [ms]
  wda.py type <text>                  type into the focused field
  wda.py size                         window size in points
  wda.py safari                       bring Mobile Safari to the front

Reads HELM_WDA_URL (default http://127.0.0.1:8100, the iproxy port) and
HELM_PHONE_OUT (default $TMPDIR/helm-phone). Also importable: run.py uses it.
"""
import base64
import json
import os
import sys
import tempfile
import urllib.request

WDA = os.environ.get('HELM_WDA_URL', 'http://127.0.0.1:8100')
OUT = os.environ.get('HELM_PHONE_OUT', os.path.join(tempfile.gettempdir(), 'helm-phone'))


def req(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(WDA + path, method=method, data=data, headers={'Content-Type': 'application/json'})
    return json.load(urllib.request.urlopen(r, timeout=60))


def session():
    s = req('GET', '/status').get('sessionId')
    return s or req('POST', '/session', {'capabilities': {'alwaysMatch': {}}})['sessionId']


def act(s, chain):
    req('POST', f'/session/{s}/actions', {'actions': [
        {'type': 'pointer', 'id': 'f', 'parameters': {'pointerType': 'touch'}, 'actions': chain}]})


def tap(s, x, y):
    act(s, [{'type': 'pointerMove', 'duration': 0, 'x': x, 'y': y}, {'type': 'pointerDown'},
            {'type': 'pause', 'duration': 60}, {'type': 'pointerUp'}])


def swipe(s, x1, y1, x2, y2, ms=300):
    act(s, [{'type': 'pointerMove', 'duration': 0, 'x': x1, 'y': y1}, {'type': 'pointerDown'},
            {'type': 'pointerMove', 'duration': ms, 'x': x2, 'y': y2}, {'type': 'pointerUp'}])


def shot(name):
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, f'{name}.png')
    with open(path, 'wb') as f:
        f.write(base64.b64decode(req('GET', '/screenshot')['value']))
    return path


def main(argv):
    if not argv or argv[0] in ('-h', '--help'):
        print(__doc__)
        return 0
    cmd, args = argv[0], argv[1:]
    if cmd == 'shot':
        print(shot(args[0]))
    elif cmd == 'size':
        print(req('GET', f'/session/{session()}/window/size')['value'])
    elif cmd == 'tap':
        tap(session(), float(args[0]), float(args[1]))
    elif cmd == 'swipe':
        x1, y1, x2, y2 = map(float, args[:4])
        swipe(session(), x1, y1, x2, y2, int(args[4]) if len(args) > 4 else 300)
    elif cmd == 'type':
        req('POST', f'/session/{session()}/wda/keys', {'value': list(args[0])})
    elif cmd == 'safari':
        req('POST', f'/session/{session()}/wda/apps/activate', {'bundleId': 'com.apple.mobilesafari'})
    else:
        print(f'unknown command: {cmd}\n{__doc__}', file=sys.stderr)
        return 2
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
