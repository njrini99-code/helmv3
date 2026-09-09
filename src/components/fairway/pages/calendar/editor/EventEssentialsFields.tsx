'use client';

/**
 * "Essentials" stage — title, type, location, notes. Extraction of the top
 * of the old single-page form (SCREEN-BUILD-PLAN.md §2.1's
 * `editor/EventEssentialsFields.tsx`).
 *
 * A files field belongs here per the plan, but `files/EventFilesSection.tsx`
 * (§2.6, Wave B, owned by W-Detail) does not exist yet — nothing here
 * fabricates that section ahead of it landing (handoffRequests notes the
 * seam for the coordinator).
 */

import * as React from 'react';
import {
  Dumbbell,
  Trophy,
  Flag,
  Users,
  Plane,
  CalendarDays,
  MapPin,
  AlignLeft,
} from 'lucide-react';
import { Button as UiButton } from '@/components/ui/button';
import { Input as UiInput, Textarea as UiTextarea } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { FormSection } from '@/components/fairway/forms/FormSection';
import type { GolfEventFormData } from '@/components/golf/calendar/EventDetailModal';
import { fieldCls } from './fieldStyles';

type EventType = GolfEventFormData['eventType'];

export const EVENT_TYPES: ReadonlyArray<{ type: EventType; label: string; icon: typeof Dumbbell }> = [
  { type: 'practice', label: 'Practice', icon: Dumbbell },
  { type: 'tournament', label: 'Tournament', icon: Trophy },
  { type: 'qualifier', label: 'Qualifier', icon: Flag },
  { type: 'meeting', label: 'Meeting', icon: Users },
  { type: 'travel', label: 'Travel', icon: Plane },
  { type: 'other', label: 'Other', icon: CalendarDays },
];

export interface EventEssentialsFieldsProps {
  formData: GolfEventFormData;
  onChange: React.Dispatch<React.SetStateAction<GolfEventFormData>>;
  disabled: boolean;
}

export function EventEssentialsFields({ formData, onChange, disabled }: EventEssentialsFieldsProps) {
  return (
    <div className="flex flex-col gap-5">
      {/* Title — with a green editorial spine. The wrapper carries the
          visible focus cue (WCAG 2.4.7) since the input itself is a
          bare editorial field with no border. */}
      <div className="flex items-center gap-3 rounded-fw-md transition-shadow focus-within:ring-2 focus-within:ring-accent-500/70 focus-within:ring-offset-2 focus-within:ring-offset-canvas">
        <span aria-hidden className="h-7 w-1 flex-shrink-0 rounded-full bg-accent-500" />
        <UiInput
          type="text"
          value={formData.title}
          onChange={(e) => onChange({ ...formData, title: e.target.value })}
          disabled={disabled}
          placeholder="Event name…"
          aria-label="Event title"
          className="w-full flex-1 border-none bg-transparent px-0 py-1 font-fw-display text-h3 font-semibold tracking-[-0.01em] text-text-primary outline-none placeholder:text-text-tertiary focus-visible:ring-0 focus-visible:ring-offset-0"
          required
        />
      </div>

      {/* Event type */}
      <div className="flex flex-wrap gap-2">
        {EVENT_TYPES.map(({ type, label, icon: Icon }) => {
          const active = formData.eventType === type;
          return (
            <UiButton
              key={type}
              variant="ghost"
              type="button"
              onClick={() => onChange({ ...formData, eventType: type })}
              disabled={disabled}
              aria-pressed={active}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-fw-sans text-caption font-medium transition-colors',
                // UiButton's base style hardcodes `ring-offset-white`
                // (src/components/ui/button.tsx); twMerge only dedupes
                // within the same ring-offset-* group, so the color
                // override below doesn't touch it — a bright white
                // square flashes around the ring in dark mode without
                // this explicit override, matching FairwayDayStrip /
                // FairwayEventCard's own `ring-offset-canvas` convention.
                'focus-visible:ring-accent-500/40 focus-visible:ring-offset-canvas',
                active
                  ? 'bg-accent-650 text-text-on-accent shadow-flat'
                  : 'border border-border-subtle bg-surface-sunken text-text-secondary hover:bg-surface-tint',
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </UiButton>
          );
        })}
      </div>

      {/* Location — one FormSection per field-group, same primitive as
          every other section below (finding: this form used to mix four
          different section treatments — label-above-input here, a
          tinted no-header panel for RSVP, a header+count row for
          invitees, and a tinted panel WITH a header for Repeat — with no
          rule for which earned a tint. FormSection (already the modal
          section primitive — see FocusAreaModal) replaces all four. */}
      <FormSection
        title={
          <span className="inline-flex items-center gap-1.5">
            <MapPin className="h-4 w-4 text-accent-700" /> Location
          </span>
        }
      >
        <UiInput
          id="ev-location"
          type="text"
          value={formData.location || ''}
          onChange={(e) => onChange({ ...formData, location: e.target.value || null })}
          disabled={disabled}
          placeholder="Course, facility, or address"
          aria-label="Location"
          className={fieldCls}
        />
      </FormSection>

      {/* Notes */}
      <FormSection
        title={
          <span className="inline-flex items-center gap-1.5">
            <AlignLeft className="h-4 w-4 text-accent-700" /> Notes
          </span>
        }
      >
        <UiTextarea
          id="ev-desc"
          value={formData.description || ''}
          onChange={(e) => onChange({ ...formData, description: e.target.value || null })}
          disabled={disabled}
          rows={2}
          placeholder="Details for the team…"
          aria-label="Notes"
          className={cn(fieldCls, 'resize-none')}
        />
      </FormSection>
    </div>
  );
}
