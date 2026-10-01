import { validatePassword } from '@/lib/auth/password-validation';

/**
 * Sign-up and onboarding, the pure half: which questions each path asks, and
 * the rules behind every field. Nothing here talks to the server; the screens
 * call the same actions today's sign-up calls (validateAccessCode, signupAction,
 * completePlayerOnboarding, submitDemoRequest), so the rules below mirror the
 * server's and never replace them.
 *
 * Paths follow the owner's decisions of 2026-09-30 (Q-96): a roster code signs
 * up players only, a staff code signs up assistant coaches (instantly, no role
 * picker), there is no head-coach path (the owner creates head coaches), and
 * Request access reaches the owner.
 */

export type OnboardStep =
  | 'intro'
  | 'code'
  | 'name'
  | 'grad'
  | 'account'
  | 'game'
  | 'photo'
  | 'done'
  | 'staffdone'
  | 'rwho'
  | 'rdetails'
  | 'sent';

export type OnboardPath = 'pre' | 'player' | 'staff' | 'request';

export const PLAN: Record<OnboardPath, readonly OnboardStep[]> = {
  pre: ['intro', 'code'],
  player: ['intro', 'code', 'name', 'grad', 'account', 'game', 'photo', 'done'],
  staff: ['intro', 'code', 'name', 'account', 'staffdone'],
  request: ['intro', 'rwho', 'rdetails', 'sent'],
};

/** The rail's section for each question (full-screen moments have none). */
export const SECTION: Partial<Record<OnboardStep, string>> = {
  code: 'Team',
  name: 'You',
  grad: 'You',
  account: 'Account',
  game: 'Your game',
  photo: 'Photo',
  rwho: 'You',
  rdetails: 'Details',
};

/** Screens where the question pane gives way to the whole scene. */
export const FULL_STEPS: ReadonlySet<OnboardStep> = new Set(['intro', 'done', 'staffdone', 'sent']);

/** Steps the account exists by: Back never returns across the account. */
export const AFTER_ACCOUNT: ReadonlySet<OnboardStep> = new Set(['game', 'photo', 'done', 'staffdone']);

export type CodeKind = 'roster' | 'staff';

export function pathOf(intent: 'code' | 'request' | null, kind: CodeKind | null): OnboardPath {
  if (intent === 'request') return 'request';
  if (kind === 'staff') return 'staff';
  if (kind === 'roster') return 'player';
  return 'pre';
}

/** The rail: its sections in order, the current one, and "n of m". */
export function railOf(path: OnboardPath, step: OnboardStep): { sections: string[]; current: number } {
  const sections: string[] = [];
  for (const s of PLAN[path]) {
    const x = SECTION[s];
    if (x && !sections.includes(x)) sections.push(x);
  }
  // Before the code is known the rail still shows where the path goes.
  if (path === 'pre') sections.push('You', 'Account');
  const cur = SECTION[step];
  return { sections, current: cur ? sections.indexOf(cur) : -1 };
}

/** The camera's push toward the pin as the questions advance (design: 1 + progress × .38). */
export function zoomOf(path: OnboardPath, step: OnboardStep): number {
  const plan = PLAN[path];
  const i = Math.max(0, plan.indexOf(step));
  return 1 + (plan.length > 1 ? i / (plan.length - 1) : 0) * 0.38;
}

// ── Team code ────────────────────────────────────────────────────────────────

/**
 * Team codes are 8 characters today (generateJoinCode, and staff codes share
 * it), but three older teams in production carry 6- and 9-character codes and
 * the join screen accepts 4 to 10, so the field takes up to 10 and draws a slot
 * for every character past eight.
 */
export const CODE_MIN = 4;
export const CODE_MAX = 10;
export const CODE_SLOTS = 8;

export const cleanCode = (v: string): string => v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, CODE_MAX);

/** Checked on its own only at eight characters and after a pause; any other length is checked on Continue. */
export const codeAutoChecks = (code: string): boolean => code.length === CODE_SLOTS;
export const codeCanSubmit = (code: string): boolean => code.length >= CODE_MIN;

export function slotCount(code: string): number {
  return Math.max(CODE_SLOTS, Math.min(CODE_MAX, code.length));
}

/** The prefill an invite link carries (/golf/join/<CODE> → ?returnTo=, or ?joinCode= / ?code=), as today's sign-up reads it. */
export function codeFromSearch(search: string): string | null {
  const params = new URLSearchParams(search);
  let linkCode = params.get('joinCode') || params.get('code');
  if (!linkCode) {
    const returnTo = params.get('returnTo');
    const match = returnTo?.match(/\/golf\/join\/([^/?#]+)/i);
    if (match?.[1]) {
      try {
        linkCode = decodeURIComponent(match[1]);
      } catch {
        linkCode = match[1];
      }
    }
  }
  const c = linkCode ? cleanCode(linkCode.trim()) : '';
  return c.length >= CODE_MIN ? c : null;
}

// ── Graduation year ──────────────────────────────────────────────────────────

/**
 * The first class still to graduate: from July the season's seniors graduate
 * next spring.
 */
export function firstGradYear(now: Date): number {
  return now.getMonth() >= 6 ? now.getFullYear() + 1 : now.getFullYear();
}

/** Today's sign-up estimates age from the graduation year; under 13 cannot sign up (COPPA). */
export const approxAge = (grad: number, now: Date): number => now.getFullYear() - (grad - 18);
export const needsGuardianConsent = (grad: number, now: Date): boolean => {
  const a = approxAge(grad, now);
  return a >= 13 && a <= 17;
};

const CLASS_WORD = ['Senior', 'Junior', 'Sophomore', 'Freshman'] as const;

/** Class on the roster, from how many seasons are left, never from a fixed table. */
export function classOf(grad: number, now: Date): string {
  const left = grad - firstGradYear(now);
  return left >= 0 && left < CLASS_WORD.length ? CLASS_WORD[left]! : 'Recruit';
}

/** Six tiles from the first class still to graduate; a year that would put the player under 13 is not offered. */
export function gradYears(now: Date): number[] {
  const first = firstGradYear(now);
  return Array.from({ length: 6 }, (_, i) => first + i).filter((y) => approxAge(y, now) >= 13);
}

// ── Account ──────────────────────────────────────────────────────────────────

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * The rules drawn under the password are the server's (validatePassword), so
 * a password that ticks every line is never refused for a rule the screen did
 * not show. A breached password can still be refused by the auth server, and
 * its own sentence is shown as it arrives.
 */
export function passwordRules(p: string): Array<{ label: string; ok: boolean }> {
  const r = validatePassword(p).requirements;
  return [
    { label: '8+ characters', ok: r.minLength },
    { label: 'Upper and lower case', ok: r.hasUppercase && r.hasLowercase },
    { label: 'A number', ok: r.hasNumber },
    { label: 'A symbol', ok: r.hasSpecialChar },
  ];
}

/** The meter's four bars: one per rule met. */
export const passwordScore = (p: string): number => (p ? passwordRules(p).filter((r) => r.ok).length : 0);

/** The first thing wrong, in the design's words; null when the server's rules pass. */
export function passwordProblem(p: string): string | null {
  const v = validatePassword(p);
  if (!v.requirements.minLength) return 'Use at least 8 characters.';
  if (!v.requirements.hasUppercase || !v.requirements.hasLowercase) return 'Add upper and lower case letters.';
  if (!v.requirements.hasNumber) return 'Add a number.';
  if (!v.requirements.hasSpecialChar) return 'Add a symbol, like ! or #.';
  if (!v.requirements.notCommon) return 'That password is too common. Choose another.';
  return null;
}

/**
 * The server's sign-up errors, in the words the design gives each. Anything
 * the server already wrote for people (a breached password, a lockout) passes
 * through, as today's form does.
 */
export type AccountError = { field: 'email' | 'pw' | null; message: string; signIn?: boolean };

export function accountErrorFor(raw: string): AccountError {
  const lower = raw.toLowerCase();
  if (lower.includes('already registered') || lower.includes('already exists') || lower.includes('user_already_exists')) {
    return { field: 'email', message: 'An account with this email already exists. Please sign in instead, or use a different email.', signIn: true };
  }
  if (lower.includes('invalid email') || lower.includes('validate email')) {
    return { field: 'email', message: 'Please enter a valid email address.' };
  }
  if (lower.includes('weak password') || lower.includes('weak_password') || lower.includes('password must') || lower.includes('stronger password')) {
    return {
      field: 'pw',
      message: /[a-z]{4,}\s+[a-z]{4,}/i.test(raw) ? raw : 'That password was rejected. Try a longer one with a mix of letters, numbers and symbols that you have not used elsewhere.',
    };
  }
  if (lower.includes('network') || lower.includes('fetch')) {
    return { field: null, message: 'Unable to reach the server. Please check your internet connection and try again.' };
  }
  if (lower.includes('rate limit') || lower.includes('too many')) {
    return { field: null, message: 'Too many attempts. Please wait a moment and try again.' };
  }
  return { field: null, message: raw };
}

// ── Your game ────────────────────────────────────────────────────────────────

export const HCP_MIN = -6;
export const HCP_MAX = 36;

/** A plus handicap is stored negative (as production does) and shown with a plus. */
export const fmtHcp = (n: number | null): string => (n == null ? '' : n < 0 ? `+${Math.abs(n).toFixed(1)}` : n.toFixed(1));

export const clampHcp = (v: number): number => Math.round(Math.max(HCP_MIN, Math.min(HCP_MAX, v)) * 10) / 10;

export function hcpWords(n: number | null): string {
  if (n == null) return 'No handicap yet. That’s fine, your coach can add one later.';
  if (n < 0) return 'Plus handicap. Better than scratch.';
  if (n === 0) return 'Scratch.';
  if (n <= 5) return 'Low single digits.';
  if (n <= 12) return 'Single to low double digits.';
  return 'Still building. Rounds you post here help.';
}

export const cleanState = (v: string): string => v.replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase();
export const cleanCity = (v: string): string => v.slice(0, 40);

export function hometownProblem(city: string, state: string): string | null {
  if (state && state.length !== 2) return 'Use the two-letter code, like TX.';
  if (city.trim() && !state) return 'Add the state.';
  return null;
}

// ── Photo ────────────────────────────────────────────────────────────────────

/**
 * The avatars bucket takes JPEG, PNG, GIF and WebP up to 2 MB (checked live
 * 2026-09-30), so HEIC is refused here rather than failing at the bucket.
 */
export const PHOTO_MAX_MB = 2;
export const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const;
export function photoProblem(file: { type: string; size: number }): string | null {
  if (!(PHOTO_TYPES as readonly string[]).includes(file.type)) return 'Choose a JPG, PNG or WebP image.';
  if (file.size > PHOTO_MAX_MB * 1024 * 1024) return `That photo is over ${PHOTO_MAX_MB} MB. Try a smaller one.`;
  return null;
}

// ── Request access ───────────────────────────────────────────────────────────

export type RequestWho = 'coach' | 'ad' | 'player';
export const REQUEST_TITLE: Record<RequestWho, string> = { coach: 'Coach', ad: 'Athletic director', player: 'Player' };

/** demo_requests.interest_type allows golf_coach, golf_player and organization. */
export const REQUEST_INTEREST: Record<RequestWho, 'golf_coach' | 'golf_player' | 'organization'> = {
  coach: 'golf_coach',
  ad: 'organization',
  player: 'golf_player',
};

export interface RequestDetails {
  who: RequestWho | null;
  first: string;
  last: string;
  school: string;
  coach: string;
  email: string;
  note: string;
}

export function requestProblem(d: RequestDetails): { field: 'first' | 'last' | 'school' | 'email'; message: string } | null {
  if (!d.first.trim()) return { field: 'first', message: 'Enter your first name.' };
  if (!d.last.trim()) return { field: 'last', message: 'Enter your last name.' };
  if (!d.school.trim()) return { field: 'school', message: 'Enter your school.' };
  if (!d.email.trim()) return { field: 'email', message: 'Enter your email.' };
  if (!EMAIL_RE.test(d.email.trim())) return { field: 'email', message: 'Please enter a valid email address.' };
  return null;
}

/** The message that reaches the owner's inbound list: who they are, and their coach when a player asks. */
export function requestMessage(d: RequestDetails): string {
  return [
    d.who ? `Requested access as: ${REQUEST_TITLE[d.who]}` : null,
    d.who === 'player' && d.coach.trim() ? `Coach: ${d.coach.trim()}` : null,
    d.note.trim() || null,
  ]
    .filter(Boolean)
    .join('\n');
}
