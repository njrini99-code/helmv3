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
  // NOTE: only the 5 stages in the `baseball_pipeline_stage` DB enum (and the
  // WatchlistSchemas.updateStatus server contract) are valid. `contacted` and
  // `campus_visit` were surfaced in the UI but rejected server-side, so stage
  // changes to them silently failed — they have been removed.
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

// Helper to get next stage
export function getNextStage(currentStage: PipelineStage): PipelineStage | null {
  const currentIndex = PIPELINE_STAGES.findIndex((s) => s.id === currentStage);
  if (currentIndex === -1 || currentIndex === PIPELINE_STAGES.length - 1) {
    return null;
  }
  return PIPELINE_STAGES[currentIndex + 1]?.id || null;
}
