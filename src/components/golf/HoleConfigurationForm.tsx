'use client';

import { useState } from 'react';
import type { HoleConfig } from '@/lib/types/golf-course';

interface HoleConfigurationFormProps {
  initialHoles?: HoleConfig[];
  onSave: (holes: HoleConfig[]) => void;
  onBack: () => void;
  courseName: string;
  holesPerRound?: 9 | 18;
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
  courseName,
  holesPerRound = 18,
}: HoleConfigurationFormProps) {
  const [holes, setHoles] = useState<HoleConfig[]>(() => {
    if (initialHoles && initialHoles.length === holesPerRound) {
      return initialHoles;
    }
    return Array.from({ length: holesPerRound }, (_, i) => ({
      holeNumber: i + 1,
      par: DEFAULT_PARS[i]!,
      yardage: DEFAULT_YARDAGES[i]!,
    }));
  });

  const [activeTab, setActiveTab] = useState<'front' | 'back'>('front');

  const is9Hole = holesPerRound === 9;

  // Calculate totals
  const frontNine = holes.slice(0, 9);
  const backNine = is9Hole ? [] : holes.slice(9, 18);
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

  const [validationError, setValidationError] = useState<string | null>(null);

  function handleSubmit() {
    const isValid = holes.every(h => h.par >= 3 && h.par <= 6 && h.yardage > 0);
    if (!isValid) {
      setValidationError('Please ensure all holes have valid par (3-6) and yardage values');
      return;
    }
    setValidationError(null);
    onSave(holes);
  }

  // For 9-hole rounds, always show all holes (no tabs)
  const displayHoles = is9Hole ? holes : (activeTab === 'front' ? frontNine : backNine);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-warm-600 hover:text-warm-900"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>
        <h2 className="text-lg font-semibold text-warm-900">{courseName}</h2>
        <div className="w-16" /> {/* Spacer */}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div className="bg-white rounded-lg p-4 border border-warm-200 shadow-sm shadow-primary-950/5 ring-1 ring-warm-100 text-center">
          <div className="text-2xl font-bold text-primary-600 tabular-nums">{totalPar}</div>
          <div className="text-xs font-bold text-warm-500 uppercase tracking-wider">Total Par</div>
        </div>
        <div className="bg-white rounded-lg p-4 border border-warm-200 shadow-sm shadow-primary-950/5 ring-1 ring-warm-100 text-center">
          <div className="text-2xl font-bold text-warm-900 tabular-nums">
            {totalYards.toLocaleString()}
          </div>
          <div className="text-xs font-bold text-warm-500 uppercase tracking-wider">Total Yards</div>
        </div>
        <div className="bg-white rounded-lg p-4 border border-warm-200 shadow-sm shadow-primary-950/5 ring-1 ring-warm-100 text-center">
          <div className="text-2xl font-bold text-warm-600 tabular-nums">{holesPerRound}</div>
          <div className="text-xs font-bold text-warm-500 uppercase tracking-wider">Holes</div>
        </div>
      </div>

      {/* Front/Back Nine Tabs — only for 18-hole rounds */}
      {!is9Hole && (
        <div className="flex bg-warm-100 rounded-lg p-1">
          <button
            onClick={() => setActiveTab('front')}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all
              ${activeTab === 'front'
                ? 'bg-white text-warm-900 shadow-sm'
                : 'text-warm-600 hover:text-warm-900'
              }`}
          >
            Front 9 <span className="text-warm-400">({frontPar} par)</span>
          </button>
          <button
            onClick={() => setActiveTab('back')}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all
              ${activeTab === 'back'
                ? 'bg-white text-warm-900 shadow-sm'
                : 'text-warm-600 hover:text-warm-900'
              }`}
          >
            Back 9 <span className="text-warm-400">({backPar} par)</span>
          </button>
        </div>
      )}

      {/* Hole Configuration Grid */}
      <div className="bg-white rounded-lg border border-warm-200 overflow-hidden shadow-sm shadow-primary-950/5 ring-1 ring-warm-100">
        {/* Header */}
        <div className="grid grid-cols-[60px_1fr_1fr] gap-0 bg-warm-50 border-b border-warm-200">
          <div className="px-3 py-2 text-xs font-bold text-warm-500 uppercase tracking-wider">
            Hole
          </div>
          <div className="px-3 py-2 text-xs font-bold text-warm-500 uppercase tracking-wider text-center border-l border-warm-200">
            Par
          </div>
          <div className="px-3 py-2 text-xs font-bold text-warm-500 uppercase tracking-wider text-center border-l border-warm-200">
            Yardage
          </div>
        </div>

        {/* Hole Rows */}
        {displayHoles.map((hole, idx) => (
          <div
            key={hole.holeNumber}
            className={`grid grid-cols-[60px_1fr_1fr] gap-0
              ${idx % 2 === 0 ? 'bg-white' : 'bg-warm-50/50'}
              ${idx < displayHoles.length - 1 ? 'border-b border-warm-100' : ''}`}
          >
            {/* Hole Number */}
            <div className="px-3 py-3 flex items-center">
              <span className={`w-8 h-8 rounded-full flex items-center justify-center
                text-sm font-bold
                ${hole.par === 3 ? 'bg-rose-50 text-rose-600 ring-1 ring-rose-200' : ''}
                ${hole.par === 4 ? 'bg-warm-100 text-warm-700 ring-1 ring-warm-200' : ''}
                ${hole.par === 5 ? 'bg-primary-50 text-primary-600 ring-1 ring-primary-200' : ''}
              `}>
                {hole.holeNumber}
              </span>
            </div>

            {/* Par Selector */}
            <div className="px-2 py-2 border-l border-warm-100 flex items-center justify-center">
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
                            ? 'bg-primary-600 text-white shadow-sm shadow-primary-950/10 ring-1 ring-primary-700'
                            : 'bg-warm-700 text-white shadow-sm shadow-warm-950/10 ring-1 ring-warm-800'
                        : 'bg-warm-100 text-warm-600 hover:bg-warm-200 ring-1 ring-warm-200'
                      }`}
                  >
                    {par}
                  </button>
                ))}
              </div>
            </div>

            {/* Yardage Input */}
            <div className="px-2 py-2 border-l border-warm-100 flex items-center justify-center">
              <input
                type="number"
                inputMode="numeric"
                value={hole.yardage}
                onChange={(e) => updateHole(hole.holeNumber, 'yardage', parseInt(e.target.value) || 0)}
                className="w-20 px-3 py-2 text-center text-sm font-medium border border-warm-200
                           rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent"
                min="50"
                max="700"
              />
            </div>
          </div>
        ))}

        {/* Nine Total */}
        <div className="grid grid-cols-[60px_1fr_1fr] gap-0 bg-warm-100 border-t border-warm-200">
          <div className="px-3 py-3 text-sm font-bold text-warm-700">
            {is9Hole ? 'TOTAL' : (activeTab === 'front' ? 'OUT' : 'IN')}
          </div>
          <div className="px-3 py-3 text-center text-sm font-bold text-warm-900 border-l border-warm-200">
            {is9Hole ? totalPar : (activeTab === 'front' ? frontPar : backPar)}
          </div>
          <div className="px-3 py-3 text-center text-sm font-bold text-warm-900 border-l border-warm-200">
            {(is9Hole ? totalYards : (activeTab === 'front' ? frontYards : backYards)).toLocaleString()}
          </div>
        </div>
      </div>

      {validationError && (
        <p className="text-red-500 text-sm font-medium">{validationError}</p>
      )}

      {/* Save Button */}
      <button
        onClick={handleSubmit}
        className="w-full py-4 bg-primary-600 text-white font-semibold rounded-lg
                   hover:bg-primary-700 transition-colors shadow-sm shadow-primary-950/10 ring-1 ring-primary-700"
      >
        Save Course & Start Round
      </button>
    </div>
  );
}
