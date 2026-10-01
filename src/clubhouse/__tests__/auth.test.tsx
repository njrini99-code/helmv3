import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** Sign in and the welcome (P015): every numbered state in docs/clubhouse/catalog/auth.md, found by its number. */

const hapticSpy = vi.hoisted(() => vi.fn());
vi.mock('../lib/haptics', () => ({ haptic: hapticSpy }));
const report = vi.hoisted(() => vi.fn());
vi.mock('../lib/track', () => ({ chReport: report, chTrail: vi.fn(), chTagSession: vi.fn() }));
const logError = vi.hoisted(() => vi.fn());
vi.mock('@/lib/error-logging', () => ({ logError }));
const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn(), back: vi.fn() }));
const redirect = vi.hoisted(() =>
  vi.fn((to: string) => {
    throw new Error(`REDIRECT:${to}`);
  }),
);
vi.mock('next/navigation', () => ({ useRouter: () => router, redirect }));
const login = vi.hoisted(() => vi.fn());
vi.mock('@/app/golf/actions/auth', () => ({ loginAction: login }));
const native = vi.hoisted(() => ({ is: false }));
vi.mock('@/lib/utils/capacitor', () => ({ isNativeApp: () => native.is }));
// The scene has its own tests below; here it is a marker that, like the real one, draws only once the viewer's clock is known.
vi.mock('../screens/auth/SceneMount', async () => {
  const { useLocalHour } = await import('../screens/auth/use-hour');
  return {
    SceneMount: ({ camera, play }: { camera?: string; play?: boolean }) => (useLocalHour() === null ? null : <div data-testid="scene" data-camera={camera} data-play={String(!!play)} />),
  };
});
const flag = vi.hoisted(() => ({ on: true }));
vi.mock('@/clubhouse/gate', () => ({ isClubhouseFrontDoor: () => flag.on, isClubhouseFor: () => true }));
vi.mock('@/clubhouse/routes/auth', () => ({ ClubhouseSignInRoute: () => <p>The Clubhouse sign in</p>, ClubhouseWelcomeRoute: () => <p>The Clubhouse welcome</p> }));

import LoginLayout from '@/app/golf/(auth)/login/layout';
import WelcomeLayout from '@/app/golf/(auth)/welcome/layout';
import { STALE_BUNDLE_RELOAD_KEY } from '@/lib/auth/golf-sign-in-logic';
import { PREVIEW_AUTH_NOW, PREVIEW_WELCOME_CAUGHT_UP, PREVIEW_WELCOME_COACH, PREVIEW_WELCOME_FAILED, PREVIEW_WELCOME_FIRST, PREVIEW_WELCOME_NO_NAME, PREVIEW_WELCOME_PLAYER } from '../preview/fixtures-auth';
import { SignIn } from '../screens/auth/SignIn';
import { Welcome } from '../screens/auth/Welcome';
import { WelcomeStage } from '../screens/auth/WelcomeStage';
import { FixedClock } from '../screens/auth/use-hour';
import { GolfScene } from '../screens/auth/GolfScene';
import { HANDOFF_MS, OPENING_MS } from '../screens/auth/auth-motion';

let reduced = false;
const setMedia = (opts: { reduced?: boolean; phone?: boolean } = {}) => {
  reduced = opts.reduced ?? false;
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('reduce') ? reduced : query.includes('max-width') ? !!opts.phone : false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
    onchange: null,
  }));
};
const at = (path: string) => window.history.replaceState({}, '', path);

beforeEach(() => {
  setMedia();
  native.is = false;
  flag.on = true;
  sessionStorage.clear();
  localStorage.clear();
  at('/golf/login');
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const email = () => screen.getByLabelText('Email') as HTMLInputElement;
const password = () => screen.getByLabelText('Password') as HTMLInputElement;
const submit = () => screen.getByRole('button', { name: /^sign in$/i });
const fill = async (user: ReturnType<typeof userEvent.setup>, e = 'coach@example.com', p = 'hunter22') => {
  await user.type(email(), e);
  await user.type(password(), p);
};

describe('the sign-in screen', () => {
  it('CH-15907 renders the form in the server markup, with no scene and no clock in it', () => {
    const html = renderToString(<SignIn />);
    expect(html).toContain('id="golf-signin-email"');
    expect(html).toContain('Forgot password?');
    expect(html).not.toContain('data-testid="scene"');
    expect(html).not.toMatch(/Good (morning|afternoon|evening)/);
  });

  it('CH-15601 hydrates without a mismatch, then draws the course from the viewer clock', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2025, 9, 14, 21, 30));
    const html = renderToString(<SignIn />);
    const container = document.createElement('div');
    container.innerHTML = html;
    document.body.appendChild(container);
    const onRecoverableError = vi.fn();
    let root: ReturnType<typeof hydrateRoot> | undefined;
    await act(async () => {
      root = hydrateRoot(container, <SignIn />, { onRecoverableError });
    });
    expect(onRecoverableError).not.toHaveBeenCalled();
    expect(container.querySelector('[data-testid="scene"]')).not.toBeNull();
    // 9:30 pm: the wordmark over the sky flips to ivory (the welcome's type does the same).
    expect(container.querySelector('.ch-au-photo')?.hasAttribute('data-dark')).toBe(true);
    act(() => root?.unmount());
    container.remove();
  });

  it('CH-15101 CH-15703 never hands the server an empty credential pair', () => {
    render(<SignIn signIn={login} />);
    fireEvent.submit(screen.getByRole('form', { name: /sign in to golfhelm/i }));
    expect(login).not.toHaveBeenCalled();
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Enter your email and password to sign in.');
    expect(alert).toHaveAttribute('data-ch-code', 'CH-15101');
    expect(hapticSpy).toHaveBeenCalledWith('warning');
    expect(email()).toHaveAttribute('aria-invalid', 'true');
    expect(password()).not.toHaveAttribute('aria-invalid');
    expect(email()).toHaveFocus();
  });

  it('keeps the button off until both fields are filled, and takes text put in before hydration', async () => {
    const user = userEvent.setup();
    render(<SignIn signIn={login} />);
    await waitFor(() => expect(submit()).toBeDisabled());
    await user.type(email(), 'coach@example.com');
    expect(submit()).toBeDisabled();
    await user.type(password(), 'hunter22');
    expect(submit()).toBeEnabled();
  });

  it('CH-15001 CH-15802 CH-15701 CH-15704 a credentials rejection is about both fields, focuses the first, and buzzes an error', async () => {
    login.mockResolvedValue({ success: false, error: 'Invalid login credentials' });
    const user = userEvent.setup();
    render(<SignIn signIn={login} />);
    await fill(user);
    await user.click(submit());
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Incorrect email or password. Please check your credentials and try again.');
    expect(alert).toHaveAttribute('data-ch-code', 'CH-15001');
    expect(alert).toHaveClass('ch-au-notice--danger');
    expect(email()).toHaveAttribute('aria-invalid', 'true');
    expect(password()).toHaveAttribute('aria-invalid', 'true');
    expect(email()).toHaveAttribute('aria-describedby', alert.id);
    await waitFor(() => expect(email()).toHaveFocus());
    expect(hapticSpy).toHaveBeenCalledWith('press');
    expect(hapticSpy).toHaveBeenLastCalledWith('error');
    expect(login).toHaveBeenCalledWith('coach@example.com', 'hunter22', undefined);
    expect(router.push).not.toHaveBeenCalled();
  });

  it('CH-15001 the server’s wrong-password text reads as the design’s, both fields marked, the attempts kept (Q-98)', async () => {
    login.mockResolvedValue({ success: false, error: 'Invalid email or password (2 attempts remaining)' });
    const user = userEvent.setup();
    render(<SignIn signIn={login} />);
    await fill(user);
    await user.click(submit());
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Incorrect email or password. Please check your credentials and try again.');
    expect(alert).toHaveTextContent('2 attempts remaining before the account is locked for a while.');
    expect(alert).toHaveAttribute('data-ch-code', 'CH-15001');
    expect(email()).toHaveAttribute('aria-invalid', 'true');
  });

  it('CH-15007 any other server sentence (a lockout) is shown as it was said, and marks no field', async () => {
    login.mockResolvedValue({ success: false, error: 'Too many login attempts. Please try again in 14 minutes.' });
    const user = userEvent.setup();
    render(<SignIn signIn={login} />);
    await fill(user);
    await user.click(submit());
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Too many login attempts. Please try again in 14 minutes.');
    expect(alert).toHaveAttribute('data-ch-code', 'CH-15007');
    expect(email()).not.toHaveAttribute('aria-invalid');
  });

  it.each([
    ['CH-15002', 'Email not confirmed', 'Please verify your email address before signing in. Check your inbox for the confirmation link.', 'warning', 'warning'],
    ['CH-15003', 'Too many requests', 'Too many sign-in attempts. Please wait a moment and try again.', 'warning', 'warning'],
    ['CH-15004', 'fetch failed', 'Unable to reach the server. Please check your internet connection and try again.', 'danger', 'error'],
  ])('%s %s is worded, toned and felt as the design says (CH-15703 CH-15704)', async (code, server, words, tone, felt) => {
    login.mockResolvedValue({ success: false, error: server });
    const user = userEvent.setup();
    render(<SignIn signIn={login} />);
    await fill(user);
    await user.click(submit());
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(words);
    expect(alert).toHaveAttribute('data-ch-code', code);
    expect(alert).toHaveClass(`ch-au-notice--${tone}`);
    expect(hapticSpy).toHaveBeenLastCalledWith(felt);
    expect(email()).not.toHaveAttribute('aria-invalid');
  });

  it('CH-15402 shows it is signing in, and stays that way while it navigates away', async () => {
    let finish: (v: unknown) => void = () => {};
    login.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const user = userEvent.setup();
    render(<SignIn signIn={login} />);
    await fill(user);
    await user.click(submit());
    const busy = await screen.findByRole('button', { name: /signing in/i });
    expect(busy).toHaveAttribute('aria-busy', 'true');
    expect(busy).toBeDisabled();
    expect(busy).toHaveAttribute('data-ch-code', 'CH-15402');
    await act(async () => finish({ success: false, error: 'Too many requests' }));
  });

  it('CH-15902 CH-15601 CH-15702 a sign-in that lands opens the course, then goes to the welcome (role routing through next)', async () => {
    login.mockResolvedValue({ success: true, redirectTo: '/golf/dashboard' });
    const user = userEvent.setup();
    const { container } = render(<SignIn signIn={login} />);
    await fill(user);
    await user.click(submit());
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
    await waitFor(() => expect(container.querySelector('.ch-au')?.getAttribute('data-phase')).toBe('opening'));
    expect(hapticSpy).toHaveBeenCalledWith('success');
    // The form is out of reach (and of the screen reader) while the course takes the frame.
    const panel = container.querySelector('.ch-au-panel') as HTMLElement;
    expect(panel.getAttribute('aria-hidden')).toBe('true');
    expect(panel.hasAttribute('inert')).toBe(true);
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/golf/welcome?next=%2Fgolf%2Fdashboard'), { timeout: OPENING_MS + 2000 });
    expect(router.push).toHaveBeenCalledTimes(1);
  });

  it('CH-15902 goes straight to onboarding, with the invite code, when the person has no profile yet', async () => {
    sessionStorage.setItem('golf_login_returnTo', '/golf/join/ABC123');
    login.mockResolvedValue({ success: true, redirectTo: '/golf/player' });
    const user = userEvent.setup();
    const { container } = render(<SignIn signIn={login} />);
    await fill(user);
    await user.click(submit());
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/golf/player?joinCode=ABC123'));
    expect(container.querySelector('.ch-au')?.getAttribute('data-phase')).toBe('login');
    expect(sessionStorage.getItem('golf_login_returnTo')).toBeNull();
  });

  it('CH-15902 never follows a returnTo that is not a safe internal path', async () => {
    sessionStorage.setItem('golf_login_returnTo', '//evil.example/x');
    login.mockResolvedValue({ success: true, redirectTo: '/golf/coach' });
    const user = userEvent.setup();
    render(<SignIn signIn={login} />);
    await fill(user);
    await user.click(submit());
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/golf/coach'));
  });

  it('CH-15901 keeps the returnTo and the demo ref through the round trip, and hands the ref to the server', async () => {
    at('/golf/login?returnTo=/golf/join/ABC123&ref=coach_nick_rini');
    login.mockResolvedValue({ success: true, redirectTo: '/golf/dashboard' });
    const user = userEvent.setup();
    render(<SignIn signIn={login} />);
    await waitFor(() => expect(sessionStorage.getItem('golf_login_returnTo')).toBe('/golf/join/ABC123'));
    expect(sessionStorage.getItem('golf_login_ref')).toBe('coach_nick_rini');
    expect(screen.getByRole('link', { name: 'Create an account' })).toHaveAttribute('href', '/golf/signup?returnTo=%2Fgolf%2Fjoin%2FABC123');
    await fill(user);
    await user.click(submit());
    await waitFor(() => expect(login).toHaveBeenCalledWith('coach@example.com', 'hunter22', 'coach_nick_rini'));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/golf/welcome?next=%2Fgolf%2Fjoin%2FABC123'), { timeout: OPENING_MS + 2000 });
    expect(sessionStorage.getItem('golf_login_ref')).toBeNull();
    expect(sessionStorage.getItem('golf_login_returnTo')).toBeNull();
  });

  it('CH-15906 reloads once on a stale bundle, then says so', async () => {
    const reload = vi.fn();
    vi.stubGlobal('location', { ...window.location, reload, search: '' });
    login.mockRejectedValue(new Error('An unexpected response was received from the server.'));
    const user = userEvent.setup();
    render(<SignIn signIn={login} />);
    await fill(user);
    await user.click(submit());
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
    expect(sessionStorage.getItem(STALE_BUNDLE_RELOAD_KEY)).toBe('1');
    expect(screen.queryByRole('alert')).toBeNull();
    // After the reload (a fresh page, the tab's guard still set) a broken deploy cannot loop the screen.
    cleanup();
    render(<SignIn signIn={login} />);
    await fill(user);
    await user.click(submit());
    // Info tone: it is announced politely (status), not as an alert, since nothing is wrong with the account.
    const notice = (await screen.findByText('The app updated in the background. Please try signing in once more.')).closest('.ch-au-notice') as HTMLElement;
    expect(notice).toHaveAttribute('role', 'status');
    expect(notice).toHaveAttribute('data-ch-code', 'CH-15005');
    expect(notice).toHaveClass('ch-au-notice--info');
    expect(reload).toHaveBeenCalledTimes(1);
    expect(hapticSpy).toHaveBeenLastCalledWith('error');
  });

  it('CH-15006 reports anything else that throws, and says so plainly', async () => {
    login.mockRejectedValue(new Error('socket hang up'));
    const user = userEvent.setup();
    render(<SignIn signIn={login} />);
    await fill(user);
    await user.click(submit());
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('An unexpected error occurred. Please try again.');
    expect(alert).toHaveAttribute('data-ch-code', 'CH-15006');
    expect(logError).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({ action: 'loginAction' }), 'high');
    expect(submit()).toBeEnabled();
  });

  it('CH-15904 shows the notice the URL names, for the middleware and the other auth pages', async () => {
    at('/golf/login?message=session_expired');
    render(<SignIn signIn={login} />);
    const notice = await screen.findByText('Session expired. Please sign in again.');
    expect(notice.closest('[role="status"]')).toHaveAttribute('data-ch-code', 'CH-15904');
  });

  it('CH-15905 has no way back home and no sign-up inside the App Store build', async () => {
    native.is = true;
    render(<SignIn signIn={login} />);
    await waitFor(() => expect(screen.queryByRole('link', { name: 'Create an account' })).toBeNull());
    expect(screen.queryByRole('link', { name: 'Back to home' })).toBeNull();
    cleanup();
    native.is = false;
    render(<SignIn signIn={login} />);
    expect(await screen.findByRole('link', { name: 'Back to home' })).toHaveAttribute('data-ch-code', 'CH-15905');
    expect(screen.getByRole('link', { name: 'Create an account' })).toHaveAttribute('href', '/golf/signup');
  });

  it('CH-15801 CH-15804 puts a skip link first, and keeps the course out of the reading order', () => {
    const { container } = render(<SignIn signIn={login} />);
    const skip = screen.getByRole('link', { name: 'Skip to sign in' });
    expect(skip).toHaveAttribute('href', '#ch-au-form');
    expect(skip).toHaveAttribute('data-ch-code', 'CH-15801');
    expect(container.querySelector('#ch-au-form')).not.toBeNull();
    expect(container.querySelector('.ch-au-photo')).toHaveAttribute('aria-hidden', 'true');
    expect(container.querySelector('.ch-au-photo')).toHaveAttribute('data-ch-code', 'CH-15804');
  });

  it('CH-15805 gives the password eye a name and a pressed state, and a hit area past 44px', async () => {
    const user = userEvent.setup();
    render(<SignIn signIn={login} />);
    const eye = screen.getByRole('button', { name: 'Show password' });
    expect(eye).toHaveAttribute('aria-pressed', 'false');
    await user.click(eye);
    expect(password()).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: 'Hide password' })).toHaveAttribute('aria-pressed', 'true');
    const css = readFileSync('src/clubhouse/styles/auth.css', 'utf8');
    expect(css).toMatch(/\.ch-au-eye::after\s*{[^}]*inset:\s*-7px/);
  });

  it('CH-15909 the phone layout breaks at the same width as useChPhone, in the same stylesheet as desktop', () => {
    const css = readFileSync('src/clubhouse/styles/auth.css', 'utf8');
    const hook = readFileSync('src/clubhouse/lib/use-phone.ts', 'utf8');
    expect(hook).toContain("CH_PHONE_QUERY = '(max-width: 820px)'");
    expect(css).toContain('@media (max-width: 820px)');
    // Desktop and phone are one structure: a grouped-row sheet, not a second form.
    expect(css).toMatch(/@media \(max-width: 820px\)[\s\S]*\.ch-au-fields\s*{[^}]*overflow: hidden/);
    // Both "Forgot password?" links are in the markup and CSS shows one.
    render(<SignIn signIn={login} />);
    expect(screen.getAllByRole('link', { name: 'Forgot password?' })).toHaveLength(2);
    expect(css).toMatch(/\.ch-au-forgot--field\s*{\s*display: none/);
  });

  it('CH-15910 Enter in Email moves to Password, Enter in Password signs in, and a focused field brings the button into view', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    login.mockResolvedValue({ success: false, error: 'Too many requests' });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<SignIn signIn={login} />);
    await user.type(email(), 'coach@example.com{Enter}');
    expect(login).not.toHaveBeenCalled();
    expect(password()).toHaveFocus();
    await user.type(password(), 'hunter22');
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
    await act(async () => void vi.advanceTimersByTime(400));
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({ block: 'nearest', behavior: 'smooth' });
    await user.keyboard('{Enter}');
    await waitFor(() => expect(login).toHaveBeenCalledWith('coach@example.com', 'hunter22', undefined));
  });

  it('carries the autofill and keyboard attributes password managers and iOS need', () => {
    render(<SignIn signIn={login} />);
    expect(email()).toHaveAttribute('autocomplete', 'username');
    expect(email()).toHaveAttribute('inputmode', 'email');
    expect(email()).toHaveAttribute('enterkeyhint', 'next');
    expect(password()).toHaveAttribute('autocomplete', 'current-password');
    expect(password()).toHaveAttribute('enterkeyhint', 'go');
  });

  it('idle marker: the form signs in through the server action only, never from the browser', () => {
    // loginAction resets the shared idle marker in the response that sets the session cookies; a browser-side
    // sign-in would skip that, and middleware would sign the fresh session straight out again.
    const src = readFileSync('src/clubhouse/screens/auth/SignInForm.tsx', 'utf8');
    expect(src).toMatch(/import \{ loginAction \} from '@\/app\/golf\/actions\/auth'/);
    expect(src).toMatch(/signIn = loginAction/);
    expect(src).not.toMatch(/signInWithPassword|supabase\/client|createClient/);
    const action = readFileSync('src/app/golf/actions/auth.ts', 'utf8');
    expect(action.indexOf('await resetSessionIdleMarker()')).toBeGreaterThan(-1);
  });
});

describe('the front door flag chooses the page, and only the page', () => {
  it('flag off: today pages render untouched', () => {
    flag.on = false;
    render(LoginLayout({ children: <p>Today login page</p> }));
    expect(screen.getByText('Today login page')).toBeInTheDocument();
    expect(screen.queryByText('The Clubhouse sign in')).toBeNull();
    cleanup();
    render(WelcomeLayout({ children: <p>Today welcome page</p> }));
    expect(screen.getByText('Today welcome page')).toBeInTheDocument();
    expect(screen.queryByText('The Clubhouse welcome')).toBeNull();
  });

  it('flag on: the Clubhouse pages render in their place', () => {
    flag.on = true;
    render(LoginLayout({ children: <p>Today login page</p> }));
    expect(screen.getByText('The Clubhouse sign in')).toBeInTheDocument();
    expect(screen.queryByText('Today login page')).toBeNull();
    cleanup();
    render(WelcomeLayout({ children: <p>Today welcome page</p> }));
    expect(screen.getByText('The Clubhouse welcome')).toBeInTheDocument();
    expect(screen.queryByText('Today welcome page')).toBeNull();
  });
});

const welcome = (data = PREVIEW_WELCOME_COACH, navigate = vi.fn()) => ({
  navigate,
  ui: (
    <FixedClock.Provider value={new Date(2025, 9, 14, 8, 30)}>
      <WelcomeStage>
        <Welcome data={data} navigate={navigate} />
      </WelcomeStage>
    </FixedClock.Provider>
  ),
});

describe('the welcome', () => {
  it('CH-15602 draws the greeting from the viewer clock, never the server: hydration settles before it lands', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2025, 9, 14, 9, 0));
    const ui = (
      <WelcomeStage>
        <Welcome data={PREVIEW_WELCOME_COACH} navigate={() => {}} />
      </WelcomeStage>
    );
    const html = renderToString(ui);
    expect(html).toContain('<h1');
    expect(html).not.toMatch(/Good (morning|afternoon|evening)/);
    expect(html).not.toContain('Tuesday');
    const container = document.createElement('div');
    container.innerHTML = html;
    document.body.appendChild(container);
    const onRecoverableError = vi.fn();
    let root: ReturnType<typeof hydrateRoot> | undefined;
    await act(async () => {
      root = hydrateRoot(container, ui, { onRecoverableError });
    });
    expect(onRecoverableError).not.toHaveBeenCalled();
    expect(container.querySelector('h1')?.textContent).toContain('Good morning,');
    expect(container.querySelector('h1')?.textContent).toContain('Coach Reyes.');
    act(() => root?.unmount());
    container.remove();
  });

  it.each([
    [8.5, 'Good morning,'],
    [12, 'Good afternoon,'],
    [16.9, 'Good afternoon,'],
    [17, 'Good evening,'],
    [4 + 29 / 60, 'Good evening,'],
    [4.5, 'Good morning,'],
  ])('CH-15602 at %s it says %s', (hour, line) => {
    const d = new Date(2025, 9, 14, Math.floor(hour), Math.round((hour % 1) * 60));
    render(
      <FixedClock.Provider value={d}>
        <WelcomeStage>
          <Welcome data={PREVIEW_WELCOME_COACH} navigate={vi.fn()} />
        </WelcomeStage>
      </FixedClock.Provider>,
    );
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain(line);
  });

  it('CH-15803 greets a player by first name and announces the sentence once', () => {
    const { ui } = welcome(PREVIEW_WELCOME_PLAYER);
    render(ui);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Good morning,Theo.');
    const live = screen.getByRole('status');
    expect(live).toHaveTextContent('Good morning, Theo.');
    expect(live).toHaveAttribute('aria-live', 'polite');
    expect(live).toHaveAttribute('data-ch-code', 'CH-15803');
  });

  it('CH-15303 stands on the greeting alone when the name could not be read', () => {
    const { ui } = welcome(PREVIEW_WELCOME_NO_NAME);
    render(ui);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Good morning.');
    expect(screen.getByRole('status')).toHaveTextContent('Good morning.');
  });

  it('lists up to three things since the last visit, with when that was', () => {
    const { ui } = welcome(PREVIEW_WELCOME_COACH);
    render(ui);
    expect(screen.getByText('Since you last signed in')).toBeInTheDocument();
    expect(screen.getByText(/^Sunday at 9:12 ?pm$/)).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getByText('4 new messages')).toBeInTheDocument();
    expect(screen.getByText('Sofia, Eli and 2 others')).toBeInTheDocument();
  });

  it('CH-15301 says nothing is new, with the time, when nothing is', () => {
    const { ui } = welcome(PREVIEW_WELCOME_CAUGHT_UP);
    render(ui);
    expect(screen.getByText('You’re all caught up')).toBeInTheDocument();
    expect(screen.getByText('Nothing new since your last visit.')).toBeInTheDocument();
    expect(screen.getByText('Since you last signed in')).toBeInTheDocument();
    expect(screen.queryByRole('listitem')).toBeNull();
    expect(document.querySelector('[data-ch-code="CH-15301"]')).not.toBeNull();
  });

  it('CH-15302 welcomes a first visit, with no last-visit time', () => {
    const { ui } = welcome(PREVIEW_WELCOME_FIRST);
    render(ui);
    expect(screen.getByText('Your first time in')).toBeInTheDocument();
    expect(screen.queryByText('Since you last signed in')).toBeNull();
    expect(screen.getByText('Your team’s updates will show up here')).toBeInTheDocument();
    expect(screen.getByText('Messages, posted rounds and RSVPs since your last visit.')).toBeInTheDocument();
    expect(document.querySelector('[data-ch-code="CH-15302"]')).not.toBeNull();
  });

  it('CH-15201 says so when the updates could not be read, and never claims all caught up', () => {
    const { ui } = welcome(PREVIEW_WELCOME_FAILED);
    render(ui);
    expect(screen.getByText('Updates didn’t load')).toBeInTheDocument();
    expect(screen.getByText('They’ll be waiting in your notifications.')).toBeInTheDocument();
    expect(screen.queryByText('You’re all caught up')).toBeNull();
    expect(document.querySelector('[data-ch-code="CH-15201"]')).not.toBeNull();
    // Continue is there whatever the reads did.
    expect(screen.getByRole('button', { name: /continue/i })).toBeEnabled();
  });

  it('waits for Continue: it never advances on its own', () => {
    vi.useFakeTimers();
    const { ui, navigate } = welcome();
    render(ui);
    act(() => void vi.advanceTimersByTime(60_000));
    expect(navigate).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('CH-15604 CH-15705 Continue buzzes once, folds the course into the canvas, then goes to the destination, once', () => {
    vi.useFakeTimers();
    at('/golf/welcome?next=%2Fgolf%2Fdashboard%2Froster');
    const { ui, navigate } = welcome();
    const { container } = render(ui);
    const go = screen.getByRole('button', { name: /continue/i });
    fireEvent.click(go);
    fireEvent.click(go);
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(hapticSpy.mock.calls.filter(([k]) => k === 'commit')).toHaveLength(1);
    expect(container.querySelector('.ch-au')?.getAttribute('data-phase')).toBe('leaving');
    expect(container.querySelector('.ch-au-photo')?.hasAttribute('data-fold')).toBe(true);
    expect(screen.getByTestId('scene')).toHaveAttribute('data-camera', 'leave');
    act(() => void vi.advanceTimersByTime(HANDOFF_MS.navigate - 1));
    expect(navigate).not.toHaveBeenCalled();
    act(() => void vi.advanceTimersByTime(1));
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith('/golf/dashboard/roster');
  });

  it('Return does what Continue does, on desktop', () => {
    vi.useFakeTimers();
    const { ui, navigate } = welcome();
    render(ui);
    fireEvent.keyDown(window, { key: 'Enter' });
    act(() => void vi.advanceTimersByTime(HANDOFF_MS.navigate));
    expect(navigate).toHaveBeenCalledWith('/golf/dashboard');
  });

  it('goes to the dashboard when next is not a safe internal path', () => {
    vi.useFakeTimers();
    at('/golf/welcome?next=//evil.example');
    const { ui, navigate } = welcome();
    render(ui);
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    act(() => void vi.advanceTimersByTime(HANDOFF_MS.navigate));
    expect(navigate).toHaveBeenCalledWith('/golf/dashboard');
  });

  it('hands the legacy admin to the console when there is no next', () => {
    vi.useFakeTimers();
    const { ui, navigate } = welcome({ ...PREVIEW_WELCOME_COACH, isAdmin: true, clubhouseDashboard: false });
    render(ui);
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    act(() => void vi.advanceTimersByTime(HANDOFF_MS.plain));
    expect(navigate).toHaveBeenCalledWith('/admin');
  });

  it('only folds when the destination is a dashboard page that is Clubhouse: otherwise the welcome just leaves', () => {
    vi.useFakeTimers();
    at('/golf/welcome?next=%2Fgolf%2Fjoin%2FABC123');
    const { ui, navigate } = welcome();
    const { container } = render(ui);
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    expect(container.querySelector('.ch-au-photo')?.hasAttribute('data-fold')).toBe(false);
    act(() => void vi.advanceTimersByTime(HANDOFF_MS.plain));
    expect(navigate).toHaveBeenCalledWith('/golf/join/ABC123');
  });

  it('CH-15605 under reduced motion the hand-off is a fade, and quick', () => {
    setMedia({ reduced: true });
    vi.useFakeTimers();
    const { ui, navigate } = welcome();
    const { container } = render(ui);
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    expect(container.querySelector('.ch-au-photo')?.hasAttribute('data-fold')).toBe(false);
    expect(container.querySelector('.ch-root')?.getAttribute('data-motion')).toBe('off');
    act(() => void vi.advanceTimersByTime(HANDOFF_MS.reducedNavigate));
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it('prefetches the destination while the person reads', () => {
    at('/golf/welcome?next=%2Fgolf%2Fdashboard%2Fstats');
    render(<FixedClock.Provider value={PREVIEW_AUTH_NOW}><WelcomeStage><Welcome data={PREVIEW_WELCOME_COACH} /></WelcomeStage></FixedClock.Provider>);
    expect(router.prefetch).toHaveBeenCalledWith('/golf/dashboard/stats');
  });

  it('CH-15401 draws the frame and the course while the greeting is still being read, and the course is not redrawn when it lands', () => {
    const { container, rerender } = render(
      <FixedClock.Provider value={new Date(2025, 9, 14, 8, 30)}>
        <WelcomeStage />
      </FixedClock.Provider>,
    );
    expect(container.querySelector('.ch-au-photo')).toHaveAttribute('data-ch-code', 'CH-15401');
    const scene = screen.getByTestId('scene');
    expect(scene).toHaveAttribute('data-camera', 'push');
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
    // The greeting streams in as children of the same stage: the very same scene node stays.
    rerender(
      <FixedClock.Provider value={new Date(2025, 9, 14, 8, 30)}>
        <WelcomeStage>
          <Welcome data={PREVIEW_WELCOME_COACH} navigate={vi.fn()} />
        </WelcomeStage>
      </FixedClock.Provider>,
    );
    expect(screen.getByTestId('scene')).toBe(scene);
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
  });

  it('the course fills the frame, and the ball is asked to fly', () => {
    render(welcome().ui);
    expect(screen.getByTestId('scene')).toHaveAttribute('data-camera', 'push');
    expect(screen.getByTestId('scene')).toHaveAttribute('data-play', 'true');
  });
});

describe('the painted course', () => {
  const svgPause = vi.fn();
  const svgUnpause = vi.fn();
  beforeEach(() => {
    (SVGSVGElement.prototype as unknown as Record<string, unknown>).pauseAnimations = svgPause;
    (SVGSVGElement.prototype as unknown as Record<string, unknown>).unpauseAnimations = svgUnpause;
  });
  afterEach(() => {
    delete (SVGSVGElement.prototype as unknown as Record<string, unknown>).pauseAnimations;
    delete (SVGSVGElement.prototype as unknown as Record<string, unknown>).unpauseAnimations;
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  });

  it('draws each thing that moves on a layer of its own', () => {
    const { container } = render(<GolfScene hour={9} />);
    const layers = Array.from(container.querySelectorAll('svg')).map((s) => s.getAttribute('class'));
    expect(layers.filter((c) => c?.includes('ch-au-layer--'))).toEqual([
      'ch-au-layer ch-au-layer--sky',
      'ch-au-layer ch-au-layer--clouds',
      'ch-au-layer ch-au-layer--birds',
      'ch-au-layer ch-au-layer--land',
      'ch-au-layer ch-au-layer--fx',
    ]);
    // By day there are no stars to twinkle; at night there are.
    cleanup();
    const night = render(<GolfScene hour={23} />);
    expect(night.container.querySelector('.ch-au-layer--stars')).not.toBeNull();
    expect(night.container.querySelectorAll('.ch-au-tw').length).toBeGreaterThan(10);
  });

  it('CH-15606 holds every loop still while the tab is hidden, and lets them go when it is back', () => {
    const { container } = render(<GolfScene hour={9} />);
    const scene = container.querySelector('.ch-au-scene') as HTMLElement;
    expect(scene.hasAttribute('data-paused')).toBe(false);
    svgPause.mockClear();
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    act(() => void document.dispatchEvent(new Event('visibilitychange')));
    expect(scene.hasAttribute('data-paused')).toBe(true);
    expect(svgPause).toHaveBeenCalled();
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    act(() => void document.dispatchEvent(new Event('visibilitychange')));
    expect(scene.hasAttribute('data-paused')).toBe(false);
    expect(svgUnpause).toHaveBeenCalled();
  });

  it('CH-15605 under reduced motion it never moves: loops paused and the ball already on the green', () => {
    setMedia({ reduced: true });
    const { container } = render(<GolfScene hour={9} play />);
    const scene = container.querySelector('.ch-au-scene') as HTMLElement;
    expect(scene.getAttribute('data-motion')).toBe('reduced');
    expect(scene.hasAttribute('data-paused')).toBe(true);
    expect(svgPause).toHaveBeenCalled();
    const ball = container.querySelector('.ch-au-layer--fx circle[fill="#FFFFFF"]') as SVGCircleElement;
    expect(ball.getAttribute('cx')).toBe('1052');
    expect(ball.getAttribute('cy')).toBe('648');
    expect(ball.style.opacity).toBe('1');
  });

  it('keeps the ball out of sight until the welcome asks for it', () => {
    const { container } = render(<GolfScene hour={9} />);
    const ball = container.querySelector('.ch-au-layer--fx circle[fill="#FFFFFF"]') as SVGCircleElement;
    expect(ball.style.opacity).toBe('0');
  });

  it('CH-15603 starts the camera at rest and moves it a couple of frames later, so the transition has somewhere to start', async () => {
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb));
    vi.stubGlobal('cancelAnimationFrame', () => {});
    const { container } = render(<GolfScene hour={9} camera="push" />);
    const scene = container.querySelector('.ch-au-scene') as HTMLElement;
    expect(scene.getAttribute('data-camera')).toBe('rest');
    await act(async () => void frames.splice(0).forEach((f) => f(0)));
    await act(async () => void frames.splice(0).forEach((f) => f(16)));
    expect(scene.getAttribute('data-camera')).toBe('push');
    expect(scene.style.getPropertyValue('--ch-au-zoom')).toBe('var(--ch-au-push)');
  });
});
