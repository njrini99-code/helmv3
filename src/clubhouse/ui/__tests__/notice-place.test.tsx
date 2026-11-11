// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { InlineNotice, noticePlace } from '../Notices';

/**
 * On the phone no text sits on the page: a failure notice belongs inside the card it is about (DESIGN_LANGUAGE law 1 and
 * 9). Design review, 10 Nov 2026: Messages, Roster and Classes drew the notice as text on the page, its icon outside the
 * 16pt edge, with a 99x30 Try again. A notice now finds out whether anything holds it and, if nothing does, is its own
 * card; its recovery control is the regular key (36pt drawn, 44pt reach on the phone).
 */

const PAGE = 'rgb(242, 240, 233)';
const CARD = 'rgb(255, 254, 251)';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** A page (the canvas) holding `inner`, which holds the notice. `left` is where the notice starts on a 390pt phone. */
function mount(inner: Partial<CSSStyleDeclaration>, left = 16) {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const x = this.classList.contains('ch-notice') ? left : 0;
    return { left: x, right: x, top: 0, bottom: 0, width: 0, height: 0, x, y: 0, toJSON: () => ({}) } as DOMRect;
  });
  const { container } = render(
    <div className="ch-canvas" style={{ backgroundColor: PAGE }}>
      <div data-testid="holder" style={inner as React.CSSProperties}>
        <InlineNotice title="Season stats didn’t load" body="The roster is complete." onRetry={() => {}} />
      </div>
    </div>,
  );
  return container.querySelector<HTMLElement>('.ch-notice')!;
}

describe('where a notice sits', () => {
  it('is bare when nothing between it and the page paints a surface, and draws its own card', () => {
    const el = mount({});
    expect(noticePlace(el)).toBe('card');
    expect(el.getAttribute('data-ch-bare')).toBe('card');
  });

  it('is still bare inside a container painted in the page’s own colour', () => {
    expect(mount({ backgroundColor: PAGE }).getAttribute('data-ch-bare')).toBe('card');
  });

  it('takes the page gutter when it starts at the screen’s edge', () => {
    expect(mount({}, 0).getAttribute('data-ch-bare')).toBe('edge');
  });

  it('stays flush inside a card, whoever drew the card', () => {
    const el = mount({ backgroundColor: CARD });
    expect(noticePlace(el)).toBeNull();
    expect(el.hasAttribute('data-ch-bare')).toBe(false);
  });

  it('stays flush on a painted face such as the green hero', () => {
    expect(mount({ backgroundImage: 'linear-gradient(rgb(11, 58, 37), rgb(10, 51, 31))' }).hasAttribute('data-ch-bare')).toBe(false);
  });
});

describe('the notice’s recovery control', () => {
  it('is the regular 36pt key, not the 30pt small one', () => {
    const el = mount({});
    const key = el.querySelector('.ch-notice__act .ch-btn')!;
    expect(key.textContent).toBe('Try again');
    expect(key.classList.contains('ch-btn--sm')).toBe(false);
  });

  it('reaches 44pt on the phone and the bare notice is the one card', () => {
    const dir = join(process.cwd(), 'src/clubhouse/styles');
    // Every .ch-btn carries the shared reach on the phone (controls.css).
    expect(readFileSync(join(dir, 'controls.css'), 'utf8')).toMatch(/:where\(\.ch-root\) :where\(\.ch-btn,[^)]*\)::after \{\s*content: '';\s*position: absolute;\s*inset: min\(0px, calc\(50% - 22px\)\);/);
    const shell = readFileSync(join(dir, 'shell.css'), 'utf8');
    expect(shell).toMatch(/\.ch-notice\[data-ch-bare\] \{\s*--ch-notice-fill: var\(--ch-card-bg\);\s*padding: 14px 16px 16px;\s*border-radius: var\(--ch-radius-lg\);\s*box-shadow: var\(--ch-card-shadow\);/);
    expect(shell).toMatch(/\.ch-notice\[data-ch-bare='edge'\] \{\s*margin-inline: var\(--ch-page-x-phone\);/);
  });
});
