'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import {
  CheckCircle2,
  XCircle,
  Loader2,
  Hash,
  Target,
} from 'lucide-react';
import { DetailModal } from '../DetailModal';
import { timeAgo } from '../admin-utils';
import {
  getTracerRoundDiagnostic,
  type TracerRoundDiagnosticData,
  type TracerHoleDiagnostic,
  type TracerShotDiagnostic,
  type TracerErrorLog,
} from '@/app/golf/actions/admin-tracer-data';

// ============================================================================
// TYPES
// ============================================================================

interface RoundDiagnosticModalProps {
  isOpen: boolean;
  onClose: () => void;
  roundId: string | null;
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function RoundDiagnosticModal({ isOpen, onClose, roundId }: RoundDiagnosticModalProps) {
  const [data, setData] = useState<TracerRoundDiagnosticData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !roundId) {
      setData(null);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    getTracerRoundDiagnostic(roundId)
      .then((result) => {
        if (!cancelled) {
          setData(result);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load diagnostic data');
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, roundId]);

  return (
    <DetailModal
      isOpen={isOpen}
      onClose={onClose}
      title="Round Diagnostic"
      subtitle={data ? `${data.playerName} \u2014 ${roundId?.slice(0, 8)}...` : roundId ? `${roundId.slice(0, 8)}...` : undefined}
      showTimeRange={false}
      width="full"
    >
      {loading && (
        <div className="flex flex-col items-center justify-center py-16">
          <Loader2 size={28} className="text-primary-500 animate-spin mb-3" />
          <p className="text-sm text-warm-500">Loading diagnostic data...</p>
        </div>
      )}

      {error && (
        <div className="bg-red-50/80 border border-red-200 rounded-xl p-6 text-center">
          <XCircle className="mx-auto mb-2 text-red-400" size={24} />
          <p className="text-warm-900 font-semibold text-sm">Failed to load</p>
          <p className="text-warm-500 text-xs mt-1">{error}</p>
        </div>
      )}

      {!loading && !error && data && (
        <div className="space-y-6">
          {/* Hole-by-hole Grid */}
          <HoleGrid holes={data.holes} />

          {/* Shot Summary */}
          <ShotSummary shots={data.shots} />

          {/* Errors */}
          <ErrorsList errors={data.errors} />

          {/* Data Completeness */}
          <CompletenessChecklist holes={data.holes} shots={data.shots} />
        </div>
      )}
    </DetailModal>
  );
}

// ============================================================================
// HOLE-BY-HOLE GRID
// ============================================================================

function HoleGrid({ holes }: { holes: TracerHoleDiagnostic[] }) {
  if (holes.length === 0) {
    return (
      <section>
        <SectionLabel label="Hole-by-Hole" />
        <div className="bg-warm-50/50 rounded-xl p-6 text-center">
          <Hash size={20} className="mx-auto mb-2 text-warm-300" />
          <p className="text-sm text-warm-400">No hole data recorded</p>
        </div>
      </section>
    );
  }

  const maxHole = Math.max(...holes.map((h) => h.hole_number));
  const is9Hole = maxHole <= 9;
  const holeSlots = Array.from({ length: is9Hole ? 9 : 18 }, (_, i) => i + 1);
  const holeMap = new Map(holes.map((h) => [h.hole_number, h]));

  return (
    <section>
      <SectionLabel label="Hole-by-Hole" />
      <div className="bg-white/65 backdrop-blur-[16px] border border-white/30 rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04),inset_0_1px_0_rgba(255,255,255,0.7)] overflow-clip">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-warm-100/80">
                <th className="px-3 py-2.5 text-left text-[10px] font-semibold text-warm-400 uppercase tracking-wider sticky left-0 bg-white/90 backdrop-blur-sm z-10 min-w-[60px]">
                  Hole
                </th>
                {holeSlots.map((n) => (
                  <th key={n} className="px-2 py-2.5 text-center font-semibold text-warm-600 min-w-[36px]">
                    {n}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {/* Par row */}
              <tr className="border-b border-warm-50/80">
                <td className="px-3 py-2 text-[10px] font-semibold text-warm-400 uppercase tracking-wider sticky left-0 bg-white/90 backdrop-blur-sm z-10">
                  Par
                </td>
                {holeSlots.map((n) => {
                  const hole = holeMap.get(n);
                  return (
                    <td key={n} className="px-2 py-2 text-center tabular-nums text-warm-500">
                      {hole?.par ?? <span className="text-warm-200">&mdash;</span>}
                    </td>
                  );
                })}
              </tr>

              {/* Score row */}
              <tr className="border-b border-warm-50/80">
                <td className="px-3 py-2 text-[10px] font-semibold text-warm-400 uppercase tracking-wider sticky left-0 bg-white/90 backdrop-blur-sm z-10">
                  Score
                </td>
                {holeSlots.map((n) => {
                  const hole = holeMap.get(n);
                  const score = hole?.score;
                  const par = hole?.par;
                  let colorClass = 'text-warm-600';
                  let bgClass = '';
                  if (score != null && par != null) {
                    if (score < par) { colorClass = 'text-green-700 font-bold'; bgClass = 'bg-green-50/60'; }
                    else if (score > par) { colorClass = 'text-red-600 font-bold'; bgClass = 'bg-red-50/60'; }
                    else { colorClass = 'text-warm-600'; bgClass = 'bg-warm-50/40'; }
                  }
                  return (
                    <td key={n} className={cn('px-2 py-2 text-center tabular-nums', bgClass, colorClass)}>
                      {score ?? <span className="text-warm-200">&mdash;</span>}
                    </td>
                  );
                })}
              </tr>

              {/* Putts row */}
              <tr className="border-b border-warm-50/80">
                <td className="px-3 py-2 text-[10px] font-semibold text-warm-400 uppercase tracking-wider sticky left-0 bg-white/90 backdrop-blur-sm z-10">
                  Putts
                </td>
                {holeSlots.map((n) => {
                  const hole = holeMap.get(n);
                  return (
                    <td key={n} className="px-2 py-2 text-center tabular-nums text-warm-500">
                      {hole?.putts ?? <span className="text-warm-200">&mdash;</span>}
                    </td>
                  );
                })}
              </tr>

              {/* FW row */}
              <tr className="border-b border-warm-50/80">
                <td className="px-3 py-2 text-[10px] font-semibold text-warm-400 uppercase tracking-wider sticky left-0 bg-white/90 backdrop-blur-sm z-10">
                  FW
                </td>
                {holeSlots.map((n) => {
                  const hole = holeMap.get(n);
                  return (
                    <td key={n} className="px-2 py-2 text-center">
                      {hole?.fairway_hit === true ? (
                        <CheckCircle2 size={13} className="inline text-green-500" />
                      ) : hole?.fairway_hit === false ? (
                        <XCircle size={13} className="inline text-red-400" />
                      ) : (
                        <span className="text-warm-200">&mdash;</span>
                      )}
                    </td>
                  );
                })}
              </tr>

              {/* GIR row */}
              <tr>
                <td className="px-3 py-2 text-[10px] font-semibold text-warm-400 uppercase tracking-wider sticky left-0 bg-white/90 backdrop-blur-sm z-10">
                  GIR
                </td>
                {holeSlots.map((n) => {
                  const hole = holeMap.get(n);
                  return (
                    <td key={n} className="px-2 py-2 text-center">
                      {hole?.gir === true ? (
                        <CheckCircle2 size={13} className="inline text-green-500" />
                      ) : hole?.gir === false ? (
                        <XCircle size={13} className="inline text-red-400" />
                      ) : (
                        <span className="text-warm-200">&mdash;</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

// ============================================================================
// SHOT SUMMARY
// ============================================================================

function ShotSummary({ shots }: { shots: TracerShotDiagnostic[] }) {
  if (shots.length === 0) {
    return (
      <section>
        <SectionLabel label="Shot Summary" />
        <div className="bg-warm-50/50 rounded-xl p-6 text-center">
          <Target size={20} className="mx-auto mb-2 text-warm-300" />
          <p className="text-sm text-warm-400">No shot data recorded</p>
        </div>
      </section>
    );
  }

  // Group by shot_type
  const byType = new Map<string, number>();
  for (const shot of shots) {
    const key = shot.shot_type || 'unknown';
    byType.set(key, (byType.get(key) || 0) + 1);
  }
  const typeBreakdown = Array.from(byType.entries()).sort((a, b) => b[1] - a[1]);

  return (
    <section>
      <SectionLabel label="Shot Summary" />
      <div className="bg-white/65 backdrop-blur-[16px] border border-white/30 rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04),inset_0_1px_0_rgba(255,255,255,0.7)] p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold text-warm-900 tabular-nums">{shots.length}</span>
            <span className="text-sm text-warm-500">total shots</span>
          </div>
        </div>
        {typeBreakdown.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {typeBreakdown.map(([type, count]) => (
              <span
                key={type}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-warm-50/60 text-xs font-medium text-warm-600"
              >
                <span className="capitalize">{type.replace(/_/g, ' ')}</span>
                <span className="text-warm-400 tabular-nums">{count}</span>
              </span>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

// ============================================================================
// ERRORS LIST
// ============================================================================

function ErrorsList({ errors }: { errors: TracerErrorLog[] }) {
  if (errors.length === 0) {
    return (
      <section>
        <SectionLabel label="Errors" />
        <div className="bg-green-50/40 border border-green-200/30 rounded-xl p-5 text-center">
          <CheckCircle2 size={20} className="mx-auto mb-2 text-green-500" />
          <p className="text-sm text-green-700 font-medium">No errors for this round</p>
        </div>
      </section>
    );
  }

  const badgeColors: Record<string, string> = {
    critical: 'bg-red-100 text-red-800',
    error: 'bg-red-50 text-red-700',
    warning: 'bg-amber-50 text-amber-700',
    info: 'bg-blue-50 text-blue-700',
  };

  return (
    <section>
      <SectionLabel label={`Errors (${errors.length})`} />
      <div className="bg-white/65 backdrop-blur-[16px] border border-white/30 rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04),inset_0_1px_0_rgba(255,255,255,0.7)] divide-y divide-warm-100/50 overflow-clip">
        {errors.map((err) => {
          const sev = err.severity || 'error';
          return (
            <div key={err.id} className="px-4 py-3 flex items-start gap-3">
              <span className={cn(
                'inline-flex px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide flex-shrink-0 mt-0.5',
                badgeColors[sev] || 'bg-warm-100 text-warm-600'
              )}>
                {sev}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-warm-800 leading-relaxed break-words">{err.message}</p>
              </div>
              {err.created_at && (
                <span className="text-[10px] text-warm-400 flex-shrink-0 whitespace-nowrap">
                  {timeAgo(err.created_at)}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ============================================================================
// COMPLETENESS CHECKLIST
// ============================================================================

function CompletenessChecklist({
  holes,
  shots,
}: {
  holes: TracerHoleDiagnostic[];
  shots: TracerShotDiagnostic[];
}) {
  const hasHoles = holes.length > 0;
  const hasShots = shots.length > 0;
  const hasScores = holes.some((h) => h.score != null);
  const hasPutts = holes.some((h) => h.putts != null);
  const hasFairways = holes.some((h) => h.fairway_hit != null);
  const hasGIR = holes.some((h) => h.gir != null);
  const hasPar = holes.some((h) => h.par != null);
  const hasShotTypes = shots.some((s) => s.shot_type != null);
  const hasClubs = shots.some((s) => s.club != null);
  const hasDistances = shots.some((s) => s.distance != null);

  const checks = [
    { label: 'Holes Recorded', ok: hasHoles, detail: hasHoles ? `${holes.length} holes` : 'None' },
    { label: 'Shots Recorded', ok: hasShots, detail: hasShots ? `${shots.length} shots` : 'None' },
    { label: 'Par Data', ok: hasPar, detail: hasPar ? 'Present' : 'Missing' },
    { label: 'Scores', ok: hasScores, detail: hasScores ? 'Present' : 'Missing' },
    { label: 'Putts', ok: hasPutts, detail: hasPutts ? 'Present' : 'Missing' },
    { label: 'Fairways', ok: hasFairways, detail: hasFairways ? 'Present' : 'Missing' },
    { label: 'GIR', ok: hasGIR, detail: hasGIR ? 'Present' : 'Missing' },
    { label: 'Shot Types', ok: hasShotTypes, detail: hasShotTypes ? 'Present' : 'Missing' },
    { label: 'Clubs', ok: hasClubs, detail: hasClubs ? 'Present' : 'Missing' },
    { label: 'Distances', ok: hasDistances, detail: hasDistances ? 'Present' : 'Missing' },
  ];

  const passCount = checks.filter((c) => c.ok).length;

  return (
    <section>
      <SectionLabel label={`Data Completeness (${passCount}/${checks.length})`} />
      <div className="bg-white/65 backdrop-blur-[16px] border border-white/30 rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04),inset_0_1px_0_rgba(255,255,255,0.7)] p-4">
        <div className="grid grid-cols-2 gap-2">
          {checks.map((check) => (
            <div
              key={check.label}
              className={cn(
                'flex items-center gap-2 px-3 py-2 rounded-lg text-xs',
                check.ok ? 'bg-green-50/50' : 'bg-red-50/50'
              )}
            >
              {check.ok ? (
                <CheckCircle2 size={14} className="text-green-500 flex-shrink-0" />
              ) : (
                <XCircle size={14} className="text-red-400 flex-shrink-0" />
              )}
              <span className={cn(
                'font-medium',
                check.ok ? 'text-green-700' : 'text-red-600'
              )}>
                {check.label}
              </span>
              <span className={cn(
                'ml-auto text-[10px]',
                check.ok ? 'text-green-500' : 'text-red-400'
              )}>
                {check.detail}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ============================================================================
// SECTION LABEL
// ============================================================================

function SectionLabel({ label }: { label: string }) {
  return (
    <h3 className="text-[11px] font-semibold text-warm-500 uppercase tracking-wider mb-2">
      {label}
    </h3>
  );
}
