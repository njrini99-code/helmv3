// @vitest-environment jsdom
import { act } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
vi.mock('@/lib/error-logging', () => ({ logError: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn(), back: vi.fn() }) }));
vi.mock('@/app/golf/actions/auth', () => ({ loginAction: vi.fn(), requestPasswordResetAction: vi.fn() }));

import { SignInForm } from '../screens/auth/SignInForm';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * The sign-in boxes stay editable (and fillable by autofill) before hydration, so text typed or filled in that window
 * must survive hydration and reach the submit. Hydration adopts the boxes' current values into state.
 */
describe('sign-in adopts text entered before hydration', () => {
  it('keeps the email and password and submits them', async () => {
    const signIn = vi.fn().mockResolvedValue({ ok: false, failure: { kind: 'credentials' } });
    const host = document.createElement('div');
    host.innerHTML = renderToString(<SignInForm onOpening={() => {}} signIn={signIn as never} />);
    document.body.appendChild(host);

    const email = host.querySelector<HTMLInputElement>('#golf-signin-email')!;
    const password = host.querySelector<HTMLInputElement>('#golf-signin-password')!;
    email.value = 'coach@school.edu';
    password.value = 'hunter22!';

    let root!: ReturnType<typeof hydrateRoot>;
    await act(async () => {
      root = hydrateRoot(host, <SignInForm onOpening={() => {}} signIn={signIn as never} />);
    });

    expect(email.value).toBe('coach@school.edu');
    expect(password.value).toBe('hunter22!');

    const submit = host.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    expect(submit.disabled).toBe(false);
    await act(async () => {
      submit.click();
    });
    expect(signIn).toHaveBeenCalledTimes(1);
    expect(signIn.mock.calls[0]?.[0]).toBe('coach@school.edu');
    expect(signIn.mock.calls[0]?.[1]).toBe('hunter22!');

    act(() => root.unmount());
    host.remove();
  });

  it('keeps a value typed between the server markup and the first effect even if the box is blurred right away', async () => {
    const signIn = vi.fn().mockResolvedValue({ ok: false, failure: { kind: 'credentials' } });
    const host = document.createElement('div');
    host.innerHTML = renderToString(<SignInForm onOpening={() => {}} signIn={signIn as never} />);
    document.body.appendChild(host);
    const email = host.querySelector<HTMLInputElement>('#golf-signin-email')!;
    email.value = 'a@b.co';
    let root!: ReturnType<typeof hydrateRoot>;
    await act(async () => {
      root = hydrateRoot(host, <SignInForm onOpening={() => {}} signIn={signIn as never} />);
    });
    expect(email.value).toBe('a@b.co');
    act(() => root.unmount());
    host.remove();
  });
});
