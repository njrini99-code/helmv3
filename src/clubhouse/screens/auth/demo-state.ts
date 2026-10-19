/**
 * The demo entry's checks: today's page (`src/app/golf/(auth)/demo/page.tsx`), word for word, so a message appears
 * here for exactly the input it appears for there. `enterDemo` validates again on the server; these only make the
 * answer fast. Everything the demo does (the shared account, the session marker, where it lands) is that action's.
 */
export const validateName = (v: string): string | undefined => {
  if (!v.trim()) return 'Name is required.';
  if (v.trim().length > 120) return 'Must be 120 characters or fewer.';
  return undefined;
};

export const validateEmail = (v: string): string | undefined => {
  if (!v.trim()) return 'Email is required.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())) return 'Enter a valid email address.';
  if (v.trim().length > 254) return 'Email is too long.';
  return undefined;
};

export const validateSchool = (v: string): string | undefined => {
  if (!v.trim()) return 'School / Program is required.';
  if (v.trim().length > 160) return 'Must be 160 characters or fewer.';
  return undefined;
};

export type DemoField = 'name' | 'email' | 'school';

/** The first thing wrong, in the order the boxes are drawn; null when it can be sent. */
export function demoProblem(f: { name: string; email: string; school: string }): { field: DemoField; message: string } | null {
  const name = validateName(f.name);
  if (name) return { field: 'name', message: name };
  const email = validateEmail(f.email);
  if (email) return { field: 'email', message: email };
  const school = validateSchool(f.school);
  if (school) return { field: 'school', message: school };
  return null;
}

/** A demo-invite email links here as `?ref=<address>`: only an address that passes the field's own check is taken. */
export function refEmail(raw: string | null): string {
  const v = raw?.trim().toLowerCase() ?? '';
  return v && !validateEmail(v) ? v : '';
}

export const DEMO_EXPIRED_NOTICE = 'Your demo session timed out. Enter your info again to jump right back in.';
