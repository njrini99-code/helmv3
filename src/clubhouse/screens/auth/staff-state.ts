import { EMAIL_RE, passwordProblem } from '../onboard/logic';

/** The staff invitation's words and checks: today's `staff-join-client.tsx`, in Clubhouse's voice. */

export type StaffRole = 'admin' | 'coach' | undefined;

export const roleLabel = (role: StaffRole): string => (role === 'admin' ? 'Program admin' : 'Assistant coach');
export const roleLine = (role: StaffRole): string => (role === 'admin' ? 'You’ll have head-coach access across every team in this program.' : 'You’ll have coaching access to this team.');

export type StaffField = 'name' | 'email' | 'password';
export type StaffProblem = { field: StaffField; message: string; code: 'CH-15142' };

/** The first thing wrong with the account form, in the order the fields are drawn; null when it can be sent. */
export function staffProblem(f: { name: string; email: string; password: string }): StaffProblem | null {
  if (!f.name.trim()) return { field: 'name', message: 'Enter your name.', code: 'CH-15142' };
  const email = f.email.trim();
  if (!email) return { field: 'email', message: 'Enter your email.', code: 'CH-15142' };
  if (!EMAIL_RE.test(email)) return { field: 'email', message: 'Please enter a valid email address.', code: 'CH-15142' };
  const pw = passwordProblem(f.password);
  if (pw) return { field: 'password', message: f.password ? pw : 'Choose a password.', code: 'CH-15142' };
  return null;
}

/**
 * A refused redeem. The one worth a way forward is an account that already belongs to another program: nothing is
 * wrong with the link, it was opened on the wrong account, and the answer is to sign out and use the right one.
 */
export const wrongAccount = (error?: string | null): boolean => /already belongs to another program|different email/i.test(error ?? '');
