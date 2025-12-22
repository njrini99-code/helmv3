'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { IconX, IconCalendar } from '@/components/icons';
import { createClient } from '@/lib/supabase/client';

interface EventModalProps {
  teamId: string;
  coachId: string;
  event?: any | null;
  onClose: () => void;
  onSuccess: () => void;
}

export function EventModal({ teamId, coachId, event, onClose, onSuccess }: EventModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEditing = !!event;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);

    const eventData = {
      team_id: teamId,
      created_by: coachId,
      name: formData.get('name') as string,
      description: formData.get('description') as string || null,
      event_type: formData.get('event_type') as string,
      start_time: new Date(formData.get('start_time') as string).toISOString(),
      end_time: formData.get('end_time') ? new Date(formData.get('end_time') as string).toISOString() : null,
      location_venue: formData.get('location_venue') as string || null,
      location_city: formData.get('location_city') as string || null,
      location_state: formData.get('location_state') as string || null,
      opponent: formData.get('opponent') as string || null,
      home_away: formData.get('home_away') as string || null,
      notes: formData.get('notes') as string || null,
      is_public: true,
    };

    try {
      const supabase = createClient();

      if (isEditing) {
        const { error: updateError } = await supabase
          .from('events')
          .update(eventData)
          .eq('id', event.id);

        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await supabase
          .from('events')
          .insert(eventData);

        if (insertError) throw insertError;
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Error saving event:', err);
      setError(err.message || 'Failed to save event');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <CardHeader className="border-b border-slate-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-green-50 flex items-center justify-center">
                <IconCalendar size={20} className="text-green-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  {isEditing ? 'Edit Event' : 'Create Event'}
                </h2>
                <p className="text-sm leading-relaxed text-slate-500">Add to your team calendar</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            >
              <IconX size={20} />
            </button>
          </div>
        </CardHeader>

        <CardContent className="p-6">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Event Name */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Event Name *
              </label>
              <Input
                type="text"
                name="name"
                required
                defaultValue={event?.name || ''}
                placeholder="e.g., Practice, Home Game vs Tigers"
              />
            </div>

            {/* Event Type */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Event Type *
              </label>
              <select
                name="event_type"
                required
                defaultValue={event?.event_type || 'practice'}
                className="w-full px-4 py-2.5 rounded-lg border border-slate-200
                           focus:border-green-500 focus:ring-2 focus:ring-green-100
                           text-slate-900 bg-white transition-colors"
              >
                <option value="practice">Practice</option>
                <option value="game">Game</option>
                <option value="tournament">Tournament</option>
                <option value="camp">Camp/Clinic</option>
                <option value="tryout">Tryout</option>
                <option value="meeting">Team Meeting</option>
                <option value="other">Other</option>
              </select>
            </div>

            {/* Date & Time */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Start Date & Time *
                </label>
                <Input
                  type="datetime-local"
                  name="start_time"
                  required
                  defaultValue={event?.start_time ? new Date(event.start_time).toISOString().slice(0, 16) : ''}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  End Date & Time
                </label>
                <Input
                  type="datetime-local"
                  name="end_time"
                  defaultValue={event?.end_time ? new Date(event.end_time).toISOString().slice(0, 16) : ''}
                />
              </div>
            </div>

            {/* Location */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Venue/Location
              </label>
              <Input
                type="text"
                name="location_venue"
                defaultValue={event?.location_venue || ''}
                placeholder="e.g., Main Stadium, Field 3"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  City
                </label>
                <Input
                  type="text"
                  name="location_city"
                  defaultValue={event?.location_city || ''}
                  placeholder="City"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  State
                </label>
                <Input
                  type="text"
                  name="location_state"
                  maxLength={2}
                  defaultValue={event?.location_state || ''}
                  placeholder="TX"
                />
              </div>
            </div>

            {/* Game-specific fields */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Opponent (for games)
              </label>
              <Input
                type="text"
                name="opponent"
                defaultValue={event?.opponent || ''}
                placeholder="Opponent team name"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Home/Away (for games)
              </label>
              <select
                name="home_away"
                defaultValue={event?.home_away || ''}
                className="w-full px-4 py-2.5 rounded-lg border border-slate-200
                           focus:border-green-500 focus:ring-2 focus:ring-green-100
                           text-slate-900 bg-white transition-colors"
              >
                <option value="">Select...</option>
                <option value="home">Home</option>
                <option value="away">Away</option>
                <option value="neutral">Neutral</option>
              </select>
            </div>

            {/* Description/Notes */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Description/Notes
              </label>
              <textarea
                name="description"
                rows={3}
                defaultValue={event?.description || ''}
                placeholder="Add any additional details..."
                className="w-full px-4 py-2.5 rounded-lg border border-slate-200
                           focus:border-green-500 focus:ring-2 focus:ring-green-100
                           text-slate-900 placeholder:text-slate-400 transition-colors"
              />
            </div>

            {/* Notes (additional) */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Private Notes
              </label>
              <textarea
                name="notes"
                rows={2}
                defaultValue={event?.notes || ''}
                placeholder="Private notes for coaches only..."
                className="w-full px-4 py-2.5 rounded-lg border border-slate-200
                           focus:border-green-500 focus:ring-2 focus:ring-green-100
                           text-slate-900 placeholder:text-slate-400 transition-colors"
              />
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
              <Button type="button" variant="secondary" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" loading={loading}>
                {isEditing ? 'Save Changes' : 'Create Event'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
