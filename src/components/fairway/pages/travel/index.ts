/**
 * ============================================================================
 * Fairway · pages · travel — barrel
 * ----------------------------------------------------------------------------
 * The redesigned coach+player /golf/dashboard/travel surface. ADDITIVE +
 * GATED — consumed only behind the isRedesignEnabled() fork in travel/page.tsx
 * (by DIRECT PATH). Renders inside the `.fairway-ds` scope on a bg-canvas page.
 * ========================================================================== */

export { FairwayTravel } from './FairwayTravel';
export type { FairwayTravelProps } from './FairwayTravel';

export { FairwayTripCard } from './FairwayTripCard';
export type { FairwayTripCardProps } from './FairwayTripCard';

export { FairwayTripDetail } from './FairwayTripDetail';
export type { FairwayTripDetailProps } from './FairwayTripDetail';

export { FairwayItineraryModal, EMPTY_ITINERARY_FORM, itineraryToForm } from './FairwayItineraryModal';
export type { FairwayItineraryModalProps, ItineraryFormData } from './FairwayItineraryModal';

export type {
  TravelItinerary,
  TransportationType,
  TripStatus,
} from './travel-helpers';
export {
  TRANSPORT_ICON,
  TRANSPORT_LABEL,
  getTripStatus,
  formatTravelDate,
  formatTravelTime,
} from './travel-helpers';
