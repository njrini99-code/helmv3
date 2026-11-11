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
import { findInApp, findInAppForPlayer } from './context/find-in-app';
import { noteTools } from './context/notes';
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
import { strictInput } from './strict-input';
import { taskTools } from './tasks';

export type { TaskProposal } from './tasks';

// One instance of each, so a tool is the same object, and the same bytes, on every request.
const QUERY_TEAM_DATA = queryTeamDataTool();
const SUMMARISE_COACH = summariseDataTool(false);
const SUMMARISE_PLAYER = summariseDataTool(true);

/**
 * A tool as it is registered: its input in the shape strict tool use takes (`strict-input.ts`). The tool's own schema
 * still does the validating behind it. Built once per tool.
 */
const registered = new WeakMap<ChatTool, ChatTool>();
function strict(tool: ChatTool): ChatTool {
  let out = registered.get(tool);
  if (!out) {
    out = { ...tool, input: strictInput(tool.input) } as ChatTool;
    registered.set(tool, out);
  }
  return out;
}

/** A player's Ask: reads of their own data and a visual of them. */
function playerTools(): ChatTool[] {
  // CONTEXT's reader (`context/find-in-app.ts`) is last, so everything before it keeps its place in the cached prefix.
  return [getMyStats, getRound, getShots, getMySeason, getMySchedule, getMyCoachHelm, getMyReference, SUMMARISE_PLAYER, showVisual, findInAppForPlayer];
}

function coachTools(surface: Exclude<ChatSurface, 'player'>, who: ToolContext['who']): ChatTool[] {
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
    QUERY_TEAM_DATA,
    SUMMARISE_COACH,
    showVisual,
    findThread,
    // CONTEXT's tools (`context/**`), after every reader of ours. The two note tools save the coach's own standing note at once: they are
    // reads on the contract (no card), and are not in TASK_TOOL_NAMES.
    findInApp,
    ...noteTools(who),
  ];
  // Quick chat's card is the coach's Send, so it sends and does not hand a draft to Messages or keep a document.
  const drafts: ChatTool[] = quickChat ? [askPracticeBrief, draftPracticePlan, draftBoard] : [writeArtifact, askPracticeBrief, draftPracticePlan, draftMessage, draftPoll, draftBoard];
  return [...reads, ...drafts, ...taskTools({ quickChat })];
}

export const toolsFor: ToolsFor = (surface: ChatSurface, who: ToolContext['who']): ChatTool[] => {
  // The session decides, not the surface name: a player's context never gets a coach's list, and a coach's context never gets the player's.
  if (isPlayerContext(who) || surface === 'player') return isPlayerContext(who) ? playerTools().map(strict) : [];
  return coachTools(surface, who).map(strict);
};

/** The names of the tools that write, for anything that must tell a task from a read without the list in hand (the confirm gate's tests, the UI's card pairing). */
export const TASK_TOOL_NAMES: readonly string[] = [...new Set([...taskTools({ quickChat: false }), ...taskTools({ quickChat: true })].map((t) => t.name).concat(['set_lineup', 'lock_lineup']))];
