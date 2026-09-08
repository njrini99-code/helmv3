// @vitest-environment jsdom

import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RoundHole } from '@/lib/types/golf';
import { FairwayScorecardHeader } from './FairwayScorecardHeader';

vi.mock('@/hooks/golf/use-distance-units', () => ({
  useDistanceUnits: () => ({
    distancePref: 'yards',
    setDistancePref: vi.fn(),
  }),
}));

const holes: RoundHole[] = [
  { number: 1, par: 4, yardage: 400, score: null },
  { number: 2, par: 3, yardage: 160, score: null },
];

const baseProps = {
  holes,
  currentHoleIndex: 0,
  currentHoleNumber: 1,
  autoSaveStatus: 'idle' as const,
  onExit: vi.fn(),
};

let headerHeight = 112;
let stickyTop = '0px';
const resizeObservers: ControlledResizeObserver[] = [];
const originalRect = Element.prototype.getBoundingClientRect;
const originalGetComputedStyle = globalThis.getComputedStyle;
const originalResizeObserver = globalThis.ResizeObserver;

function scorecardRect(height: number): DOMRect {
  return {
    x: 0,
    y: 0,
    width: 320,
    height,
    top: 0,
    right: 320,
    bottom: height,
    left: 0,
    toJSON: () => ({}),
  } as DOMRect;
}

class ControlledResizeObserver {
  private readonly callback: ResizeObserverCallback;
  readonly observe = vi.fn();
  readonly disconnect = vi.fn();

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    resizeObservers.push(this);
  }

  trigger() {
    this.callback([], this as unknown as ResizeObserver);
  }
}

beforeEach(() => {
  headerHeight = 112;
  stickyTop = '0px';
  resizeObservers.length = 0;

  Element.prototype.getBoundingClientRect = function getBoundingClientRect() {
    if ((this as HTMLElement).dataset.testid === 'round-scorecard-header') {
      return scorecardRect(headerHeight);
    }
    return originalRect.call(this);
  };

  globalThis.getComputedStyle = ((element: Element, pseudoElt?: string | null) => {
    const computed = originalGetComputedStyle(element, pseudoElt);
    if ((element as HTMLElement).dataset?.testid !== 'round-scorecard-header') {
      return computed;
    }
    return new Proxy(computed, {
      get(target, property, receiver) {
        return property === 'top' ? stickyTop : Reflect.get(target, property, receiver);
      },
    });
  }) as typeof getComputedStyle;
  globalThis.ResizeObserver = ControlledResizeObserver as unknown as typeof ResizeObserver;
});

afterEach(() => {
  Element.prototype.getBoundingClientRect = originalRect;
  globalThis.getComputedStyle = originalGetComputedStyle;
  globalThis.ResizeObserver = originalResizeObserver;
  document.documentElement.style.removeProperty('--scorecard-height');
});

describe('FairwayScorecardHeader layout contract', () => {
  it('keeps safe-area ownership measurable for New Round and Continue Round', () => {
    headerHeight = 112;
    stickyTop = '0px';
    const first = render(<FairwayScorecardHeader {...baseProps} />);
    const newRoundHeader = screen.getByTestId('round-scorecard-header');

    expect(newRoundHeader.className).toContain('pt-[env(safe-area-inset-top,0px)]');
    expect(document.documentElement.style.getPropertyValue('--scorecard-height')).toBe('112px');
    first.unmount();

    headerHeight = 88;
    stickyTop = '47px';
    render(<FairwayScorecardHeader {...baseProps} safeAreaHandledAbove />);
    const continueHeader = screen.getByTestId('round-scorecard-header');

    expect(continueHeader.className).toContain('top-[env(safe-area-inset-top,0px)]');
    expect(continueHeader.className).not.toContain('pt-[env(safe-area-inset-top,0px)]');
    expect(document.documentElement.style.getPropertyValue('--scorecard-height')).toBe('135px');
  });

  it('keeps the below-slot status inside the measured scorecard chrome', () => {
    headerHeight = 144;
    render(
      <FairwayScorecardHeader
        {...baseProps}
        belowSlot={<div data-testid="shot-progress-status">Shot progress</div>}
      />,
    );

    const header = screen.getByTestId('round-scorecard-header');
    const status = screen.getByTestId('shot-progress-status');
    expect(header.contains(status)).toBe(true);
    expect(status.parentElement).toBe(header);
    expect(document.documentElement.style.getPropertyValue('--scorecard-height')).toBe('144px');
  });

  it('remeasures the sticky offset when ResizeObserver reports a height change', () => {
    headerHeight = 96;
    stickyTop = '47px';
    render(<FairwayScorecardHeader {...baseProps} safeAreaHandledAbove />);

    const header = screen.getByTestId('round-scorecard-header');
    const observer = resizeObservers[0];
    expect(observer).toBeDefined();
    expect(observer!.observe).toHaveBeenCalledWith(header);
    expect(document.documentElement.style.getPropertyValue('--scorecard-height')).toBe('143px');

    headerHeight = 128;
    act(() => observer!.trigger());
    expect(document.documentElement.style.getPropertyValue('--scorecard-height')).toBe('175px');
  });
});
