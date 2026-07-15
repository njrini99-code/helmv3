'use client';

import { useState, useEffect, useId } from 'react';
import { useRouter } from 'next/navigation';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/components/ui/sonner';
import { createCamp, updateCamp, type CampInput } from '@/app/baseball/actions/camps';

interface Camp {
  id: string;
  name: string;
  description: string | null;
  start_date: string;
  end_date: string;
  location: string | null;
  capacity: number | null;
  price_cents: number | null;
  is_free: boolean | null;
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
  const uid = useId();

  const isEditing = !!camp;

  const [formData, setFormData] = useState({
    name: camp?.name || '',
    description: camp?.description || '',
    location: camp?.location || '',
    start_date: camp?.start_date ? camp.start_date.split('T')[0] : '',
    end_date: camp?.end_date ? camp.end_date.split('T')[0] : '',
    capacity: camp?.capacity?.toString() || '',
    price: camp?.price_cents ? (camp.price_cents / 100).toString() : '',
    is_free: camp?.is_free || false,
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
      price: camp?.price_cents ? (camp.price_cents / 100).toString() : '',
      is_free: camp?.is_free || false,
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

    // Go through the audited server-action layer (createCamp/updateCamp)
    // instead of a raw client-side write. Camps are always written with
    // status: 'published' so the player-facing RLS SELECT policy (which
    // only exposes status = 'published' to non-owners) shows them
    // immediately — a coach-only 'active'/'draft' status left new camps
    // invisible to players.
    const campData: CampInput = {
      name: formData.name,
      description: formData.description || null,
      location: formData.location || null,
      start_date: formData.start_date,
      end_date: formData.end_date || formData.start_date, // end_date is required, default to start_date
      capacity: formData.capacity ? parseInt(formData.capacity) : null,
      price_cents: formData.price ? Math.round(parseFloat(formData.price) * 100) : null,
      is_free: formData.is_free || !formData.price,
    };

    const result =
      isEditing && camp
        ? await updateCamp(camp.id, campData)
        : await createCamp(campData);

    setLoading(false);

    if (!result.success) {
      console.error(`Error ${isEditing ? 'updating' : 'creating'} camp:`, result.error);
      showToast(result.error || `Failed to ${isEditing ? 'update' : 'create'} camp. Please try again.`, 'error');
      return;
    }

    showToast(`Camp ${isEditing ? 'updated' : 'created'} successfully`, 'success');
    onClose();
    router.refresh();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEditing ? 'Edit Camp' : 'Create Camp'}
      size="lg"
      sheetOnMobile
    >
      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor={`${uid}-name`} className="block text-sm font-medium text-warm-700 mb-1">
            Camp Name *
          </label>
          <Input
            id={`${uid}-name`}
            type="text"
            required
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="Summer Prospect Camp"
          />
        </div>

        <div>
          <label htmlFor={`${uid}-desc`} className="block text-sm font-medium text-warm-700 mb-1">
            Description
          </label>
          <Textarea
            id={`${uid}-desc`}
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            rows={3}
            placeholder="Tell players what to expect..."
          />
        </div>

        <div>
          <label htmlFor={`${uid}-location`} className="block text-sm font-medium text-warm-700 mb-1">
            Location
          </label>
          <Input
            id={`${uid}-location`}
            type="text"
            value={formData.location}
            onChange={(e) => setFormData({ ...formData, location: e.target.value })}
            placeholder="University Stadium, City, State"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor={`${uid}-start`} className="block text-sm font-medium text-warm-700 mb-1">
              Start Date *
            </label>
            <Input
              id={`${uid}-start`}
              type="date"
              required
              value={formData.start_date}
              onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
            />
          </div>
          <div>
            <label htmlFor={`${uid}-end`} className="block text-sm font-medium text-warm-700 mb-1">
              End Date
            </label>
            <Input
              id={`${uid}-end`}
              type="date"
              value={formData.end_date}
              onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor={`${uid}-capacity`} className="block text-sm font-medium text-warm-700 mb-1">
              Capacity
            </label>
            <Input
              id={`${uid}-capacity`}
              type="number"
              min="1"
              value={formData.capacity}
              onChange={(e) => setFormData({ ...formData, capacity: e.target.value })}
              placeholder="50"
            />
          </div>
          <div>
            <label htmlFor={`${uid}-price`} className="block text-sm font-medium text-warm-700 mb-1">
              Price ($)
            </label>
            <Input
              id={`${uid}-price`}
              type="number"
              min="0"
              step="0.01"
              value={formData.price}
              onChange={(e) => setFormData({ ...formData, price: e.target.value })}
              placeholder="150.00"
            />
          </div>
        </div>

        {/* Footer actions — inline with the form so Enter submits and the
            sheet's own scroll container carries them, matching the
            EditGameModal pattern already used elsewhere on Modal. */}
        <div className="flex gap-3 pt-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={loading} className="flex-1">
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={loading || !formData.name || !formData.start_date}
            className="flex-1"
          >
            {loading ? (isEditing ? 'Saving...' : 'Creating...') : (isEditing ? 'Save Changes' : 'Create Camp')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
