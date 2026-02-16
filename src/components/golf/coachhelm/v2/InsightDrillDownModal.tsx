'use client';

/**
 * InsightDrillDownModal - Full analysis modal for CoachHelm insights
 *
 * Features:
 * - Tabbed interface: Overview | Reasoning | Evidence | Actions
 * - Complete insight breakdown with reasoning chains
 * - Evidence sources from round data
 * - Action buttons for insight management
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useFocusTrap } from '@/hooks/use-focus-trap';
import { Modal } from '@/components/ui/modal';
import { cn } from '@/lib/utils';
import {
  IconSparkles,
  IconTarget,
  IconFile,
  IconCheck,
} from '@/components/icons';
import { ReasoningChainView } from './ReasoningChainView';
import { EvidenceSourcesView } from './EvidenceSourcesView';
import { PatternDetailsView } from './PatternDetailsView';
import { CausalRelationshipView } from './CausalRelationshipView';
import { InsightActionPanel } from './InsightActionPanel';
import type {
  ComposedInsight,
  MinedPattern,
  CausalRelationship,
} from '@/lib/coachhelm/v2/types';

type TabId = 'overview' | 'reasoning' | 'evidence' | 'actions';

interface InsightDrillDownModalProps {
  open: boolean;
  onClose: () => void;
  insight: ComposedInsight;
  playerId: string;
  playerName?: string;
  /** Optional pattern associated with this insight */
  pattern?: MinedPattern;
  /** Optional causal relationship associated with this insight */
  causalRelationship?: CausalRelationship;
  /** Callback when insight is resolved/dismissed */
  onAction?: (action: 'resolved' | 'dismissed' | 'shared' | 'dev_plan') => void;
}

const tabs: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: 'overview', label: 'Overview', icon: <IconSparkles size={14} /> },
  { id: 'reasoning', label: 'Reasoning', icon: <IconTarget size={14} /> },
  { id: 'evidence', label: 'Evidence', icon: <IconFile size={14} /> },
  { id: 'actions', label: 'Actions', icon: <IconCheck size={14} /> },
];

const toneColors = {
  encouraging: {
    bg: 'bg-primary-50',
    border: 'border-primary-200',
    text: 'text-primary-700',
    accent: 'bg-primary-500',
  },
  neutral: {
    bg: 'bg-warm-50',
    border: 'border-warm-200',
    text: 'text-warm-700',
    accent: 'bg-warm-500',
  },
  cautionary: {
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    text: 'text-amber-700',
    accent: 'bg-amber-500',
  },
  urgent: {
    bg: 'bg-red-50',
    border: 'border-red-200',
    text: 'text-red-700',
    accent: 'bg-red-500',
  },
  celebratory: {
    bg: 'bg-purple-50',
    border: 'border-purple-200',
    text: 'text-purple-700',
    accent: 'bg-purple-500',
  },
};

export function InsightDrillDownModal({
  open,
  onClose,
  insight,
  playerId,
  playerName,
  pattern,
  causalRelationship,
  onAction,
}: InsightDrillDownModalProps) {
  const { modalRef } = useFocusTrap(open, onClose);
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const toneStyle = toneColors[insight.tone] || toneColors.neutral;

  const handleAction = (action: 'resolved' | 'dismissed' | 'shared' | 'dev_plan') => {
    onAction?.(action);
    if (action === 'resolved' || action === 'dismissed') {
      onClose();
    }
  };

  return (
    <Modal open={open} onClose={onClose} size="xl">
      <div ref={modalRef} role="dialog" aria-modal="true" aria-labelledby="insight-drilldown-title" className="min-h-[500px] flex flex-col -mx-6 -mb-6">
        {/* Header with tone accent */}
        <div className={cn('px-6 pt-4 pb-3 border-b', toneStyle.bg, toneStyle.border)}>
          {/* Tone indicator */}
          <div className="flex items-center gap-2 mb-3">
            <div className={cn('w-2 h-2 rounded-full', toneStyle.accent)} />
            <span className={cn('text-xs font-medium uppercase tracking-wide', toneStyle.text)}>
              {insight.tone} insight
            </span>
            {playerName && (
              <>
                <span className="text-warm-300">|</span>
                <span className="text-xs text-warm-500">{playerName}</span>
              </>
            )}
          </div>

          {/* Headline */}
          <h2 id="insight-drilldown-title" className="text-xl font-semibold text-warm-900 mb-2">
            {insight.headline}
          </h2>

          {/* Confidence badge */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div className="w-24 h-1.5 bg-warm-200 rounded-full overflow-hidden">
                <div
                  className={cn('h-full rounded-full', toneStyle.accent)}
                  style={{ width: `${insight.confidence * 100}%` }}
                />
              </div>
              <span className="text-xs text-warm-500">
                {Math.round(insight.confidence * 100)}% confidence
              </span>
            </div>
            {insight.reasoning && (
              <span className="text-xs px-2 py-0.5 bg-white/50 rounded-full text-warm-500">
                {insight.reasoning.reasoningChain?.length || 0} reasoning steps
              </span>
            )}
          </div>
        </div>

        {/* Tab navigation */}
        <div className="px-6 pt-4 pb-0">
          <div className="flex gap-1 border-b border-warm-200">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'relative flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors',
                  activeTab === tab.id
                    ? 'text-primary-600'
                    : 'text-warm-500 hover:text-warm-700'
                )}
              >
                {tab.icon}
                {tab.label}
                {activeTab === tab.id && (
                  <motion.div
                    layoutId="insight-tab-indicator"
                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary-600"
                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                  />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <AnimatePresence mode="wait">
            {activeTab === 'overview' && (
              <motion.div
                key="overview"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.15 }}
                className="space-y-6"
              >
                {/* Full body */}
                <div>
                  <h3 className="text-sm font-medium text-warm-900 mb-2">Analysis</h3>
                  <p className="text-sm text-warm-600 leading-relaxed">
                    {insight.body}
                  </p>
                </div>

                {/* Call to action */}
                {insight.callToAction && (
                  <div className={cn('p-4 rounded-xl border', toneStyle.bg, toneStyle.border)}>
                    <h4 className="text-xs font-medium text-warm-500 uppercase tracking-wide mb-2">
                      Recommended Action
                    </h4>
                    <p className={cn('text-sm font-medium', toneStyle.text)}>
                      {insight.callToAction}
                    </p>
                  </div>
                )}

                {/* Pattern summary if available */}
                {pattern && (
                  <div className="border border-warm-200 rounded-xl p-4">
                    <h4 className="text-xs font-medium text-warm-500 uppercase tracking-wide mb-3">
                      Related Pattern
                    </h4>
                    <PatternDetailsView pattern={pattern} compact />
                  </div>
                )}

                {/* Causal relationship summary if available */}
                {causalRelationship && (
                  <div className="border border-warm-200 rounded-xl p-4">
                    <h4 className="text-xs font-medium text-warm-500 uppercase tracking-wide mb-3">
                      Causal Relationship
                    </h4>
                    <CausalRelationshipView relationship={causalRelationship} compact />
                  </div>
                )}

                {/* Quick stats */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-warm-50 rounded-lg p-3 text-center">
                    <p className="text-2xl font-semibold text-warm-900">
                      {Math.round(insight.confidence * 100)}%
                    </p>
                    <p className="text-xs text-warm-500 mt-1">Confidence</p>
                  </div>
                  <div className="bg-warm-50 rounded-lg p-3 text-center">
                    <p className="text-2xl font-semibold text-warm-900">
                      {insight.reasoning?.reasoningChain?.length || 0}
                    </p>
                    <p className="text-xs text-warm-500 mt-1">Reasoning Steps</p>
                  </div>
                  <div className="bg-warm-50 rounded-lg p-3 text-center">
                    <p className="text-2xl font-semibold text-warm-900">
                      {insight.reasoning?.alternatives?.length || 0}
                    </p>
                    <p className="text-xs text-warm-500 mt-1">Alternatives</p>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'reasoning' && (
              <motion.div
                key="reasoning"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.15 }}
              >
                {insight.reasoning ? (
                  <ReasoningChainView reasoning={insight.reasoning} />
                ) : (
                  <EmptyTabState
                    title="No Reasoning Data"
                    description="This insight was generated without detailed reasoning chain."
                  />
                )}
              </motion.div>
            )}

            {activeTab === 'evidence' && (
              <motion.div
                key="evidence"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.15 }}
              >
                <EvidenceSourcesView
                  playerId={playerId}
                  insight={insight}
                  pattern={pattern}
                />
              </motion.div>
            )}

            {activeTab === 'actions' && (
              <motion.div
                key="actions"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.15 }}
              >
                <InsightActionPanel
                  playerId={playerId}
                  playerName={playerName}
                  insight={insight}
                  onAction={handleAction}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </Modal>
  );
}

function EmptyTabState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="w-12 h-12 rounded-full bg-warm-100 flex items-center justify-center mb-4">
        <IconSparkles size={24} className="text-warm-300" />
      </div>
      <h4 className="text-sm font-medium text-warm-600 mb-1">{title}</h4>
      <p className="text-xs text-warm-400 max-w-[250px]">{description}</p>
    </div>
  );
}
