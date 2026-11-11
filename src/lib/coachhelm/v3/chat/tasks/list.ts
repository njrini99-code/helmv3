/**
 * CoachHelm chat: every task tool this folder adds, in one fixed order.
 *
 * The order is part of the cached prompt prefix, so a new tool goes at the END: every earlier definition keeps its
 * bytes and its place. The registry (`../registry.ts`) puts this list after TOOLS's own tasks, for the three coach
 * surfaces and never for a player. INVENTORY.md beside this file says what each wraps and what is deliberately absent.
 */
import type { ChatTool } from '../engine/tool';
import { developmentTools } from './development-tasks';
import { eventEditTools } from './event-edit-tasks';
import { eventTaskTools } from './event-tasks';
import { qualifierTools } from './qualifier-tasks';

export function contextTaskTools(): ChatTool[] {
  return [...eventTaskTools(), ...eventEditTools(), ...developmentTools(), ...qualifierTools()];
}
