'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/ui/toast';
import { IconX } from '@/components/icons';
import { Modal } from '@/components/ui/modal';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

interface PersonalInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentName: string;
  role: 'coach' | 'player';
  onUpdate: () => void;
}

export function PersonalInfoModal({ isOpen, onClose, currentName, role, onUpdate }: PersonalInfoModalProps) {
  const [loading, setLoading] = useState(false);
  const { showToast } = useToast();

  // Parse current name
  const nameParts = currentName.split(' ');
  const [firstName, setFirstName] = useState(role === 'player' ? nameParts[0] || '' : '');
  const [lastName, setLastName] = useState(role === 'player' ? nameParts.slice(1).join(' ') || '' : '');
  const [fullName, setFullName] = useState(role === 'coach' ? currentName : '');

  async function handleSave() {
    setLoading(true);
    const supabase = createClient();

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      if (role === 'coach') {
        const { error } = await supabase
          .from('golf_coaches')
          .update({ full_name: fullName.trim() })
          .eq('user_id', user.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('golf_players')
          .update({
            first_name: firstName.trim(),
            last_name: lastName.trim()
          })
          .eq('user_id', user.id);

        if (error) throw error;
      }

      showToast('Profile updated successfully', 'success');
      onUpdate();
      onClose();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to update profile', 'error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Personal Information">
      <div className="space-y-4">
        {role === 'coach' ? (
          <Input
            label="Full Name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="John Smith"
            required
          />
        ) : (
          <>
            <Input
              label="First Name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="John"
              required
            />
            <Input
              label="Last Name"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="Smith"
              required
            />
          </>
        )}

        <div className="flex justify-end gap-3 pt-4">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} loading={loading}>
            Save Changes
          </Button>
        </div>
      </div>
    </Modal>
  );
}
