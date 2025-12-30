'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/ui/toast';
import { Modal } from '@/components/ui/modal';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

interface EmailModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentEmail: string;
  onUpdate: () => void;
}

export function EmailModal({ isOpen, onClose, currentEmail, onUpdate }: EmailModalProps) {
  const [loading, setLoading] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const { showToast } = useToast();

  async function handleUpdateEmail() {
    if (!newEmail.trim() || !newEmail.includes('@')) {
      showToast('Please enter a valid email address', 'error');
      return;
    }

    if (newEmail === currentEmail) {
      showToast('New email is the same as current email', 'error');
      return;
    }

    setLoading(true);
    const supabase = createClient();

    try {
      const { error } = await supabase.auth.updateUser({
        email: newEmail.trim()
      });

      if (error) throw error;

      showToast('Confirmation email sent. Please check your inbox.', 'success');
      setNewEmail('');
      onUpdate();
      onClose();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to update email', 'error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Change Email Address">
      <div className="space-y-4">
        <div>
          <label className="text-sm font-medium text-slate-700 block mb-1">
            Current Email
          </label>
          <div className="px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-600">
            {currentEmail}
          </div>
        </div>

        <Input
          label="New Email Address"
          type="email"
          value={newEmail}
          onChange={(e) => setNewEmail(e.target.value)}
          placeholder="newemail@example.com"
          required
        />

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-700">
          <p className="font-medium mb-1">Email Change Process:</p>
          <ul className="text-xs space-y-0.5 ml-4 list-disc">
            <li>We'll send a confirmation email to your new address</li>
            <li>Click the link in the email to confirm the change</li>
            <li>Your email will be updated once confirmed</li>
          </ul>
        </div>

        <div className="flex justify-end gap-3 pt-4">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleUpdateEmail} loading={loading}>
            Send Confirmation
          </Button>
        </div>
      </div>
    </Modal>
  );
}
