/**
 * ============================================================================
 * Fairway · pages/tasks — barrel (ADDITIVE · FLAG-GATED)
 * ----------------------------------------------------------------------------
 * The flag-on redesign of the shared coach+player /golf/dashboard/tasks route.
 * Imported only behind the isRedesignEnabled() fork in tasks/page.tsx (by direct
 * path). Nothing here is consumed by the live (flag-off) app.
 * ========================================================================== */

export {
  FairwayTasks,
  type FairwayTasksProps,
  type FairwayTask,
  type TaskAssignment,
  type FairwayTaskStats,
  type FairwayTaskPlayer,
} from './FairwayTasks';

export {
  FairwayCreateTaskModal,
  type FairwayCreateTaskModalProps,
} from './FairwayCreateTaskModal';

export {
  FairwayCreateFromTemplateModal,
  type FairwayCreateFromTemplateModalProps,
} from './FairwayCreateFromTemplateModal';

export {
  FairwayTaskTemplateList,
  type FairwayTaskTemplateListProps,
} from './FairwayTaskTemplateList';
