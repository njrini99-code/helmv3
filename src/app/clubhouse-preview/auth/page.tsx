import { notFound } from 'next/navigation';
import { PreviewAuth } from './PreviewAuth';

/**
 * Dev-only preview of the sign-in page and the welcome, over sample data, with
 * no auth and no database. 404 in production. They are outside the dashboard
 * frame, so this is its own route (the shared `[screen]` page draws inside it).
 *
 *   /clubhouse-preview/auth ?screen=signin | welcome
 *     signin:  &state=coach | player   &fail=empty | creds | unverified | rate | network | stale
 *     welcome: &state=coach | player | caughtup | first | failed | noname
 *     welcome: &go=1 makes Continue navigate into the preview dashboard, to watch the hand-off end to end
 *     either:  &hour=8.5   (the time of day, local; 6.4 sunrise, 12.5 midday, 18.6 golden hour, 22 night)
 */
export default async function ClubhouseAuthPreview({ searchParams }: { searchParams: Promise<{ screen?: string; state?: string; fail?: string; hour?: string; go?: string }> }) {
  if (process.env.NODE_ENV === 'production') notFound();
  const { screen, state, fail, hour, go } = await searchParams;
  const h = hour === undefined ? undefined : Number(hour);
  return <PreviewAuth screen={screen === 'welcome' ? 'welcome' : 'signin'} state={state} fail={fail} hour={h !== undefined && Number.isFinite(h) ? h : undefined} go={go === '1'} />;
}
