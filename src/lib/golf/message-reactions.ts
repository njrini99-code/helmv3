/**
 * Closed quick-reaction vocabulary shared by the messaging UI and its server
 * action. This must stay outside a `use server` module because Next.js requires
 * every runtime export from those modules to be an async function.
 */
export const GOLF_QUICK_REACTIONS = ['👍', '❤️', '😂', '👀', '✅'] as const;

export type GolfQuickReaction = (typeof GOLF_QUICK_REACTIONS)[number];

export function isGolfQuickReaction(value: string): value is GolfQuickReaction {
  return (GOLF_QUICK_REACTIONS as readonly string[]).includes(value);
}
