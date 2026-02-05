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
      const result = await createAnnouncement({
        title: formData.get('title') as string,
        body: formData.get('body') as string,
        urgency: formData.get('urgency') as 'low' | 'normal' | 'high' | 'urgent',
        requiresAcknowledgement: formData.get('requiresAcknowledgement') === 'on',
      });

      if (!result.success) {
        setError(result.error);
        setLoading(false);
        return;
      }

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
        <div
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setIsOpen(false)}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[85vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header - Fixed */}
            <div className="px-6 py-4 border-b border-slate-200 flex-shrink-0">
              <h2 className="text-lg font-semibold text-slate-900">New Announcement</h2>
              <p className="text-sm text-slate-500 mt-0.5">Share updates with your team</p>
            </div>

            {/* Scrollable Form Content */}
            <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
              <div className="px-6 py-5 space-y-5 overflow-y-auto flex-1">
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
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Message
                  </label>
                  <textarea
                    name="body"
                    rows={4}
                    required
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-green-500 focus:ring-2 focus:ring-green-100 text-slate-900 placeholder:text-slate-400 transition-colors resize-none text-sm"
                    placeholder="Announcement details..."
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Urgency Level
                  </label>
                  <select
                    name="urgency"
                    defaultValue="normal"
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-green-500 focus:ring-2 focus:ring-green-100 text-slate-900 bg-white transition-colors text-sm"
                  >
                    <option value="low">Low - General information</option>
                    <option value="normal">Normal - Standard update</option>
                    <option value="high">High - Important notice</option>
                    <option value="urgent">Urgent - Requires immediate attention</option>
                  </select>
                </div>

                <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-xl">
                  <input
                    type="checkbox"
                    name="requiresAcknowledgement"
                    id="requiresAcknowledgement"
                    className="w-4 h-4 mt-0.5 rounded border-slate-300 text-green-600 focus:ring-green-500"
                  />
                  <div>
                    <label htmlFor="requiresAcknowledgement" className="text-sm font-medium text-slate-700 cursor-pointer">
                      Require player acknowledgement
                    </label>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Players will need to confirm they've read this announcement
                    </p>
                  </div>
                </div>
              </div>

              {/* Footer - Fixed */}
              <div className="px-6 py-4 border-t border-slate-200 flex justify-end gap-3 flex-shrink-0 bg-slate-50/50">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setIsOpen(false)}
                  disabled={loading}
                >
                  Cancel
                </Button>
                <Button type="submit" isLoading={loading}>
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
