import 'server-only';
import { cookies } from 'next/headers';
import { CH_PHONE_COOKIE } from './use-phone';

/** The device's last drawn layout (see ChPhoneHintProvider); desktop when the cookie is missing. */
export async function phoneHint(): Promise<boolean> {
  return (await cookies()).get(CH_PHONE_COOKIE)?.value === '1';
}
