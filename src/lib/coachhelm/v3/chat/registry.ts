/**
 * CoachHelm chat: the tools one surface offers one signed-in person.
 *
 * The mapping from the old 67 tools to these is in TOOLS.md beside this file. The order of each list is fixed: tool
 * definitions are the first part of the cached prompt prefix, so the same surface must always produce the same bytes.
 * The Ask tab and the practice helper share one list for the same reason (one cache entry, not two).
 *
 * Who may reach what is decided here and inside each tool, never by the model:
 *   a coach    every reader and every task, for their own team (the team is never an argument).
 *   a player   the readers below only. Each replaces any player id with the caller's own (`reader-kit.ts`), reads only
 *              the caller's rounds, and takes its figures from the player's own Stats page, which has no team column.
 *              No task, no team-wide read, no allowlisted table reader.
 */
import { isFlagEnabled } from '@/lib/flags/is-enabled';
import { isPlayerContext, type ChatSurface, type ChatTool, type ToolContext, type ToolsFor } from './engine/tool';
import { getMyStats, getMySeason, getPlayerStats, getQualifiers, getRounds, getSeason, getTeamStats } from './readers';
import {
  askPracticeBrief,
  draftBoard,
  draftMessage,
  draftPoll,
  draftPracticePlan,
  findThread,
  getCoachHelm,
  getMyCoachHelm,
  getMyReference,
  getMySchedule,
  getPracticeTool,
  getReference,
  getRound,
  getSchedule,
  getShots,
  getTournamentsTool,
  queryTeamDataTool,
  showVisual,
  summariseDataTool,
  writeArtifact,
} from './readers-direct';
import { taskTools } from './tasks';

export type { TaskProposal } from './tasks';

/** A player's Ask: reads of their own data and a visual of them. */
function playerTools(): ChatTool[] {
  return [getMyStats, getRound, getShots, getMySeason, getMySchedule, getMyCoachHelm, getMyReference, summariseDataTool(true), showVisual];
}

function coachTools(surface: Exclude<ChatSurface, 'player'>): ChatTool[] {
  const quickChat = surface === 'quick_chat';
  const reads: ChatTool[] = [
    getPlayerStats,
    getTeamStats,
    getRounds,
    getRound,
    getShots,
    getSeason,
    getQualifiers,
    // Tournaments are behind golf_tournaments_v1: the chat must not read an unreleased feature's tables.
    ...(isFlagEnabled('golf_tournaments_v1') ? [getTournamentsTool] : []),
    getSchedule,
    getCoachHelm,
    getPracticeTool,
    getReference,
    queryTeamDataTool(),
    summariseDataTool(false),
    showVisual,
    findThread,
  ];
  // Quick chat's card is the coach's Send, so it sends and does not hand a draft to Messages or keep a document.
  const drafts: ChatTool[] = quickChat ? [askPracticeBrief, draftPracticePlan, draftBoard] : [writeArtifact, askPracticeBrief, draftPracticePlan, draftMessage, draftPoll, draftBoard];
  return [...reads, ...drafts, ...taskTools({ quickChat })];
}

export const toolsFor: ToolsFor = (surface: ChatSurface, who: ToolContext['who']): ChatTool[] => {
  // The session decides, not the surface name: a player's context never gets a coach's list, and a coach's context never gets the player's.
  if (isPlayerContext(who) || surface === 'player') return isPlayerContext(who) ? playerTools() : [];
  return coachTools(surface);
};

/** The names of the tools that write, for anything that must tell a task from a read without the list in hand (the confirm gate's tests, the UI's card pairing). */
export const TASK_TOOL_NAMES: readonly string[] = [...new Set([...taskTools({ quickChat: false }), ...taskTools({ quickChat: true })].map((t) => t.name).concat(['set_lineup', 'lock_lineup']))];
