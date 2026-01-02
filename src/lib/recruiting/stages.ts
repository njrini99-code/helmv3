// Pipeline stage configuration for recruiting
import type { PipelineStage } from '@/lib/types';

export const PIPELINE_STAGES = [
  {
    id: 'watchlist' as PipelineStage,
    label: 'Watchlist',
    color: 'warm',
    description: 'Initial prospects being monitored',
  },
  {
    id: 'high_priority' as PipelineStage,
    label: 'High Priority',
    color: 'amber',
    description: 'Top recruiting targets',
  },
  {
    id: 'contacted' as PipelineStage,
    label: 'Contacted',
    color: 'blue',
    description: 'Reached out to player/family',
  },
  {
    id: 'campus_visit' as PipelineStage,
    label: 'Campus Visit',
    color: 'purple',
    description: 'Scheduled or completed visit',
  },
  {
    id: 'offer_extended' as PipelineStage,
    label: 'Offer Extended',
    color: 'primary',
    description: 'Scholarship offer made',
  },
  {
    id: 'committed' as PipelineStage,
    label: 'Committed',
    color: 'primary',
    description: 'Verbal or signed commitment',
  },
  {
    id: 'uninterested' as PipelineStage,
    label: 'Not Interested',
    color: 'warm',
    description: 'Player declined or not a fit',
  },
] as const;

export type PipelineStageColor = (typeof PIPELINE_STAGES)[number]['color'];

// Helper to get stage info
export function getStageInfo(stageId: PipelineStage) {
  return PIPELINE_STAGES.find((s) => s.id === stageId);
}

// Helper to get next stage
export function getNextStage(currentStage: PipelineStage): PipelineStage | null {
  const currentIndex = PIPELINE_STAGES.findIndex((s) => s.id === currentStage);
  if (currentIndex === -1 || currentIndex === PIPELINE_STAGES.length - 1) {
    return null;
  }
  return PIPELINE_STAGES[currentIndex + 1]?.id || null;
}

// Helper to get previous stage
export function getPreviousStage(currentStage: PipelineStage): PipelineStage | null {
  const currentIndex = PIPELINE_STAGES.findIndex((s) => s.id === currentStage);
  if (currentIndex <= 0) {
    return null;
  }
  return PIPELINE_STAGES[currentIndex - 1]?.id || null;
}
