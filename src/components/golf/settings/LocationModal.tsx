'use client';

import { useState, useEffect } from 'react';
import { useFocusTrap } from '@/hooks/use-focus-trap';
import { useToast } from '@/components/ui/toast';
import { Modal } from '@/components/ui/modal';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

interface LocationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function LocationModal({ isOpen, onClose }: LocationModalProps) {
  const { modalRef } = useFocusTrap(isOpen, onClose);
  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [defaultCourse, setDefaultCourse] = useState('');
  const [defaultCity, setDefaultCity] = useState('');
  const [defaultState, setDefaultState] = useState('');
  const { showToast } = useToast();

  useEffect(() => {
    if (isOpen) {
      loadLocationPreferences();
    }
  }, [isOpen]);

  async function loadLocationPreferences() {
    setLoadingData(true);
    try {
      const stored = localStorage.getItem('golf_location_preferences');
      if (stored) {
        const prefs = JSON.parse(stored);
        setDefaultCourse(prefs.default_course || '');
        setDefaultCity(prefs.default_city || '');
        setDefaultState(prefs.default_state || '');
      }
    } catch {
      // Use defaults if no preferences exist
    } finally {
      setLoadingData(false);
    }
  }

  async function handleSave() {
    setLoading(true);

    try {
      const prefs = {
        default_course: defaultCourse.trim(),
        default_city: defaultCity.trim(),
        default_state: defaultState.trim(),
      };
      localStorage.setItem('golf_location_preferences', JSON.stringify(prefs));

      showToast('Location preferences updated', 'success');
      onClose();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to update preferences', 'error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Location Settings">
      <div ref={modalRef} role="dialog" aria-modal="true" aria-labelledby="modal-title">
      {loadingData ? (
        <div className="flex items-center justify-center py-8">
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-primary-600 skeleton-shimmer" style={{ animationDelay: '0ms' }} />
            <span className="w-1.5 h-1.5 rounded-full bg-primary-600 skeleton-shimmer" style={{ animationDelay: '150ms' }} />
            <span className="w-1.5 h-1.5 rounded-full bg-primary-600 skeleton-shimmer" style={{ animationDelay: '300ms' }} />
          </span>
        </div>
      ) : (
        <div className="space-y-4">
          <Input
            label="Default Course"
            value={defaultCourse}
            onChange={(e) => setDefaultCourse(e.target.value)}
            placeholder="Pebble Beach Golf Links"
          />
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Default City"
              value={defaultCity}
              onChange={(e) => setDefaultCity(e.target.value)}
              placeholder="Pebble Beach"
            />
            <Input
              label="Default State"
              value={defaultState}
              onChange={(e) => setDefaultState(e.target.value)}
              placeholder="CA"
              maxLength={2}
            />
          </div>

          <div className="bg-warm-50 border border-warm-200 rounded-lg p-3 text-sm text-warm-600">
            <p className="text-xs">
              These defaults will be pre-filled when creating new rounds or tracking shots.
            </p>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={handleSave} isLoading={loading}>
              Save Preferences
            </Button>
          </div>
        </div>
      )}
      </div>
    </Modal>
  );
}
