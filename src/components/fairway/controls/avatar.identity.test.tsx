// @vitest-environment jsdom
/**
 * Avatar `identity` tone (golf): a photo-less person gets the SAME flat pastel
 * tint the roster player card draws (`--fw-tint-N`), seeded by their id via
 * `identityKey` so the colour matches FairwayPlayerCard's `tintFor(player.id)`.
 */
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Avatar, AvatarToneProvider } from './avatar';
import { identityTintSlot, tintFor } from './identity-tint';

function styleOf(container: HTMLElement): string {
  return container.querySelector('[style]')?.getAttribute('style') ?? '';
}

describe('Avatar identity tone', () => {
  it('fills with the roster card tint for the same id, never a gradient', () => {
    const id = 'a5d6c1f0-0000-4000-8000-000000000001';
    const { container } = render(
      <AvatarToneProvider tone="identity">
        <Avatar name="Cole Bennett" identityKey={id} />
      </AvatarToneProvider>,
    );
    const style = styleOf(container);
    const card = tintFor(id);
    expect(style).toContain(card.bg);
    expect(style).toContain(card.text);
    expect(style).not.toContain('gradient');
    expect(container.querySelector('[style]')?.textContent).toContain('CB');
  });

  it('seeds by name when no id is in reach', () => {
    const { container } = render(
      <AvatarToneProvider tone="identity">
        <Avatar name="Ava Reyes" />
      </AvatarToneProvider>,
    );
    expect(styleOf(container)).toContain(`var(--fw-tint-${identityTintSlot('Ava Reyes')}-bg)`);
  });

  it('draws no tint when there is a photo, or outside the golf identity tone', () => {
    const withPhoto = render(
      <AvatarToneProvider tone="identity">
        <Avatar name="Cole Bennett" identityKey="p1" src="https://example.test/cole.jpg" />
      </AvatarToneProvider>,
    );
    expect(styleOf(withPhoto.container)).not.toContain('--fw-tint-');

    const neutral = render(<Avatar name="Cole Bennett" identityKey="p1" />);
    expect(styleOf(neutral.container)).not.toContain('--fw-tint-');
  });
});
