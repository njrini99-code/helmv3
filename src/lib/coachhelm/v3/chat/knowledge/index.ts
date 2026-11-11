/**
 * CoachHelm chat knowledge: what the model is told about golf and about where things are, as blocks of the cached prompt.
 *
 * `knowledgeBlocks(surface)` returns two strings, both identical for every team, every day and every conversation, so they
 * belong in the one-hour cached prefix after the policy block and before the team block:
 *
 *   tools → policy → golf → dataMap → [1h cache breakpoint] → team block → conversation
 *
 * Nothing here may ever hold a date, a team's name, a count or a figure.
 */
import type { ChatSurface } from '../engine/tool';
import { dataMapBlock } from './data-map';
import { golfBlock } from './golf';

export { golfBlock, APP_DEFINITIONS } from './golf';
export { dataMapBlock } from './data-map';
export { REFERENCE_TOPICS, referenceTopic } from './reference-topics';

export function knowledgeBlocks(surface: ChatSurface): { golf: string; dataMap: string } {
  return { golf: golfBlock(surface), dataMap: dataMapBlock(surface) };
}

/** The size the registry's size test adds to the tool definitions and the policy: characters, as that test counts them. */
export function knowledgeChars(surface: ChatSurface): number {
  const k = knowledgeBlocks(surface);
  return k.golf.length + k.dataMap.length;
}
