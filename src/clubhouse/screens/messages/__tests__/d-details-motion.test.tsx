import { act, cleanup, render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pollReminderLine } from '@/lib/golf/message-polls';
import { chSpringCurve } from '../../../lib/motion';
import { HelloCard } from '../HelloCard';
import { MUTE_CHOICES, MuteMenu, detailsLine, forgetSigned, muteToast, signedOnce, tokenBeat, usePopIn } from '../details-v2';
import { durationLabel, fileSubline, fileTypeLabel } from '../files';
import { faceOrder, pollHeadWords, soleLeader } from '../polls';
import { MS_BEATS } from '../motion/messages-motion';

/**
 * Package D motion and rules: MOT-DET-2/3, MOT-EMP-2/3, MOT-POLL, with Reduce Motion per id. jsdom has no Web Animations, so
 * `Element.prototype.animate` is a spy and the keyframes, length and easing are asserted.
 */
const reduce = { current: false };
vi.mock('../../../lib/reduced-motion', () => ({ useChReducedMotion: () => reduce.current }));
vi.mock('../../../ui/Toast', () => ({ useToast: () => vi.fn() }));
vi.mock('../../../lib/haptics', () => ({ haptic: vi.fn() }));

let animate: ReturnType<typeof vi.fn>;
beforeEach(() => {
  reduce.current = false;
  animate = vi.fn(() => ({ onfinish: null, cancel: vi.fn() }));
  Element.prototype.animate = animate as never;
});
afterEach(() => {
  cleanup();
  forgetSigned();
});

const css = readFileSync(resolve(process.cwd(), 'src/clubhouse/styles/messages-details.css'), 'utf8');

describe('MOT-DET-3: the mute menu and the quick action', () => {
  it('the menu grows 0.8 > 1 with opacity on the lift spring from its corner; Reduce Motion is a fade', () => {
    render(<MuteMenu anchor={{ left: 10, top: 20, above: true }} onPick={vi.fn()} onClose={vi.fn()} />);
    const [frames, opts] = animate.mock.calls[0]!;
    expect(frames).toEqual([{ transform: 'scale(0.8)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }]);
    expect(opts.duration).toBe(chSpringCurve('lift').ms);
    expect(opts.easing).toBe(chSpringCurve('lift').linear);
    expect(screen.getByRole('menu').style.transformOrigin).toBe('0 100%');
    cleanup();
    animate.mockClear();
    reduce.current = true;
    render(<MuteMenu onPick={vi.fn()} onClose={vi.fn()} />);
    const [rf, ro] = animate.mock.calls[0]!;
    expect(rf).toEqual([{ opacity: 0 }, { opacity: 1 }]);
    expect(ro.easing).toBe('linear');
  });

  it('offers the three lengths as drawn and leaves on a 160 ms fade before it picks', async () => {
    expect(MUTE_CHOICES.map((c) => c.label)).toEqual(['For 8 hours', 'For a week', 'Until I turn it on']);
    const onPick = vi.fn();
    render(<MuteMenu onPick={onPick} onClose={vi.fn()} />);
    animate.mockClear();
    await userEvent.setup().click(screen.getByRole('menuitem', { name: 'For a week' }));
    const [frames, opts] = animate.mock.calls[0]!;
    expect(frames[1]).toEqual({ opacity: 0 });
    expect(opts.duration).toBe(MS_BEATS.fillInk);
    expect(MS_BEATS.fillInk).toBe(160);
    await act(async () => void (await new Promise((r) => setTimeout(r, 260))));
    expect(onPick).toHaveBeenCalledWith(24 * 7);
  });

  it('one toast per choice, in the artifact’s words', () => {
    expect(muteToast(true, 8)).toBe('Muted for 8 hours');
    expect(muteToast(true, 168)).toBe('Muted for a week');
    expect(muteToast(true, null)).toBe('Muted until I turn it on');
    expect(muteToast(false, null)).toBe('Unmuted');
  });

  it('the tile pops 0.92 > 1 on pop; nothing moves under Reduce Motion', () => {
    const el = document.createElement('button');
    const { result } = renderHook(() => usePopIn());
    result.current(el, 0.92);
    expect(animate.mock.calls[0]![0]).toEqual([{ transform: 'scale(0.92)' }, { transform: 'scale(1)' }]);
    expect(animate.mock.calls[0]![1].duration).toBe(chSpringCurve('pop').ms);
    animate.mockClear();
    reduce.current = true;
    const r2 = renderHook(() => usePopIn());
    r2.result.current(el, 0.92);
    expect(animate).not.toHaveBeenCalled();
  });

  it('the header says Muted', () => {
    const conv = { group: false, subtitle: 'Junior', memberCount: 2 } as never;
    expect(detailsLine(conv, 'Demo University Golf', true)).toBe('Junior · Demo University Golf · Muted');
    expect(detailsLine(conv, 'Demo University Golf')).toBe('Junior · Demo University Golf');
  });
});

describe('MOT-EMP-2 / MOT-EMP-3', () => {
  it('a picked token pops 0.8 > 1 with opacity once; the wait is 520 ms, 200 under Reduce Motion', () => {
    const el = document.createElement('button');
    const { result } = renderHook(() => usePopIn());
    result.current(el, 0.8, { once: true, fade: true });
    result.current(el, 0.8, { once: true, fade: true });
    expect(animate).toHaveBeenCalledTimes(1);
    expect(animate.mock.calls[0]![0]).toEqual([{ transform: 'scale(0.8)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }]);
    expect(tokenBeat(false)).toBe(520);
    expect(tokenBeat(true)).toBe(200);
  });

  it('a starter fills the field and the composer pill does scale .98 > 1; it never sends', async () => {
    const pill = document.createElement('div');
    pill.className = 'ch-ms-comp__field';
    document.body.append(pill);
    const onStarter = vi.fn();
    render(<HelloCard {...{ name: 'Eli', role: 'Junior' }} coach onStarter={onStarter} />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Nice round. What clicked?' }));
    expect(onStarter).toHaveBeenCalledWith('Nice round. What clicked?');
    expect(animate.mock.calls.some((c) => JSON.stringify(c[0]) === JSON.stringify([{ transform: 'scale(0.98)' }, { transform: 'scale(1)' }]))).toBe(true);
    pill.remove();
  });
});

describe('polls: pure rules (MSG-501 to MSG-505)', () => {
  const poll = { question: 'Q', options: [{ id: 'a', label: 'A' }], multi: false, closesAt: null, closedAt: null };
  it('head words, faces and the sole leader', () => {
    expect(pollHeadWords(poll, false)).toBe('Poll · Choose one');
    expect(pollHeadWords({ ...poll, multi: true }, false)).toBe('Poll · Choose any');
    expect(pollHeadWords(poll, true)).toBe('Poll · Final');
    expect(faceOrder(['x', 'y', 'me', 'z'], 'me')).toEqual(['me', 'x', 'y']);
    expect(soleLeader({ voterCount: 1, leaders: ['a'] } as never)).toBe('a');
    expect(soleLeader({ voterCount: 2, leaders: ['a', 'b'] } as never)).toBeNull();
    expect(soleLeader({ voterCount: 0, leaders: ['a'] } as never)).toBeNull();
  });
  it('the reminder names the poll and when it closes (Q-09)', () => {
    expect(pollReminderLine({ question: 'Practice round', by: 'Sunday at 8:00 PM' })).toBe('Reminder: vote in the “Practice round” poll by Sunday at 8:00 PM.');
    expect(pollReminderLine({ question: 'Practice round', by: null })).toBe('Reminder: vote in the “Practice round” poll.');
  });
});

describe('files and photos (MSG-220, MSG-221)', () => {
  it('the tile says the type, the second line the kind with its size or length', () => {
    expect(fileTypeLabel('Back nine.pdf', 'application/pdf')).toBe('PDF');
    expect(fileTypeLabel('swing', 'video/quicktime')).toBe('MOV');
    expect(durationLabel(42)).toBe('0:42');
    expect(fileSubline({ mime: 'video/quicktime', size: 1000, durationSeconds: 42 })).toBe('Video · 0:42');
    expect(fileSubline({ mime: 'application/pdf', size: 96 * 1024 })).toBe('PDF · 96 KB');
  });
  it('signing is read once per message, so six tiles are one request each', async () => {
    const read = vi.fn(async () => []);
    await Promise.all([signedOnce(read as never, 'm1'), signedOnce(read as never, 'm1'), signedOnce(read as never, 'm2')]);
    expect(read).toHaveBeenCalledTimes(2);
    await signedOnce(read as never, 'm1', Date.now() + 41 * 60_000);
    expect(read).toHaveBeenCalledTimes(3);
  });
});

describe('the sheet: layout and motion pins', () => {
  it('MSG-801: the three panes apply from the drawn 1280 viewport (a 1032 canvas), not 1101', () => {
    const q = /@container \(min-width: (\d+)px\) \{\s*\[data-ch-ms-v2\] \.ch-msd-ms \{\s*grid-template-columns: 320px minmax\(0, 1fr\) 0px;/.exec(css);
    expect(q).not.toBeNull();
    expect(Number(q![1])).toBeLessThanOrEqual(1280 - 240 - 8);
    expect(css).toContain('grid-template-columns: 320px minmax(0, 1fr) 300px;');
  });
  it('MOT-DET-2: no layout property is ever transitioned, in the stylesheet or from the hook: the panel slides and the thread FLIPs by transform', () => {
    expect(css).not.toMatch(/transition[^;]*grid-template-columns/);
    expect(css).not.toMatch(/transition[^;]*\b(width|height|left|top)\b/);
    const hook = readFileSync(resolve(process.cwd(), 'src/clubhouse/screens/messages/details-v2.tsx'), 'utf8');
    expect(hook).not.toMatch(/style\.transition\s*=/);
    expect(hook).not.toMatch(/grid-template-columns \$\{/);
    // The panel: translateX(100%) and opacity on the smooth spring; the thread's pieces: translate() from where they were.
    expect(hook).toMatch(/transform: 'translateX\(100%\)', opacity: 0/);
    expect(hook).toMatch(/transform: `translate\(\$\{dx\}px, \$\{dy\}px\)`/);
    // Leaving, the panel is lifted out of the grid so it can slide away over the thread.
    expect(css).toMatch(/\.ch-msd-det\.is-leaving \{\s*position: absolute;/);
  });
  it('MOT-POLL-2: the bar scales (scaleX, origin left) on the smooth spring and lands under Reduce Motion', () => {
    expect(css).toMatch(/\.ch-msd-poll__fill \{[^}]*transform: scaleX\(var\(--ch-poll-share, 0\)\);[^}]*transform-origin: 0 50%;[^}]*transition: transform var\(--ch-dur-spring-smooth\) var\(--ch-ease-spring-smooth\);/);
    expect(css).toMatch(/prefers-reduced-motion: reduce\) \{[^@]*\.ch-msd-poll__fill \{\s*transition: none;/);
  });
  it('MOT-POLL-1/3: the disc pops from .6 and the check draws from 20; your face from .4', () => {
    expect(css).toMatch(/@keyframes ch-msd-ring-pop \{\s*from \{\s*transform: scale\(0\.6\)/);
    expect(css).toMatch(/@keyframes ch-msd-tick-draw \{\s*from \{\s*stroke-dashoffset: 20/);
    expect(css).toMatch(/@keyframes ch-msd-face-pop \{\s*from \{\s*opacity: 0;\s*transform: scale\(0\.4\)/);
  });
  it('MOT-X-7: the switch is 44 x 26 with a 22 knob travelling 18', () => {
    expect(css).toMatch(/\.ch-msd-sw \.ch-switch__track \{\s*width: 44px;\s*height: 26px;/);
    expect(css).toMatch(/\.ch-switch__thumb \{\s*width: 22px;\s*height: 22px;/);
    expect(css).toContain('translateX(18px)');
  });
  it('MSG-702: suggestions dim to .35', () => {
    expect(css).toMatch(/\.ch-msd-sug\.is-dim \{\s*opacity: 0\.35;/);
  });
});
