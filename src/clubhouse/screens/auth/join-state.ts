import { CODE_MIN, cleanCode, slotCount } from '../onboard/logic';

/**
 * The team code on the join screens: what is typed or pasted, and the checks before it is taken to the team it names.
 * Today's page (`src/app/golf/join/page.tsx`) only checks that something is there and that it is at least four
 * characters, then goes to `/golf/join/<code>`, where the server resolves it; the same two checks are made here, in
 * Clubhouse's words. The code itself is only ever resolved by the server.
 */

export const JOIN_EMPTY = 'Enter your team code.';
export const JOIN_SHORT = `A team code is at least ${CODE_MIN} characters.`;

/** CH-15140 nothing typed, CH-15141 too short; null when it can be taken to the team. */
export function joinCodeProblem(code: string): { message: string; code: 'CH-15140' | 'CH-15141' } | null {
  if (!code) return { message: JOIN_EMPTY, code: 'CH-15140' };
  if (code.length < CODE_MIN) return { message: JOIN_SHORT, code: 'CH-15141' };
  return null;
}

/**
 * What a paste or a keystroke becomes. A coach often sends the link rather than the code, so a pasted invite link
 * (`…/golf/join/K7PQX4MN`, or a `?joinCode=`) fills the code it carries; anything else is cleaned the way sign up
 * cleans it (upper case, letters and numbers, at most ten).
 */
export function codeFromEntry(raw: string): string {
  const link = /\/golf\/join\/([A-Za-z0-9]+)/i.exec(raw) ?? /[?&](?:joinCode|code)=([A-Za-z0-9]+)/i.exec(raw);
  return cleanCode(link?.[1] ?? raw);
}

/** The boxes of a code: four, a dash, then the rest (eight in all, more for a longer code). */
export function chunkSlots(code: string): { n: number; slots: Array<number | 'dash'>; chars: string[] } {
  const n = slotCount(code);
  return { n, chars: code.split(''), slots: [0, 1, 2, 3, 'dash', ...Array.from({ length: n - 4 }, (_, i) => i + 4)] };
}
