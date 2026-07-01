// =============================================================================
// Command Center page adapter — maps the canonical read model to client props.
// =============================================================================

import 'server-only';

import type { BaseballRosterPlayer } from '@/lib/types';
import type { CoachDailyContractsReadModel } from '@/lib/baseball/read-models/coach-daily-contracts';
import type { CommandCenterReadModel } from '@/lib/baseball/read-models/command-center';
import { resolveReadModelLoadState } from '@/lib/product-trust/read-model-state';

export interface CommandCenterPageTeam {
  id: string;
  name: string;
  teamType: string;
  inviteCode: string | null;
}

export interface CommandCenterClientAssembly {
  team: CommandCenterPageTeam;
  players: BaseballRosterPlayer[];
  calendarEvents: Array<{
    id: string;
    title: string;
    event_type: string;
    start_time: string;
    end_time: string | null;
  }>;
  riskFeed: CommandCenterReadModel['riskFeed'];
  riskFeedError: string | null;
  coachDailyContracts?: CoachDailyContractsReadModel;
  summary: CommandCenterReadModel['summary'];
  loadState: ReturnType<typeof resolveReadModelLoadState>;
}

/**
 * Map `getCommandCenter()` output (+ team meta) into `CommandCenterClient` props.
 * Keeps page.tsx free of ad hoc Supabase queries.
 */
export function assembleCommandCenterClientProps(input: {
  team: CommandCenterPageTeam;
  model: CommandCenterReadModel;
  coachDailyContracts?: CoachDailyContractsReadModel;
}): CommandCenterClientAssembly {
  const { team, model, coachDailyContracts } = input;

  const hasData =
    model.rosterPulse.length > 0 ||
    model.riskFeed.length > 0 ||
    model.todayEvents.length > 0 ||
    model.weekEvents.length > 0;

  const loadState = resolveReadModelLoadState({
    authorized: model.authorized,
    error: model.error,
    hasData,
  });

  const calendarEvents = (model.weekEvents.length > 0 ? model.weekEvents : model.todayEvents).map(
    (e) => ({
      id: e.id,
      title: e.title,
      event_type: e.eventType,
      start_time: e.startTime,
      end_time: e.endTime,
    }),
  );

  return {
    team,
    players: model.authorized ? model.rosterPlayers : [],
    calendarEvents: model.authorized ? calendarEvents : [],
    riskFeed: model.authorized ? model.riskFeed : [],
    riskFeedError: model.error,
    coachDailyContracts,
    summary: model.summary,
    loadState,
  };
}
