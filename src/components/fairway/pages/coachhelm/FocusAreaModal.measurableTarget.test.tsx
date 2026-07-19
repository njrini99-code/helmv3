// @vitest-environment jsdom
/**
 * ============================================================================
 * FocusAreaModal — "Measurable target" renders real, obvious inputs (#59)
 * ----------------------------------------------------------------------------
 * Bug: on a fresh CREATE (no `initial`), the "Measurable target" section
 * opened with `target_metric: ''` — no catalog stat card highlighted, and
 * both the Current/Target NumberFields blank with no unit shown next to
 * them. Base UI's NumberField *does* render a real, focusable `<input>` in
 * every state (confirmed by direct DOM inspection), but with nothing
 * selected and no unit label the section reads as inert decoration rather
 * than a working form — which is what the "appears to render with no input
 * fields" report was catching.
 *
 * Fix: `buildInitialForm` now pre-selects the first catalog metric for the
 * default area type up front (mirroring what `selectArea` already does on a
 * manual category change), and both NumberFields render the selected
 * metric's real unit (yds/%/ft/putts/strokes). This suite locks: (1) a fresh
 * create always opens with one metric card active + a unit shown on both
 * fields, with or without player stats to autofill from, and (2) editing an
 * existing focus area still renders the caller's resolved `initial` values
 * untouched (no regression from the new pre-select behavior).
 * ========================================================================== */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FocusAreaModal } from './FocusAreaModal';

function numberFieldInputs(): HTMLInputElement[] {
  return Array.from(
    document.querySelectorAll('input[data-slot="number-field-input"]'),
  ) as HTMLInputElement[];
}

describe('FocusAreaModal — Measurable target renders real inputs (#59)', () => {
  it('a fresh create (with player stats) pre-selects the first metric, autofills values, and shows the unit', () => {
    render(
      <FocusAreaModal
        open
        onOpenChange={() => {}}
        mode="player"
        playerId="p1"
        playerStats={{
          p1: {
            rounds_played: 5,
            driving_distance: 250,
            fairway_pct: 60,
            avg_score: 78,
            avg_putts: 30,
          },
        }}
        onSubmit={vi.fn().mockResolvedValue({ success: true })}
      />,
    );

    // One stat card is highlighted active — never opens with nothing selected.
    const active = document.querySelector('[aria-pressed="true"]');
    expect(active).not.toBeNull();
    expect(active?.textContent).toMatch(/Driving Distance/);

    // Both value fields carry real, non-empty inputs...
    const inputs = numberFieldInputs();
    expect(inputs).toHaveLength(2);
    expect(inputs[0]?.value).toBe('250');
    expect(inputs[1]?.value).not.toBe('');

    // ...and both show the metric's unit, so an empty/blank box never reads
    // as decoration even before the player picks something else.
    expect(screen.getAllByText('yds').length).toBeGreaterThanOrEqual(2);
  });

  it('a fresh create with NO player stats still pre-selects a metric + shows its unit (fields never look decorative)', () => {
    render(
      <FocusAreaModal
        open
        onOpenChange={() => {}}
        mode="player"
        playerId="p1"
        playerStats={{}}
        onSubmit={vi.fn().mockResolvedValue({ success: true })}
      />,
    );

    const active = document.querySelector('[aria-pressed="true"]');
    expect(active).not.toBeNull();

    const inputs = numberFieldInputs();
    expect(inputs).toHaveLength(2);
    // No stats to autofill from — the numeric inputs are legitimately empty...
    expect(inputs[0]?.value).toBe('');
    // ...but the unit is still shown, so an empty box still reads as a real,
    // metric-scoped input rather than inert decoration.
    expect(screen.getAllByText('yds').length).toBeGreaterThanOrEqual(2);
  });

  it('editing an existing focus area keeps the caller-resolved initial values untouched', () => {
    render(
      <FocusAreaModal
        open
        onOpenChange={() => {}}
        mode="coach"
        editing
        players={[{ id: 'p1', name: 'Alice' }]}
        playerStats={{
          p1: { rounds_played: 5, avg_score: 78, avg_putts: 30, fairway_pct: 55, gir_pct: 40 },
        }}
        initial={{
          player_id: 'p1',
          area_type: 'putting',
          title: 'Tighten lag putting',
          target_metric: 'putts_per_round',
          current_value: 32,
          target_value: 28,
        }}
        onSubmit={vi.fn().mockResolvedValue({ success: true })}
      />,
    );

    const inputs = numberFieldInputs();
    expect(inputs).toHaveLength(2);
    expect(inputs[0]?.value).toBe('32');
    expect(inputs[1]?.value).toBe('28');
    expect(screen.getAllByText('putts').length).toBeGreaterThanOrEqual(2);
  });
});
