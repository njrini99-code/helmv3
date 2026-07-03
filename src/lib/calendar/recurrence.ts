// BATCH 6: Recurrence Utilities (RRULE format)
// Extended with event expansion, academic exclusions, and filtering



// ============================================================================
// ADDITIONAL TYPES
// ============================================================================

export interface ExpandedEvent {
  id: string;
  parentId: string | null;
  title: string;
  eventType: string;
  startDate: Date;
  endDate: Date | null;
  startTime: string | null;
  endTime: string | null;
  isRecurringInstance: boolean;
  originalStartDate: Date;
}


