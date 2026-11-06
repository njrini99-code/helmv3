import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Surface } from '../Surface';

describe('Surface nesting', () => {
  afterEach(() => vi.restoreAllMocks());
  it('warns in development when a Surface holds a Surface', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(<Surface title="Outer"><Surface title="Inner">x</Surface></Surface>);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![0]).toMatch(/inside a Surface/);
  });
  it('stays quiet for one Surface, or two side by side', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(<><Surface title="A">a</Surface><Surface title="B">b</Surface></>);
    expect(warn).not.toHaveBeenCalled();
  });
});
