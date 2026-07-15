import { PlayerOnboardingSkeleton } from './PlayerOnboardingSkeleton';

// Route-transition fallback — reuses the wizard's own extracted chrome
// (see PlayerOnboardingSkeleton's header comment) instead of a flat
// unrelated pulse-bars-on-solid-fill skeleton, so this route reads as
// exactly one loading look end to end (mobile findings, onboarding-auth
// group).
export default function Loading() {
  return <PlayerOnboardingSkeleton />;
}
