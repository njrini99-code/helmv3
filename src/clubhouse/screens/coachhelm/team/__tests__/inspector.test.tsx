import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { Inspector } from '../Inspector';

function Host() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open it
      </button>
      <Inspector open={open} onClose={() => setOpen(false)} label="Details">
        <h3>Heading</h3>
      </Inspector>
    </>
  );
}

afterEach(cleanup);

describe('Inspector', () => {
  it('sits in its rail, so the slide stays inside the canvas', () => {
    render(<Host />);
    const panel = screen.getByRole('complementary', { hidden: true });
    expect(panel.parentElement?.className).toBe('insp-rail');
  });

  it('returns focus to the control that was tapped, when the tap gave it no focus (Safari)', () => {
    render(<Host />);
    const button = screen.getByRole('button', { name: 'Open it' });
    // A click with no focus, as WebKit gives a button.
    fireEvent.pointerDown(button);
    fireEvent.click(button);
    expect(document.activeElement?.textContent).toBe('Heading');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(document.activeElement).toBe(button);
  });

  it('prefers the keyboard focus when it is on a control', () => {
    render(
      <>
        <Host />
        <button type="button">Other</button>
      </>,
    );
    const other = screen.getByRole('button', { name: 'Other' });
    const button = screen.getByRole('button', { name: 'Open it' });
    fireEvent.pointerDown(other);
    button.focus();
    fireEvent.click(button);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(document.activeElement).toBe(button);
  });
});
