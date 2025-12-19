'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { IconX } from '@/components/icons';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/components/ui/toast';

interface Camp {
  id: string;
  name: string;
  description: string | null;
  start_date: string;
  end_date: string | null;
  location: string | null;
  capacity: number | null;
  price: number | null;
}

interface CreateCampModalProps {
  open: boolean;
  onClose: () => void;
  camp?: Camp | null; // For editing existing camp
}

export function CreateCampModal({ open, onClose, camp }: CreateCampModalProps) {
  const router = useRouter();
  const { coach } = useAuth();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);

  const isEditing = !!camp;

  const [formData, setFormData] = useState({
    name: camp?.name || '',
    description: camp?.description || '',
    location: camp?.location || '',
    start_date: camp?.start_date ? camp.start_date.split('T')[0] : '',
    end_date: camp?.end_date ? camp.end_date.split('T')[0] : '',
    capacity: camp?.capacity?.toString() || '',
    price: camp?.price?.toString() || '',
  });

  // Reset form when camp changes (switching between edit/create)
  useEffect(() => {
    setFormData({
      name: camp?.name || '',
      description: camp?.description || '',
      location: camp?.location || '',
      start_date: camp?.start_date ? camp.start_date.split('T')[0] : '',
      end_date: camp?.end_date ? camp.end_date.split('T')[0] : '',
      capacity: camp?.capacity?.toString() || '',
      price: camp?.price?.toString() || '',
    });
  }, [camp]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!coach) return;

    // Ensure start_date is provided (form validation should handle this, but TypeScript needs assurance)
    if (!formData.start_date) {
      showToast('Start date is required', 'error');
      return;
    }

    setLoading(true);
    const supabase = createClient();

    const campData = {
      name: formData.name,
      description: formData.description || null,
      location: formData.location || null,
      start_date: formData.start_date,
      end_date: formData.end_date || null,
      capacity: formData.capacity ? parseInt(formData.capacity) : null,
      price: formData.price ? parseFloat(formData.price) : null,
    };

    let error;

    if (isEditing && camp) {
      // Update existing camp
      const result = await supabase
        .from('camps')
        .update(campData)
        .eq('id', camp.id);
      error = result.error;
    } else {
      // Create new camp
      const result = await supabase.from('camps').insert({
        ...campData,
        coach_id: coach.id,
        organization_id: coach.organization_id,
        status: 'active',
      });
      error = result.error;
    }

    setLoading(false);

    if (error) {
      console.error(`Error ${isEditing ? 'updating' : 'creating'} camp:`, error);
      showToast(`Failed to ${isEditing ? 'update' : 'create'} camp. Please try again.`, 'error');
      return;
    }

    showToast(`Camp ${isEditing ? 'updated' : 'created'} successfully`, 'success');
    onClose();
    router.refresh();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">
            {isEditing ? 'Edit Camp' : 'Create Camp'}
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            aria-label={isEditing ? 'Close edit camp modal' : 'Close create camp modal'}
          >
            <IconX size={20} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Camp Name *
            </label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:border-green-500 focus:ring-2 focus:ring-green-100 text-slate-900"
              placeholder="Summer Prospect Camp"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Description
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={3}
              className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:border-green-500 focus:ring-2 focus:ring-green-100 text-slate-900 resize-none"
              placeholder="Tell players what to expect..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Location
            </label>
            <input
              type="text"
              value={formData.location}
              onChange={(e) => setFormData({ ...formData, location: e.target.value })}
              className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:border-green-500 focus:ring-2 focus:ring-green-100 text-slate-900"
              placeholder="University Stadium, City, State"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Start Date *
              </label>
              <input
                type="date"
                required
                value={formData.start_date}
                onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:border-green-500 focus:ring-2 focus:ring-green-100 text-slate-900"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                End Date
              </label>
              <input
                type="date"
                value={formData.end_date}
                onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:border-green-500 focus:ring-2 focus:ring-green-100 text-slate-900"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Capacity
              </label>
              <input
                type="number"
                min="1"
                value={formData.capacity}
                onChange={(e) => setFormData({ ...formData, capacity: e.target.value })}
                className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:border-green-500 focus:ring-2 focus:ring-green-100 text-slate-900"
                placeholder="50"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Price ($)
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={formData.price}
                onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:border-green-500 focus:ring-2 focus:ring-green-100 text-slate-900"
                placeholder="150.00"
              />
            </div>
          </div>
        </form>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-end gap-3">
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={loading || !formData.name || !formData.start_date}>
            {loading ? (isEditing ? 'Saving...' : 'Creating...') : (isEditing ? 'Save Changes' : 'Create Camp')}
          </Button>
        </div>
      </div>
    </div>
  );
}
