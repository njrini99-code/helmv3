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
import type { GolfEventFormData } from '@/components/golf/calendar/EventDetailModal';
import { fieldCls } from './fieldStyles';
import surfaces from '../CalendarSurfaces.module.css';

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
      {/* Title — a large display field with a green editorial spine. The
          wrapper carries the visible focus cue (WCAG 2.4.7) since the input
          itself is a bare editorial field with no border. */}
      <div className="flex items-center gap-3 rounded-fw-md py-1 transition-shadow focus-within:ring-2 focus-within:ring-accent-500/70 focus-within:ring-offset-4 focus-within:ring-offset-canvas">
        <span aria-hidden className="h-9 w-1 flex-shrink-0 rounded-full bg-accent-600" />
        <UiInput
          type="text"
          value={formData.title}
          onChange={(e) => onChange({ ...formData, title: e.target.value })}
          disabled={disabled}
          placeholder="Event name…"
          aria-label="Event title"
          className="h-auto w-full flex-1 border-none bg-transparent px-0 py-1 font-fw-display text-h2 font-medium tracking-[-0.01em] text-text-primary outline-none placeholder:text-text-tertiary focus-visible:ring-0 focus-visible:ring-offset-0"
          required
        />
      </div>

      {/* Event type — glass chips at rest, the emerald selected fill when
          active. Same icon in both states so the choice never loses its
          glyph. */}
      <div className="flex flex-wrap gap-2" role="group" aria-label="Event type">
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
                'inline-flex min-h-[40px] items-center gap-1.5 rounded-full px-3.5 py-2 font-fw-sans text-caption font-semibold transition-colors',
                // UiButton's base style hardcodes `ring-offset-white`
                // (src/components/ui/button.tsx); twMerge only dedupes
                // within the same ring-offset-* group, so the color
                // override below doesn't touch it — a bright white
                // square flashes around the ring in dark mode without
                // this explicit override, matching FairwayDayStrip /
                // FairwayEventCard's own `ring-offset-canvas` convention.
                'focus-visible:ring-accent-500/40 focus-visible:ring-offset-canvas',
                surfaces.press,
                active
                  ? cn('border border-transparent text-text-on-accent hover:text-text-on-accent', surfaces.selected)
                  : cn('text-text-secondary hover:text-text-primary', surfaces.float),
              )}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden />
              {label}
            </UiButton>
          );
        })}
      </div>

      {/* Location + Notes — one card, one icon disc per row. */}
      <div className={cn('flex flex-col divide-y divide-border-subtle rounded-card px-4', surfaces.paper)}>
        <label htmlFor="ev-location" className="flex items-center gap-3 py-3">
          <span aria-hidden className={cn('grid h-8 w-8 shrink-0 place-items-center rounded-full', surfaces.rowIcon)}>
            <MapPin className="h-4 w-4" aria-hidden />
          </span>
          <span className="sr-only">Location</span>
          <UiInput
            id="ev-location"
            type="text"
            value={formData.location || ''}
            onChange={(e) => onChange({ ...formData, location: e.target.value || null })}
            disabled={disabled}
            placeholder="Course, facility, or address"
            aria-label="Location"
            className={cn(fieldCls, 'border-none bg-transparent px-0 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0')}
          />
        </label>
        <label htmlFor="ev-desc" className="flex items-start gap-3 py-3">
          <span aria-hidden className={cn('mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-full', surfaces.rowIcon)}>
            <AlignLeft className="h-4 w-4" aria-hidden />
          </span>
          <span className="sr-only">Notes</span>
          <UiTextarea
            id="ev-desc"
            value={formData.description || ''}
            onChange={(e) => onChange({ ...formData, description: e.target.value || null })}
            disabled={disabled}
            rows={2}
            placeholder="Details for the team…"
            aria-label="Notes"
            className={cn(fieldCls, 'resize-none border-none bg-transparent px-0 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0')}
          />
        </label>
      </div>
    </div>
  );
}
