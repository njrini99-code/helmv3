'use client';

/**
 * ReasoningChainView - Displays the full reasoning chain from a CoachHelm insight
 *
 * Features:
 * - Step-by-step visualization with numbered steps
 * - Confidence indicator per step (progress bar)
 * - Evidence citations with expandable sections
 * - Alternative explanations display
 * - Sensitivity analysis display
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import {
  IconChevronDown,
  IconCheck,
  IconWarning,
  IconInfo,
} from '@/components/icons';
import type { ReasoningResult, ReasoningStep, ReasoningType } from '@/lib/coachhelm/v2/types';

interface ReasoningChainViewProps {
  reasoning: ReasoningResult;
}

const reasoningTypeLabels: Record<ReasoningType, { label: string; color: string }> = {
  deductive: { label: 'Deductive', color: 'bg-blue-100 text-blue-700' },
  inductive: { label: 'Inductive', color: 'bg-primary-100 text-primary-700' },
  abductive: { label: 'Abductive', color: 'bg-purple-100 text-purple-700' },
};

export function ReasoningChainView({ reasoning }: ReasoningChainViewProps) {
  const [expandedStep, setExpandedStep] = useState<number | null>(null);
  const [showAlternatives, setShowAlternatives] = useState(false);
  const [showSensitivities, setShowSensitivities] = useState(false);

  const calibrationDiff = reasoning.calibratedConfidence - reasoning.confidence;
  const calibrationAdjusted = Math.abs(calibrationDiff) > 0.05;

  return (
    <div className="space-y-6">
      {/* Conclusion summary */}
      <div className="bg-gradient-to-r from-primary-50 to-primary-50 border border-primary-200 rounded-xl p-4">
        <h3 className="text-xs font-medium text-primary-600 uppercase tracking-wide mb-2">
          Conclusion
        </h3>
        <p className="text-sm text-warm-800 font-medium leading-relaxed">
          {reasoning.conclusion}
        </p>
        <div className="flex items-center gap-4 mt-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-warm-500">Raw Confidence:</span>
            <span className="text-xs font-medium text-warm-700">
              {Math.round(reasoning.confidence * 100)}%
            </span>
          </div>
          {calibrationAdjusted && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-warm-500">Calibrated:</span>
              <span className={cn(
                'text-xs font-medium',
                calibrationDiff > 0 ? 'text-primary-600' : 'text-amber-600'
              )}>
                {Math.round(reasoning.calibratedConfidence * 100)}%
                <span className="text-xs ml-1">
                  ({calibrationDiff > 0 ? '+' : ''}{Math.round(calibrationDiff * 100)}%)
                </span>
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Reasoning chain */}
      <div>
        <h3 className="text-sm font-medium text-warm-900 mb-4">Reasoning Chain</h3>
        <div className="space-y-3">
          {reasoning.reasoningChain.map((step, index) => (
            <ReasoningStepCard
              key={step.stepNumber}
              step={step}
              isLast={index === reasoning.reasoningChain.length - 1}
              isExpanded={expandedStep === step.stepNumber}
              onToggle={() =>
                setExpandedStep(
                  expandedStep === step.stepNumber ? null : step.stepNumber
                )
              }
            />
          ))}
        </div>
      </div>

      {/* Evidence citations */}
      {reasoning.evidence && reasoning.evidence.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-warm-900 mb-3">Supporting Evidence</h3>
          <div className="space-y-2">
            {reasoning.evidence.map((citation, i) => (
              <div
                key={i}
                className="flex items-start gap-2 text-sm text-warm-600 bg-warm-50 rounded-lg px-3 py-2"
              >
                <IconCheck size={14} className="text-primary-500 mt-0.5 flex-shrink-0" />
                <span>{citation}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Alternative explanations */}
      {reasoning.alternatives && reasoning.alternatives.length > 0 && (
        <div className="border border-warm-200 rounded-xl overflow-hidden">
          <button
            onClick={() => setShowAlternatives(!showAlternatives)}
            className="w-full flex items-center justify-between px-4 py-3 bg-warm-50 hover:bg-warm-100 active:bg-warm-200 transition-colors"
          >
            <div className="flex items-center gap-2">
              <IconWarning size={16} className="text-amber-500" />
              <span className="text-sm font-medium text-warm-700">
                Alternative Explanations ({reasoning.alternatives.length})
              </span>
            </div>
            <motion.div
              animate={{ rotate: showAlternatives ? 180 : 0 }}
              transition={{ duration: 0.2 }}
            >
              <IconChevronDown size={16} className="text-warm-400" />
            </motion.div>
          </button>
          <AnimatePresence>
            {showAlternatives && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ height: { type: 'spring', stiffness: 500, damping: 30 }, opacity: { duration: 0.2 } }}
                className="overflow-hidden"
              >
                <div className="p-4 space-y-3 border-t border-warm-200">
                  {reasoning.alternatives.map((alt, i) => (
                    <div
                      key={i}
                      className="bg-white border border-warm-100 rounded-lg p-3"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-warm-700">
                          {alt.explanation}
                        </span>
                        <span className="text-xs px-2 py-0.5 bg-warm-100 text-warm-600 rounded-full">
                          {Math.round(alt.probability * 100)}% likely
                        </span>
                      </div>
                      <p className="text-xs text-warm-500">
                        <span className="font-medium">Less likely because:</span>{' '}
                        {alt.whyLessLikely}
                      </p>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Sensitivity analysis */}
      {reasoning.sensitivities && reasoning.sensitivities.length > 0 && (
        <div className="border border-warm-200 rounded-xl overflow-hidden">
          <button
            onClick={() => setShowSensitivities(!showSensitivities)}
            className="w-full flex items-center justify-between px-4 py-3 bg-warm-50 hover:bg-warm-100 active:bg-warm-200 transition-colors"
          >
            <div className="flex items-center gap-2">
              <IconInfo size={16} className="text-blue-500" />
              <span className="text-sm font-medium text-warm-700">
                Sensitivity Analysis ({reasoning.sensitivities.length})
              </span>
            </div>
            <motion.div
              animate={{ rotate: showSensitivities ? 180 : 0 }}
              transition={{ duration: 0.2 }}
            >
              <IconChevronDown size={16} className="text-warm-400" />
            </motion.div>
          </button>
          <AnimatePresence>
            {showSensitivities && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ height: { type: 'spring', stiffness: 500, damping: 30 }, opacity: { duration: 0.2 } }}
                className="overflow-hidden"
              >
                <div className="p-4 space-y-3 border-t border-warm-200">
                  {reasoning.sensitivities.map((sens, i) => (
                    <div
                      key={i}
                      className="bg-white border border-warm-100 rounded-lg p-3"
                    >
                      <p className="text-sm text-warm-700 mb-2">
                        <span className="font-medium">Assumption:</span>{' '}
                        {sens.assumption}
                      </p>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="bg-amber-50 rounded-lg p-2">
                          <span className="font-medium text-amber-700">If changed:</span>
                          <p className="text-amber-600 mt-0.5">{sens.ifChanged}</p>
                        </div>
                        <div className="bg-blue-50 rounded-lg p-2">
                          <span className="font-medium text-blue-700">Impact:</span>
                          <p className="text-blue-600 mt-0.5">{sens.impactOnConclusion}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

interface ReasoningStepCardProps {
  step: ReasoningStep;
  isLast: boolean;
  isExpanded: boolean;
  onToggle: () => void;
}

function ReasoningStepCard({
  step,
  isLast,
  isExpanded,
  onToggle,
}: ReasoningStepCardProps) {
  const typeStyle = reasoningTypeLabels[step.type];
  const confidencePercent = Math.round(step.confidence * 100);

  return (
    <div className="relative">
      {/* Connector line */}
      {!isLast && (
        <div className="absolute left-5 top-12 bottom-0 w-px bg-warm-200" />
      )}

      <button
        onClick={onToggle}
        className={cn(
          'w-full text-left bg-white border rounded-xl p-4 transition-all',
          isExpanded
            ? 'border-primary-200 shadow-sm'
            : 'border-warm-200 hover:border-warm-300'
        )}
      >
        <div className="flex items-start gap-3">
          {/* Step number */}
          <div
            className={cn(
              'w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium flex-shrink-0',
              isExpanded
                ? 'bg-primary-600 text-white'
                : 'bg-warm-100 text-warm-600'
            )}
          >
            {step.stepNumber}
          </div>

          <div className="flex-1 min-w-0">
            {/* Header */}
            <div className="flex items-center gap-2 mb-1">
              <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', typeStyle.color)}>
                {typeStyle.label}
              </span>
              <div className="flex items-center gap-2 flex-1">
                <div className="flex-1 max-w-[100px] h-1.5 bg-warm-200 rounded-full overflow-hidden">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all',
                      confidencePercent >= 70
                        ? 'bg-primary-500'
                        : confidencePercent >= 40
                        ? 'bg-amber-500'
                        : 'bg-red-500'
                    )}
                    style={{ width: `${confidencePercent}%` }}
                  />
                </div>
                <span className="text-xs text-warm-400">{confidencePercent}%</span>
              </div>
            </div>

            {/* Conclusion */}
            <p className="text-sm font-medium text-warm-800 mt-2">
              {step.conclusion}
            </p>

            {/* Expand indicator */}
            <motion.div
              className="flex items-center gap-1 mt-2 text-xs text-warm-400"
              animate={{ opacity: isExpanded ? 0 : 1 }}
            >
              <IconChevronDown size={12} />
              <span>Click to expand</span>
            </motion.div>
          </div>
        </div>

        {/* Expanded content */}
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ height: { type: 'spring', stiffness: 500, damping: 30 }, opacity: { duration: 0.2 } }}
              className="overflow-hidden"
            >
              <div className="mt-4 ml-13 pl-4 border-l-2 border-primary-200 space-y-3">
                {/* Premise */}
                <div>
                  <h5 className="text-xs font-medium text-warm-500 uppercase tracking-wide mb-1">
                    Premise
                  </h5>
                  <p className="text-sm text-warm-600">{step.premise}</p>
                </div>

                {/* Inference */}
                <div>
                  <h5 className="text-xs font-medium text-warm-500 uppercase tracking-wide mb-1">
                    Inference
                  </h5>
                  <p className="text-sm text-warm-600">{step.inference}</p>
                </div>

                {/* Evidence */}
                {step.evidence && step.evidence.length > 0 && (
                  <div>
                    <h5 className="text-xs font-medium text-warm-500 uppercase tracking-wide mb-1">
                      Evidence
                    </h5>
                    <ul className="space-y-1">
                      {step.evidence.map((ev, i) => (
                        <li
                          key={i}
                          className="flex items-start gap-2 text-sm text-warm-600"
                        >
                          <IconCheck size={12} className="text-primary-500 mt-1 flex-shrink-0" />
                          <span>{ev}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </button>
    </div>
  );
}
