'use client';

/**
 * ============================================================================
 * Fairway · Travel · FairwayItineraryModal — coach create / edit itinerary
 * ----------------------------------------------------------------------------
 * The Fairway re-skin of the legacy create/edit itinerary modal. ALL the form
 * logic is preserved VERBATIM — the same 19-field formData shape, the same
 * edit-mode prefill, the same required-field validation (event name +
 * destination + departure date), and the same onSave contract. Writes are NOT
 * reimplemented here: the parent (FairwayTravel) calls the EXACT same server
 * actions (createGolfTravelItinerary / updateGolfTravelItinerary). This
 * component only gathers form data and hands it back.
 *
 * Presentation only: a centered Fairway ModalShell + Fairway form controls
 * styled with Fairway tokens. Coach-only.
 * ========================================================================== */

import * as React from 'react';
import { MapPin, Calendar as CalendarIcon, Clock, Hotel, Package, Link2 } from 'lucide-react';

import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';
import { ModalShell } from '@/components/fairway/overlays/ModalShell';
import { Button, InlineNotice } from '@/components/fairway';
import { Input, Select, TextArea } from '@/components/fairway/forms';
import { formatShortDate } from '@/lib/golf/format-date';
import type { TransportationType, TravelItinerary } from './travel-helpers';
import { TRANSPORT_LABEL } from './travel-helpers';

/* ── shared field recipes (verbatim from FairwayEventEditor) ──────────────── */
const fieldCls =
  'w-full rounded-fw-md border border-border-subtle bg-surface-sunken px-3 py-2 font-fw-sans text-body-sm text-text-primary outline-none transition-colors placeholder:text-text-tertiary focus:border-accent-500 focus:bg-surface focus:ring-2 focus:ring-accent-500/25 disabled:opacity-50';
const labelCls = 'mb-1.5 block font-fw-sans text-caption font-medium text-text-secondary';
const sectionTitleCls =
  'flex items-center gap-1.5 font-fw-sans text-eyebrow font-semibold uppercase tracking-[0.12em] text-text-tertiary';

/* ── the form shape — IDENTICAL to the legacy TravelClient formData, plus the
 * optional event_id link (createGolfTravelItinerary already accepts it). ───── */
export interface ItineraryFormData {
  /**
   * Optional link to a golf_events row. Omitted/undefined = no link (the server
   * action persists null). Never sent as '' — that fails the action's optional
   * UUID schema.
   */
  event_id?: string;
  event_name: string;
  destination: string;
  transportation_type: TransportationType;
  departure_date: string;
  departure_time: string;
  departure_location: string;
  return_date: string;
  return_time: string;
  flight_info: string;
  hotel_name: string;
  hotel_address: string;
  hotel_phone: string;
  hotel_confirmation: string;
  check_in_date: string;
  check_out_date: string;
  room_assignments: string;
  uniform_requirements: string;
  gear_list: string;
  notes: string;
}

export const EMPTY_ITINERARY_FORM: ItineraryFormData = {
  event_id: undefined,
  event_name: '',
  destination: '',
  transportation_type: 'bus',
  departure_date: '',
  departure_time: '',
  departure_location: '',
  return_date: '',
  return_time: '',
  flight_info: '',
  hotel_name: '',
  hotel_address: '',
  hotel_phone: '',
  hotel_confirmation: '',
  check_in_date: '',
  check_out_date: '',
  room_assignments: '',
  uniform_requirements: '',
  gear_list: '',
  notes: '',
};

/** Map a legacy itinerary row → editable form values (verbatim prefill). */
export function itineraryToForm(itinerary: TravelItinerary): ItineraryFormData {
  // event_id is round-tripped on the TravelItinerary prop (the page mapper joins
  // it), so the picker prefills from the saved link on re-edit. Null/absent =
  // start the picker empty ("No linked event").
  return {
    event_id: itinerary.event_id ?? undefined,
    event_name: itinerary.event_name,
    destination: itinerary.destination,
    transportation_type: itinerary.transportation_type,
    departure_date: itinerary.departure_date,
    departure_time: itinerary.departure_time || '',
    departure_location: itinerary.departure_location || '',
    return_date: itinerary.return_date || '',
    return_time: itinerary.return_time || '',
    flight_info: itinerary.flight_info || '',
    hotel_name: itinerary.hotel_name || '',
    hotel_address: itinerary.hotel_address || '',
    hotel_phone: itinerary.hotel_phone || '',
    hotel_confirmation: itinerary.hotel_confirmation || '',
    check_in_date: itinerary.check_in_date || '',
    check_out_date: itinerary.check_out_date || '',
    room_assignments: itinerary.room_assignments || '',
    uniform_requirements: itinerary.uniform_requirements || '',
    gear_list: itinerary.gear_list || '',
    notes: itinerary.notes || '',
  };
}

const TRANSPORT_OPTIONS: TransportationType[] = ['bus', 'van', 'flight', 'carpool'];

/** A minimal golf_events row for the optional "Link to event" picker. */
interface EventOption {
  id: string;
  title: string;
  start_time: string | null;
}

export interface FairwayItineraryModalProps {
  open: boolean;
  onClose: () => void;
  /** null = create; an itinerary = edit. */
  editing: TravelItinerary | null;
  saving: boolean;
  /** Inline error from the parent's save attempt (server action result). */
  error: string | null;
  /** Hands the gathered form data back; the parent owns the write. */
  onSave: (data: ItineraryFormData) => void;
  /**
   * The team whose golf_events power the optional "Link to event" picker. When
   * omitted the picker is hidden (the field stays optional/nullable either way).
   */
  teamId?: string;
}

export function FairwayItineraryModal({
  open,
  onClose,
  editing,
  saving,
  error,
  onSave,
  teamId,
}: FairwayItineraryModalProps) {
  const isEditing = !!editing;
  const [formData, setFormData] = React.useState<ItineraryFormData>(EMPTY_ITINERARY_FORM);
  const [localError, setLocalError] = React.useState<string | null>(null);
  const [events, setEvents] = React.useState<EventOption[]>([]);

  // Edit prefill / create reset on open (verbatim contract).
  React.useEffect(() => {
    if (!open) return;
    setFormData(editing ? itineraryToForm(editing) : EMPTY_ITINERARY_FORM);
    setLocalError(null);
  }, [open, editing]);

  // Load the team's events for the optional "Link to event" picker. Client-side
  // read, scoped to the team; failures degrade quietly (the link is optional).
  React.useEffect(() => {
    if (!open || !teamId) return;
    let cancelled = false;
    void (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from('golf_events')
        .select('id, title, start_time')
        .eq('team_id', teamId)
        .order('start_time', { ascending: false })
        .limit(500);
      if (!cancelled) setEvents((data as EventOption[] | null) ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, teamId]);

  const set = <K extends keyof ItineraryFormData>(key: K, value: ItineraryFormData[K]) =>
    setFormData((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = () => {
    // Same required-field validation as the legacy handleSave.
    if (!formData.event_name.trim() || !formData.destination.trim() || !formData.departure_date) {
      setLocalError('Event name, destination, and departure date are required');
      return;
    }
    setLocalError(null);
    // Never send event_id as '' — the create action treats it as an optional
    // UUID, so an empty string fails validation. Pass undefined when unlinked.
    onSave({ ...formData, event_id: formData.event_id || undefined });
  };

  const shownError = localError || error;

  // Event picker options. A leading "No linked event" choice clears the link
  // (mapped back to undefined → the server action persists null).
  const NO_EVENT = '__none__';
  const eventOptions = React.useMemo(
    () => [
      { value: NO_EVENT, label: 'No linked event' },
      ...events.map((ev) => ({
        value: ev.id,
        label: ev.start_time
          ? `${ev.title} · ${formatShortDate(ev.start_time)}`
          : ev.title,
      })),
    ],
    [events],
  );

  return (
    <ModalShell
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      size="xl"
      title={isEditing ? 'Edit travel itinerary' : 'Create travel itinerary'}
      description={
        isEditing
          ? 'Update the trip details your team sees.'
          : 'Post a trip and the team sees the plan, lodging, and gear in one place.'
      }
      data-slot="itinerary-editor"
      className="min-h-[60dvh]"
    >
      <ModalShell.Body className="flex min-h-0 flex-col gap-5">
        {shownError ? (
          <InlineNotice tone="danger" title="Couldn't save the itinerary">
            {shownError}
          </InlineNotice>
        ) : null}

        {/* Event name — green editorial spine (matches FairwayEventEditor). */}
        <div className="flex items-center gap-3">
          <span aria-hidden className="h-7 w-1 flex-shrink-0 rounded-full bg-accent-500" />
          <Input
            type="text"
            value={formData.event_name}
            onChange={(e) => set('event_name', e.target.value)}
            disabled={saving}
            placeholder="Event name…"
            aria-label="Event name"
            className="w-full flex-1 border-none bg-transparent px-0 py-1 font-fw-display text-h3 font-semibold tracking-[-0.01em] text-text-primary outline-none placeholder:text-text-tertiary"
            required
          />
        </div>

        {/* Destination + transport */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="trip-destination" className={labelCls}>
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 text-accent-700" /> Destination
              </span>
            </label>
            <Input
              id="trip-destination"
              type="text"
              value={formData.destination}
              onChange={(e) => set('destination', e.target.value)}
              disabled={saving}
              placeholder="e.g. Pebble Beach, CA"
              className={fieldCls}
              required
            />
          </div>
          <div>
            <label htmlFor="trip-transport" className={labelCls}>
              Transportation
            </label>
            <Select
              name="trip-transport"
              value={formData.transportation_type}
              onValueChange={(value) => set('transportation_type', value as TransportationType)}
              disabled={saving}
              options={TRANSPORT_OPTIONS.map((t) => ({
                value: t,
                label: TRANSPORT_LABEL[t],
              }))}
              className={cn(fieldCls, 'bg-surface')}
            />
          </div>
        </div>

        {/* Optional link to a calendar event (golf_events). Hidden when no team
            is supplied or the team has no events — the link is always optional. */}
        {teamId && events.length > 0 ? (
          <div>
            <label htmlFor="trip-event" className={labelCls}>
              <span className="inline-flex items-center gap-1.5">
                <Link2 className="h-3.5 w-3.5 text-accent-700" /> Link to event (optional)
              </span>
            </label>
            <Select
              name="trip-event"
              value={formData.event_id || NO_EVENT}
              onValueChange={(value) => set('event_id', !value || value === NO_EVENT ? undefined : value)}
              disabled={saving}
              options={eventOptions}
              placeholder="No linked event"
              className={cn(fieldCls, 'bg-surface')}
            />
          </div>
        ) : null}

        {/* Departure / return well */}
        <div className="flex flex-col gap-3 rounded-fw-md border border-accent-100 bg-accent-50/60 p-4">
          <div className="flex items-center gap-3">
            <CalendarIcon className="h-4 w-4 flex-shrink-0 text-accent-700" aria-hidden />
            <div className="grid flex-1 grid-cols-2 gap-3">
              <div>
                <label htmlFor="trip-dep-date" className={labelCls}>Departure date</label>
                <Input
                  id="trip-dep-date"
                  type="date"
                  value={formData.departure_date}
                  onChange={(e) => set('departure_date', e.target.value)}
                  disabled={saving}
                  className={cn(fieldCls, 'bg-surface')}
                  required
                />
              </div>
              <div>
                <label htmlFor="trip-ret-date" className={labelCls}>Return date</label>
                <Input
                  id="trip-ret-date"
                  type="date"
                  value={formData.return_date}
                  onChange={(e) => set('return_date', e.target.value)}
                  disabled={saving}
                  className={cn(fieldCls, 'bg-surface')}
                />
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Clock className="h-4 w-4 flex-shrink-0 text-accent-700" aria-hidden />
            <div className="grid flex-1 grid-cols-2 gap-3">
              <div>
                <label htmlFor="trip-dep-time" className={labelCls}>Departure time</label>
                <Input
                  id="trip-dep-time"
                  type="time"
                  value={formData.departure_time}
                  onChange={(e) => set('departure_time', e.target.value)}
                  disabled={saving}
                  className={cn(fieldCls, 'bg-surface')}
                />
              </div>
              <div>
                <label htmlFor="trip-ret-time" className={labelCls}>Return time</label>
                <Input
                  id="trip-ret-time"
                  type="time"
                  value={formData.return_time}
                  onChange={(e) => set('return_time', e.target.value)}
                  disabled={saving}
                  className={cn(fieldCls, 'bg-surface')}
                />
              </div>
            </div>
          </div>
          <div className="pl-7">
            <label htmlFor="trip-dep-loc" className={labelCls}>Departure location</label>
            <Input
              id="trip-dep-loc"
              type="text"
              value={formData.departure_location}
              onChange={(e) => set('departure_location', e.target.value)}
              disabled={saving}
              placeholder="e.g. School parking lot"
              className={cn(fieldCls, 'bg-surface')}
            />
          </div>
        </div>

        {/* Flight info (always available — the legacy field is independent of
            transport type, so keep it honest and always editable). */}
        <div>
          <label htmlFor="trip-flight" className={labelCls}>Flight info</label>
          <Input
            id="trip-flight"
            type="text"
            value={formData.flight_info}
            onChange={(e) => set('flight_info', e.target.value)}
            disabled={saving}
            placeholder="Airline, flight numbers, times…"
            className={fieldCls}
          />
        </div>

        {/* Lodging */}
        <div className="flex flex-col gap-3 border-t border-border-subtle pt-5">
          <p className={sectionTitleCls}>
            <Hotel className="h-3.5 w-3.5 text-accent-700" /> Lodging
          </p>
          <div>
            <label htmlFor="trip-hotel-name" className={labelCls}>Hotel name</label>
            <Input
              id="trip-hotel-name"
              type="text"
              value={formData.hotel_name}
              onChange={(e) => set('hotel_name', e.target.value)}
              disabled={saving}
              className={fieldCls}
            />
          </div>
          <div>
            <label htmlFor="trip-hotel-addr" className={labelCls}>Hotel address</label>
            <Input
              id="trip-hotel-addr"
              type="text"
              value={formData.hotel_address}
              onChange={(e) => set('hotel_address', e.target.value)}
              disabled={saving}
              className={fieldCls}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="trip-hotel-phone" className={labelCls}>Hotel phone</label>
              <Input
                id="trip-hotel-phone"
                type="tel"
                inputMode="tel"
                value={formData.hotel_phone}
                onChange={(e) => set('hotel_phone', e.target.value)}
                disabled={saving}
                className={fieldCls}
              />
            </div>
            <div>
              <label htmlFor="trip-hotel-conf" className={labelCls}>Confirmation #</label>
              <Input
                id="trip-hotel-conf"
                type="text"
                inputMode="numeric"
                value={formData.hotel_confirmation}
                onChange={(e) => set('hotel_confirmation', e.target.value)}
                disabled={saving}
                className={fieldCls}
              />
            </div>
          </div>
        </div>

        {/* Logistics */}
        <div className="flex flex-col gap-3 border-t border-border-subtle pt-5">
          <p className={sectionTitleCls}>
            <Package className="h-3.5 w-3.5 text-accent-700" /> Logistics
          </p>
          <div>
            <label htmlFor="trip-rooms" className={labelCls}>Room assignments</label>
            <TextArea
              id="trip-rooms"
              value={formData.room_assignments}
              onChange={(e) => set('room_assignments', e.target.value)}
              disabled={saving}
              rows={2}
              placeholder="e.g. Room 201 — A. Lopez & J. Chen…"
              className={cn(fieldCls, 'resize-none')}
            />
          </div>
          <div>
            <label htmlFor="trip-uniform" className={labelCls}>Uniform requirements</label>
            <Input
              id="trip-uniform"
              type="text"
              value={formData.uniform_requirements}
              onChange={(e) => set('uniform_requirements', e.target.value)}
              disabled={saving}
              placeholder="e.g. Team polo, khaki pants"
              className={fieldCls}
            />
          </div>
          <div>
            <label htmlFor="trip-gear" className={labelCls}>Gear list</label>
            <Input
              id="trip-gear"
              type="text"
              value={formData.gear_list}
              onChange={(e) => set('gear_list', e.target.value)}
              disabled={saving}
              placeholder="e.g. Clubs, rain gear, extra balls"
              className={fieldCls}
            />
          </div>
          <div>
            <label htmlFor="trip-notes" className={labelCls}>Notes</label>
            <TextArea
              id="trip-notes"
              value={formData.notes}
              onChange={(e) => set('notes', e.target.value)}
              disabled={saving}
              rows={3}
              placeholder="Any additional information…"
              className={cn(fieldCls, 'resize-none')}
            />
          </div>
        </div>
      </ModalShell.Body>

      <ModalShell.Footer>
        <Button variant="secondary" type="button" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button
          variant="primary"
          type="button"
          onClick={handleSubmit}
          busy={saving}
          disabled={saving}
          className="min-w-[160px]"
        >
          {isEditing ? 'Save changes' : 'Create itinerary'}
        </Button>
      </ModalShell.Footer>
    </ModalShell>
  );
}
