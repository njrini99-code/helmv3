'use client';

import { useState } from 'react';
import { X, RefreshCw, Calendar, CheckCircle2, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SyncDirection } from '@/lib/types/calendar';

interface SyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  googleConnected?: boolean;
  appleConnected?: boolean;
  onConnectGoogle?: () => Promise<void>;
  onConnectApple?: () => Promise<void>;
  onDisconnectGoogle?: () => Promise<void>;
  onDisconnectApple?: () => Promise<void>;
  onSync?: () => Promise<void>;
}

export function SyncModal({
  isOpen,
  onClose,
  googleConnected = false,
  appleConnected = false,
  onConnectGoogle,
  onConnectApple,
  onDisconnectGoogle,
  onDisconnectApple,
  onSync,
}: SyncModalProps) {
  const [syncing, setSyncing] = useState(false);
  const [googleDirection, setGoogleDirection] = useState<SyncDirection>('both');
  const [appleDirection, setAppleDirection] = useState<SyncDirection>('both');

  if (!isOpen) return null;

  async function handleSync() {
    if (!onSync) return;
    setSyncing(true);
    try {
      await onSync();
    } catch (error) {
      console.error('Sync failed:', error);
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-warm-900/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg mx-4 bg-white/95 backdrop-blur-xl rounded-[24px] shadow-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-warm-100">
          <div className="flex items-center gap-2">
            <RefreshCw className="w-5 h-5 text-primary-600" />
            <h2 className="text-lg font-semibold text-warm-900">Calendar Sync</h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-warm-400 hover:bg-warm-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-4 space-y-6">
          {/* Google Calendar */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                  <Calendar className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <h3 className="font-medium text-warm-900">Google Calendar</h3>
                  <p className="text-xs text-warm-500">
                    {googleConnected ? 'Connected' : 'Not connected'}
                  </p>
                </div>
              </div>

              {googleConnected ? (
                <CheckCircle2 className="w-5 h-5 text-primary-600" />
              ) : (
                <AlertCircle className="w-5 h-5 text-warm-400" />
              )}
            </div>

            {googleConnected ? (
              <div className="space-y-3 pl-13">
                {/* Sync Direction */}
                <div>
                  <label className="block text-sm font-medium text-warm-700 mb-1.5">
                    Sync Direction
                  </label>
                  <select
                    value={googleDirection}
                    onChange={(e) => setGoogleDirection(e.target.value as SyncDirection)}
                    className="w-full px-3 py-2 rounded-lg border border-warm-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 text-warm-900 bg-white text-sm"
                  >
                    <option value="both">Two-way sync</option>
                    <option value="push">Helm → Google</option>
                    <option value="pull">Google → Helm</option>
                  </select>
                </div>

                <button
                  onClick={onDisconnectGoogle}
                  className="text-sm text-red-600 hover:text-red-700 font-medium"
                >
                  Disconnect
                </button>
              </div>
            ) : (
              <button
                onClick={onConnectGoogle}
                className="w-full px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium transition-colors text-sm"
              >
                Connect Google Calendar
              </button>
            )}
          </div>

          {/* Apple Calendar */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center">
                  <Calendar className="w-5 h-5 text-slate-600" />
                </div>
                <div>
                  <h3 className="font-medium text-warm-900">Apple Calendar</h3>
                  <p className="text-xs text-warm-500">
                    {appleConnected ? 'Connected' : 'Not connected'}
                  </p>
                </div>
              </div>

              {appleConnected ? (
                <CheckCircle2 className="w-5 h-5 text-primary-600" />
              ) : (
                <AlertCircle className="w-5 h-5 text-warm-400" />
              )}
            </div>

            {appleConnected ? (
              <div className="space-y-3 pl-13">
                {/* Sync Direction */}
                <div>
                  <label className="block text-sm font-medium text-warm-700 mb-1.5">
                    Sync Direction
                  </label>
                  <select
                    value={appleDirection}
                    onChange={(e) => setAppleDirection(e.target.value as SyncDirection)}
                    className="w-full px-3 py-2 rounded-lg border border-warm-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 text-warm-900 bg-white text-sm"
                  >
                    <option value="both">Two-way sync</option>
                    <option value="push">Helm → Apple</option>
                    <option value="pull">Apple → Helm</option>
                  </select>
                </div>

                <button
                  onClick={onDisconnectApple}
                  className="text-sm text-red-600 hover:text-red-700 font-medium"
                >
                  Disconnect
                </button>
              </div>
            ) : (
              <button
                onClick={onConnectApple}
                className="w-full px-4 py-2 rounded-lg bg-slate-600 hover:bg-slate-700 text-white font-medium transition-colors text-sm"
              >
                Connect Apple Calendar
              </button>
            )}
          </div>

          {/* Manual Sync */}
          {(googleConnected || appleConnected) && (
            <div className="pt-4 border-t border-warm-100">
              <button
                onClick={handleSync}
                disabled={syncing}
                className={cn(
                  'w-full px-4 py-2.5 rounded-lg font-medium transition-colors',
                  'bg-primary-600 hover:bg-primary-700 text-white',
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                  'flex items-center justify-center gap-2'
                )}
              >
                <RefreshCw className={cn('w-4 h-4', syncing && 'animate-spin')} />
                {syncing ? 'Syncing...' : 'Sync Now'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
