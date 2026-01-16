'use client';

import { useRouter } from 'next/navigation';

interface RoundSummaryData {
  id: string;
  courseName: string;
  roundDate: string;
  totalScore: number;
  totalToPar: number;
  totalPutts: number;
  fairwaysHit: number;
  fairwaysTotal: number;
  greensInReg: number;
  greensTotal: number;
  birdies: number;
  eagles: number;
  pars: number;
  bogeys: number;
  doublePlus: number;
}

interface RoundCompletionSummaryProps {
  summary: RoundSummaryData;
  onClose: () => void;
}

export function RoundCompletionSummary({ summary, onClose }: RoundCompletionSummaryProps) {
  const router = useRouter();

  const handleBackToDashboard = () => {
    onClose();
    router.push('/golf/dashboard');
  };

  const handleViewStats = () => {
    onClose();
    router.push('/golf/dashboard/stats');
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const getToParDisplay = (toPar: number) => {
    if (toPar === 0) return 'E';
    if (toPar > 0) return `+${toPar}`;
    return `${toPar}`;
  };

  const getToParColor = (toPar: number) => {
    if (toPar <= -5) return 'text-emerald-700';
    if (toPar < 0) return 'text-emerald-600';
    if (toPar === 0) return 'text-slate-700';
    if (toPar <= 5) return 'text-amber-600';
    return 'text-red-600';
  };

  const fairwayPercentage = summary.fairwaysTotal > 0
    ? Math.round((summary.fairwaysHit / summary.fairwaysTotal) * 100)
    : 0;

  const girPercentage = summary.greensTotal > 0
    ? Math.round((summary.greensInReg / summary.greensTotal) * 100)
    : 0;

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="relative glass-standard rounded-2xl overflow-hidden shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto transition-all duration-300">
        {/* Shine effect */}
        <div
          className="absolute inset-x-0 top-0 h-px pointer-events-none z-10"
          style={{
            background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)',
          }}
        />
        {/* Header */}
        <div className="bg-gradient-to-br from-emerald-600 to-emerald-700 text-white px-8 py-6 rounded-t-2xl">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
              <span className="text-2xl">🏌️</span>
            </div>
            <div>
              <h2 className="text-2xl font-bold">Round Complete!</h2>
              <p className="text-emerald-100 text-sm">Great job out there</p>
            </div>
          </div>
        </div>

        {/* Course & Date */}
        <div className="px-8 py-6 border-b border-slate-200">
          <h3 className="text-xl font-semibold text-slate-900 mb-1">{summary.courseName}</h3>
          <p className="text-sm text-slate-500">{formatDate(summary.roundDate)}</p>
        </div>

        {/* Score */}
        <div className="px-8 py-6 bg-gradient-to-br from-slate-50 to-white border-b border-slate-200">
          <div className="flex items-center justify-center gap-8">
            <div className="text-center">
              <p className="text-sm font-medium text-slate-500 uppercase tracking-wide mb-2">Total Score</p>
              <p className="text-5xl font-bold text-slate-900">{summary.totalScore}</p>
            </div>
            <div className="h-16 w-px bg-slate-200"></div>
            <div className="text-center">
              <p className="text-sm font-medium text-slate-500 uppercase tracking-wide mb-2">To Par</p>
              <p className={`text-5xl font-bold ${getToParColor(summary.totalToPar)}`}>
                {getToParDisplay(summary.totalToPar)}
              </p>
            </div>
          </div>
        </div>

        {/* Quick Stats Grid */}
        <div className="px-8 py-6 border-b border-slate-200">
          <h4 className="text-sm font-semibold text-slate-700 uppercase tracking-wider mb-4">Round Stats</h4>
          <div className="grid grid-cols-2 gap-4">
            <div className="relative glass-standard rounded-xl overflow-hidden p-4 transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5">
              {/* Shine effect */}
              <div
                className="absolute inset-x-0 top-0 h-px pointer-events-none z-10"
                style={{
                  background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)',
                }}
              />
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Total Putts</p>
              <p className="text-2xl font-bold text-slate-900">{summary.totalPutts}</p>
              <p className="text-xs text-slate-400 mt-1">
                {(summary.totalPutts / summary.greensTotal).toFixed(1)} per hole
              </p>
            </div>
            <div className="relative glass-standard rounded-xl overflow-hidden p-4 transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5">
              {/* Shine effect */}
              <div
                className="absolute inset-x-0 top-0 h-px pointer-events-none z-10"
                style={{
                  background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)',
                }}
              />
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Fairways Hit</p>
              <p className="text-2xl font-bold text-slate-900">
                {summary.fairwaysHit}/{summary.fairwaysTotal}
              </p>
              <p className="text-xs text-slate-400 mt-1">{fairwayPercentage}% accuracy</p>
            </div>
            <div className="relative glass-standard rounded-xl overflow-hidden p-4 transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5">
              {/* Shine effect */}
              <div
                className="absolute inset-x-0 top-0 h-px pointer-events-none z-10"
                style={{
                  background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)',
                }}
              />
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Greens in Regulation</p>
              <p className="text-2xl font-bold text-slate-900">
                {summary.greensInReg}/{summary.greensTotal}
              </p>
              <p className="text-xs text-slate-400 mt-1">{girPercentage}%</p>
            </div>
            <div className="relative glass-standard rounded-xl overflow-hidden p-4 transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5">
              {/* Shine effect */}
              <div
                className="absolute inset-x-0 top-0 h-px pointer-events-none z-10"
                style={{
                  background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)',
                }}
              />
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Putts per GIR</p>
              <p className="text-2xl font-bold text-slate-900">
                {summary.greensInReg > 0
                  ? (summary.totalPutts / summary.greensInReg).toFixed(2)
                  : '--'}
              </p>
              <p className="text-xs text-slate-400 mt-1">when on green</p>
            </div>
          </div>
        </div>

        {/* Score Distribution */}
        <div className="px-8 py-6 border-b border-slate-200">
          <h4 className="text-sm font-semibold text-slate-700 uppercase tracking-wider mb-4">Score Distribution</h4>
          <div className="flex items-center justify-between gap-3">
            {summary.eagles > 0 && (
              <div className="relative flex-1 text-center glass-standard rounded-xl overflow-hidden p-3 transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5">
                {/* Shine effect */}
                <div
                  className="absolute inset-x-0 top-0 h-px pointer-events-none z-10"
                  style={{
                    background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)',
                  }}
                />
                <p className="text-2xl font-bold text-yellow-700">{summary.eagles}</p>
                <p className="text-xs font-medium text-yellow-600 uppercase tracking-wide mt-1">Eagles</p>
              </div>
            )}
            <div className="relative flex-1 text-center glass-standard rounded-xl overflow-hidden p-3 transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5">
              {/* Shine effect */}
              <div
                className="absolute inset-x-0 top-0 h-px pointer-events-none z-10"
                style={{
                  background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)',
                }}
              />
              <p className="text-2xl font-bold text-emerald-700">{summary.birdies}</p>
              <p className="text-xs font-medium text-emerald-600 uppercase tracking-wide mt-1">Birdies</p>
            </div>
            <div className="relative flex-1 text-center glass-standard rounded-xl overflow-hidden p-3 transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5">
              {/* Shine effect */}
              <div
                className="absolute inset-x-0 top-0 h-px pointer-events-none z-10"
                style={{
                  background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)',
                }}
              />
              <p className="text-2xl font-bold text-slate-700">{summary.pars}</p>
              <p className="text-xs font-medium text-slate-600 uppercase tracking-wide mt-1">Pars</p>
            </div>
            <div className="relative flex-1 text-center glass-standard rounded-xl overflow-hidden p-3 transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5">
              {/* Shine effect */}
              <div
                className="absolute inset-x-0 top-0 h-px pointer-events-none z-10"
                style={{
                  background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)',
                }}
              />
              <p className="text-2xl font-bold text-amber-700">{summary.bogeys}</p>
              <p className="text-xs font-medium text-amber-600 uppercase tracking-wide mt-1">Bogeys</p>
            </div>
            <div className="relative flex-1 text-center glass-standard rounded-xl overflow-hidden p-3 transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5">
              {/* Shine effect */}
              <div
                className="absolute inset-x-0 top-0 h-px pointer-events-none z-10"
                style={{
                  background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)',
                }}
              />
              <p className="text-2xl font-bold text-red-700">{summary.doublePlus}</p>
              <p className="text-xs font-medium text-red-600 uppercase tracking-wide mt-1">Double+</p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="px-8 py-6 bg-slate-50 rounded-b-2xl">
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={handleBackToDashboard}
              className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-3.5 px-6 rounded-xl transition-colors shadow-sm"
            >
              Back to Dashboard
            </button>
            <button
              onClick={handleViewStats}
              className="flex-1 bg-white hover:bg-slate-50 text-slate-700 font-semibold py-3.5 px-6 rounded-xl border-2 border-slate-200 hover:border-slate-300 transition-colors"
            >
              View Full Stats
            </button>
          </div>
          <p className="text-center text-xs text-slate-400 mt-4">
            Your round has been saved and stats are ready to view
          </p>
        </div>
      </div>
    </div>
  );
}
