/** Serializable scheduling boundary shared by the server and Fairway surfaces. */
export interface ScheduleParticipant {
  id: string;
  kind: 'coach' | 'player';
  name: string;
  avatarUrl: string | null;
  isViewer: boolean;
  required: boolean;
  verification: 'complete' | 'partial' | 'failed';
  intervals: ScheduleInterval[];
}

export interface ScheduleInterval {
  id: string;
  start: string;
  end: string;
  type: 'event' | 'class' | 'blocked';
  title: string;
  eventId?: string;
}

export interface ScheduleSnapshot {
  teamId: string;
  timeZone: string;
  window: { start: string; end: string };
  checkedAt: string;
  participants: ScheduleParticipant[];
}

export interface ScheduleProposal {
  start: string;
  end: string;
}

export interface ScheduleEvaluation {
  requiredFree: number;
  requiredTotal: number;
  optionalFree: number;
  optionalTotal: number;
  unknown: number;
  allAvailable: boolean;
  overlaps: Array<{ participantId: string; interval: ScheduleInterval }>;
}

export interface ScheduleWindowRequest {
  teamId: string;
  date: string;
  participantIds: string[];
  excludeEventId?: string;
}

export type ScheduleWindowResult =
  | { success: true; data: ScheduleSnapshot }
  | { success: false; error: string };
