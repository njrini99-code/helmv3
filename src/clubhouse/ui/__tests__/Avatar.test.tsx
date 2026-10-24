import { cleanup, render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { AVATAR_SIZES, AVATAR_TONES, Avatar, avatarTone } from '../Avatar';

afterEach(() => cleanup());

const coin = (props: Parameters<typeof Avatar>[0]) => {
  const { container, unmount } = render(<Avatar {...props} />);
  const el = container.querySelector<HTMLElement>('.ch-avatar')!;
  const out = { tone: el.getAttribute('data-tone'), size: el.style.getPropertyValue('--ch-av-size') };
  unmount();
  return out;
};

const ids = Array.from({ length: 24 }, (_, i) => `3f2a${i.toString(16).padStart(4, '0')}-9c1e-4b7a-8d2f-0a1b2c3d4e5f`);

/** B19: one tint rule. A person's coin takes the same tone wherever it is drawn, at any size and with or without a ring
 *  (the phone then draws every tone as the one calm neutral, D-43, in CSS). */
describe('Avatar tone (B19)', () => {
  it('the same person gets the same tone at every size and in a ring', () => {
    for (const id of ids.slice(0, 4)) {
      const t = coin({ name: 'Ava Thompson', id }).tone;
      expect(AVATAR_TONES).toContain(t);
      expect(coin({ name: 'Ava Thompson', id, size: 'xs' }).tone).toBe(t);
      expect(coin({ name: 'Ava Thompson', id, size: 48, ring: true }).tone).toBe(t);
    }
  });

  /** Auditor on #2361: the tint hashed the name onto 5 tones, so two people with one name shared a tint and a rename
   *  changed it. It hashes the person's id onto 6. */
  it('hashes the id, not the name: a rename keeps the tone, and two people who share a name are told apart', () => {
    const id = ids[0]!;
    expect(coin({ name: 'Ava Thompson', id }).tone).toBe(coin({ name: 'Ava Okafor-Thompson', id }).tone);
    expect(new Set(ids.map((i) => coin({ name: 'Sam Lee', id: i }).tone)).size).toBeGreaterThan(1);
  });

  it('spreads a team across all six tones', () => {
    expect(AVATAR_TONES).toHaveLength(6);
    expect(new Set(ids.map(avatarTone))).toEqual(new Set(AVATAR_TONES));
  });

  it('with no id it falls back to the name', () => {
    expect(coin({ name: 'Riverside Golf' }).tone).toBe(avatarTone('Riverside Golf'));
    expect(coin({ name: 'Riverside Golf', id: null }).tone).toBe(avatarTone('Riverside Golf'));
  });

  it('every tone has its light and dark colours', () => {
    const css = readFileSync(join(__dirname, '../../styles/ui.css'), 'utf8');
    for (const t of AVATAR_TONES.filter((x) => x !== 'sand')) {
      expect(css).toContain(`.ch-avatar[data-tone='${t}'] {`);
      expect(css).toContain(`html[data-fw-theme='dark'] .ch-avatar[data-tone='${t}'] {`);
    }
  });
});

/** Auditor on #2361 (CONS-33): the default size was 32, off the step set and invisible to the ratchet. */
describe('Avatar size', () => {
  it('a coin with no size is a step', () => {
    expect(coin({ name: 'Jamie Rivera' }).size).toBe(`${AVATAR_SIZES.md}px`);
  });
});
