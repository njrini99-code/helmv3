/**
 * Shared field classnames, pulled out of `FairwayEventEditor.tsx` so every
 * extracted `editor/**` module renders the exact same input/label styling
 * instead of three near-identical copies of the same class string.
 */

export const fieldCls =
  'w-full rounded-fw-md border border-border-subtle bg-surface-sunken px-3 py-2 font-fw-sans text-body-sm text-text-primary outline-none transition-colors placeholder:text-text-tertiary focus:border-accent-500 focus:bg-surface focus:ring-2 focus:ring-accent-500/25 disabled:opacity-50';

export const labelCls = 'mb-1.5 block font-fw-sans text-caption font-medium text-text-secondary';
