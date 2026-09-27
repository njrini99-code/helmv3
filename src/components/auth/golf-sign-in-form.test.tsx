/**
 * GolfSignInForm presentation contract (2026-09 iOS-native redesign):
 * it renders, the button stays disabled until both fields are filled, errors
 * render inline with role="alert" and aria-describedby and move focus to the
 * first invalid field, and the inputs carry the autofill/keyboard attributes
 * password managers and iOS need. Auth behaviour (the action call itself) is
 * mocked; these tests only pin the presentation layer.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, waitFor, cleanup, fireEvent } from '@/test/utils';
import { GolfSignInForm } from './golf-sign-in-form';
import { loginAction } from '@/app/golf/actions/auth';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/app/golf/actions/auth', () => ({ loginAction: vi.fn() }));
vi.mock('@/lib/error-logging', () => ({ logError: vi.fn() }));
vi.mock('@/lib/utils/capacitor', () => ({ triggerHaptic: vi.fn() }));
vi.mock('@/lib/fairway/haptics', () => ({ fwHapticSequence: vi.fn(), fwHaptic: vi.fn() }));

const mockedLogin = vi.mocked(loginAction);

beforeEach(() => {
  // jsdom has no layout; the keyboard reveal calls scrollIntoView.
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  sessionStorage.clear();
});

const emailInput = () => screen.getByLabelText('Email') as HTMLInputElement;
const passwordInput = () => screen.getByLabelText('Password') as HTMLInputElement;
const submit = () => screen.getByRole('button', { name: /^sign in$/i });

describe('GolfSignInForm', () => {
  it('renders the grouped fields, the primary button and the reset link', () => {
    render(<GolfSignInForm />);
    expect(emailInput()).toBeInTheDocument();
    expect(passwordInput()).toBeInTheDocument();
    expect(submit()).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /forgot password/i })).toBeInTheDocument();
    // Placeholder-only visible names: no "you@example.com"-style duplication.
    expect(emailInput().placeholder).toBe('Email');
    expect(passwordInput().placeholder).toBe('Password');
  });

  it('keeps the button disabled until both fields are filled', async () => {
    const { user } = render(<GolfSignInForm />);
    await waitFor(() => expect(submit()).toBeDisabled());

    await user.type(emailInput(), 'coach@example.com');
    expect(submit()).toBeDisabled();

    await user.type(passwordInput(), 'hunter22');
    expect(submit()).toBeEnabled();

    await user.clear(emailInput());
    expect(submit()).toBeDisabled();
  });

  it('carries the autofill, keyboard and no-zoom attributes', () => {
    render(<GolfSignInForm />);
    const email = emailInput();
    const password = passwordInput();

    expect(email).toHaveAttribute('type', 'email');
    expect(email).toHaveAttribute('autocomplete', 'username');
    expect(email).toHaveAttribute('inputmode', 'email');
    expect(email).toHaveAttribute('autocapitalize', 'none');
    expect(email).toHaveAttribute('enterkeyhint', 'next');

    expect(password).toHaveAttribute('type', 'password');
    expect(password).toHaveAttribute('autocomplete', 'current-password');
    expect(password).toHaveAttribute('autocapitalize', 'none');
    expect(password).toHaveAttribute('enterkeyhint', 'go');

    // text-body-lg is 17px: iOS Safari zooms any input under 16px on focus.
    expect(email.className).toContain('text-body-lg');
    expect(password.className).toContain('text-body-lg');
  });

  it('toggles password visibility from a labelled trailing icon button', async () => {
    const { user } = render(<GolfSignInForm />);
    const toggle = screen.getByRole('button', { name: 'Show password' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');

    await user.click(toggle);
    expect(passwordInput()).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: 'Hide password' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows a rejected sign-in inline with role=alert, links it to both fields, and focuses the first one', async () => {
    mockedLogin.mockResolvedValue({ success: false, error: 'Invalid login credentials' });
    const { user } = render(<GolfSignInForm />);

    await user.type(emailInput(), 'coach@example.com');
    await user.type(passwordInput(), 'wrong-password');
    await user.click(submit());

    const alert = await screen.findByRole('alert');
    // Message content is unchanged by the redesign.
    expect(alert).toHaveTextContent('Incorrect email or password. Please check your credentials and try again.');
    expect(mockedLogin).toHaveBeenCalledWith('coach@example.com', 'wrong-password', undefined);

    const errorId = alert.id;
    expect(errorId).toBeTruthy();
    expect(emailInput()).toHaveAttribute('aria-describedby', errorId);
    expect(passwordInput()).toHaveAttribute('aria-describedby', errorId);
    expect(emailInput()).toHaveAttribute('aria-invalid', 'true');
    expect(passwordInput()).toHaveAttribute('aria-invalid', 'true');
    await waitFor(() => expect(emailInput()).toHaveFocus());
  });

  it('does not mark fields invalid for a non-field failure such as rate limiting', async () => {
    mockedLogin.mockResolvedValue({ success: false, error: 'Too many requests' });
    const { user } = render(<GolfSignInForm />);

    await user.type(emailInput(), 'coach@example.com');
    await user.type(passwordInput(), 'pw');
    await user.click(submit());

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Too many sign-in attempts. Please wait a moment and try again.',
    );
    expect(emailInput()).not.toHaveAttribute('aria-invalid');
    expect(passwordInput()).not.toHaveAttribute('aria-invalid');
  });

  it('adopts values a password manager filled without firing onChange', async () => {
    render(<GolfSignInForm />);
    await waitFor(() => expect(submit()).toBeDisabled());

    // Simulate an autofill that writes the DOM value but never tells React.
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    setValue.call(emailInput(), 'coach@example.com');
    setValue.call(passwordInput(), 'hunter22');
    fireEvent.focus(emailInput());

    await waitFor(() => expect(submit()).toBeEnabled());
  });
});
