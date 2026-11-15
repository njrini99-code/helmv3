/**
 * The player hub's data shapes (trips, tasks, event invites), shared by the player hub read
 * (`src/app/golf/actions/player-hub-data.ts`) and the screens that draw it. Moved out of Fairway's
 * hub-parts when Fairway was retired (2026-11-14); identical to the legacy PlayerHub props.
 */

export interface TripData {
  id: string;
  /** The trip's calendar event (golf_travel_itineraries.event_id), or null when it has none. The
   *  player hub aggregate sets it; the Team Hub page's own trips read doesn't select it. */
  event_id?: string | null;
  event_name: string;
  destination: string;
  transportation_type: 'bus' | 'van' | 'fly' | 'carpool';
  departure_date: string;
  departure_time: string | null;
  departure_location: string | null;
  return_date: string | null;
  return_time: string | null;
  hotel_name: string | null;
  hotel_address: string | null;
  hotel_phone: string | null;
  hotel_confirmation: string | null;
  uniform_requirements: string | null;
  gear_list: string | null;
  room_assignments: string | null;
  notes: string | null;
  flight_info: string | null;
}

export interface PlayerTask {
  id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  category: string | null;
  requires_upload: boolean;
  status: 'pending' | 'overdue' | 'completed';
  completed_at: string | null;
}

export interface EventInvite {
  id: string;
  event_id: string;
  title: string;
  event_type: string;
  start_time: string;
  end_time: string | null;
  location: string | null;
  is_mandatory: boolean;
  rsvp_status: 'pending' | 'accepted' | 'declined' | 'tentative' | null;
  going_count: number;
  maybe_count: number;
}
