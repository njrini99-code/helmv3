'use client';

/**
 * InsightActionPanel - Action buttons for managing CoachHelm insights
 *
 * Features:
 * - Mark Resolved, Dismiss, Share, Create Dev Plan buttons
 * - Uses server actions for mutations
 * - Loading states per button
 * - Success/error feedback
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import {
  IconCheck,
  IconX,
  IconSend,
  IconClipboardList,
  IconRefresh,
} from '@/components/icons';
import {
  resolveInsight,
  dismissInsight,
  recordInteraction,
} from '@/app/golf/actions/insights';
import type { ComposedInsight } from '@/lib/coachhelm/v2/types';

interface InsightActionPanelProps {
  playerId: string;
  playerName?: string;
  insight: ComposedInsight;
  /** Optional insight database ID if stored */
  insightId?: string;
  onAction: (action: 'resolved' | 'dismissed' | 'shared' | 'dev_plan') => void;
}

interface ActionButtonState {
  loading: boolean;
  success: boolean;
  error: string | null;
}

const initialButtonState: ActionButtonState = {
  loading: false,
  success: false,
  error: null,
};

export function InsightActionPanel({
  playerId,
  playerName,
  insight,
  insightId,
  onAction,
}: InsightActionPanelProps) {
  const [resolveState, setResolveState] = useState<ActionButtonState>(initialButtonState);
  const [dismissState, setDismissState] = useState<ActionButtonState>(initialButtonState);
  const [shareState, setShareState] = useState<ActionButtonState>(initialButtonState);
  const [devPlanState, setDevPlanState] = useState<ActionButtonState>(initialButtonState);

  const handleResolve = async () => {
    setResolveState({ loading: true, success: false, error: null });

    try {
      if (insightId) {
        const result = await resolveInsight(insightId);
        if (!result.success) {
          throw new Error(result.error || 'Failed to resolve');
        }
      }

      // Record interaction for learning
      await recordInteraction(playerId, 'player', 'action', 'insight_resolved', {
        insightTone: insight.tone,
        confidence: insight.confidence,
      });

      setResolveState({ loading: false, success: true, error: null });

      // Delay before calling onAction to show success state
      setTimeout(() => {
        onAction('resolved');
      }, 500);
    } catch (error) {
      setResolveState({
        loading: false,
        success: false,
        error: error instanceof Error ? error.message : 'Failed to resolve',
      });
    }
  };

  const handleDismiss = async () => {
    setDismissState({ loading: true, success: false, error: null });

    try {
      if (insightId) {
        const result = await dismissInsight(insightId);
        if (!result.success) {
          throw new Error(result.error || 'Failed to dismiss');
        }
      }

      // Record interaction for learning
      await recordInteraction(playerId, 'player', 'dismiss', 'insight_dismissed', {
        insightTone: insight.tone,
        confidence: insight.confidence,
      });

      setDismissState({ loading: false, success: true, error: null });

      setTimeout(() => {
        onAction('dismissed');
      }, 500);
    } catch (error) {
      setDismissState({
        loading: false,
        success: false,
        error: error instanceof Error ? error.message : 'Failed to dismiss',
      });
    }
  };

  const handleShare = async () => {
    setShareState({ loading: true, success: false, error: null });

    try {
      // Create shareable text
      const shareText = `CoachHelm Insight for ${playerName || 'Player'}:\n\n${insight.headline}\n\n${insight.body}${insight.callToAction ? `\n\nRecommendation: ${insight.callToAction}` : ''}`;

      // Try native share API first
      if (navigator.share) {
        await navigator.share({
          title: 'CoachHelm Insight',
          text: shareText,
        });
      } else {
        // Fallback to clipboard
        await navigator.clipboard.writeText(shareText);
      }

      // Record interaction
      await recordInteraction(playerId, 'player', 'share', 'insight_shared');

      setShareState({ loading: false, success: true, error: null });

      setTimeout(() => {
        setShareState(initialButtonState);
        onAction('shared');
      }, 2000);
    } catch (error) {
      // User may have cancelled share - not an error
      if ((error as Error).name === 'AbortError') {
        setShareState(initialButtonState);
        return;
      }

      setShareState({
        loading: false,
        success: false,
        error: 'Failed to share',
      });
    }
  };

  const handleCreateDevPlan = async () => {
    setDevPlanState({ loading: true, success: false, error: null });

    try {
      // Record interaction
      await recordInteraction(playerId, 'player', 'action', 'dev_plan_initiated', {
        insightHeadline: insight.headline,
      });

      setDevPlanState({ loading: false, success: true, error: null });

      setTimeout(() => {
        onAction('dev_plan');
        // This would redirect to dev plan creation with insight pre-filled
        window.location.href = `/golf/dashboard/development/new?player=${playerId}&insight=${encodeURIComponent(insight.headline)}`;
      }, 500);
    } catch (error) {
      setDevPlanState({
        loading: false,
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create plan',
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Description */}
      <div className="text-center pb-4 border-b border-warm-100">
        <h3 className="text-sm font-medium text-warm-900 mb-2">
          Take Action on This Insight
        </h3>
        <p className="text-xs text-warm-500">
          Choose how you want to respond to this insight. Your actions help us learn your preferences.
        </p>
      </div>

      {/* Primary actions */}
      <div className="space-y-3">
        <ActionButton
          icon={<IconCheck size={18} />}
          label="Mark as Resolved"
          description="I've addressed this insight and it no longer applies"
          variant="success"
          state={resolveState}
          onClick={handleResolve}
        />

        <ActionButton
          icon={<IconClipboardList size={18} />}
          label="Create Development Plan"
          description="Start a focused practice plan based on this insight"
          variant="primary"
          state={devPlanState}
          onClick={handleCreateDevPlan}
        />

        <ActionButton
          icon={<IconSend size={18} />}
          label={shareState.success ? 'Copied to Clipboard!' : 'Share Insight'}
          description="Share this insight with team members or coaches"
          variant="secondary"
          state={shareState}
          onClick={handleShare}
        />
      </div>

      {/* Divider */}
      <div className="relative py-2">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-warm-200" />
        </div>
        <div className="relative flex justify-center">
          <span className="bg-white px-3 text-xs text-warm-400">or</span>
        </div>
      </div>

      {/* Secondary action */}
      <ActionButton
        icon={<IconX size={18} />}
        label="Dismiss Insight"
        description="This insight isn't relevant or helpful right now"
        variant="ghost"
        state={dismissState}
        onClick={handleDismiss}
      />

      {/* Learning feedback note */}
      <div className="bg-warm-50 border border-warm-100 rounded-xl p-4 mt-6">
        <h4 className="text-xs font-medium text-warm-600 mb-2">
          Your Actions Improve CoachHelm
        </h4>
        <p className="text-xs text-warm-500">
          When you resolve or dismiss insights, CoachHelm learns your preferences and becomes
          better at showing you the most relevant analysis. This personalization happens
          automatically over time.
        </p>
      </div>
    </div>
  );
}

interface ActionButtonProps {
  icon: React.ReactNode;
  label: string;
  description: string;
  variant: 'success' | 'primary' | 'secondary' | 'ghost';
  state: ActionButtonState;
  onClick: () => void;
}

function ActionButton({
  icon,
  label,
  description,
  variant,
  state,
  onClick,
}: ActionButtonProps) {
  const variantStyles = {
    success: {
      base: 'bg-primary-600 hover:bg-primary-700 text-white border-primary-600',
      icon: 'bg-primary-500/20',
    },
    primary: {
      base: 'bg-blue-600 hover:bg-blue-700 text-white border-blue-600',
      icon: 'bg-blue-500/20',
    },
    secondary: {
      base: 'bg-white hover:bg-warm-50 text-warm-700 border-warm-200',
      icon: 'bg-warm-100',
    },
    ghost: {
      base: 'bg-transparent hover:bg-red-50 text-warm-500 hover:text-red-600 border-warm-200 hover:border-red-200',
      icon: 'bg-warm-100 group-hover:bg-red-100',
    },
  };

  const style = variantStyles[variant];

  return (
    <button
      onClick={onClick}
      disabled={state.loading || state.success}
      className={cn(
        'group w-full flex items-center gap-4 p-4 rounded-xl border transition-all',
        'disabled:opacity-60 disabled:cursor-not-allowed',
        state.success && 'bg-primary-50 border-primary-200',
        !state.success && style.base
      )}
    >
      {/* Icon */}
      <div
        className={cn(
          'w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors',
          state.success ? 'bg-primary-100' : style.icon
        )}
      >
        <AnimatePresence mode="wait">
          {state.loading ? (
            <motion.div
              key="loading"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
            >
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
              >
                <IconRefresh size={18} />
              </motion.div>
            </motion.div>
          ) : state.success ? (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
            >
              <IconCheck size={18} className="text-primary-600" />
            </motion.div>
          ) : (
            <motion.div
              key="icon"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
            >
              {icon}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Text */}
      <div className="flex-1 text-left">
        <p
          className={cn(
            'text-sm font-medium',
            state.success ? 'text-primary-700' : ''
          )}
        >
          {state.success ? 'Done!' : label}
        </p>
        <p
          className={cn(
            'text-xs mt-0.5',
            variant === 'success' || variant === 'primary'
              ? 'text-white/70'
              : 'text-warm-400',
            state.success && 'text-primary-600'
          )}
        >
          {state.error || description}
        </p>
      </div>

      {/* Error indicator */}
      {state.error && (
        <div className="px-2 py-0.5 bg-red-100 text-red-600 text-xs rounded-full">
          Error
        </div>
      )}
    </button>
  );
}
