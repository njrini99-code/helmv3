import type { ActionProposal, ActionReceipt } from '@/lib/coachhelm/v3/chat/action-types';
import type { HoleStripBlock, MissPatternBlock, PuttProfileBlock, SeasonCompareBlock } from '@/lib/coachhelm/v3/chat/visuals/composition';
import type { StudioKindName } from '@/lib/coachhelm/v3/chat/visuals/studio-kinds';
import type { AskBriefData, AskEvidence, AskHandoffData, AskRankRow, AskTable, AskTeamTable } from '../../../../data/coachhelm-chat-thread';
import type { PlanPartData } from '../../plan/PlanCard';
import type { AppLink, CoachNote } from '../cards/answers';
import type { DocDraft } from '../cards/drafts';
import type { CardPerson, CardPhase } from '../cards/types';

/**
 * The studio (CAPABILITIES.md, "The studio"): the fixed set of things CoachHelm can put on screen. The assistant never
 * invents interface: it fills a typed schema, the server fills every figure from a read, and one of these components
 * draws it. The names are `STUDIO_KINDS` (src/lib/coachhelm/v3/chat/visuals/studio-kinds.ts), the list the schema side
 * is tested against too.
 *
 * A component takes what it draws already in the app's words: a figure as printed, a sample in words ("over 4 rounds"),
 * a day as "Thu, Nov 12". Turning a read or a composition block into that is `from.ts`; nothing here computes a figure.
 */

/** `full` in the thread on a desk; `compact` in the quick chat and on a phone, where a row must hold in 320px. */
export type StudioSize = 'full' | 'compact';

/**
 * What a tap on an element asks about: the read it came from and which element of it, so the question the composer is
 * filled with can be answered from the same figures. `words` is what the coach sees in the composer; they can edit it
 * before sending, and nothing is sent by the tap.
 */
export interface StudioAsk {
  kind: StudioKindName;
  /** The read (`evidence_ref`) or the artifact the element came from; null when the part did not say. */
  read: string | null;
  /** The element inside it: a player id, `hole:7`, a band's label, a metric id. */
  key: string;
  words: string;
}

export type StudioTone = 'gain' | 'loss' | 'plain';

export interface StudioFigure {
  key: string;
  label: string;
  /** As printed: "+0.42", "31.8", "58%". */
  value: string;
  /** The window and the sample, in words: "over 4 rounds". */
  sub: string | null;
  tone: StudioTone;
  /** What it is set against, in words: "Team average 30.4". */
  refs?: readonly string[];
  /** The screen that shows it. */
  href?: string | null;
}

export interface StudioLeg {
  key: string;
  label: string;
  value: number;
  display: string;
}

export interface StudioHole {
  n: number;
  par: number | null;
  score: number | null;
  /** When the scorecard was not read but the result was: strokes against par. */
  toPar?: number | null;
}

export interface StudioEvent {
  id: string;
  title: string;
  /** "3 to 5:30 PM"; null for an all-day entry. */
  time: string | null;
  kind: 'practice' | 'qualifier' | 'tournament' | 'travel' | 'class' | 'other';
  place?: string | null;
  /** Replies in, when the event asks for them. */
  replies?: { going: number; out: number; waiting: number } | null;
  /** Players with a class at that time. */
  conflicts?: number;
  href?: string | null;
}

export interface StudioDay {
  /** ISO day. */
  date: string;
  events: StudioEvent[];
}

export interface StudioBoardRow {
  id: string;
  name: string;
  /** Each round as printed ("71"), a dash for one not played. */
  rounds: string[];
  total: string;
  /** "-3", "E", "+4". */
  toPar: string;
  href?: string | null;
}

/** What each kind draws. One kind, one component; a kind with more than one `form` is still one component. */
export interface StudioData {
  figure: { title: string | null; figures: StudioFigure[] };
  comparison: { label: string; team: AskTeamTable; hrefs?: Readonly<Record<string, string>> };
  ranking: { label: string; rows: AskRankRow[]; signed: boolean; highlight: string | null; hrefs?: Readonly<Record<string, string>> };
  trend: { form: 'rounds'; trend: Extract<AskEvidence, { kind: 'trend' }> } | { form: 'seasons'; seasons: SeasonCompareBlock };
  round: { title: string | null; holes: StudioHole[]; href?: string | null } | { title: string | null; strip: HoleStripBlock; href?: string | null };
  strokes_gained: { title: string | null; legs: StudioLeg[]; takeaway: string | null };
  distance_profile: { form: 'bands'; bands: Extract<AskEvidence, { kind: 'bars' }> } | { form: 'putts'; putts: PuttProfileBlock } | { form: 'misses'; misses: MissPatternBlock };
  schedule: { title: string | null; days: StudioDay[]; href?: string | null };
  qualifier_board: { title: string; rows: StudioBoardRow[]; /** Seats: the cut is drawn under this row. Null when the qualifier has none. */ cut: number | null; roundLabels: string[]; status: string | null; href?: string | null };
  practice_plan: { form: 'plan'; plan: PlanPartData } | { form: 'brief'; brief: AskBriefData };
  document: { form: 'document'; doc: DocDraft } | { form: 'handoff'; handoff: AskHandoffData };
  app_link: { link: AppLink };
  note: { form: 'visual'; claim: 'measured' | 'association' | 'hypothesis'; text: string } | { form: 'kept'; note: CoachNote } | { form: 'record'; title: string; rows: ReadonlyArray<{ label: string; value: string }> };
  action_preview: { tool: string; proposal: ActionProposal; phase?: CardPhase };
  receipt: { tool: string; proposal: ActionProposal; receipt: ActionReceipt };
  table: { table: AskTable };
}

export type StudioPart = { [K in StudioKindName]: { kind: K; data: StudioData[K] } }[StudioKindName];

export interface StudioProps<K extends StudioKindName = StudioKindName> {
  data: StudioData[K];
  size: StudioSize;
  /** The read or artifact the part came from, carried on every ask. */
  read: string | null;
  /** Absent: nothing is tappable to ask (a restored thread a player may not continue, a printed answer). */
  onAsk?: (ask: StudioAsk) => void;
  roster?: readonly CardPerson[];
  team?: string;
}
