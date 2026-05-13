'use client';

import { useState, useEffect } from 'react';
import { getMySeasonStats } from '@/app/baseball/actions/games';
import type { BaseballPlayerSeasonStats } from '@/lib/types';

function StatCard({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-2xl p-4 text-center border ${highlight ? 'bg-primary-50 border-primary-100' : 'bg-cream-100/75 backdrop-blur-xl border-white/20'} shadow-sm`}>
      <p className="text-xs font-semibold text-warm-400 uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-2xl font-black tabular-nums ${highlight ? 'text-primary-700' : 'text-warm-900'}`}>{value}</p>
    </div>
  );
}

export function MySeasonStats() {
  const [stats, setStats] = useState<BaseballPlayerSeasonStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getMySeasonStats().then((r) => {
      if (r.success) setStats(r.data ?? null);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-20 bg-warm-100 rounded-2xl animate-pulse" />
        ))}
      </div>
    );
  }

  if (!stats || (stats.ab === 0 && stats.ip === 0)) {
    return (
      <div className="bg-cream-100/75 backdrop-blur-xl border border-white/20 rounded-2xl p-6 text-center">
        <p className="text-sm text-warm-400">
          No season stats yet. Your coach will enter them from game box scores.
        </p>
      </div>
    );
  }

  const currentYear = new Date().getFullYear();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-bold text-warm-800">{currentYear} Season Stats</h3>
        <span className="text-xs text-warm-400">{stats.g} games played</span>
      </div>

      {/* Batting stats */}
      {stats.ab > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-semibold text-warm-500 uppercase tracking-wider">Batting</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="AVG" value={stats.avg != null ? stats.avg.toFixed(3).replace(/^0/, '') : '—'} highlight={stats.avg != null && stats.avg >= 0.3} />
            <StatCard label="OBP" value={stats.obp != null ? stats.obp.toFixed(3).replace(/^0/, '') : '—'} />
            <StatCard label="SLG" value={stats.slg != null ? stats.slg.toFixed(3).replace(/^0/, '') : '—'} />
            <StatCard label="OPS" value={stats.ops != null ? stats.ops.toFixed(3) : '—'} highlight={stats.ops != null && stats.ops >= 0.9} />
          </div>
          <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
            {[
              { label: 'G', value: stats.g },
              { label: 'AB', value: stats.ab },
              { label: 'R', value: stats.r },
              { label: 'H', value: stats.h },
              { label: 'HR', value: stats.hr },
              { label: 'RBI', value: stats.rbi },
              { label: 'BB', value: stats.bb },
              { label: 'SB', value: stats.sb },
            ].map(({ label, value }) => (
              <div key={label} className="bg-warm-50 rounded-xl p-2 text-center">
                <p className="text-[10px] font-semibold text-warm-400 uppercase">{label}</p>
                <p className="text-base font-bold text-warm-800 tabular-nums">{value}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pitching stats */}
      {stats.ip > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-semibold text-warm-500 uppercase tracking-wider">Pitching</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="ERA" value={stats.era != null ? stats.era.toFixed(2) : '—'} highlight={stats.era != null && stats.era <= 3.0} />
            <StatCard label="WHIP" value={stats.whip != null ? stats.whip.toFixed(3) : '—'} />
            <StatCard label="K/9" value={stats.k9 != null ? stats.k9.toFixed(2) : '—'} />
            <StatCard label="IP" value={stats.ip.toFixed(1)} />
          </div>
          <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
            {[
              { label: 'W', value: stats.w },
              { label: 'L', value: stats.l },
              { label: 'SV', value: stats.sv },
              { label: 'K', value: stats.k_thrown },
              { label: 'BB', value: stats.bb_allowed },
              { label: 'H', value: stats.h_allowed },
              { label: 'HR', value: stats.hr_allowed },
            ].map(({ label, value }) => (
              <div key={label} className="bg-warm-50 rounded-xl p-2 text-center">
                <p className="text-[10px] font-semibold text-warm-400 uppercase">{label}</p>
                <p className="text-base font-bold text-warm-800 tabular-nums">{value}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
