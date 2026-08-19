/**
 * The month arrows in the date picker must actually change the month.
 *
 * Reported from Shenandoah, 2026-08-19: "Calendar is glitching and won't let
 * him change months." The event-creation picker was stuck on the selected
 * date's month and neither chevron did anything.
 *
 * CAUSE: `CalendarSurface` bumped a `key` on the wrapper <div> in
 * `onMonthChange` to replay the slide animation. That wrapper contains
 * <DayPicker>, and DayPicker is UNCONTROLLED here — no `month` or
 * `defaultMonth` prop is passed, so it holds the displayed month in its own
 * internal state. Changing the key unmounted and remounted it, throwing that
 * state away and snapping the view back to the month derived from `selected`.
 *
 * So each click advanced the month and instantly reverted it. Nothing errored,
 * nothing logged, and the arrows simply appeared dead.
 *
 * These tests pin the BEHAVIOUR (the caption advances and persists), not the
 * implementation, so a future animation rewrite is free to change how the
 * replay works as long as the month still moves.
 */
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CalendarSurface } from '@/components/fairway/calendar/calendar-surface';

/** August 2026 — the month in the reported screenshot. */
const SELECTED = new Date(2026, 7, 19);

function renderSurface() {
  return render(<CalendarSurface mode="single" selected={SELECTED} />);
}

/** react-day-picker labels its nav buttons "Go to the Next/Previous Month". */
const nextBtn = () => screen.getByRole('button', { name: /next month/i });
const prevBtn = () => screen.getByRole('button', { name: /previous month/i });

/** The caption is the month title rendered by react-day-picker. */
const caption = () => screen.getByText(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}\b/);

describe('CalendarSurface — month navigation', () => {
  it('opens on the selected date’s month', () => {
    renderSurface();
    expect(caption().textContent).toMatch(/August 2026/);
  });

  it('advances a month when the next arrow is clicked', () => {
    // The failing case. Against the keyed-remount version this reverts to
    // August immediately, because DayPicker is rebuilt from `selected`.
    renderSurface();
    fireEvent.click(nextBtn());
    expect(caption().textContent).toMatch(/September 2026/);
  });

  it('goes back a month when the previous arrow is clicked', () => {
    renderSurface();
    fireEvent.click(prevBtn());
    expect(caption().textContent).toMatch(/July 2026/);
  });

  it('KEEPS advancing across repeated clicks, and rolls the year over', () => {
    // The single-click case could pass by accident if a remount happened to
    // land on the right month. Four clicks from August must reach December,
    // and a fifth must roll into 2027 — that only holds if the month state
    // genuinely persists between clicks.
    renderSurface();
    for (let i = 0; i < 4; i++) fireEvent.click(nextBtn());
    expect(caption().textContent).toMatch(/December 2026/);

    fireEvent.click(nextBtn());
    expect(caption().textContent).toMatch(/January 2027/);
  });

  it('returns to the starting month after equal forward and back travel', () => {
    renderSurface();
    for (let i = 0; i < 3; i++) fireEvent.click(nextBtn());
    for (let i = 0; i < 3; i++) fireEvent.click(prevBtn());
    expect(caption().textContent).toMatch(/August 2026/);
  });

  it('slides BACKWARDS on a first click of the previous arrow', () => {
    // `prevMonthRef` starts empty, so the first change had nothing to compare
    // against and direction fell back to its 'next' default — a coach whose
    // first move was backwards got a forwards slide. The seed (month →
    // defaultMonth → selected → today) gives that first comparison something
    // real to measure from.
    renderSurface();
    const grid = document.querySelector('[data-slot="calendar-surface"] > div:last-child');

    fireEvent.click(prevBtn());

    expect(grid?.className).toMatch(/enterPrev/);
    expect(grid?.className).not.toMatch(/enterNext/);
  });

  it('slides forwards on a first click of the next arrow', () => {
    renderSurface();
    const grid = document.querySelector('[data-slot="calendar-surface"] > div:last-child');

    fireEvent.click(nextBtn());

    expect(grid?.className).toMatch(/enterNext/);
    expect(grid?.className).not.toMatch(/enterPrev/);
  });

  it('reverses direction mid-sequence', () => {
    // Guards the seed from being used for anything after the first click —
    // once prevMonthRef is populated it must win.
    renderSurface();
    const grid = document.querySelector('[data-slot="calendar-surface"] > div:last-child');

    fireEvent.click(nextBtn());
    fireEvent.click(nextBtn());
    expect(grid?.className).toMatch(/enterNext/);

    fireEvent.click(prevBtn());
    expect(grid?.className).toMatch(/enterPrev/);
  });

  it('still navigates when no date is selected at all', () => {
    // With no `selected`, the seed falls through to today. The arrows must
    // still work — this is the shape an empty "Pick a date" field renders.
    render(<CalendarSurface mode="single" />);
    const before = caption().textContent;

    fireEvent.click(nextBtn());

    expect(caption().textContent).not.toBe(before);
  });

  it('does not destroy the focused nav button on click', () => {
    // The remount also blew away DOM focus, so a keyboard user had to re-find
    // the arrow after every press. Asserted separately from the month value
    // because it is a distinct regression with a distinct cause.
    renderSurface();
    const btn = nextBtn();
    btn.focus();
    expect(document.activeElement).toBe(btn);

    fireEvent.click(btn);

    expect(document.activeElement).toBe(nextBtn());
  });
});
