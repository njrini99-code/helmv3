/**
 * ============================================================================
 * AddClassModal.tsx — cream-glass field styling regression (#143)
 * ----------------------------------------------------------------------------
 * Every text-like field in the "Add Class" drawer (Course ID/Name, Start/End
 * Time, Building/Room, Professor/Credits, Semester, Notes) previously fell
 * back to the shared `<Input>`/`<Select>` component's flat near-white
 * `bg-cream-50/92` default (no blur, indistinguishable from a plain white
 * box), while the Notes `<Textarea>` was separately overridden to `bg-surface`
 * — the flat CARD-level cream token, not a recessed input well — which reads
 * the same way against the Drawer's warm `surface-stone` chrome. Both
 * rendered as "plain white" inputs, out of step with the rest of the app's
 * cream-glass surfaces.
 *
 * This locks every field onto the shared `creamGlassFieldCls` recipe (the
 * same warm sunken-well + hairline-border + accent-600-focus treatment the
 * canonical Fairway forms primitive uses) so the regression can't silently
 * come back one field at a time.
 * ========================================================================== */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AddClassModal } from './AddClassModal';

// Real getBoundingClientRect for the Select's portal positioning — jsdom
// returns all-zero rects by default, which is fine for these assertions
// (we never open the dropdown), but keep the mock out of the way.

describe('AddClassModal — cream-glass field styling (#143)', () => {
  const baseProps = {
    isOpen: true,
    onClose: vi.fn(),
    onSave: vi.fn(async () => {}),
  };

  it('renders every text field on the shared warm sunken-well recipe, never the plain-white default', () => {
    render(<AddClassModal {...baseProps} />);

    const textFields = [
      screen.getByLabelText(/Course ID/i),
      screen.getByLabelText(/Course Name/i),
      screen.getByLabelText(/Start Time/i),
      screen.getByLabelText(/End Time/i),
      screen.getByLabelText(/Building/i),
      screen.getByLabelText(/Room/i),
      screen.getByLabelText(/Professor/i),
      screen.getByLabelText(/Credits/i),
      screen.getByLabelText(/Notes/i),
    ];

    for (const field of textFields) {
      // The cream-glass recessed-well recipe is present…
      expect(field.className).toContain('bg-surface-sunken');
      expect(field.className).toContain('border-border-subtle');
      // …and neither legacy flat-white treatment survives: the shared
      // <Input>/<Textarea> component's own near-white default, or the old
      // ad hoc bg-surface (card-level, not well-level) override.
      expect(field.className).not.toContain('bg-cream-50');
      expect(field.className).not.toMatch(/(?:^|\s)bg-surface(?:\s|$)/);
      // Design-system hard rule: no bg-white outside src/components/ui.
      expect(field.className).not.toMatch(/(?:^|\s)bg-white/);
    }
  });

  it('renders the Semester select trigger on the same cream-glass recipe', () => {
    render(<AddClassModal {...baseProps} />);

    const semesterTrigger = screen.getByRole('button', { name: /Semester|Select an option/i });
    expect(semesterTrigger.className).toContain('bg-surface-sunken');
    expect(semesterTrigger.className).toContain('border-border-subtle');
    expect(semesterTrigger.className).not.toContain('bg-cream-50');
  });

  it('never renders an arbitrary text-[Npx] utility on the restyled fields (design-system rule)', () => {
    const { container } = render(<AddClassModal {...baseProps} />);
    expect(container.innerHTML).not.toMatch(/text-\[\d+px\]/);
  });
});
