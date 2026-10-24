import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

/** Settings' Version row (A+ handoff 0.4: "an About row with the app version"), row 85. */

const native = vi.hoisted(() => ({ getNativeAppVersion: vi.fn() }));
vi.mock('@/lib/utils/capacitor', () => native);

import { releaseStamp, useAppVersion, versionLine } from '../hooks';

afterEach(() => native.getNativeAppVersion.mockReset());

function Line() {
  return <p data-testid="v">{useAppVersion()}</p>;
}

describe('the Version row', () => {
  it('is the app version and build in the iOS app, with the release it runs', () => {
    expect(versionLine({ version: '1.4.0', build: '52' }, '8860fd3')).toBe('1.4.0 (52) · 8860fd3');
    expect(versionLine({ version: '1.4.0', build: '52' }, null)).toBe('1.4.0 (52)');
  });

  it('is the build on the web, and plain "Web" for an unstamped build', () => {
    expect(versionLine(null, '8860fd3')).toBe('Build 8860fd3');
    expect(versionLine(null, null)).toBe('Web');
  });

  it('shortens the release stamp to seven characters and ignores a blank one', () => {
    expect(releaseStamp('8860fd382abcdef')).toBe('8860fd3');
    expect(releaseStamp('  ')).toBeNull();
    expect(releaseStamp(undefined)).toBeNull();
  });

  it('first paints the web line (what the server drew), then the native version once the app answers', async () => {
    let answer: (v: { version: string; build: string }) => void = () => {};
    native.getNativeAppVersion.mockReturnValue(new Promise((r) => (answer = r)));
    render(<Line />);
    expect(screen.getByTestId('v').textContent).toBe('Web');
    answer({ version: '2.0.1', build: '7' });
    await waitFor(() => expect(screen.getByTestId('v').textContent).toBe('2.0.1 (7)'));
  });

  it('stays on the web line when the native shell has no answer', async () => {
    native.getNativeAppVersion.mockResolvedValue(null);
    render(<Line />);
    await waitFor(() => expect(native.getNativeAppVersion).toHaveBeenCalled());
    expect(screen.getByTestId('v').textContent).toBe('Web');
  });
});
