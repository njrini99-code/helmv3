'use client';

import { useState, useEffect } from 'react';
import { useToast } from '@/components/ui/toast';
import { Modal } from '@/components/ui/modal';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

interface LocationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function LocationModal({ isOpen, onClose }: LocationModalProps) {
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
      {loadingData ? (
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin h-6 w-6 border-2 border-emerald-600 border-t-transparent rounded-full" />
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

          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm text-slate-600">
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
    </Modal>
  );
}
