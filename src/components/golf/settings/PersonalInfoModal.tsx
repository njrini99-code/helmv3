'use client';

import { useState, useEffect } from 'react';
import { useFocusTrap } from '@/hooks/use-focus-trap';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/ui/toast';
import { Modal } from '@/components/ui/modal';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { AvatarUpload } from '@/components/ui/avatar-upload';

interface PersonalInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentName: string;
  currentAvatarUrl?: string | null;
  role: 'coach' | 'player';
  onUpdate: () => void;
}

export function PersonalInfoModal({
  isOpen,
  onClose,
  currentName,
  currentAvatarUrl,
  role,
  onUpdate
}: PersonalInfoModalProps) {
  const { modalRef } = useFocusTrap(isOpen, onClose);
  const [loading, setLoading] = useState(false);
  const { showToast } = useToast();

  // Parse current name
  const nameParts = currentName.split(' ');
  const [firstName, setFirstName] = useState(role === 'player' ? nameParts[0] || '' : '');
  const [lastName, setLastName] = useState(role === 'player' ? nameParts.slice(1).join(' ') || '' : '');
  const [fullName, setFullName] = useState(role === 'coach' ? currentName : '');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(currentAvatarUrl || null);

  // Reset avatar when modal opens with new data
  useEffect(() => {
    setAvatarUrl(currentAvatarUrl || null);
  }, [currentAvatarUrl, isOpen]);

  async function handleSave() {
    setLoading(true);
    const supabase = createClient();

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      if (role === 'coach') {
        const { error } = await supabase
          .from('golf_coaches')
          .update({
            full_name: fullName.trim(),
            avatar_url: avatarUrl
          })
          .eq('user_id', user.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('golf_players')
          .update({
            first_name: firstName.trim(),
            last_name: lastName.trim(),
            avatar_url: avatarUrl
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
      <div ref={modalRef} role="dialog" aria-modal="true" aria-labelledby="modal-title" className="space-y-6">
        {/* Avatar Upload */}
        <div>
          <label className="block text-sm font-medium text-warm-700 mb-3">
            Profile Picture
          </label>
          <AvatarUpload
            currentAvatarUrl={avatarUrl}
            name={role === 'coach' ? fullName : `${firstName} ${lastName}`}
            onUploadComplete={(url) => setAvatarUrl(url)}
            onRemove={() => setAvatarUrl(null)}
          />
        </div>

        {/* Name Fields */}
        {role === 'coach' ? (
          <Input
            label="Full Name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="John Smith"
            autoComplete="name"
            enterKeyHint="done"
            required
          />
        ) : (
          <>
            <Input
              label="First Name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="John"
              autoComplete="given-name"
              enterKeyHint="next"
              required
            />
            <Input
              label="Last Name"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="Smith"
              autoComplete="family-name"
              enterKeyHint="done"
              required
            />
          </>
        )}

        <div className="flex justify-end gap-3 pt-4">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} isLoading={loading}>
            Save Changes
          </Button>
        </div>
      </div>
    </Modal>
  );
}
