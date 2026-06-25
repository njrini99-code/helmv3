// =============================================================================
// src/components/baseball/player-profile/snapshot-cards/SnapshotCardGrid.tsx
//
// Composes the V7 Profile Header band + the 8 snapshot cards into the operating
// record a coach scans before a player meeting. The card ORDER is role-driven
// (DEPTH RULE: "show batting/pitching/defense by the player's actual role rather
// than assuming a hitter"):
//
//   pitcher   -> Pitching, Defense, Strength, Performance, Video, Tasks, Classes
//   two_way   -> Hitting, Pitching, Defense, Strength, Performance, Video, ...
//   catcher   -> Hitting, Defense(catching), Strength, Performance, Video, ...
//   hitter    -> Hitting, Defense, Performance, Strength, Video, Tasks, Classes
//
// Role-IRRELEVANT performance cards (Hitting for a pure pitcher; Pitching for a
// position player) are SUPPRESSED entirely rather than shown empty — the read
// model already returns them not-present, and a pure-role player should not see
// an empty card for a thing they don't do. Universal cards (Strength, Classes,
// Video, Tasks, Performance) always render (with honest empty states) because
// every athlete has those domains.
//
// Presentational only. Fed by getPlayerSnapshotCards().
// =============================================================================

import { SnapshotHeaderBand } from './SnapshotHeaderBand';
import {
  PerformanceSnapshotCard,
  HittingSnapshotCard,
  PitchingSnapshotCard,
  DefenseSnapshotCard,
  StrengthSnapshotCard,
  ClassesSnapshotCard,
  VideoSnapshotCard,
  TaskDevSnapshotCard,
} from './SnapshotCards';
import type { PlayerSnapshotCardsReadModel } from '@/lib/baseball/read-models/player-snapshot-cards';

export function SnapshotCardGrid({
  model,
  basePath,
}: {
  model: PlayerSnapshotCardsReadModel;
  /** e.g. `/baseball/dashboard/players/<id>` — used to build card deep-links. */
  basePath: string;
}) {
  // Honest unauthorized notice (viewer is not staff). The rest of the Snapshot
  // tab still renders its existing content; this just omits the staff cards.
  if (!model.authorized) {
    return (
      <div className="bg-cream-100/75 backdrop-blur-xl border border-white/20 rounded-2xl shadow-sm p-5 text-center">
        <p className="text-sm text-warm-400">The operating snapshot is visible to team staff only.</p>
      </div>
    );
  }

  const { header } = model;
  const role = header.role;

  // Which performance cards are RELEVANT to this role (suppressed otherwise).
  const showHitting = role !== 'pitcher'; // hitter / two_way / catcher / utility
  const showPitching = role === 'pitcher' || role === 'two_way';
  const showDefense = role !== 'utility' || model.defense.present;

  // Render-ready card nodes keyed for ordering.
  const hitting = showHitting ? <HittingSnapshotCard key="hitting" card={model.hitting} /> : null;
  const pitching = showPitching ? <PitchingSnapshotCard key="pitching" card={model.pitching} /> : null;
  const defense = showDefense ? <DefenseSnapshotCard key="defense" card={model.defense} /> : null;
  const performance = (
    <PerformanceSnapshotCard key="performance" card={model.performance} statsHref={`${basePath}/stats`} />
  );
  const strength = <StrengthSnapshotCard key="strength" card={model.strength} />;
  const video = <VideoSnapshotCard key="video" card={model.video} />;
  const taskDev = <TaskDevSnapshotCard key="taskDev" card={model.taskDev} devHref="/baseball/dashboard/development" />;
  const classes = <ClassesSnapshotCard key="classes" card={model.classes} />;

  // Role-driven ordering — lead with what the athlete primarily does.
  let ordered: (React.ReactNode | null)[];
  switch (role) {
    case 'pitcher':
      ordered = [pitching, defense, strength, performance, video, taskDev, classes];
      break;
    case 'two_way':
      ordered = [hitting, pitching, defense, strength, performance, video, taskDev, classes];
      break;
    case 'catcher':
      ordered = [hitting, defense, strength, performance, video, taskDev, classes];
      break;
    case 'hitter':
      ordered = [hitting, defense, performance, strength, video, taskDev, classes];
      break;
    default: // utility
      ordered = [performance, hitting, defense, strength, video, taskDev, classes];
  }
  const cards = ordered.filter(Boolean);

  return (
    <div className="space-y-5">
      <SnapshotHeaderBand header={header} playerId={model.playerId} />

      {model.error && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-2.5 text-xs text-amber-800">
          Some snapshot data could not be loaded right now. The cards below show what is available.
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 items-stretch">
        {cards}
      </div>
    </div>
  );
}
