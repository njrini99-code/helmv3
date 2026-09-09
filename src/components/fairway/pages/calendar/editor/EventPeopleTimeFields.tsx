'use client';

/**
 * "People & time" stage — when fields, all-day, Find a time, RSVP, invite
 * grid (or a summary-button seam for the future people picker), the
 * schedule-verification panel, and the recurrence pattern.
 * SCREEN-BUILD-PLAN.md §2.1's `editor/EventPeopleTimeFields.tsx`.
 *
 * On a desktop-width viewport (`desktopSplit`) the when-fields sit in a left
 * column and people/verification/recurrence sit in a right column via a
 * responsive CSS grid — one JSX tree, not a forked mobile/desktop copy, so
 * every string here only exists once.
 */

import * as React from 'react';
import { CalendarDays, Calendar as CalendarIcon, Clock, Users, UserRound, Check } from 'lucide-react';
import { Button as UiButton } from '@/components/ui/button';
import { Button } from '@/components/fairway/controls/button';
import { Switch } from '@/components/fairway/forms/Switch';
import { FormSection } from '@/components/fairway/forms/FormSection';
import { Input as UiInput } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  DateChooser,
  TimeChooser,
  SpanSummary,
} from '@/components/fairway/pages/calendar/EventWhenFields';
import type { GolfEventFormData } from '@/components/golf/calendar/EventDetailModal';
import { fieldCls, labelCls } from './fieldStyles';
import type { TeamPlayer } from './types';
import { CalendarPeoplePicker, type PeoplePickerPerson } from '../people/CalendarPeoplePicker';
import {
  EventVerificationPanel,
  type ConflictData,
  type VerificationStatus,
} from './EventVerificationPanel';
import { EventRecurrenceFields } from './EventRecurrenceFields';
import type { FairwayEventTimeRequest } from '../FairwayEventEditor';
import { sectionCardCls, sectionTitle } from './sectionChrome';

export interface EventPeopleTimeFieldsProps {
  formData: GolfEventFormData;
  setFormData: React.Dispatch<React.SetStateAction<GolfEventFormData>>;
  shiftStartDate: (form: GolfEventFormData, nextStartDate: string | null) => GolfEventFormData;
  shiftStartTime: (form: GolfEventFormData, nextStart: string | null) => GolfEventFormData;
  disabled: boolean;
  isCancelled: boolean;
  tzAbbrev: string | null;
  desktopSplit: boolean;
  /** Publish and Find a time are disabled while offline; every other field
   *  stays editable so the draft isn't locked just because the network is
   *  down (§2.1 offline state). */
  offline: boolean;

  eventId?: string;
  onFindTime?: (request: FairwayEventTimeRequest) => void;

  attendeesLoading: boolean;
  attendeeHydrationError: boolean;
  availablePlayers: TeamPlayer[];
  visiblePlayers: TeamPlayer[];
  attendeeQuery: string;
  onAttendeeQueryChange: (q: string) => void;
  allPlayersSelected: boolean;
  onSelectAllPlayers: () => void;
  onClearPlayers: () => void;
  onToggleAttendee: (id: string) => void;
  attendeeChangeSummary: string | null;
  attendeeRemovalCount: number;
  /** Seam for the coordinator to wire the real people picker (§2.3). Until
   *  it exists, the inline avatar grid below stays the only invite UI. */
  onOpenPeoplePicker?: () => void;
  /** The people picker (§2.3): when both are provided the invite grid is
   * replaced by a summary button that opens `CalendarPeoplePicker`, which
   * anchors to that button on desktop and opens a modal below 1024px. */
  pickerPeople?: PeoplePickerPerson[];
  onApplyAttendees?: (ids: string[]) => void;

  verificationStatus: VerificationStatus;
  conflicts: ConflictData | null;
  onRetryAttendees: () => void;
  onRetryConflicts: () => void;
  onSelectSuggestion: (slot: { start: Date; end: Date }) => void;

  showRecurrence: boolean;
  isSeriesRoot: boolean;
  recurrencePreview: string | null;
}

export function EventPeopleTimeFields({
  formData,
  setFormData,
  shiftStartDate,
  shiftStartTime,
  disabled,
  isCancelled,
  tzAbbrev,
  desktopSplit,
  offline,
  eventId,
  onFindTime,
  attendeesLoading,
  attendeeHydrationError,
  availablePlayers,
  visiblePlayers,
  attendeeQuery,
  onAttendeeQueryChange,
  allPlayersSelected,
  onSelectAllPlayers,
  onClearPlayers,
  onToggleAttendee,
  attendeeChangeSummary,
  attendeeRemovalCount,
  onOpenPeoplePicker,
  pickerPeople,
  onApplyAttendees,
  verificationStatus,
  conflicts,
  onRetryAttendees,
  onRetryConflicts,
  onSelectSuggestion,
  showRecurrence,
  isSeriesRoot,
  recurrencePreview,
}: EventPeopleTimeFieldsProps) {
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const whenColumn = (
    <FormSection title={sectionTitle(Clock, 'When')} className={sectionCardCls}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <DateChooser
          label="Start date"
          labelIcon={<CalendarIcon className="h-3.5 w-3.5 text-accent-700" />}
          value={formData.startDate || null}
          onChange={(iso) => setFormData(shiftStartDate(formData, iso))}
          disabled={disabled}
        />
        <DateChooser
          label="End date"
          value={formData.endDate}
          onChange={(iso) => setFormData({ ...formData, endDate: iso })}
          disabled={disabled}
          placeholder="Same day"
        />
      </div>

      {!formData.allDay && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <TimeChooser
            label="Start time"
            labelIcon={<Clock className="h-3.5 w-3.5 text-accent-700" />}
            value={formData.startTime}
            onChange={(hhmm) => setFormData(shiftStartTime(formData, hhmm))}
            disabled={disabled}
          />
          {/* Duration-aware: every end option is labelled with its length
              from the chosen start, so picking an end IS picking a
              duration. */}
          <TimeChooser
            label="End time"
            value={formData.endTime}
            onChange={(hhmm) => setFormData({ ...formData, endTime: hhmm })}
            disabled={disabled}
            durationFrom={formData.startTime}
          />
        </div>
      )}

      {/* The span itself, stated once. The editor previously showed only
          the fields the span was assembled from, never the result. */}
      {formData.startDate ? (
        <SpanSummary
          startDate={formData.startDate}
          endDate={formData.endDate}
          startTime={formData.startTime}
          endTime={formData.endTime}
          allDay={formData.allDay}
          timezoneLabel={!formData.allDay ? tzAbbrev : null}
        />
      ) : null}

      <Switch
        label="All day"
        checked={formData.allDay}
        onCheckedChange={(checked) => setFormData({ ...formData, allDay: checked })}
        disabled={disabled}
      />
      {onFindTime ? (
        <Button
          variant="secondary"
          size="md"
          disabled={disabled || !formData.startDate || attendeesLoading || attendeeHydrationError || offline}
          leftIcon={<CalendarDays className="h-4 w-4" aria-hidden />}
          onClick={() => onFindTime({
            date: formData.startDate,
            endDate: formData.endDate || formData.startDate,
            startTime: formData.startTime || '09:00',
            endTime: formData.endTime || '11:00',
            attendeeIds: [...formData.attendeeIds],
            ...(eventId ? { eventId } : {}),
          })}
        >
          Find a time
        </Button>
      ) : null}
      {!isCancelled ? (
        <EventVerificationPanel
          status={verificationStatus}
          conflicts={conflicts}
          attendeeHydrationError={attendeeHydrationError}
          onRetryAttendees={onRetryAttendees}
          onRetryConflicts={onRetryConflicts}
          onSelectSuggestion={onSelectSuggestion}
        />
      ) : null}
    </FormSection>
  );

  const peopleColumn = (
    <div className="flex flex-col gap-5">
      {/* RSVP */}
      <FormSection title={sectionTitle(Check, 'RSVP')} className={sectionCardCls}>
        <Switch
          label="Require RSVP"
          description="Players respond Going / Maybe / Decline"
          checked={formData.requiresRsvp}
          onCheckedChange={(checked) => setFormData({ ...formData, requiresRsvp: checked })}
          disabled={disabled}
        />
        {formData.requiresRsvp && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="ev-rsvp-deadline" className={labelCls}>RSVP deadline</label>
              <UiInput
                id="ev-rsvp-deadline"
                type="datetime-local"
                value={formData.rsvpDeadline || ''}
                onChange={(e) => setFormData({ ...formData, rsvpDeadline: e.target.value || null })}
                disabled={disabled}
                className={cn(fieldCls, 'bg-surface')}
              />
              <p className="mt-1 font-fw-sans text-caption text-text-tertiary">Your local time</p>
            </div>
            <div>
              <label htmlFor="ev-max" className={labelCls}>Max attendees</label>
              <UiInput
                id="ev-max"
                type="number"
                min={1}
                inputMode="numeric"
                value={formData.maxAttendees ?? ''}
                onChange={(e) =>
                  setFormData({ ...formData, maxAttendees: e.target.value ? parseInt(e.target.value, 10) : null })
                }
                onWheel={(e) => (e.target as HTMLInputElement).blur()}
                disabled={disabled}
                placeholder="No limit"
                className={cn(fieldCls, 'bg-surface')}
              />
            </div>
          </div>
        )}
      </FormSection>

      {/* Attendees — either the seam for the real people picker (§2.3, not
          yet wired), or today's colored-avatar toggle grid. An empty
          roster is its own state (§2.1 "empty roster"): the section still
          renders, but the invite affordance is disabled and says so —
          never silently disappears, which would read as "no invite step
          exists" rather than "there's no one to invite yet". This is
          independent of `attendeesLoading` — that flag tracks which
          invitees are already on THIS event (`getEventRSVP`), not whether
          the team has any players at all, which is already known
          synchronously from the `teamPlayers` prop. */}
      {availablePlayers.length === 0 ? (
        <FormSection
          title={sectionTitle(Users, 'Invite players')}
          className={sectionCardCls}
        >
          <UiButton
            variant="ghost"
            type="button"
            disabled
            className="flex min-h-11 w-full items-center justify-between gap-2 rounded-fw-md border border-border-subtle bg-surface-sunken px-3 py-2 text-left font-fw-sans text-body-sm text-text-tertiary opacity-70"
          >
            <span className="inline-flex items-center gap-2">
              <UserRound className="h-4 w-4 text-text-tertiary" aria-hidden />
              No players on this team yet.
            </span>
          </UiButton>
        </FormSection>
      ) : (
        onApplyAttendees ? (
          <FormSection
            title={sectionTitle(Users, 'Invite players')}
            className={sectionCardCls}
            action={
              <span className="font-fw-mono text-caption font-semibold tabular-nums text-accent-700">
                {formData.attendeeIds.length} of {availablePlayers.length}
              </span>
            }
          >
            {attendeeHydrationError ? (
              <p
                role="status"
                className="rounded-fw-md border border-fw-warning-ring bg-fw-warning-bg px-3 py-2 font-fw-sans text-caption text-fw-warning-ink"
              >
                Couldn&apos;t load the current invitees. You can still add players — existing invites won&apos;t be changed.
              </p>
            ) : null}
            <CalendarPeoplePicker
              open={pickerOpen}
              onOpenChange={setPickerOpen}
              trigger={
                <UiButton
                  variant="ghost"
                  type="button"
                  disabled={disabled || attendeesLoading}
                  className={cn('flex min-h-12 w-full items-center justify-between gap-2 rounded-fw-md border-transparent px-3 py-2 text-left font-fw-sans text-body-sm text-text-primary hover:bg-surface-tint focus-visible:ring-accent-500/40 focus-visible:ring-offset-canvas', 'border border-border-subtle bg-surface')}
                >
                  <span className="inline-flex items-center gap-2">
                    <UserRound className="h-4 w-4 text-text-tertiary" aria-hidden />
                    {formData.attendeeIds.length > 0
                      ? `${formData.attendeeIds.length} invited`
                      : 'No one invited yet'}
                  </span>
                  <span className="font-fw-mono text-caption text-text-tertiary">Choose</span>
                </UiButton>
              }
              people={pickerPeople ?? []}
              selectedIds={formData.attendeeIds}
              mode="invite"
              title="Invite players"
              doneLabel="Apply attendees"
              onApply={(ids) => {
                onApplyAttendees(ids);
                setPickerOpen(false);
              }}
              loading={attendeesLoading}
              emptyMessage="No players on this team yet."
            />
            {attendeeChangeSummary ? (
              <p className="font-fw-sans text-caption text-text-secondary">{attendeeChangeSummary}</p>
            ) : null}
          </FormSection>
        ) : onOpenPeoplePicker ? (
          <FormSection
            title={sectionTitle(Users, 'Invite players')}
            className={sectionCardCls}
          >
            <UiButton
              variant="ghost"
              type="button"
              onClick={onOpenPeoplePicker}
              disabled={disabled || attendeesLoading}
              className={cn('flex min-h-12 w-full items-center justify-between gap-2 rounded-fw-md border-transparent px-3 py-2 text-left font-fw-sans text-body-sm text-text-primary hover:bg-surface-tint focus-visible:ring-accent-500/40 focus-visible:ring-offset-canvas', 'border border-border-subtle bg-surface')}
            >
              <span className="inline-flex items-center gap-2">
                <UserRound className="h-4 w-4 text-text-tertiary" aria-hidden />
                {formData.attendeeIds.length > 0
                  ? `${formData.attendeeIds.length} invited`
                  : 'No one invited yet'}
              </span>
              <span className="font-fw-mono text-caption text-text-tertiary">of {availablePlayers.length}</span>
            </UiButton>
          </FormSection>
        ) : (
          <FormSection
            title={sectionTitle(Users, 'Invite players')}
            className={sectionCardCls}
            // Always show the count, not only once someone is picked —
            // "0 of 14" is the honest starting state and tells the coach
            // how big the roster is before they start tapping. The
            // `action` slot is FormSection's own right-aligned cluster —
            // exactly what this count needed instead of a hand-rolled
            // header row.
            action={
              <span className="font-fw-mono text-caption font-semibold tabular-nums text-accent-700">
                {formData.attendeeIds.length} of {availablePlayers.length}
              </span>
            }
          >
            {/* Select-all / clear. Inviting the whole team is the single
                most common case (practice, lift, study hall) and used to
                cost one tap per player. */}
            <div className="flex items-center gap-3">
              <UiButton
                variant="ghost"
                type="button"
                onClick={onSelectAllPlayers}
                disabled={disabled || attendeesLoading || allPlayersSelected}
                className="h-auto p-0 font-fw-sans text-caption font-medium text-accent-700 underline-offset-2 hover:underline focus-visible:ring-accent-500/40 focus-visible:ring-offset-canvas disabled:no-underline disabled:opacity-40"
              >
                {attendeeQuery.trim() ? `Select ${visiblePlayers.length} shown` : 'Select all'}
              </UiButton>
              <UiButton
                variant="ghost"
                type="button"
                onClick={onClearPlayers}
                disabled={disabled || attendeesLoading || formData.attendeeIds.length === 0}
                className="h-auto p-0 font-fw-sans text-caption font-medium text-text-secondary underline-offset-2 hover:underline focus-visible:ring-accent-500/40 focus-visible:ring-offset-canvas disabled:no-underline disabled:opacity-40"
              >
                Clear
              </UiButton>
            </div>

            {/* Search appears only once the roster is long enough to need
                it — a filter box over eight names is clutter. */}
            {availablePlayers.length > 8 ? (
              <UiInput
                type="search"
                value={attendeeQuery}
                onChange={(e) => onAttendeeQueryChange(e.target.value)}
                disabled={disabled || attendeesLoading}
                placeholder="Search the roster…"
                aria-label="Search the roster"
                className={cn(fieldCls, 'bg-surface')}
              />
            ) : null}

            {attendeesLoading ? (
              <p role="status" className="font-fw-sans text-caption text-text-tertiary">
                Loading current invitees...
              </p>
            ) : null}

            {attendeeHydrationError ? (
              <p
                role="status"
                className="rounded-fw-md border border-fw-warning-ring bg-fw-warning-bg px-3 py-2 font-fw-sans text-caption text-fw-warning-ink"
              >
                Couldn&apos;t load the current invitees. You can still add players — existing invites won&apos;t be changed.
              </p>
            ) : null}

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {visiblePlayers.map((p) => {
                const selected = formData.attendeeIds.includes(p.id);
                return (
                  <UiButton
                    key={p.id}
                    variant="ghost"
                    type="button"
                    onClick={() => onToggleAttendee(p.id)}
                    disabled={disabled || attendeesLoading}
                    aria-pressed={selected}
                    className={cn(
                      'flex items-center gap-2.5 rounded-fw-md border p-2 text-left transition-colors',
                      'focus-visible:ring-accent-500/40 focus-visible:ring-offset-canvas',
                      selected
                        ? 'border-accent-600 bg-accent-50 ring-1 ring-accent-600'
                        : cn('border-transparent hover:bg-surface-tint', 'border border-border-subtle bg-surface'),
                    )}
                  >
                    <span
                      className="relative grid h-8 w-8 flex-shrink-0 place-items-center overflow-hidden rounded-full font-fw-sans text-caption font-semibold ring-1 ring-border-subtle"
                    >
                      {p.avatar_url ? (
                        <img src={p.avatar_url} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <UserRound className="h-4 w-4 text-text-tertiary" aria-hidden />
                      )}
                      {selected ? (
                        <span className="absolute -bottom-0.5 -right-0.5 grid h-4 w-4 place-items-center rounded-full bg-accent-500 ring-2 ring-surface">
                          <Check className="h-2.5 w-2.5 text-text-on-accent" />
                        </span>
                      ) : null}
                    </span>
                    {/* Full name, not a truncated "Last I." — the chip has
                        room to spare (filter chips show "CB", the agenda
                        shows "Cole Bennett"; this was the odd one out).
                        Truncating to the last name's FIRST CHARACTER is
                        also what turned a coach's placeholder profile name
                        into "Coach (." in the live app: last_name[0] on a
                        name like "(Nick Rini)" reads as "(", and the old
                        `${last_name[0]}.` built "(." from it. A full name
                        can't mangle that way — the worst case is just
                        longer, and `truncate` above already ellipsizes
                        anything that doesn't fit. */}
                    <span className="min-w-0 flex-1 truncate font-fw-sans text-caption font-medium text-text-primary">
                      {p.last_name ? `${p.first_name} ${p.last_name}` : p.first_name}
                    </span>
                  </UiButton>
                );
              })}
            </div>

            {/* Pending attendee changes — the save summary. Removals only
                ever come from explicit deselects against the hydrated
                baseline, and they're called out before saving. */}
            {!isCancelled && attendeeChangeSummary ? (
              <p
                role="status"
                className={cn(
                  'rounded-fw-md border px-3 py-2 font-fw-sans text-caption',
                  attendeeRemovalCount > 0
                    ? 'border-fw-warning-ring bg-fw-warning-bg text-fw-warning-ink'
                    : 'border-accent-100 bg-accent-50 text-accent-700',
                )}
              >
                Saving will update invites: {attendeeChangeSummary}.
              </p>
            ) : null}
          </FormSection>
        )
      )}
    </div>
  );

  return (
    <div className="flex flex-col gap-5">
      <div className={cn('flex flex-col gap-5', desktopSplit && 'lg:grid lg:grid-cols-2 lg:items-start lg:gap-6')}>
        {whenColumn}
        {peopleColumn}
      </div>

      {/* Recurrence pattern — on create, and on series-root edit (the
          series-extend affordance: bump the count or push the end date
          to add occurrences, or re-shape the weekday pattern). Child
          occurrences don't carry the pattern; their edits go through
          the scope picker instead. */}
      {!isCancelled && showRecurrence ? (
        <EventRecurrenceFields
          formData={formData}
          onChange={setFormData}
          disabled={disabled}
          isSeriesRoot={isSeriesRoot}
          recurrencePreview={recurrencePreview}
        />
      ) : null}
    </div>
  );
}
