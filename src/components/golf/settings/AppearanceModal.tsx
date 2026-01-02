'use client';

import { useState, useEffect } from 'react';
import { useToast } from '@/components/ui/toast';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface AppearanceModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type DisplayDensity = 'comfortable' | 'compact';
type DateFormat = 'MM/DD/YYYY' | 'DD/MM/YYYY' | 'YYYY-MM-DD';

export function AppearanceModal({ isOpen, onClose }: AppearanceModalProps) {
  const [loading, setLoading] = useState(false);
  const [loadingPrefs, setLoadingPrefs] = useState(true);
  const [density, setDensity] = useState<DisplayDensity>('comfortable');
  const [dateFormat, setDateFormat] = useState<DateFormat>('MM/DD/YYYY');
  const [showAnimations, setShowAnimations] = useState(true);
  const { showToast } = useToast();

  useEffect(() => {
    if (isOpen) {
      loadPreferences();
    }
  }, [isOpen]);

  async function loadPreferences() {
    setLoadingPrefs(true);
    try {
      const stored = localStorage.getItem('golf_appearance_preferences');
      if (stored) {
        const prefs = JSON.parse(stored);
        setDensity(prefs.display_density || 'comfortable');
        setDateFormat(prefs.date_format || 'MM/DD/YYYY');
        setShowAnimations(prefs.show_animations ?? true);
      }
    } catch (error) {
      // Use defaults if no preferences exist
    } finally {
      setLoadingPrefs(false);
    }
  }

  async function handleSave() {
    setLoading(true);

    try {
      const prefs = {
        display_density: density,
        date_format: dateFormat,
        show_animations: showAnimations,
      };
      localStorage.setItem('golf_appearance_preferences', JSON.stringify(prefs));

      showToast('Appearance preferences updated', 'success');
      onClose();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to update preferences', 'error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Appearance">
      {loadingPrefs ? (
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin h-6 w-6 border-2 border-emerald-600 border-t-transparent rounded-full" />
        </div>
      ) : (
        <div className="space-y-6">
          <div>
            <h3 className="text-sm font-semibold text-slate-700 mb-3">Display Density</h3>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setDensity('comfortable')}
                className={cn(
                  'p-4 rounded-lg border-2 text-left transition-all',
                  density === 'comfortable'
                    ? 'border-emerald-600 bg-emerald-50'
                    : 'border-slate-200 hover:border-slate-300'
                )}
              >
                <p className="font-medium text-slate-900">Comfortable</p>
                <p className="text-xs text-slate-500 mt-0.5">More spacing, easier to scan</p>
              </button>
              <button
                onClick={() => setDensity('compact')}
                className={cn(
                  'p-4 rounded-lg border-2 text-left transition-all',
                  density === 'compact'
                    ? 'border-emerald-600 bg-emerald-50'
                    : 'border-slate-200 hover:border-slate-300'
                )}
              >
                <p className="font-medium text-slate-900">Compact</p>
                <p className="text-xs text-slate-500 mt-0.5">Less spacing, more content</p>
              </button>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-slate-700 mb-3">Date Format</h3>
            <div className="space-y-2">
              {(['MM/DD/YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD'] as DateFormat[]).map((format) => (
                <button
                  key={format}
                  onClick={() => setDateFormat(format)}
                  className={cn(
                    'w-full p-3 rounded-lg border-2 text-left transition-all flex items-center justify-between',
                    dateFormat === format
                      ? 'border-emerald-600 bg-emerald-50'
                      : 'border-slate-200 hover:border-slate-300'
                  )}
                >
                  <span className="font-medium text-slate-900">{format}</span>
                  <span className="text-sm text-slate-500">
                    {format === 'MM/DD/YYYY' && '12/28/2024'}
                    {format === 'DD/MM/YYYY' && '28/12/2024'}
                    {format === 'YYYY-MM-DD' && '2024-12-28'}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <button
              onClick={() => setShowAnimations(!showAnimations)}
              className="w-full flex items-center justify-between p-3 rounded-lg hover:bg-slate-50 transition-colors"
            >
              <div className="text-left">
                <p className="text-sm font-medium text-slate-900">Animations</p>
                <p className="text-xs text-slate-500">Enable smooth transitions and effects</p>
              </div>
              <div className={cn(
                'w-11 h-6 rounded-full transition-colors relative flex-shrink-0',
                showAnimations ? 'bg-emerald-600' : 'bg-slate-200'
              )}>
                <div className={cn(
                  'absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform',
                  showAnimations && 'transform translate-x-5'
                )} />
              </div>
            </button>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
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
