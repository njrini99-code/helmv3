'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  createItinerary,
  updateItinerary,
  type BaseballTravelItinerary,
} from '@/app/baseball/actions/travel';

interface CreateItineraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  teamId: string;
  itinerary?: BaseballTravelItinerary | null;
}

export function CreateItineraryModal({
  isOpen,
  onClose,
  onSaved,
  teamId,
  itinerary,
}: CreateItineraryModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [eventName, setEventName] = useState('');
  const [departureDate, setDepartureDate] = useState('');
  const [returnDate, setReturnDate] = useState('');
  const [location, setLocation] = useState('');
  const [accommodation, setAccommodation] = useState('');
  const [transportation, setTransportation] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (itinerary) {
      setEventName(itinerary.event_name || '');
      setDepartureDate(itinerary.departure_date || '');
      setReturnDate(itinerary.return_date || '');
      setLocation(itinerary.location || '');
      setAccommodation(itinerary.accommodation || '');
      setTransportation(itinerary.transportation || '');
      setNotes(itinerary.notes || '');
    } else {
      resetForm();
    }
  }, [itinerary]);

  function resetForm() {
    setEventName('');
    setDepartureDate('');
    setReturnDate('');
    setLocation('');
    setAccommodation('');
    setTransportation('');
    setNotes('');
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!eventName.trim()) {
      setError('Event name is required');
      return;
    }

    setLoading(true);

    try {
      if (itinerary) {
        const result = await updateItinerary(itinerary.id, {
          event_name: eventName.trim(),
          departure_date: departureDate || null,
          return_date: returnDate || null,
          location: location.trim() || null,
          accommodation: accommodation.trim() || null,
          transportation: transportation.trim() || null,
          notes: notes.trim() || null,
        });
        if (!result.success) {
          setError(result.error || 'Failed to update itinerary');
          return;
        }
      } else {
        const result = await createItinerary(teamId, {
          event_name: eventName.trim(),
          departure_date: departureDate || undefined,
          return_date: returnDate || undefined,
          location: location.trim() || undefined,
          accommodation: accommodation.trim() || undefined,
          transportation: transportation.trim() || undefined,
          notes: notes.trim() || undefined,
        });
        if (!result.success) {
          setError(result.error || 'Failed to create itinerary');
          return;
        }
      }

      onSaved();
      onClose();
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Drawer
      open={isOpen}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>{itinerary ? 'Edit Trip' : 'Create Trip'}</DrawerTitle>
        </DrawerHeader>
      <form
        onSubmit={handleSubmit}
        className="space-y-5 px-6 pb-6 overflow-y-auto overscroll-contain"
        style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))' }}
      >
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600"
          >
            {error}
          </motion.div>
        )}

        <Input
          label="Event Name"
          value={eventName}
          onChange={(e) => setEventName(e.target.value)}
          placeholder="Regional Tournament, Away Series..."
          required
        />

        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Departure Date"
            type="date"
            value={departureDate}
            onChange={(e) => setDepartureDate(e.target.value)}
          />
          <Input
            label="Return Date"
            type="date"
            value={returnDate}
            onChange={(e) => setReturnDate(e.target.value)}
          />
        </div>

        <Input
          label="Location"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="City, State or Venue Name"
        />

        <Input
          label="Accommodation"
          value={accommodation}
          onChange={(e) => setAccommodation(e.target.value)}
          placeholder="Hotel name, address..."
        />

        <Input
          label="Transportation"
          value={transportation}
          onChange={(e) => setTransportation(e.target.value)}
          placeholder="Team bus, charter flight..."
        />

        <div>
          <label className="text-sm font-medium text-warm-700 block mb-1">Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Additional trip details, packing list, dress code..."
            rows={3}
            className="w-full px-4 py-2.5 rounded-lg border border-warm-200
                     focus:border-primary-500 focus:ring-2 focus:ring-primary-100
                     text-warm-900 placeholder:text-warm-400 transition-colors resize-none"
          />
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-warm-200">
          <Button variant="secondary" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" isLoading={loading}>
            {itinerary ? 'Save Changes' : 'Create Trip'}
          </Button>
        </div>
      </form>
      </DrawerContent>
    </Drawer>
  );
}
