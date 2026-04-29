'use client';

/**
 * CausalRelationshipView - Displays causal relationship details
 *
 * Features:
 * - Cause -> Effect relationship visualization
 * - Mechanism explanation
 * - Confounders list
 * - Intervention potential indicator
 * - Temporal lag if available
 */

import { cn } from '@/lib/utils';
import {
  IconArrowRight,
  IconWarning,
  IconTarget,
  IconClock,
  IconCheck,
  IconX,
} from '@/components/icons';
import type { CausalRelationship } from '@/lib/coachhelm/v2/types';

interface CausalRelationshipViewProps {
  relationship: CausalRelationship;
  /** Compact mode for embedding in other views */
  compact?: boolean;
}

const relationshipTypeLabels = {
  direct: { label: 'Direct', color: 'bg-primary-100 text-primary-700', desc: 'X directly causes Y' },
  mediated: { label: 'Mediated', color: 'bg-blue-100 text-blue-700', desc: 'X causes M which causes Y' },
  moderated: { label: 'Moderated', color: 'bg-purple-100 text-purple-700', desc: 'X causes Y, but depends on Z' },
  bidirectional: { label: 'Bidirectional', color: 'bg-amber-100 text-amber-700', desc: 'X and Y influence each other' },
};

export function CausalRelationshipView({
  relationship,
  compact = false,
}: CausalRelationshipViewProps) {
  const typeInfo = relationshipTypeLabels[relationship.relationshipType];

  if (compact) {
    return (
      <div className="space-y-3">
        {/* Compact cause -> effect */}
        <div className="flex items-center gap-3">
          <div className="px-3 py-1.5 bg-blue-100 text-blue-700 rounded-lg text-sm font-medium">
            {relationship.cause}
          </div>
          <IconArrowRight size={16} className="text-warm-400" />
          <div className="px-3 py-1.5 bg-primary-100 text-primary-700 rounded-lg text-sm font-medium">
            {relationship.effect}
          </div>
        </div>

        {/* Key stats row */}
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1">
            <span className="text-warm-400">Strength:</span>
            <span className="font-medium text-warm-700">
              {Math.round(relationship.strength * 100)}%
            </span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-warm-400">Confidence:</span>
            <span className="font-medium text-warm-700">
              {Math.round(relationship.confidence * 100)}%
            </span>
          </div>
          <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', typeInfo.color)}>
            {typeInfo.label}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Main cause-effect visualization */}
      <div className="bg-gradient-to-r from-blue-50 via-white to-primary-50 border border-warm-200 rounded-xl p-6">
        <div className="flex flex-col md:flex-row items-center justify-center gap-3 md:gap-4">
          {/* Cause */}
          <div className="w-full md:flex-1 md:max-w-[200px]">
            <div className="bg-blue-100 border border-blue-200 rounded-xl p-4 text-center">
              <p className="text-xs text-blue-600 uppercase tracking-wide font-medium mb-1">
                Cause
              </p>
              <p className="text-lg font-medium text-blue-800">
                {relationship.cause}
              </p>
              {relationship.causeMetric && (
                <p className="text-xs text-blue-500 mt-1">
                  Metric: {relationship.causeMetric}
                </p>
              )}
            </div>
          </div>

          {/* Arrow with relationship type - horizontal (desktop) */}
          <div className="hidden md:flex flex-col items-center gap-2">
            <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', typeInfo.color)}>
              {typeInfo.label}
            </span>
            <div className="flex items-center gap-1">
              <div className="w-8 h-0.5 bg-warm-300" />
              <IconArrowRight size={20} className="text-warm-500" />
              <div className="w-8 h-0.5 bg-warm-300" />
            </div>
            <span className="text-xs text-warm-400">{typeInfo.desc}</span>
          </div>

          {/* Arrow with relationship type - vertical (mobile) */}
          <div className="flex md:hidden flex-col items-center gap-1">
            <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', typeInfo.color)}>
              {typeInfo.label}
            </span>
            <svg className="w-5 h-5 text-warm-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
            <span className="text-xs text-warm-400">{typeInfo.desc}</span>
          </div>

          {/* Effect */}
          <div className="w-full md:flex-1 md:max-w-[200px]">
            <div className="bg-primary-100 border border-primary-200 rounded-xl p-4 text-center">
              <p className="text-xs text-primary-600 uppercase tracking-wide font-medium mb-1">
                Effect
              </p>
              <p className="text-lg font-medium text-primary-800">
                {relationship.effect}
              </p>
              {relationship.effectMetric && (
                <p className="text-xs text-primary-500 mt-1">
                  Metric: {relationship.effectMetric}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Mechanism explanation */}
      <div className="border border-warm-200 rounded-xl p-4">
        <h4 className="text-xs font-medium text-warm-500 uppercase tracking-wide mb-2">
          How This Works
        </h4>
        <p className="text-sm text-warm-700">{relationship.mechanism}</p>
      </div>

      {/* Strength and Confidence */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white border border-warm-200 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-warm-600">Effect Strength</span>
            <span className="text-[17px] font-medium text-warm-900 tracking-[-0.012em]">
              {Math.round(relationship.strength * 100)}%
            </span>
          </div>
          <div className="h-2 bg-warm-200 rounded-full overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full',
                relationship.strength >= 0.7
                  ? 'bg-primary-500'
                  : relationship.strength >= 0.4
                  ? 'bg-amber-500'
                  : 'bg-red-500'
              )}
              style={{ width: `${relationship.strength * 100}%` }}
            />
          </div>
          <p className="text-xs text-warm-400 mt-1">
            {relationship.strength >= 0.7
              ? 'Strong effect'
              : relationship.strength >= 0.4
              ? 'Moderate effect'
              : 'Weak effect'}
          </p>
        </div>

        <div className="bg-white border border-warm-200 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-warm-600">Causal Confidence</span>
            <span className="text-[17px] font-medium text-warm-900 tracking-[-0.012em]">
              {Math.round(relationship.confidence * 100)}%
            </span>
          </div>
          <div className="h-2 bg-warm-200 rounded-full overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full',
                relationship.confidence >= 0.7
                  ? 'bg-primary-500'
                  : relationship.confidence >= 0.4
                  ? 'bg-amber-500'
                  : 'bg-red-500'
              )}
              style={{ width: `${relationship.confidence * 100}%` }}
            />
          </div>
          <p className="text-xs text-warm-400 mt-1">
            How confident we are this is causal
          </p>
        </div>
      </div>

      {/* Confounders */}
      {relationship.confounders.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <IconWarning size={16} className="text-amber-500" />
            <h4 className="text-sm font-medium text-amber-800">
              Potential Confounders
            </h4>
          </div>
          <p className="text-xs text-amber-600 mb-3">
            These factors may also influence the relationship:
          </p>
          <div className="flex flex-wrap gap-2">
            {relationship.confounders.map((confounder, i) => (
              <span
                key={i}
                className="px-2 py-1 bg-amber-100 text-amber-700 text-xs font-medium rounded-lg"
              >
                {confounder}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Evidence indicators */}
      <div>
        <h4 className="text-sm font-medium text-warm-900 mb-3">Evidence Quality</h4>
        <div className="grid grid-cols-2 gap-3">
          <EvidenceIndicator
            label="Temporal Precedence"
            confirmed={relationship.evidence.temporalPrecedence}
            description="Cause occurs before effect"
          />
          <EvidenceIndicator
            label="Dose-Response"
            confirmed={relationship.evidence.doseResponseConfirmed}
            description="More cause = more effect"
          />
        </div>

        {relationship.evidence.confoundersControlled.length > 0 && (
          <div className="mt-3 p-3 bg-primary-50 border border-primary-100 rounded-lg">
            <p className="text-xs font-medium text-primary-700 mb-1">
              Confounders Controlled For:
            </p>
            <div className="flex flex-wrap gap-1">
              {relationship.evidence.confoundersControlled.map((c, i) => (
                <span
                  key={i}
                  className="px-2 py-0.5 bg-primary-100 text-primary-600 text-xs rounded"
                >
                  {c}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Intervention potential */}
      <div className="bg-gradient-to-r from-primary-50 to-primary-50 border border-primary-200 rounded-xl p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <IconTarget size={18} className="text-primary-600" />
            <h4 className="text-sm font-medium text-warm-900">Intervention Potential</h4>
          </div>
          <span className="text-lg font-medium text-primary-600">
            {Math.round(relationship.interventionPotential * 100)}%
          </span>
        </div>
        <div className="h-2 bg-primary-200 rounded-full overflow-hidden mb-2">
          <div
            className="h-full bg-primary-600 rounded-full"
            style={{ width: `${relationship.interventionPotential * 100}%` }}
          />
        </div>
        <p className="text-xs text-warm-500">
          {relationship.interventionPotential >= 0.7
            ? 'High potential - the cause can be directly influenced through practice or behavior change'
            : relationship.interventionPotential >= 0.4
            ? 'Moderate potential - the cause can be partially influenced'
            : 'Lower potential - the cause is harder to change directly'}
        </p>
      </div>

      {/* Temporal lag */}
      {relationship.temporalLagDays !== undefined && (
        <div className="flex items-center gap-3 p-3 bg-warm-50 border border-warm-200 rounded-lg">
          <IconClock size={18} className="text-warm-500" />
          <div>
            <p className="text-sm font-medium text-warm-900">
              {relationship.temporalLagDays} day{relationship.temporalLagDays !== 1 ? 's' : ''} delay
            </p>
            <p className="text-xs text-warm-500">
              Time between cause and observed effect
            </p>
          </div>
        </div>
      )}

      {/* Validation info */}
      <div className="text-xs text-warm-400 text-center pt-2 border-t border-warm-100">
        {relationship.validationCount > 0 ? (
          <>
            Validated {relationship.validationCount} time{relationship.validationCount !== 1 ? 's' : ''}
            {relationship.validatedAt && (
              <> | Last: {new Date(relationship.validatedAt).toLocaleDateString()}</>
            )}
          </>
        ) : (
          'Awaiting validation'
        )}
      </div>
    </div>
  );
}

function EvidenceIndicator({
  label,
  confirmed,
  description,
}: {
  label: string;
  confirmed: boolean;
  description: string;
}) {
  return (
    <div
      className={cn(
        'flex items-start gap-2 p-3 rounded-lg border',
        confirmed
          ? 'bg-primary-50 border-primary-200'
          : 'bg-warm-50 border-warm-200'
      )}
    >
      {confirmed ? (
        <IconCheck size={16} className="text-primary-500 mt-0.5 flex-shrink-0" />
      ) : (
        <IconX size={16} className="text-warm-400 mt-0.5 flex-shrink-0" />
      )}
      <div>
        <p
          className={cn(
            'text-sm font-medium',
            confirmed ? 'text-primary-700' : 'text-warm-600'
          )}
        >
          {label}
        </p>
        <p className="text-xs text-warm-400">{description}</p>
      </div>
    </div>
  );
}
