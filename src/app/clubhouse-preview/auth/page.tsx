import { notFound } from 'next/navigation';
import { PreviewAuth } from './PreviewAuth';
import { PreviewGate, type GateScreen } from './PreviewGate';

const GATE_SCREENS: readonly string[] = ['reset', 'join', 'joinconfirm', 'staff', 'pending', 'demo'];

/**
 * Dev-only preview of the sign-in page and the welcome, over sample data, with
 * no auth and no database. 404 in production. They are outside the dashboard
 * frame, so this is its own route (the shared `[screen]` page draws inside it).
 *
 *   /clubhouse-preview/auth ?screen=signin | welcome
 *     signin:  &state=coach | player   &fail=empty | creds | unverified | rate | network | stale
 *     signin:  &pending=1 holds Sign in (and Send reset link) in flight, to look at the submitting state
 *     signin:  &view=forgot opens the reset form in the panel (Send answers after 700ms, then check your email)
 *     welcome: &state=coach | player | caughtup | first | failed | noname
 *     welcome: &go=1 makes Continue navigate into the preview dashboard, to watch the hand-off end to end
 *     either:  &hour=8.5   (the time of day, local; 6.4 sunrise, 12.5 midday, 18.6 golden hour, 22 night)
 *   The screens beside sign in (the front door's other ways in), each over fakes, with the same &hour=:
 *     reset:   &state=checking | form | expired | sent | saved | live (the whole flow, answering after a beat)
 *              &sim=expired | weak | same | rate | network | saveexpired | hold   &previous=1 (someone else was signed in)
 *              &fail=field | mismatch | banner (state=form with a refusal drawn)
 *     join:    &state=empty | partial | full | long (a ten-character code) | problem (too short, refused)
 *     joinconfirm: &state=confirm | joined | already | invalid | another | refused | long (long names)   &sim=already | another | refused | network | hold (what Join answers)
 *     staff:   &state=live (checks the session, then accept or create) | accept | create | problem | weak | wrong | failed | joined | expired | invalid | admin
 *              &sim=signedout | already ... (previewGateWrites)
 *     pending: &state=waiting | checked | noname | signoutfail
 *     demo:    &state=form | invite (the address a demo email carries) | expired | problem | refused | signedin | checking | live (checks the session; &sim=signedin | refused)
 */
export default async function ClubhouseAuthPreview({ searchParams }: { searchParams: Promise<{ screen?: string; state?: string; fail?: string; hour?: string; go?: string; pending?: string; sim?: string; previous?: string; fail?: string }> }) {
  if (process.env.NODE_ENV === 'production') notFound();
  const { screen, state, fail, hour, go, pending, sim, previous } = await searchParams;
  const h = hour === undefined ? undefined : Number(hour);
  const at = h !== undefined && Number.isFinite(h) ? h : undefined;
  if (GATE_SCREENS.includes(screen ?? '')) return <PreviewGate screen={screen as GateScreen} state={state} sim={sim} hour={at} previous={previous === '1'} fail={fail} />;
  return <PreviewAuth screen={screen === 'welcome' ? 'welcome' : 'signin'} state={state} fail={fail} hour={h !== undefined && Number.isFinite(h) ? h : undefined} go={go === '1'} pending={pending === '1'} />;
}
