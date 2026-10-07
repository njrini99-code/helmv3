// @vitest-environment jsdom
/**
 * MobileMoreButton — the golf phone top bar's avatar entry to the More sheet.
 * Pins that the grid glyph became the user's avatar (photo, else initials)
 * while the button's name, popup semantics and click behaviour stay the same.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MobileMoreButton } from './MobileMoreButton';

describe('MobileMoreButton', () => {
  it('shows the profile photo and opens the More sheet on tap', () => {
    const onOpen = vi.fn();
    const { container } = render(
      <MobileMoreButton onOpen={onOpen} open={false} active={false} name="Cole Bennett" avatarUrl="https://example.com/cole.jpg" />,
    );
    const button = screen.getByRole('button', { name: 'More' });
    expect(button).toHaveAttribute('aria-haspopup', 'dialog');
    expect(button).toHaveAttribute('aria-expanded', 'false');
    const img = container.querySelector('img');
    expect(img).toHaveAttribute('src', 'https://example.com/cole.jpg');
    expect(img).toHaveAttribute('alt', '');
    fireEvent.click(button);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('falls back to initials without a photo and keeps the unread badge in the name', () => {
    const { container } = render(
      <MobileMoreButton onOpen={() => {}} open active badge={3} name="Cole Bennett" avatarUrl={null} />,
    );
    const button = screen.getByRole('button', { name: 'More, 3 unread' });
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(button).toHaveAttribute('aria-current', 'page');
    expect(container.querySelector('img')).toBeNull();
    expect(button.textContent).toContain('CB');
    expect(container.querySelector('svg[data-lucide], .lucide-layout-grid')).toBeNull();
  });
});
