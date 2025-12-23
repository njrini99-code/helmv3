'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { IconPlus } from '@/components/icons';
import { createAnnouncement } from '@/app/golf/actions/golf';

export function CreateAnnouncementButton() {
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
      await createAnnouncement({
        title: formData.get('title') as string,
        body: formData.get('body') as string,
        urgency: formData.get('urgency') as 'low' | 'normal' | 'high' | 'urgent',
        requiresAcknowledgement: formData.get('requiresAcknowledgement') === 'on',
      });

      setIsOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create announcement');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button onClick={() => setIsOpen(true)} className="gap-2">
        <IconPlus size={18} />
        New Announcement
      </Button>

      {isOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-slate-200">
              <h2 className="text-lg font-semibold text-slate-900">New Announcement</h2>
            </div>

            <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm">
                  {error}
                </div>
              )}

              <Input
                label="Title"
                name="title"
                placeholder="Practice Schedule Change"
                required
              />

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Message
                </label>
                <textarea
                  name="body"
                  rows={6}
                  required
                  className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:border-green-500 focus:ring-2 focus:ring-green-100 text-slate-900 placeholder:text-slate-400 transition-colors resize-none"
                  placeholder="Announcement details..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Urgency Level
                </label>
                <select
                  name="urgency"
                  className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:border-green-500 focus:ring-2 focus:ring-green-100 text-slate-900 bg-white transition-colors"
                >
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  name="requiresAcknowledgement"
                  id="requiresAcknowledgement"
                  className="w-4 h-4 rounded border-slate-300 text-green-600 focus:ring-green-500"
                />
                <label htmlFor="requiresAcknowledgement" className="text-sm font-medium text-slate-700">
                  Require player acknowledgement
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
                  Post Announcement
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
