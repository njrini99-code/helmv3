'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { IconPlus } from '@/components/icons';
import { createGolfEvent } from '@/app/golf/actions/golf';

export function CreateEventButton() {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);

    try {
      await createGolfEvent({
        title: formData.get('title') as string,
        eventType: formData.get('eventType') as 'practice' | 'tournament' | 'qualifier' | 'meeting' | 'travel' | 'other',
        startDate: formData.get('startDate') as string,
        endDate: (formData.get('endDate') as string) || undefined,
        startTime: (formData.get('startTime') as string) || undefined,
        endTime: (formData.get('endTime') as string) || undefined,
        allDay: formData.get('allDay') === 'on',
        location: (formData.get('location') as string) || undefined,
        courseName: (formData.get('courseName') as string) || undefined,
        description: (formData.get('description') as string) || undefined,
        isMandatory: formData.get('isMandatory') === 'on',
      });

      setIsOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create event');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button onClick={() => setIsOpen(true)} className="gap-2">
        <IconPlus size={18} />
        Add Event
      </Button>

      {isOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-slate-200">
              <h2 className="text-lg font-semibold text-slate-900">Create Event</h2>
            </div>

            <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm">
                  {error}
                </div>
              )}

              <Input
                label="Event Title"
                name="title"
                placeholder="Team Practice"
                required
              />

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Event Type
                </label>
                <select
                  name="eventType"
                  required
                  className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:border-green-500 focus:ring-2 focus:ring-green-100 text-slate-900 bg-white transition-colors"
                >
                  <option value="practice">Practice</option>
                  <option value="tournament">Tournament</option>
                  <option value="qualifier">Qualifier</option>
                  <option value="meeting">Meeting</option>
                  <option value="travel">Travel</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  label="Start Date"
                  name="startDate"
                  type="date"
                  required
                />

                <Input
                  label="End Date (Optional)"
                  name="endDate"
                  type="date"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  name="allDay"
                  id="allDay"
                  className="w-4 h-4 rounded border-slate-300 text-green-600 focus:ring-green-500"
                />
                <label htmlFor="allDay" className="text-sm font-medium text-slate-700">
                  All day event
                </label>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  label="Start Time (Optional)"
                  name="startTime"
                  type="time"
                />

                <Input
                  label="End Time (Optional)"
                  name="endTime"
                  type="time"
                />
              </div>

              <Input
                label="Location (Optional)"
                name="location"
                placeholder="City, State"
              />

              <Input
                label="Course Name (Optional)"
                name="courseName"
                placeholder="For tournaments or practices"
              />

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Description (Optional)
                </label>
                <textarea
                  name="description"
                  rows={3}
                  className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:border-green-500 focus:ring-2 focus:ring-green-100 text-slate-900 placeholder:text-slate-400 transition-colors resize-none"
                  placeholder="Event details and information..."
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  name="isMandatory"
                  id="isMandatory"
                  className="w-4 h-4 rounded border-slate-300 text-green-600 focus:ring-green-500"
                />
                <label htmlFor="isMandatory" className="text-sm font-medium text-slate-700">
                  Mandatory attendance
                </label>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setIsOpen(false)}
                  disabled={loading}
                >
                  Cancel
                </Button>
                <Button type="submit" loading={loading}>
                  Create Event
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
