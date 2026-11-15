import { revalidateTag, updateTag as nextUpdateTag } from 'next/cache';

/**
 * Cache invalidation that works from a Server Action and from a route handler.
 *
 * `updateTag` (read-your-own-writes) is Server-Action-only: Next throws "updateTag can only be called from within a Server Action" before it
 * does anything, anywhere else. Ask's create tools call the same actions Fairway and Clubhouse do, from the chat route handler, so an action
 * that wrote its row and then called `updateTag` threw AFTER the write and reported a failed run for work that had landed.
 *
 * In a Server Action this is `updateTag`, unchanged. In a route handler (the one error Next documents for it) it is
 * `revalidateTag(tag, 'max')`, the stale-while-revalidate form that context is meant to use. Any other error is not this function's to hide.
 */
export function updateTag(tag: string): void {
  try {
    nextUpdateTag(tag);
  } catch (error) {
    if (!isServerActionOnlyError(error)) throw error;
    revalidateTag(tag, 'max');
  }
}

/** Several tags at once, each through {@link updateTag}. */
export function invalidateTags(tags: readonly string[]): void {
  for (const tag of tags) updateTag(tag);
}

/** The error Next throws from `updateTag` outside a Server Action (and only that one). */
export function isServerActionOnlyError(error: unknown): boolean {
  return error instanceof Error && /updateTag can only be called from within a Server Action/.test(error.message);
}
