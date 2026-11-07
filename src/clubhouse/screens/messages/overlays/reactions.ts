import { createLucideIcon, type LucideIcon, ThumbsUp, Heart, Laugh, PartyPopper, HandHeart } from 'lucide-react';
import type { ChReactionKey } from '../model';

/** Surprised (the 😮 reaction) in Lucide's face set: Lucide has no open-mouthed face, and Frown read as sad. */
const Surprised = createLucideIcon("face-surprised", [
  ["circle", { cx: "12", cy: "12", r: "10", key: "face" }],
  ["path", { d: "M9 10V9", key: "eye-l" }],
  ["path", { d: "M15 10V9", key: "eye-r" }],
  ["circle", { cx: "12", cy: "15.5", r: "2", key: "mouth" }],
]);

export const REACTIONS: Array<{ key: ChReactionKey; icon: LucideIcon }> = [
  { key: "Like", icon: ThumbsUp },
  { key: "Love", icon: Heart },
  { key: "Laugh", icon: Laugh },
  { key: "Celebrate", icon: PartyPopper },
  { key: "Surprised", icon: Surprised },
  { key: "Thanks", icon: HandHeart },
];

export const REACTION_ICON = Object.fromEntries(
  REACTIONS.map((r) => [r.key, r.icon]),
) as Record<ChReactionKey, LucideIcon>;
