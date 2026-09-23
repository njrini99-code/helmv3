// @vitest-environment jsdom
/**
 * ============================================================================
 * FocusAreaCard — A8 slice 3 (write side): log-practice + mark-criterion-met
 * ----------------------------------------------------------------------------
 * Covers the two new write affordances added on top of slice 2's read-only
 * criteria/practice-summary rendering:
 *   - `onLogPracticeSession` (player-only): a "Log practice" trigger opens a
 *     Sheet form and submits an idempotent request. Optimistic session-count
 *     bump on success, rollback + toast on failure, and a retried submit
 *     after a failure reuses the SAME clientRequestId (never a second row).
 *   - `onSetCriterionMet` (coach-only): each criterion becomes an interactive
 *     Checkbox. Optimistic toggle on click, rollback + toast on failure.
 * Both stay inert (present but non-interactive, or entirely absent) with no
 * handler wired — the flag-off contract lives one level up (the consumer
 * only wires these handlers when coachhelm_focus_area_practice_log is on),
 * so "no handler" here IS what "flag off" renders as.
 * ========================================================================== */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { FocusAreaCard, type FocusAreaCardData, type FocusAreaCriterionView } from './FocusAreaCard';

// jsdom implements neither the Pointer Events capture methods nor real layout
// (getBoundingClientRect/transform), both of which vaul's Drawer reads on
// press/release to drive its drag-to-dismiss gesture. Polyfilling just the
// capture methods (real browsers no-op them for a plain click anyway) is
// enough to let a userEvent.click() open/close the sheet the same way a real
// click would, without adding a fake layout engine.
const realGetComputedStyle = window.getComputedStyle.bind(window);
beforeAll(() => {
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
  }
  if (!Element.prototype.setPointerCapture) {
    Element.prototype.setPointerCapture = () => {};
  }
  if (!Element.prototype.releasePointerCapture) {
    Element.prototype.releasePointerCapture = () => {};
  }
  // vaul's getTranslate() reads `style.transform || style.webkitTransform ||
  // style.mozTransform` and assumes a real browser's "none" default. jsdom's
  // CSSStyleDeclaration returns '' (falsy) for an unset transform and doesn't
  // implement the vendor-prefixed aliases at all (undefined), so the whole
  // `||` chain collapses to `undefined` and the subsequent `.match()` throws
  // — an uncaught exception on every sheet open/close, unrelated to anything
  // this component does. Proxy just the `transform` read to jsdom's own
  // "none" default so getTranslate sees what a real browser would return.
  vi.spyOn(window, 'getComputedStyle').mockImplementation((el, pseudo) => {
    const style = realGetComputedStyle(el, pseudo ?? undefined);
    return new Proxy(style, {
      get(target, prop, receiver) {
        if (prop === 'transform') {
          const value = Reflect.get(target, prop, receiver);
          return value || 'none';
        }
        return Reflect.get(target, prop, receiver);
      },
    });
  });
});
afterAll(() => {
  vi.restoreAllMocks();
});

vi.mock('./PracticeRxForInsight', () => ({
  PracticeRxForInsight: () => null,
}));

const fairwayToastMock = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
}));
vi.mock('@/components/fairway/feedback/ToastStack', () => ({
  fairwayToast: fairwayToastMock,
}));

function makeArea(overrides: Partial<FocusAreaCardData> = {}): FocusAreaCardData {
  return {
    id: 'fa-1',
    area_type: 'putting',
    title: 'Putting under pressure',
    status: 'active',
    target_metric: 'putts_made_5_10ft_pct',
    target_value: 65,
    current_value: 42,
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

beforeEach(() => {
  fairwayToastMock.success.mockClear();
  fairwayToastMock.error.mockClear();
  fairwayToastMock.info.mockClear();
});

describe('FocusAreaCard — Log practice trigger visibility', () => {
  it('renders nothing when onLogPracticeSession is not wired (flag off)', () => {
    render(
      <FocusAreaCard
        focusArea={makeArea()}
        // eslint-disable-next-line jsx-a11y/aria-role -- domain prop, not ARIA
        role="player"
        onLogProgress={vi.fn()}
        onComplete={vi.fn()}
      />,
    );
    expect(screen.queryByRole('button', { name: /log practice/i })).not.toBeInTheDocument();
  });

  it('never renders for a coach viewer (log-practice is the player\'s own record)', () => {
    render(
      <FocusAreaCard
        focusArea={makeArea()}
        // eslint-disable-next-line jsx-a11y/aria-role
        role="coach"
        onLogPracticeSession={vi.fn()}
      />,
    );
    expect(screen.queryByRole('button', { name: /log practice/i })).not.toBeInTheDocument();
  });

  it('does not render for a non-actionable (completed) area even with a handler wired', () => {
    render(
      <FocusAreaCard
        focusArea={makeArea({ status: 'completed', completed_at: '2026-09-01T00:00:00Z' })}
        // eslint-disable-next-line jsx-a11y/aria-role
        role="player"
        onLogPracticeSession={vi.fn()}
      />,
    );
    expect(screen.queryByRole('button', { name: /log practice/i })).not.toBeInTheDocument();
  });

  it('renders the trigger for an actionable area, player role, handler wired', () => {
    render(
      <FocusAreaCard
        focusArea={makeArea()}
        // eslint-disable-next-line jsx-a11y/aria-role
        role="player"
        onLogPracticeSession={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: /log practice/i })).toBeInTheDocument();
  });
});

describe('FocusAreaCard — Log practice submit', () => {
  it('success: submits with a fresh clientRequestId, shows a success toast, closes the sheet, and bumps the session count', async () => {
    const user = userEvent.setup();
    const onLogPracticeSession = vi.fn().mockResolvedValue({ success: true });
    render(
      <FocusAreaCard
        focusArea={makeArea()}
        // eslint-disable-next-line jsx-a11y/aria-role
        role="player"
        onLogPracticeSession={onLogPracticeSession}
      />,
    );

    await user.click(screen.getByRole('button', { name: /log practice/i }));
    await user.click(screen.getByRole('button', { name: /log session/i }));

    await waitFor(() => expect(onLogPracticeSession).toHaveBeenCalledTimes(1));
    const [focusArea, input] = onLogPracticeSession.mock.calls[0]!;
    expect(focusArea.id).toBe('fa-1');
    expect(typeof input.clientRequestId).toBe('string');
    expect(input.clientRequestId.length).toBeGreaterThan(0);

    await waitFor(() => expect(fairwayToastMock.success).toHaveBeenCalledWith('Practice session logged'));
    await waitFor(() => expect(screen.getByText(/1 practice session logged/i)).toBeInTheDocument());
  });

  it('failure: shows an error toast, keeps the sheet open with the error, and does NOT bump the count', async () => {
    const user = userEvent.setup();
    const onLogPracticeSession = vi.fn().mockResolvedValue({ success: false, error: 'Nope' });
    render(
      <FocusAreaCard
        focusArea={makeArea()}
        // eslint-disable-next-line jsx-a11y/aria-role
        role="player"
        onLogPracticeSession={onLogPracticeSession}
      />,
    );

    await user.click(screen.getByRole('button', { name: /log practice/i }));
    await user.click(screen.getByRole('button', { name: /log session/i }));

    await waitFor(() => expect(fairwayToastMock.error).toHaveBeenCalledWith('Nope'));
    expect(screen.getByRole('button', { name: /log session/i })).toBeInTheDocument();
    expect(screen.queryByText(/practice session logged/i)).not.toBeInTheDocument();
  });

  it('duplicate-submit: a second click while the first is still pending does not call the handler again', async () => {
    const user = userEvent.setup();
    const { promise, resolve } = deferred<{ success: boolean; error?: string }>();
    const onLogPracticeSession = vi.fn().mockReturnValue(promise);
    render(
      <FocusAreaCard
        focusArea={makeArea()}
        // eslint-disable-next-line jsx-a11y/aria-role
        role="player"
        onLogPracticeSession={onLogPracticeSession}
      />,
    );

    await user.click(screen.getByRole('button', { name: /log practice/i }));
    const submitButton = screen.getByRole('button', { name: /log session/i });
    await user.click(submitButton);
    // Still pending — the submit button is busy/disabled, a second click is a no-op.
    await user.click(submitButton);
    expect(onLogPracticeSession).toHaveBeenCalledTimes(1);

    resolve({ success: true });
    await waitFor(() => expect(fairwayToastMock.success).toHaveBeenCalled());
  });

  it('duplicate-submit: retrying after a failure reuses the SAME clientRequestId (never a duplicate row)', async () => {
    const user = userEvent.setup();
    const onLogPracticeSession = vi
      .fn()
      .mockResolvedValueOnce({ success: false, error: 'Network hiccup' })
      .mockResolvedValueOnce({ success: true });
    render(
      <FocusAreaCard
        focusArea={makeArea()}
        // eslint-disable-next-line jsx-a11y/aria-role
        role="player"
        onLogPracticeSession={onLogPracticeSession}
      />,
    );

    await user.click(screen.getByRole('button', { name: /log practice/i }));
    await user.click(screen.getByRole('button', { name: /log session/i }));
    await waitFor(() => expect(onLogPracticeSession).toHaveBeenCalledTimes(1));

    // Retry — the sheet stayed open after the failure.
    await user.click(screen.getByRole('button', { name: /log session/i }));
    await waitFor(() => expect(onLogPracticeSession).toHaveBeenCalledTimes(2));

    const firstId = onLogPracticeSession.mock.calls[0]![1].clientRequestId;
    const secondId = onLogPracticeSession.mock.calls[1]![1].clientRequestId;
    expect(secondId).toBe(firstId);
  });
});

describe('FocusAreaCard — criteria checklist interactivity', () => {
  function criteria(): FocusAreaCriterionView[] {
    return [
      { id: 'c1', label: 'Consistent tempo', met: false },
      { id: 'c2', label: 'Square clubface at impact', met: true },
    ];
  }

  // Checkbox (Base UI) renders `role="checkbox"` on a plain `<span>` inside a
  // `<label for=...>` wrapper — the accname algorithm doesn't pick that label
  // up as this element's accessible name (it's not a "labelable" native
  // element), so `getByRole('checkbox', { name })` can't find it. Locate by
  // the label text instead and walk to the checkbox within the same row.
  function criterionCheckbox(label: string): HTMLElement {
    const li = screen.getByText(label).closest('li');
    if (!li) throw new Error(`No <li> ancestor for criterion "${label}"`);
    const checkbox = li.querySelector('[role="checkbox"]');
    if (!checkbox) throw new Error(`No checkbox found for criterion "${label}"`);
    return checkbox as HTMLElement;
  }

  it('renders the static (non-interactive) list when no onSetCriterionMet is wired (flag off)', () => {
    render(
      <FocusAreaCard
        focusArea={makeArea({ criteria: criteria() })}
        // eslint-disable-next-line jsx-a11y/aria-role
        role="coach"
      />,
    );
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.getByText('Consistent tempo')).toBeInTheDocument();
  });

  it('renders the static list for a player viewer even with a handler wired (coach-only)', () => {
    render(
      <FocusAreaCard
        focusArea={makeArea({ criteria: criteria() })}
        // eslint-disable-next-line jsx-a11y/aria-role
        role="player"
        onSetCriterionMet={vi.fn()}
      />,
    );
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('renders interactive checkboxes for a coach with a wired handler, checked state reflecting `met`', () => {
    render(
      <FocusAreaCard
        focusArea={makeArea({ criteria: criteria() })}
        // eslint-disable-next-line jsx-a11y/aria-role
        role="coach"
        onSetCriterionMet={vi.fn()}
      />,
    );
    expect(criterionCheckbox('Consistent tempo')).not.toBeChecked();
    expect(criterionCheckbox('Square clubface at impact')).toBeChecked();
  });

  it('success: toggling a criterion calls the handler and reflects the optimistic checked state', async () => {
    const user = userEvent.setup();
    const onSetCriterionMet = vi.fn().mockResolvedValue({ success: true });
    const focusArea = makeArea({ criteria: criteria() });
    render(
      <FocusAreaCard
        focusArea={focusArea}
        // eslint-disable-next-line jsx-a11y/aria-role
        role="coach"
        onSetCriterionMet={onSetCriterionMet}
      />,
    );

    const checkbox = criterionCheckbox('Consistent tempo');
    await user.click(checkbox);

    expect(onSetCriterionMet).toHaveBeenCalledWith(focusArea, criteria()[0], true);
    await waitFor(() => expect(checkbox).toBeChecked());
  });

  it('failure/rollback: a failed toggle reverts the checked state and shows an error toast', async () => {
    const user = userEvent.setup();
    const onSetCriterionMet = vi.fn().mockResolvedValue({ success: false, error: 'Could not save' });
    render(
      <FocusAreaCard
        focusArea={makeArea({ criteria: criteria() })}
        // eslint-disable-next-line jsx-a11y/aria-role
        role="coach"
        onSetCriterionMet={onSetCriterionMet}
      />,
    );

    const checkbox = criterionCheckbox('Consistent tempo');
    await user.click(checkbox);

    await waitFor(() => expect(fairwayToastMock.error).toHaveBeenCalledWith('Could not save'));
    await waitFor(() => expect(checkbox).not.toBeChecked());
  });
});
