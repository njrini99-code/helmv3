'use client';

import { cn } from '@/lib/utils';

/**
 * Abstract player comparison mockup
 */
export function CompareMockup() {
  return (
    <div className="space-y-2">
      {/* Player headers */}
      <div className="flex gap-2">
        <ComparePlayerHeader name="wide" color="primary" />
        <ComparePlayerHeader name="medium" color="amber" />
      </div>

      {/* Stat comparison bars */}
      <div className={cn(
        "bg-white/45 backdrop-blur-xl rounded-lg p-2",
        "border border-white/30 space-y-2"
      )}>
        <CompareStatRow label="Velo" values={[88, 85]} max={95} />
        <CompareStatRow label="Exit" values={[92, 95]} max={100} />
        <CompareStatRow label="60yd" values={[68, 72]} max={80} inverted />
      </div>
    </div>
  );
}

function ComparePlayerHeader({ name, color }: { name: 'wide' | 'medium'; color: 'primary' | 'amber' }) {
  const widths = { wide: 'w-12', medium: 'w-10' };
  const colors = {
    primary: 'border-primary-300',
    amber: 'border-amber-300',
  };

  return (
    <div className={cn(
      "flex-1 flex items-center gap-1.5 p-1.5 rounded",
      "bg-white/45 border-b-2",
      colors[color]
    )}>
      <div className="w-6 h-6 rounded-full bg-gradient-to-br from-slate-200 to-slate-300" />
      <div className={cn("h-1.5 bg-slate-200 rounded", widths[name])} />
    </div>
  );
}

function CompareStatRow({
  label,
  values,
  max,
  inverted
}: {
  label: string;
  values: [number, number];
  max: number;
  inverted?: boolean;
}) {
  const percent1 = (values[0] / max) * 100;
  const percent2 = (values[1] / max) * 100;
  const winner = inverted ? (values[0] < values[1] ? 0 : 1) : (values[0] > values[1] ? 0 : 1);

  return (
    <div className="space-y-1">
      <div className="flex justify-between items-center">
        <span className="text-[9px] text-slate-500">{label}</span>
        <div className="flex gap-3">
          <span className={cn(
            "text-micro font-semibold",
            winner === 0 ? "text-primary-600" : "text-slate-400"
          )}>
            {values[0]}
          </span>
          <span className={cn(
            "text-micro font-semibold",
            winner === 1 ? "text-amber-600" : "text-slate-400"
          )}>
            {values[1]}
          </span>
        </div>
      </div>
      <div className="flex gap-1">
        <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <div
            className={cn("h-full rounded-full", winner === 0 ? "bg-primary-500" : "bg-primary-200")}
            style={{ width: `${percent1}%` }}
          />
        </div>
        <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <div
            className={cn("h-full rounded-full", winner === 1 ? "bg-amber-500" : "bg-amber-200")}
            style={{ width: `${percent2}%` }}
          />
        </div>
      </div>
    </div>
  );
}
