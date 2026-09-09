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
  /** Omitted when `access` is not `'detail'`: the server did not send a
   * title, so consumers must not fabricate one — render an honest "Busy" /
   * "Class" fallback keyed off `type`, never a guessed name. */
  title?: string;
  eventId?: string;
  /** Present for `type: 'class'` intervals whose class row the server could
   * identify, even when `access` is `'free_busy'` and no title was sent —
   * lets a free/busy viewer's UI still deep-link to a class detail lookup
   * that the server will authorize (or refuse) on its own. */
  classId?: string;
  /** 'detail': the viewer is authorized to see `title` and other identifying
   * fields. 'free_busy': the viewer only gets the interval's time; `title`
   * is omitted, not redacted-looking text. Omitted on intervals produced
   * before this field existed, which callers must treat as 'detail' (their
   * only historical meaning). */
  access?: 'detail' | 'free_busy';
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
