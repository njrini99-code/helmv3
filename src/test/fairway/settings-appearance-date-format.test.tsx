/**
 * Settings › Appearance › Date format. The 390px baseline showed each choice
 * as "MM/DD/YYYY01/28/2026": the row passed the format and its example as two
 * sibling spans to the Fairway `Button`, which wraps children in one bare
 * inline span, so the row's `justify-between` never reached them and they
 * rendered glued together. Each choice is now an `OptionTile` (title over
 * hint), like the Density and Score rows beside it.
 *
 * jsdom doesn't lay out text, so this pins the structure: the format and its
 * example are separate elements stacked in one flex column.
 */
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

import { AppearancePanel } from '@/components/fairway/pages/settings/FairwaySettingsGeneral';

vi.mock('@/lib/utils/capacitor', () => ({
  triggerHaptic: vi.fn(async () => {}),
  isNativeApp: () => false,
}));

describe('AppearancePanel date format', () => {
  it('shows each format above its example instead of running them together', () => {
    render(<AppearancePanel />);

    for (const [format, example] of [
      ['MM/DD/YYYY', '01/28/2026'],
      ['DD/MM/YYYY', '28/01/2026'],
      ['YYYY-MM-DD', '2026-01-28'],
    ] as const) {
      const label = screen.getByText(format);
      const hint = screen.getByText(example);
      expect(hint).not.toBe(label);
      expect(hint.parentElement).toBe(label.parentElement);
      expect(label.parentElement?.className).toMatch(/(^|\s)flex-col(\s|$)/);
      expect(label.closest('button')).toHaveAttribute('aria-pressed');
    }
  });
});
