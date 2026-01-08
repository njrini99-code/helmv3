'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ShineEffect } from '@/components/ui/shine-effect';
import {
  IconAirplane,
  IconMapPin,
  IconCalendar,
  IconClock,
  IconPlus,
  IconX,
  IconTrash,
  IconEdit,
} from '@/components/icons';
import {
  createGolfTravelItinerary,
  updateGolfTravelItinerary,
  deleteGolfTravelItinerary,
} from '@/app/golf/actions/travel';

interface TravelItinerary {
  id: string;
  event_name: string;
  destination: string;
  transportation_type: 'bus' | 'van' | 'fly' | 'carpool';
  departure_date: string;
  departure_time: string | null;
  departure_location: string | null;
  return_date: string | null;
  return_time: string | null;
  flight_info: string | null;
  hotel_name: string | null;
  hotel_address: string | null;
  hotel_phone: string | null;
  hotel_confirmation: string | null;
  check_in_date: string | null;
  check_out_date: string | null;
  room_assignments: string | null;
  uniform_requirements: string | null;
  gear_list: string | null;
  notes: string | null;
  created_at: string | null;
}

type TransportationType = TravelItinerary['transportation_type'];

interface TravelClientProps {
  itineraries: TravelItinerary[];
  coachId: string;
  teamId: string;
  isCoach: boolean;
}

export function TravelClient({ itineraries: initialItineraries, coachId, teamId, isCoach }: TravelClientProps) {
  const router = useRouter();
  const [itineraries, setItineraries] = useState(initialItineraries);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    event_name: '',
    destination: '',
    transportation_type: 'bus' as TransportationType,
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
  });

  const getTransportIcon = (type: TransportationType) => {
    switch (type) {
      case 'fly':
        return '✈️';
      case 'bus':
        return '🚌';
      case 'van':
        return '🚐';
      case 'carpool':
        return '🚗';
      default:
        return '🚗';
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const resetForm = () => {
    setFormData({
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
    });
    setEditingId(null);
    setError(null);
  };

  const handleEdit = (itinerary: TravelItinerary) => {
    setFormData({
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
    });
    setEditingId(itinerary.id);
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!formData.event_name.trim() || !formData.destination.trim() || !formData.departure_date) {
      setError('Event name, destination, and departure date are required');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      if (editingId) {
        // Update existing
        const result = await updateGolfTravelItinerary({
          id: editingId,
          ...formData,
        });

        if (!result.success) {
          setError(result.error || 'Failed to update itinerary');
          setSaving(false);
          return;
        }
      } else {
        // Create new
        const result = await createGolfTravelItinerary({
          team_id: teamId,
          created_by: coachId,
          ...formData,
        });

        if (!result.success) {
          setError(result.error || 'Failed to create itinerary');
          setSaving(false);
          return;
        }
      }

      resetForm();
      setShowModal(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this travel itinerary?')) return;

    const result = await deleteGolfTravelItinerary(id);

    if (result.success) {
      setItineraries((prev) => prev.filter((i) => i.id !== id));
      router.refresh();
    } else {
      alert(result.error || 'Failed to delete itinerary');
    }
  };

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="border-b border-slate-200/60 bg-white/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-5">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Travel</h1>
              <p className="text-slate-500 mt-0.5">Tournament travel itineraries</p>
            </div>
            {isCoach && (
              <button
                onClick={() => {
                  resetForm();
                  setShowModal(true);
                }}
                className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2"
              >
                <IconPlus size={18} />
                Add Itinerary
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        {itineraries.length === 0 ? (
          <div className="relative glass-standard rounded-2xl overflow-hidden p-16 text-center">
            <ShineEffect />
            <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
              <IconAirplane size={28} className="text-slate-400" />
            </div>
            <h3 className="text-lg font-semibold text-slate-900 mb-2">No Travel Itineraries</h3>
            <p className="text-slate-500 mb-6 max-w-sm mx-auto">
              {isCoach
                ? 'Create travel itineraries for upcoming tournaments and events'
                : 'Travel details will appear here when available'}
            </p>
            {isCoach && (
              <button
                onClick={() => {
                  resetForm();
                  setShowModal(true);
                }}
                className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
              >
                Create First Itinerary
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {itineraries.map((itinerary) => (
              <div
                key={itinerary.id}
                className="relative glass-standard rounded-2xl overflow-hidden p-6 hover:shadow-lg transition-all group"
              >
                <ShineEffect />
                <div className="relative">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-start gap-4 flex-1">
                      <div className="text-4xl">{getTransportIcon(itinerary.transportation_type)}</div>
                      <div className="flex-1">
                        <h3 className="text-lg font-semibold text-slate-900 mb-1">{itinerary.event_name}</h3>
                        <div className="flex items-center gap-2 text-slate-600 mb-3">
                          <IconMapPin size={16} />
                          <span>{itinerary.destination}</span>
                        </div>

                        {/* Departure */}
                        <div className="flex items-center gap-4 text-sm text-slate-600 mb-2">
                          <div className="flex items-center gap-2">
                            <IconCalendar size={14} className="text-slate-400" />
                            <span className="font-medium">Depart:</span>
                            <span>{formatDate(itinerary.departure_date)}</span>
                            {itinerary.departure_time && (
                              <>
                                <IconClock size={14} className="text-slate-400 ml-2" />
                                <span>{itinerary.departure_time}</span>
                              </>
                            )}
                          </div>
                        </div>

                        {/* Return */}
                        {itinerary.return_date && (
                          <div className="flex items-center gap-4 text-sm text-slate-600">
                            <div className="flex items-center gap-2">
                              <IconCalendar size={14} className="text-slate-400" />
                              <span className="font-medium">Return:</span>
                              <span>{formatDate(itinerary.return_date)}</span>
                              {itinerary.return_time && (
                                <>
                                  <IconClock size={14} className="text-slate-400 ml-2" />
                                  <span>{itinerary.return_time}</span>
                                </>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Hotel */}
                        {itinerary.hotel_name && (
                          <div className="mt-3 p-3 bg-slate-50 rounded-lg text-sm">
                            <p className="font-medium text-slate-900 mb-1">🏨 {itinerary.hotel_name}</p>
                            {itinerary.hotel_address && (
                              <p className="text-slate-600 text-xs">{itinerary.hotel_address}</p>
                            )}
                            {itinerary.hotel_phone && (
                              <p className="text-slate-600 text-xs mt-1">📞 {itinerary.hotel_phone}</p>
                            )}
                          </div>
                        )}

                        {/* Additional Details */}
                        {(itinerary.uniform_requirements || itinerary.gear_list || itinerary.notes) && (
                          <div className="mt-3 space-y-2 text-sm">
                            {itinerary.uniform_requirements && (
                              <div>
                                <span className="font-medium text-slate-700">Uniform:</span>
                                <span className="text-slate-600 ml-2">{itinerary.uniform_requirements}</span>
                              </div>
                            )}
                            {itinerary.gear_list && (
                              <div>
                                <span className="font-medium text-slate-700">Gear:</span>
                                <span className="text-slate-600 ml-2">{itinerary.gear_list}</span>
                              </div>
                            )}
                            {itinerary.notes && (
                              <div>
                                <span className="font-medium text-slate-700">Notes:</span>
                                <span className="text-slate-600 ml-2">{itinerary.notes}</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {isCoach && (
                      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => handleEdit(itinerary)}
                          className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                        >
                          <IconEdit size={16} className="text-slate-600" />
                        </button>
                        <button
                          onClick={() => handleDelete(itinerary.id)}
                          className="p-2 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          <IconTrash size={16} className="text-red-600" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-y-auto overscroll-contain touch-pan-y" style={{ WebkitOverflowScrolling: 'touch' }}>
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-xl my-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-slate-900">
                {editingId ? 'Edit Travel Itinerary' : 'Create Travel Itinerary'}
              </h2>
              <button
                onClick={() => {
                  setShowModal(false);
                  resetForm();
                }}
                className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <IconX size={20} />
              </button>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
                {error}
              </div>
            )}

            <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2 overscroll-contain touch-pan-y" style={{ WebkitOverflowScrolling: 'touch' }} data-scroll-container>
              {/* Event Name */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Event Name *</label>
                <input
                  type="text"
                  value={formData.event_name}
                  onChange={(e) => setFormData((prev) => ({ ...prev, event_name: e.target.value }))}
                  className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-green-600 focus:border-transparent"
                  placeholder="e.g., Spring Invitational"
                />
              </div>

              {/* Destination */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Destination *</label>
                <input
                  type="text"
                  value={formData.destination}
                  onChange={(e) => setFormData((prev) => ({ ...prev, destination: e.target.value }))}
                  className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-green-600 focus:border-transparent"
                  placeholder="e.g., Pebble Beach, CA"
                />
              </div>

              {/* Transportation */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Transportation</label>
                <select
                  value={formData.transportation_type}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      transportation_type: e.target.value as TransportationType,
                    }))
                  }
                  className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-green-600 focus:border-transparent"
                >
                  <option value="bus">Bus</option>
                  <option value="van">Van</option>
                  <option value="fly">Flight</option>
                  <option value="carpool">Carpool</option>
                </select>
              </div>

              {/* Departure Info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Departure Date *</label>
                  <input
                    type="date"
                    value={formData.departure_date}
                    onChange={(e) => setFormData((prev) => ({ ...prev, departure_date: e.target.value }))}
                    className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-green-600 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Departure Time</label>
                  <input
                    type="time"
                    value={formData.departure_time}
                    onChange={(e) => setFormData((prev) => ({ ...prev, departure_time: e.target.value }))}
                    className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-green-600 focus:border-transparent"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Departure Location</label>
                <input
                  type="text"
                  value={formData.departure_location}
                  onChange={(e) => setFormData((prev) => ({ ...prev, departure_location: e.target.value }))}
                  className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-green-600 focus:border-transparent"
                  placeholder="e.g., School parking lot"
                />
              </div>

              {/* Return Info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Return Date</label>
                  <input
                    type="date"
                    value={formData.return_date}
                    onChange={(e) => setFormData((prev) => ({ ...prev, return_date: e.target.value }))}
                    className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-green-600 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Return Time</label>
                  <input
                    type="time"
                    value={formData.return_time}
                    onChange={(e) => setFormData((prev) => ({ ...prev, return_time: e.target.value }))}
                    className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-green-600 focus:border-transparent"
                  />
                </div>
              </div>

              {/* Hotel Info */}
              <div className="border-t border-slate-200 pt-4 mt-4">
                <h3 className="font-medium text-slate-900 mb-3">Hotel Information</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Hotel Name</label>
                    <input
                      type="text"
                      value={formData.hotel_name}
                      onChange={(e) => setFormData((prev) => ({ ...prev, hotel_name: e.target.value }))}
                      className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-green-600 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Hotel Address</label>
                    <input
                      type="text"
                      value={formData.hotel_address}
                      onChange={(e) => setFormData((prev) => ({ ...prev, hotel_address: e.target.value }))}
                      className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-green-600 focus:border-transparent"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">Hotel Phone</label>
                      <input
                        type="tel"
                        value={formData.hotel_phone}
                        onChange={(e) => setFormData((prev) => ({ ...prev, hotel_phone: e.target.value }))}
                        className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-green-600 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">Confirmation #</label>
                      <input
                        type="text"
                        value={formData.hotel_confirmation}
                        onChange={(e) => setFormData((prev) => ({ ...prev, hotel_confirmation: e.target.value }))}
                        className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-green-600 focus:border-transparent"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Additional Details */}
              <div className="border-t border-slate-200 pt-4 mt-4">
                <h3 className="font-medium text-slate-900 mb-3">Additional Details</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Uniform Requirements</label>
                    <input
                      type="text"
                      value={formData.uniform_requirements}
                      onChange={(e) => setFormData((prev) => ({ ...prev, uniform_requirements: e.target.value }))}
                      className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-green-600 focus:border-transparent"
                      placeholder="e.g., Team polo, khaki pants"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Gear List</label>
                    <input
                      type="text"
                      value={formData.gear_list}
                      onChange={(e) => setFormData((prev) => ({ ...prev, gear_list: e.target.value }))}
                      className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-green-600 focus:border-transparent"
                      placeholder="e.g., Clubs, rain gear, extra balls"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Notes</label>
                    <textarea
                      value={formData.notes}
                      onChange={(e) => setFormData((prev) => ({ ...prev, notes: e.target.value }))}
                      className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-green-600 focus:border-transparent"
                      rows={3}
                      placeholder="Any additional information..."
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex gap-3 pt-4 mt-4 border-t border-slate-200">
              <button
                onClick={() => {
                  setShowModal(false);
                  resetForm();
                }}
                className="flex-1 px-4 py-2 border border-slate-200 rounded-lg font-medium text-slate-700 hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? 'Saving...' : editingId ? 'Save Changes' : 'Create Itinerary'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
