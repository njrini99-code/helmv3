'use client';

import { Component, type ReactNode } from 'react';
import { STUDIO_KINDS, type StudioKindName } from '@/lib/coachhelm/v3/chat/visuals/studio-kinds';
import { Action, AppLink, Comparison, DistanceProfile, Document, Figure, Note, OnRecord, PracticePlan, QualifierBoard, RankingList, Round, Schedule, StrokesGained, Table, TrendFigure } from './components';
import { tableOf } from './from';
import type { StudioAsk, StudioProps, StudioSize } from './types';
import type { CardPerson } from '../cards/types';
import '../../../../styles/coachhelm-ask-studio.css';

/**
 * The studio's registry and its one renderer. A kind maps to exactly one component, drawn in the size it is asked for.
 * The keys are `STUDIO_KINDS` (the list the engine's side is tested against); `__tests__/registry.test.tsx` fails when
 * the two differ, so a kind cannot be added on one side only.
 *
 * Nothing falls through to nothing: an unknown kind, and a part its own component throws on (a stored part from a
 * version whose shape has since changed), are drawn by the table from whatever rows or fields the part carries.
 */
export const STUDIO_COMPONENTS: { readonly [K in StudioKindName]: (p: StudioProps<K>) => ReactNode } = {
  figure: Figure,
  comparison: Comparison,
  ranking: RankingList,
  trend: TrendFigure,
  round: Round,
  strokes_gained: StrokesGained,
  distance_profile: DistanceProfile,
  schedule: Schedule,
  qualifier_board: QualifierBoard,
  practice_plan: PracticePlan,
  document: Document,
  app_link: AppLink,
  note: Note,
  on_record: OnRecord,
  action: Action,
  table: Table,
};

const KNOWN: ReadonlySet<string> = new Set(STUDIO_KINDS.map((k) => k.kind));
export const isStudioKind = (kind: string): kind is StudioKindName => KNOWN.has(kind);

export interface StudioRenderProps {
  /** A part as the engine named it. `kind` is a string on purpose: a newer engine may send one this build has no component for. */
  part: { kind: string; data: unknown };
  size: StudioSize;
  read?: string | null;
  onAsk?: (ask: StudioAsk) => void;
  roster?: readonly CardPerson[];
  team?: string;
  /** A live answer's trend draws its line as it arrives (CoachComposition decides). */
  drawIn?: boolean;
}

function Fallback({ part, size }: Pick<StudioRenderProps, 'part' | 'size'>) {
  return <Table data={{ table: tableOf(part.data) }} size={size} read={null} />;
}

/** A component that throws on its data is replaced by the table, not by a hole in the answer. */
class Guard extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }
  override render(): ReactNode {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export function Studio({ part, size, read = null, onAsk, roster, team, drawIn }: StudioRenderProps) {
  const fallback = <Fallback part={part} size={size} />;
  if (!isStudioKind(part.kind)) {
    return (
      <div className="ch-aks-part" data-studio="table" data-studio-fallback={part.kind}>
        {fallback}
      </div>
    );
  }
  // One component per kind; the map's type ties each to its own data, which a lookup by a runtime string cannot carry.
  const Drawn = STUDIO_COMPONENTS[part.kind] as (p: StudioProps) => ReactNode;
  return (
    <div className="ch-aks-part" data-studio={part.kind} data-size={size}>
      <Guard fallback={fallback}>
        <Drawn data={part.data as StudioProps['data']} size={size} read={read} onAsk={onAsk} roster={roster} team={team} drawIn={drawIn} />
      </Guard>
    </div>
  );
}
