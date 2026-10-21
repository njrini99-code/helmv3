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

import { ResetForm } from '../screens/auth/ForgotPassword';
import { GateInput } from '../screens/auth/gate-fields';
import { SignInForm } from '../screens/auth/SignInForm';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * A fast typist's first box is reset when hydration applies the controlled value (the WebKit loss behind the Settings name
 * that never saved). The reset email and the gate boxes are read-only until they have hydrated, through the one shared guard;
 * the sign-in email and password are not, so page-load autofill still fills them (their submit is held until hydrated).
 */
describe('sign-in boxes do not take text before they hydrate', () => {
  const cases: [string, () => React.ReactElement, string[]][] = [
    ['ResetForm', () => <ResetForm initialEmail="" focusOnMount={false} onSent={() => {}} onBack={() => {}} />, ['#golf-forgot-email']],
    ['GateInput', () => <GateInput id="gate-x" label="New password" value="" onChange={() => {}} />, ['#gate-x']],
  ];
  for (const [name, make, selectors] of cases) {
    it(`${name}: read-only in the server markup, editable once hydrated`, async () => {
      const host = document.createElement('div');
      host.innerHTML = renderToString(make());
      document.body.appendChild(host);
      for (const sel of selectors) expect(host.querySelector<HTMLInputElement>(sel)!.readOnly, sel).toBe(true);
      let root!: ReturnType<typeof hydrateRoot>;
      await act(async () => {
        root = hydrateRoot(host, make());
      });
      for (const sel of selectors) {
        const input = host.querySelector<HTMLInputElement>(sel)!;
        expect(input.readOnly, sel).toBe(false);
        expect(input.hasAttribute('data-ch-hydrating'), sel).toBe(false);
      }
      act(() => root.unmount());
      host.remove();
    });
  }

  // Returning users rely on the browser's and password managers' page-load fill, which skips a read-only box.
  it('SignInForm: the credential boxes stay editable in the server markup so page-load autofill can fill them', () => {
    const host = document.createElement('div');
    host.innerHTML = renderToString(<SignInForm onOpening={() => {}} />);
    for (const sel of ['#golf-signin-email', '#golf-signin-password']) expect(host.querySelector<HTMLInputElement>(sel)!.readOnly, sel).toBe(false);
  });
});
