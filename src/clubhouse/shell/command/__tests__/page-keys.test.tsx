import { render, screen, within } from '@testing-library/react';
import { LazyMotion, domAnimation } from 'motion/react';
import { describe, expect, it } from 'vitest';
import '../../../__tests__/dialog-polyfill';
import { ShortcutsSheet } from '../ShortcutsSheet';
import { usePageKeys, type ChPageKey } from '../page-keys';

const KEYS: readonly ChPageKey[] = [{ label: 'Go to today', keys: ['T'] }];
// The sheet's own props, spread so the `role` prop (a Clubhouse role) isn't read as an ARIA role.
const SHEET = { open: true, onClose: () => {}, role: 'coach' as const, apple: true };
const Sheet = () => (
  <LazyMotion features={domAnimation}>
    <ShortcutsSheet {...SHEET} />
  </LazyMotion>
);
function Page({ name }: { name: string }) {
  usePageKeys(name, KEYS);
  return null;
}

describe('the shortcuts sheet is page-aware (B11)', () => {
  it('lists the open screen’s own keys under its name, and drops them when the screen goes', () => {
    const { rerender } = render(
      <>
        <Page name="Calendar" />
        <Sheet />
      </>,
    );
    const sheet = screen.getByRole('dialog', { name: 'Keyboard shortcuts' });
    const section = within(sheet).getByRole('heading', { name: 'On Calendar' }).closest('section')!;
    expect(within(section).getByText('Go to today')).toBeInTheDocument();
    rerender(<Sheet />);
    expect(within(screen.getByRole('dialog', { name: 'Keyboard shortcuts' })).queryByRole('heading', { name: /^On / })).toBeNull();
  });
});
