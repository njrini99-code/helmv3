import 'server-only';
import { cookies, headers } from 'next/headers';
import { CH_PHONE_COOKIE } from './phone-cookie';

/**
 * The request's guess at a phone, for a first visit with no layout cookie: the Sec-CH-UA-Mobile client hint where the
 * browser sends one, else an iPhone, iPod, mobile Android or the native app's user agent. An iPad or a desktop is not a
 * phone. Only a guess: the client corrects it right after hydration, as it does a stale cookie.
 */
export function phoneFromRequest(uaMobile: string | null, userAgent: string | null): boolean {
  if (uaMobile === '?1') return true;
  if (uaMobile === '?0') return false;
  const ua = userAgent ?? '';
  return /iPhone|iPod|Android.*Mobile|HelmSportsLabsApp/i.test(ua) && !/iPad/i.test(ua);
}

/**
 * The device's last drawn layout (see ChPhoneHintProvider). With no cookie yet (a first visit), the request's own
 * guess, so a phone's first paint is the phone layout and not the desktop one (high-fidelity audit F03, T01).
 */
export async function phoneHint(): Promise<boolean> {
  const remembered = (await cookies()).get(CH_PHONE_COOKIE)?.value;
  if (remembered === '1') return true;
  if (remembered === '0') return false;
  const h = await headers();
  return phoneFromRequest(h.get('sec-ch-ua-mobile'), h.get('user-agent'));
}
