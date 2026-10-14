#!/usr/bin/env python3
"""Drive Clubhouse on a cabled iPhone through a fixed journey, logging each step.

  run.py <plan> [--repeat N]

Plans: sections, calendar, messages, keyboard, bell, account, all.
Each step's wall time goes to $HELM_PHONE_OUT/steps.log so hitches.py can map
Instruments hitches to steps. Screenshots go to $HELM_PHONE_OUT.

Start state: Clubhouse open in Mobile Safari, signed in (you sign in on the
phone yourself), the top bar visible. Taps use iPhone 16 Pro points (402 wide).

HELM_PHONE_THREAD   label (or part of it) of the Messages thread to open
                    (default: the first thread row). Only threads whose members are
                    all test accounts may be used by the `keyboard` plan, and
                    it never presses Send.
"""
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import wda  # noqa: E402

TITLE = (60, 84)
RIGHT = (372, 84)
S = None
LOG = None


def log(s):
    LOG.write(f'{time.time():.2f} {s}\n')
    LOG.flush()
    print(f'{time.strftime("%X")} {s}')


def find(label, contains=False):
    q = f"label CONTAINS '{label}'" if contains else f"label == '{label}'"
    # Prefer a control (link, button, tab, radio): the label's static text is a child and not itself tappable.
    ctl = f"({q}) AND type IN {{'XCUIElementTypeLink','XCUIElementTypeButton','XCUIElementTypeTab','XCUIElementTypeRadioButton','XCUIElementTypeSegmentedControl'}}"
    els = wda.req('POST', f'/session/{S}/elements', {'using': 'predicate string', 'value': ctl})['value']
    if not els:
        els = wda.req('POST', f'/session/{S}/elements', {'using': 'predicate string', 'value': q})['value']
    return els[0]['ELEMENT'] if els else None


def rect(e):
    return wda.req('GET', f'/session/{S}/element/{e}/rect')['value']


def click(label, contains=False):
    """Tap the element with this label at its hittable point. A swipe-then-tap by coordinates raced the strip's
    momentum and hit a neighbour."""
    for _ in range(4):
        try:
            e = find(label, contains)
            if not e:
                log(f'MISSING {label}')
                return False
            # Web content: XCUITest won't scroll a horizontal strip itself. Drag it (with a hold before lifting, so it
            # doesn't fling) until the element is hittable, then let XCUITest tap it.
            for _ in range(5):
                if wda.req('GET', f'/session/{S}/element/{e}/attribute/hittable')['value']:
                    break
                r = rect(e)
                cy = r['y'] + r['height'] / 2
                x1, x2 = (300, 120) if r['x'] > 150 else (120, 300)
                wda.act(S, [{'type': 'pointerMove', 'duration': 0, 'x': x1, 'y': cy}, {'type': 'pointerDown'},
                            {'type': 'pointerMove', 'duration': 500, 'x': x2, 'y': cy}, {'type': 'pause', 'duration': 300},
                            {'type': 'pointerUp'}])
                time.sleep(0.6)
            wda.req('POST', f'/session/{S}/element/{e}/click', {})
            return True
        except Exception as ex:  # WDA drops a request now and then while the page animates
            log(f'retry {label} {ex}')
            time.sleep(0.5)
    return False


def step(name, fn, wait=2.0, snap=True):
    log(name)
    fn()
    time.sleep(wait)
    if snap:
        wda.shot(name)


def go(section):
    step('strip-open', lambda: wda.tap(S, *TITLE), 1.0, False)
    log(f'switch-{section}')
    click(section)
    time.sleep(0.35)
    wda.shot(f'mid-{section}')
    time.sleep(2.6)
    wda.shot(f'switch-{section}')


def open_thread():
    label = os.environ.get('HELM_PHONE_THREAD')
    if label:
        return click(label, True)
    els = wda.req('POST', f'/session/{S}/elements',
                  {'using': 'class chain', 'value': '**/XCUIElementTypeLink'})['value']
    rows = [e['ELEMENT'] for e in els if rect(e['ELEMENT'])['y'] > 140]
    if not rows:
        log('MISSING thread row')
        return False
    r = rect(rows[0])
    wda.tap(S, r['x'] + r['width'] / 2, r['y'] + r['height'] / 2)
    return True


def plan_sections():
    for s in ['Roster', 'Stats', 'Team Hub', 'Messages', 'Calendar', 'Home']:
        go(s)


def plan_calendar():
    go('Calendar')
    for v in ['Month', 'List', 'Day']:
        step(f'view-{v}', lambda v=v: click(v), 1.2, False)
    # The phone pages by week (CalendarPhone), the desktop by month.
    for i in range(5):
        step(f'next-week-{i}', lambda: click('Next week'), 0.5, False)
    for i in range(5):
        step(f'prev-week-{i}', lambda: click('Previous week'), 0.5, False)
    step('newevent-open', lambda: wda.tap(S, *RIGHT), 1.5)
    step('newevent-close-x', lambda: click('Close'), 1.5, False)
    step('newevent-open2', lambda: wda.tap(S, *RIGHT), 1.5, False)
    step('newevent-swipe-down', lambda: wda.swipe(S, 201, 330, 201, 830, 220), 1.5, False)


def plan_messages():
    go('Messages')
    time.sleep(2)
    step('thread-open', open_thread, 2.0)
    step('thread-scroll-up', lambda: wda.swipe(S, 201, 300, 201, 750, 250), 1.2, False)
    step('thread-scroll-down', lambda: wda.swipe(S, 201, 750, 201, 200, 250), 1.2, False)
    step('thread-back', lambda: click('Back'), 2.0, False)
    step('thread-open2', open_thread, 2.0, False)
    step('thread-edge-swipe', lambda: wda.swipe(S, 3, 450, 330, 450, 250), 2.0)
    step('compose-open', lambda: wda.tap(S, *RIGHT), 1.5)
    step('compose-close', lambda: click('Cancel'), 1.5, False)


def plan_keyboard():
    # Typing and the keyboard rise; never sends.
    go('Messages')
    time.sleep(2)
    step('thread-open', open_thread, 2.0, False)
    e = find('Message', True)
    if not e:
        log('MISSING composer')
        return
    r = rect(e)
    step('composer-focus', lambda: wda.tap(S, r['x'] + 40, r['y'] + r['height'] / 2), 1.2)
    step('type', lambda: wda.req('POST', f'/session/{S}/wda/keys',
                                 {'value': list('Checking the keyboard and the thread scroll')}), 1.0)
    step('thread-scroll-kb', lambda: wda.swipe(S, 201, 250, 201, 450, 250), 1.0, False)
    step('composer-blur', lambda: wda.tap(S, 201, 200), 1.2)


def plan_bell():
    go('Home')
    step('bell-open', lambda: wda.tap(S, 374, 84), 1.5)
    step('bell-close', lambda: wda.tap(S, 374, 84), 1.5, False)


def plan_account():
    step('strip-open-acct', lambda: wda.tap(S, *TITLE), 1.0, False)
    step('strip-scroll', lambda: wda.swipe(S, 350, 134, 20, 134, 200), 0.8, False)
    step('account-open', lambda: click('Account', True), 1.5)
    step('account-close-swipe', lambda: wda.swipe(S, 201, 400, 201, 850, 220), 1.5, False)


PLANS = {'sections': plan_sections, 'calendar': plan_calendar, 'messages': plan_messages,
         'keyboard': plan_keyboard, 'bell': plan_bell, 'account': plan_account}


def main(argv):
    global S, LOG
    if not argv or argv[0] in ('-h', '--help'):
        print(__doc__)
        return 0
    plan = argv[0]
    if plan != 'all' and plan not in PLANS:
        print(f'unknown plan: {plan}\n{__doc__}', file=sys.stderr)
        return 2
    repeat = int(argv[argv.index('--repeat') + 1]) if '--repeat' in argv else 1
    os.makedirs(wda.OUT, exist_ok=True)
    LOG = open(os.path.join(wda.OUT, 'steps.log'), 'a')
    S = wda.session()
    for n in range(repeat):
        log(f'run-{n + 1}')
        for name in (PLANS if plan == 'all' else [plan]):
            PLANS[name]()
    log('end')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
