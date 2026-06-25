// =============================================================================
// src/components/baseball/signals/index.ts
//
// Public surface of the Signal Inbox + Action Conversion Engine (packet:
// signal-inbox). The Signals route imports SignalInboxClient; the Command
// Center imports CommandSignalStack.
// =============================================================================

export { SignalInboxClient } from './SignalInboxClient';
export type { SignalInboxClientProps } from './SignalInboxClient';
export { SignalCard } from './SignalCard';
export type { SignalCardProps } from './SignalCard';
export { CommandSignalStack } from './CommandSignalStack';
export type { CommandSignalStackProps } from './CommandSignalStack';
export {
  ConvertToActionDialog,
  type ConvertOption,
  type RosterOption,
  type StaffOption,
} from './ConvertToActionDialog';
export {
  getSeverityPresentation,
  getDispositionPresentation,
  getCategoryLabel,
  getActionTypeLabel,
  CONVERTIBLE_ACTION_TYPES,
} from './signal-presentation';
