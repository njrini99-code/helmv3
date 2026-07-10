// =============================================================================
// src/components/baseball/player-profile/snapshot-cards/SnapshotCards.tsx
//
// The EIGHT V7 Player Profile snapshot cards. Each is fed by its slice of
// getPlayerSnapshotCards() and gated on `present` — an absent card renders an
// honest empty state, NEVER a fabricated number. Hitting/Pitching/Defense are
// rendered conditionally by the inferred role (a position player never sees an
// empty Pitching card; a pitcher leads with Pitching).
//
// Presentational only (cream/green, baseball labels). No I/O.
//
// PALETTE NOTE: Pitching and Classes cards use accent="amber" as a semantic
// role/category key — SnapshotCardShell's ACCENT map (shared.tsx) resolves it
// to the Living Annual `pursuit` clay ink (bg-pursuit/10 text-pursuit), never
// raw amber-*, used here to visually distinguish pitching and academic card
// types from the primary green batting cards.
// =============================================================================

import Link from 'next/link';
import Image from 'next/image';
import {
  IconChart,
  IconBaseball,
  IconTarget,
  IconShield,
  IconDumbbell,
  IconGraduationCap,
  IconVideo,
  IconClipboardList,
  IconTrendingUp,
  IconTrendingDown,
  IconMinus,
  IconChevronRight,
  IconBolt,
  IconAlertCircle,
  IconPlay,
  IconLock,
} from '@/components/icons';
import {
  SnapshotCardShell,
  StatTile,
  ToneChip,
  fmtAvg,
  fmtRate,
  fmtInt,
  fmtPct,
  fmtSigned,
  fmtDate,
} from './shared';
import type {
  PerformanceCard,
  HittingCard,
  PitchingCard,
  DefenseCard,
  StrengthCard,
  ClassesCard,
  VideoCard,
  TaskDevCard,
} from '@/lib/baseball/read-models/player-snapshot-cards';

function TrendBadge({ trend }: { trend: 'improving' | 'declining' | 'stable' | null }) {
  if (!trend) return null;
  const meta = {
    improving: { label: 'Improving', tone: 'success' as const, icon: <IconTrendingUp size={12} /> },
    declining: { label: 'Declining', tone: 'error' as const, icon: <IconTrendingDown size={12} /> },
    stable: { label: 'Stable', tone: 'neutral' as const, icon: <IconMinus size={12} /> },
  }[trend];
  return <ToneChip tone={meta.tone} icon={meta.icon}>{meta.label}</ToneChip>;
}

// ─── 1. Performance ──────────────────────────────────────────────────────────

export function PerformanceSnapshotCard({ card, statsHref }: { card: PerformanceCard; statsHref: string }) {
  return (
    <SnapshotCardShell
      title="Performance"
      icon={<IconChart size={16} />}
      accent="primary"
      empty={!card.present}
      emptyLabel="No captured sessions yet"
      trust={card.trust}
      asOf={card.asOf}
      accessory={card.present ? <TrendBadge trend={card.trend} /> : undefined}
    >
      <div className="grid grid-cols-3 gap-2">
        <StatTile label="Game" value={fmtAvg(card.gameAvg)} emphasis />
        <StatTile label="Scrim" value={fmtAvg(card.scrimmageAvg)} />
        <StatTile label="Last 5" value={fmtAvg(card.last5Avg)} />
      </div>
      <div className="flex items-center justify-between gap-2 mt-3 text-xs">
        <span className="text-warm-500">{card.sessions} captured sessions</span>
        {card.pressureGapPts != null && (
          <span className={card.pressureGapPts >= 0 ? 'text-primary-700 font-medium' : 'text-pursuit font-medium'}>
            {fmtSigned(card.pressureGapPts, ' pts')} game vs scrim
          </span>
        )}
      </div>
      <Link
        href={statsHref}
        className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary-600 hover:text-primary-700"
      >
        Full game log <IconChevronRight size={12} />
      </Link>
    </SnapshotCardShell>
  );
}

// ─── 2. Hitting ──────────────────────────────────────────────────────────────

export function HittingSnapshotCard({ card }: { card: HittingCard }) {
  return (
    <SnapshotCardShell
      title={`Hitting${card.seasonYear ? ` · ${card.seasonYear}` : ''}`}
      icon={<IconBaseball size={16} />}
      accent="primary"
      empty={!card.present}
      emptyLabel="No hitting stats this season"
      trust={card.trust}
      asOf={card.asOf}
    >
      <div className="grid grid-cols-4 gap-2">
        <StatTile label="AVG" value={fmtAvg(card.avg)} emphasis />
        <StatTile label="OBP" value={fmtAvg(card.obp)} />
        <StatTile label="SLG" value={fmtAvg(card.slg)} />
        <StatTile label="OPS" value={fmtAvg(card.ops)} />
      </div>
      <div className="grid grid-cols-3 gap-2 mt-2">
        <StatTile label="HR" value={fmtInt(card.hr)} />
        <StatTile label="RBI" value={fmtInt(card.rbi)} />
        <StatTile label="AB" value={fmtInt(card.ab)} />
      </div>
      {(card.avgExitVelocity != null || card.maxExitVelocity != null) && (
        <div className="flex items-center gap-2 mt-3 text-xs text-warm-600">
          <IconBolt size={13} className="text-primary-600" />
          <span className="font-medium">{fmtRate(card.avgExitVelocity, 1)} mph</span> avg EV
          {card.maxExitVelocity != null && (
            <span className="text-warm-400">· max {fmtRate(card.maxExitVelocity, 1)}</span>
          )}
        </div>
      )}
    </SnapshotCardShell>
  );
}

// ─── 3. Pitching ─────────────────────────────────────────────────────────────

export function PitchingSnapshotCard({ card }: { card: PitchingCard }) {
  return (
    <SnapshotCardShell
      title={`Pitching${card.seasonYear ? ` · ${card.seasonYear}` : ''}`}
      icon={<IconTarget size={16} />}
      accent="amber"
      empty={!card.present}
      emptyLabel="No pitching stats this season"
      trust={card.trust}
      asOf={card.asOf}
    >
      <div className="grid grid-cols-4 gap-2">
        <StatTile label="ERA" value={fmtRate(card.era)} emphasis />
        <StatTile label="WHIP" value={fmtRate(card.whip)} />
        <StatTile label="K" value={fmtInt(card.k)} />
        <StatTile label="BB" value={fmtInt(card.bb)} />
      </div>
      <div className="grid grid-cols-4 gap-2 mt-2">
        <StatTile label="IP" value={fmtRate(card.ip, 1)} />
        <StatTile label="W-L" value={`${card.w}-${card.l}`} />
        <StatTile label="SV" value={fmtInt(card.sv)} />
        <StatTile label="K/BB" value={fmtRate(card.kbb)} />
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 text-xs text-warm-600">
        <span>{card.appearances} app{card.appearances === 1 ? '' : 's'}</span>
        {card.strikePct != null ? (
          <span><span className="font-medium">{fmtPct(card.strikePct)}</span> strikes</span>
        ) : (
          <span className="text-warm-400">strike % —</span>
        )}
        {card.firstPitchStrikePct != null && (
          <span><span className="font-medium">{fmtPct(card.firstPitchStrikePct)}</span> first-pitch strike</span>
        )}
      </div>
    </SnapshotCardShell>
  );
}

// ─── 4. Defense / Catching ───────────────────────────────────────────────────

export function DefenseSnapshotCard({ card }: { card: DefenseCard }) {
  return (
    <SnapshotCardShell
      title={card.isCatcher ? 'Catching' : 'Defense'}
      icon={<IconShield size={16} />}
      accent="warm"
      empty={!card.present}
      emptyLabel="No defensive events captured"
      trust={card.trust}
      asOf={card.asOf}
      accessory={
        card.present && card.primaryPosition ? (
          <ToneChip tone="neutral">{card.primaryPosition}</ToneChip>
        ) : undefined
      }
    >
      {card.isCatcher ? (
        <>
          <div className="grid grid-cols-3 gap-2">
            <StatTile label="Pop Time" value={card.avgPopTime != null ? `${fmtRate(card.avgPopTime, 2)}s` : '—'} emphasis />
            <StatTile label="Blocks" value={fmtInt(card.blockCount)} sub={card.blockSuccessPct != null ? `${fmtPct(card.blockSuccessPct)} clean` : undefined} />
            <StatTile label="Receives" value={fmtInt(card.receiveCount)} />
          </div>
          <div className="grid grid-cols-2 gap-2 mt-2">
            <StatTile label="Throwdowns" value={fmtInt(card.throwdownCount)} />
            <StatTile label="Arm Velo" value={card.avgThrowVelocity != null ? `${fmtRate(card.avgThrowVelocity, 1)}` : '—'} sub={card.avgThrowVelocity != null ? 'mph' : undefined} />
          </div>
        </>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2">
            <StatTile label="Fld %" value={card.fieldingPct != null ? fmtAvg(card.fieldingPct) : '—'} emphasis />
            <StatTile label="Chances" value={fmtInt(card.chances)} />
            <StatTile label="Errors" value={fmtInt(card.errors)} />
          </div>
          {card.avgThrowVelocity != null && (
            <div className="flex items-center gap-2 mt-3 text-xs text-warm-600">
              <IconBolt size={13} className="text-warm-500" />
              <span className="font-medium">{fmtRate(card.avgThrowVelocity, 1)} mph</span> avg throw velo
            </div>
          )}
        </>
      )}
    </SnapshotCardShell>
  );
}

// ─── 5. Strength ─────────────────────────────────────────────────────────────

export function StrengthSnapshotCard({ card }: { card: StrengthCard }) {
  const soreTone = card.sorenessMax == null ? 'neutral' : card.sorenessMax >= 6 ? 'error' : card.sorenessMax >= 3 ? 'warning' : 'success';
  return (
    <SnapshotCardShell
      title="Strength"
      icon={<IconDumbbell size={16} />}
      accent="primary"
      empty={!card.present}
      emptyLabel="No lifting or readiness data"
      trust={card.trust}
      asOf={card.asOf}
      accessory={
        card.sorenessMax != null ? (
          <ToneChip tone={soreTone}>Soreness {card.sorenessMax}/10</ToneChip>
        ) : undefined
      }
    >
      <div className="grid grid-cols-2 gap-2">
        <StatTile
          label="Bodyweight"
          value={card.bodyweightLbs != null ? `${card.bodyweightLbs}` : '—'}
          sub={card.bodyweightLbs != null ? `lbs${card.bodyweightDelta != null ? ` · ${fmtSigned(card.bodyweightDelta)}` : ''}` : undefined}
          emphasis
        />
        <StatTile
          label="Lift Completion"
          value={card.completionPct != null ? fmtPct(card.completionPct) : '—'}
          sub={card.assignedCount > 0 ? `${card.completedCount}/${card.assignedCount} sessions` : undefined}
        />
      </div>
      <div className="mt-3 space-y-1.5 text-xs">
        {card.lastLiftDate ? (
          <div className="flex items-center justify-between gap-2">
            <span className="text-warm-500">Last lift</span>
            <span className="text-warm-800 font-medium truncate">{card.lastLiftTitle ?? 'Session'} · {fmtDate(card.lastLiftDate)}</span>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2">
            <span className="text-warm-500">Last lift</span>
            <span className="text-warm-400">No completed session</span>
          </div>
        )}
        <div className="flex items-center justify-between gap-2">
          <span className="text-warm-500">Next lift</span>
          {card.nextLiftDate ? (
            <span className="text-primary-700 font-medium truncate">{card.nextLiftTitle ?? 'Session'} · {fmtDate(card.nextLiftDate)}</span>
          ) : (
            <span className="text-warm-400">None scheduled</span>
          )}
        </div>
      </div>
    </SnapshotCardShell>
  );
}

// ─── 6. Classes & Availability ───────────────────────────────────────────────

export function ClassesSnapshotCard({ card }: { card: ClassesCard }) {
  // The private academic block (standing / GPA / eligibility / credits) is shown
  // ONLY to viewers the read model marks `canViewAcademics`. A non-academic staff
  // viewer sees the (non-private) class schedule plus an explicit "restricted"
  // affordance — never a misleading "—" that reads as missing data, and never the
  // eligibility chip. Title also tracks the gate so the card is honest at a glance.
  const showAcademics = card.canViewAcademics;
  const eligTone = card.isEligible == null ? 'neutral' : card.isEligible ? 'success' : 'error';
  const hasCredits =
    showAcademics &&
    card.creditsCompleted != null &&
    card.creditsRequired != null &&
    card.creditsRequired > 0;
  const creditPct = hasCredits
    ? Math.min(100, Math.round((card.creditsCompleted! / card.creditsRequired!) * 100))
    : null;

  return (
    <SnapshotCardShell
      title={showAcademics ? 'Classes & Academics' : 'Classes'}
      icon={<IconGraduationCap size={16} />}
      accent="amber"
      empty={!card.present}
      emptyLabel="No class schedule on file"
      trust={card.trust}
      asOf={card.asOf}
      accessory={
        showAcademics ? (
          card.isEligible != null ? (
            <ToneChip tone={eligTone}>{card.isEligible ? 'Eligible' : 'Not eligible'}</ToneChip>
          ) : undefined
        ) : (
          // Honest, non-alarming marker that the academic block is gated for this
          // viewer (capability: can_view_academics) — not "no data".
          <ToneChip tone="neutral" icon={<IconLock size={11} />}>Academics restricted</ToneChip>
        )
      }
    >
      {/* Permitted viewers get the academic-health scan (Classes + Standing/GPA);
          restricted viewers get a single, full-width class-schedule tile. */}
      {showAcademics ? (
        <div className="grid grid-cols-2 gap-2">
          <StatTile label="Classes" value={fmtInt(card.classCount)} sub={card.semester ?? undefined} emphasis />
          <StatTile
            label="Standing"
            value={card.academicStanding ?? '—'}
            sub={card.gpa != null ? `GPA ${card.gpa.toFixed(2)}` : undefined}
          />
        </div>
      ) : (
        <StatTile label="Classes" value={fmtInt(card.classCount)} sub={card.semester ?? undefined} emphasis />
      )}

      {card.classNames.length > 0 && (
        <ul className="mt-3 space-y-1">
          {card.classNames.map((name) => (
            <li key={name} className="flex items-center gap-2 text-xs text-warm-700">
              <span className="w-1.5 h-1.5 rounded-full bg-pursuit flex-shrink-0" />
              <span className="truncate">{name}</span>
            </li>
          ))}
        </ul>
      )}

      {/* Credits-to-eligibility progress — a small bar reads faster than "x/y" for
          the academic-standing scan. Permitted viewers only. */}
      {hasCredits && (
        <div className="mt-3">
          <div className="flex items-center justify-between text-eyebrow text-warm-400">
            <span>Credits toward eligibility</span>
            <span className="tabular-nums">{card.creditsCompleted}/{card.creditsRequired}</span>
          </div>
          <div className="mt-1.5 h-1.5 rounded-full bg-warm-100 overflow-hidden">
            <div
              className="h-full rounded-full bg-pursuit"
              style={{ width: `${creditPct}%` }}
            />
          </div>
        </div>
      )}

      {!showAcademics && (
        <p className="mt-3 text-eyebrow text-warm-400">
          Academic standing, GPA, and eligibility are visible to staff with academic access.
        </p>
      )}
    </SnapshotCardShell>
  );
}

// ─── 7. Video ────────────────────────────────────────────────────────────────

export function VideoSnapshotCard({ card, videosHref }: { card: VideoCard; videosHref?: string }) {
  return (
    <SnapshotCardShell
      title="Video"
      icon={<IconVideo size={16} />}
      accent="warm"
      empty={!card.present}
      emptyLabel="No video uploaded yet"
      trust={card.trust}
      asOf={card.asOf}
      accessory={card.present ? <ToneChip tone="neutral">{card.total}</ToneChip> : undefined}
    >
      <div className="flex gap-3">
        <div className="relative w-24 aspect-video rounded-lg overflow-hidden bg-warm-100 flex-shrink-0">
          {card.latestThumb ? (
            <Image src={card.latestThumb} alt={card.latestTitle ?? 'Latest clip'} fill className="object-cover" />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-warm-200 to-warm-300">
              <IconPlay size={16} className="text-warm-400" />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-warm-800 truncate">{card.latestTitle ?? 'Latest clip'}</p>
          <div className="mt-2 grid grid-cols-3 gap-1.5 text-center">
            <div>
              <p className="text-sm font-bold text-warm-900 tabular-nums leading-none">{card.assignedCount}</p>
              <p className="text-eyebrow text-warm-400">Assigned</p>
            </div>
            <div>
              <p className="text-sm font-bold text-warm-900 tabular-nums leading-none">{card.reviewedCount}</p>
              <p className="text-eyebrow text-warm-400">Reviewed</p>
            </div>
            <div>
              <p className="text-sm font-bold text-warm-900 tabular-nums leading-none">{card.passportCount}</p>
              <p className="text-eyebrow text-warm-400">Passport</p>
            </div>
          </div>
        </div>
      </div>
      {videosHref && (
        <Link
          href={videosHref}
          className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary-600 hover:text-primary-700"
        >
          View all clips <IconChevronRight size={12} />
        </Link>
      )}
    </SnapshotCardShell>
  );
}

// ─── 8. Task & Development ───────────────────────────────────────────────────

export function TaskDevSnapshotCard({ card, devHref }: { card: TaskDevCard; devHref?: string }) {
  return (
    <SnapshotCardShell
      title="Tasks & Development"
      icon={<IconClipboardList size={16} />}
      accent="primary"
      empty={!card.present}
      emptyLabel="No tasks or development plan"
      trust={card.trust}
      asOf={card.asOf}
      accessory={
        card.overdueTasks > 0 ? (
          <ToneChip tone="error" icon={<IconAlertCircle size={12} />}>{card.overdueTasks} overdue</ToneChip>
        ) : undefined
      }
    >
      <div className="grid grid-cols-2 gap-2">
        <StatTile label="Active Tasks" value={fmtInt(card.activeTasks)} emphasis />
        <StatTile label="Dev Goals" value={fmtInt(card.devPlanGoalCount)} sub={card.devPlanTitle ?? undefined} />
      </div>
      {card.taskTitles.length > 0 && (
        <ul className="mt-3 space-y-1">
          {card.taskTitles.map((t) => (
            <li key={t} className="flex items-center gap-2 text-xs text-warm-700">
              <span className="w-1.5 h-1.5 rounded-full bg-primary-400 flex-shrink-0" />
              <span className="truncate">{t}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 flex items-center justify-between gap-2 text-eyebrow text-warm-400">
        {card.staffOwner ? <span>Owner: {card.staffOwner}</span> : <span>No plan owner</span>}
        {card.lastMeetingDate && <span>Last meeting {fmtDate(card.lastMeetingDate)}</span>}
      </div>
      {devHref && (
        <Link
          href={devHref}
          className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary-600 hover:text-primary-700"
        >
          Open development plan <IconChevronRight size={12} />
        </Link>
      )}
    </SnapshotCardShell>
  );
}
