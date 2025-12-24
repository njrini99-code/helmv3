'use client';

import { useState } from 'react';
import type { HoleConfig } from '@/lib/types/golf-course';

interface HoleConfigurationFormProps {
  initialHoles?: HoleConfig[];
  onSave: (holes: HoleConfig[]) => void;
  onBack: () => void;
  courseName: string;
}

// Default par distribution for a standard course
const DEFAULT_PARS = [4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 4, 3, 5, 4, 4, 3, 4, 5];
const DEFAULT_YARDAGES = [
  380, 420, 165, 520, 400, 385, 175, 410, 545,
  395, 430, 155, 510, 375, 415, 185, 390, 535
];

export function HoleConfigurationForm({
  initialHoles,
  onSave,
  onBack,
  courseName
}: HoleConfigurationFormProps) {
  const [holes, setHoles] = useState<HoleConfig[]>(() => {
    if (initialHoles && initialHoles.length === 18) {
      return initialHoles;
    }
    return Array.from({ length: 18 }, (_, i) => ({
      holeNumber: i + 1,
      par: DEFAULT_PARS[i]!,
      yardage: DEFAULT_YARDAGES[i]!,
    }));
  });

  const [activeTab, setActiveTab] = useState<'front' | 'back'>('front');

  // Calculate totals
  const frontNine = holes.slice(0, 9);
  const backNine = holes.slice(9, 18);
  const frontPar = frontNine.reduce((sum, h) => sum + h.par, 0);
  const backPar = backNine.reduce((sum, h) => sum + h.par, 0);
  const frontYards = frontNine.reduce((sum, h) => sum + h.yardage, 0);
  const backYards = backNine.reduce((sum, h) => sum + h.yardage, 0);
  const totalPar = frontPar + backPar;
  const totalYards = frontYards + backYards;

  function updateHole(holeNumber: number, field: 'par' | 'yardage', value: number) {
    setHoles(prev => prev.map(h =>
      h.holeNumber === holeNumber ? { ...h, [field]: value } : h
    ));
  }

  function handleSubmit() {
    // Validate all holes have valid values
    const isValid = holes.every(h => h.par >= 3 && h.par <= 6 && h.yardage > 0);
    if (!isValid) {
      alert('Please ensure all holes have valid par (3-6) and yardage values');
      return;
    }
    onSave(holes);
  }

  const displayHoles = activeTab === 'front' ? frontNine : backNine;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-slate-600 hover:text-slate-900"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>
        <h2 className="text-lg font-semibold text-slate-900">{courseName}</h2>
        <div className="w-16" /> {/* Spacer */}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-lg p-4 border border-slate-200 shadow-sm shadow-emerald-950/5 ring-1 ring-slate-100 text-center">
          <div className="text-2xl font-bold text-emerald-600">{totalPar}</div>
          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Par</div>
        </div>
        <div className="bg-white rounded-lg p-4 border border-slate-200 shadow-sm shadow-emerald-950/5 ring-1 ring-slate-100 text-center">
          <div className="text-2xl font-bold text-slate-900">
            {totalYards.toLocaleString()}
          </div>
          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Yards</div>
        </div>
        <div className="bg-white rounded-lg p-4 border border-slate-200 shadow-sm shadow-emerald-950/5 ring-1 ring-slate-100 text-center">
          <div className="text-2xl font-bold text-slate-600">18</div>
          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">Holes</div>
        </div>
      </div>

      {/* Front/Back Nine Tabs */}
      <div className="flex bg-slate-100 rounded-lg p-1">
        <button
          onClick={() => setActiveTab('front')}
          className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all
            ${activeTab === 'front'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
            }`}
        >
          Front 9 <span className="text-slate-400">({frontPar} par)</span>
        </button>
        <button
          onClick={() => setActiveTab('back')}
          className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all
            ${activeTab === 'back'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
            }`}
        >
          Back 9 <span className="text-slate-400">({backPar} par)</span>
        </button>
      </div>

      {/* Hole Configuration Grid */}
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden shadow-sm shadow-emerald-950/5 ring-1 ring-slate-100">
        {/* Header */}
        <div className="grid grid-cols-[60px_1fr_1fr] gap-0 bg-slate-50 border-b border-slate-200">
          <div className="px-3 py-2 text-xs font-bold text-slate-500 uppercase tracking-wider">
            Hole
          </div>
          <div className="px-3 py-2 text-xs font-bold text-slate-500 uppercase tracking-wider text-center border-l border-slate-200">
            Par
          </div>
          <div className="px-3 py-2 text-xs font-bold text-slate-500 uppercase tracking-wider text-center border-l border-slate-200">
            Yardage
          </div>
        </div>

        {/* Hole Rows */}
        {displayHoles.map((hole, idx) => (
          <div
            key={hole.holeNumber}
            className={`grid grid-cols-[60px_1fr_1fr] gap-0
              ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}
              ${idx < displayHoles.length - 1 ? 'border-b border-slate-100' : ''}`}
          >
            {/* Hole Number */}
            <div className="px-3 py-3 flex items-center">
              <span className={`w-8 h-8 rounded-full flex items-center justify-center
                text-sm font-bold
                ${hole.par === 3 ? 'bg-rose-50 text-rose-600 ring-1 ring-rose-200' : ''}
                ${hole.par === 4 ? 'bg-slate-100 text-slate-700 ring-1 ring-slate-200' : ''}
                ${hole.par === 5 ? 'bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200' : ''}
              `}>
                {hole.holeNumber}
              </span>
            </div>

            {/* Par Selector */}
            <div className="px-2 py-2 border-l border-slate-100 flex items-center justify-center">
              <div className="flex gap-1">
                {[3, 4, 5].map(par => (
                  <button
                    key={par}
                    onClick={() => updateHole(hole.holeNumber, 'par', par)}
                    className={`w-10 h-10 rounded-lg text-sm font-bold transition-all
                      ${hole.par === par
                        ? par === 3
                          ? 'bg-rose-600 text-white shadow-sm shadow-rose-950/10 ring-1 ring-rose-700'
                          : par === 5
                            ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-950/10 ring-1 ring-emerald-700'
                            : 'bg-slate-700 text-white shadow-sm shadow-slate-950/10 ring-1 ring-slate-800'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200 ring-1 ring-slate-200'
                      }`}
                  >
                    {par}
                  </button>
                ))}
              </div>
            </div>

            {/* Yardage Input */}
            <div className="px-2 py-2 border-l border-slate-100 flex items-center justify-center">
              <input
                type="number"
                value={hole.yardage}
                onChange={(e) => updateHole(hole.holeNumber, 'yardage', parseInt(e.target.value) || 0)}
                className="w-20 px-3 py-2 text-center text-sm font-medium border border-slate-200
                           rounded-lg focus:ring-2 focus:ring-emerald-600 focus:border-transparent"
                min="50"
                max="700"
              />
            </div>
          </div>
        ))}

        {/* Nine Total */}
        <div className="grid grid-cols-[60px_1fr_1fr] gap-0 bg-slate-100 border-t border-slate-200">
          <div className="px-3 py-3 text-sm font-bold text-slate-700">
            {activeTab === 'front' ? 'OUT' : 'IN'}
          </div>
          <div className="px-3 py-3 text-center text-sm font-bold text-slate-900 border-l border-slate-200">
            {activeTab === 'front' ? frontPar : backPar}
          </div>
          <div className="px-3 py-3 text-center text-sm font-bold text-slate-900 border-l border-slate-200">
            {(activeTab === 'front' ? frontYards : backYards).toLocaleString()}
          </div>
        </div>
      </div>

      {/* Save Button */}
      <button
        onClick={handleSubmit}
        className="w-full py-4 bg-emerald-600 text-white font-semibold rounded-lg
                   hover:bg-emerald-700 transition-colors shadow-sm shadow-emerald-950/10 ring-1 ring-emerald-700"
      >
        Save Course & Start Round
      </button>
    </div>
  );
}
