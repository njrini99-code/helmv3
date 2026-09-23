/**
 * Pkg 9 slice 1a — the duplicate-active-focus-area error string.
 *
 * Split out of `src/app/golf/actions/development.ts` because that file is
 * `'use server'`: Next.js only allows a `'use server'` file to export async
 * functions, so a plain `export const` string there fails the production
 * build ("Only async functions are allowed to be exported in a 'use server'
 * file"). This module has no directive, so both the server action (for the
 * returned error payload) and the UI/tests (to match on it) can import the
 * same constant.
 */
export const ACTIVE_FOCUS_DUPLICATE_ERROR = 'An active focus on this metric already exists.';
