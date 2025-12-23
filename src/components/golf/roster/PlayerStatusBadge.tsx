'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { updatePlayerStatus } from '@/app/golf/actions/golf';

interface PlayerStatusBadgeProps {
  playerId: string;
  currentStatus: string | null;
}

export function PlayerStatusBadge({ playerId, currentStatus }: PlayerStatusBadgeProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const statuses = [
    { value: 'active', label: 'Active', color: 'bg-green-100 text-green-700' },
    { value: 'injured', label: 'Injured', color: 'bg-red-100 text-red-700' },
    { value: 'redshirt', label: 'Redshirt', color: 'bg-amber-100 text-amber-700' },
    { value: 'inactive', label: 'Inactive', color: 'bg-slate-100 text-slate-600' },
  ];

  const currentStatusObj = statuses.find(s => s.value === currentStatus) || statuses[0]!;

  const handleStatusChange = async (newStatus: 'active' | 'injured' | 'redshirt' | 'inactive') => {
    setLoading(true);
    setIsOpen(false);

    try {
      await updatePlayerStatus(playerId, newStatus);
      router.refresh();
    } catch (err) {
      console.error('Failed to update status:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={loading}
        className={`px-2.5 py-1 text-xs font-medium rounded-full ${currentStatusObj.color} hover:opacity-80 transition-opacity disabled:opacity-50`}
      >
        {loading ? 'Updating...' : currentStatusObj.label}
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute right-0 mt-2 w-36 bg-white rounded-lg border border-slate-200 shadow-lg z-20 overflow-hidden">
            {statuses.map(status => (
              <button
                key={status.value}
                onClick={() => handleStatusChange(status.value as 'active' | 'injured' | 'redshirt' | 'inactive')}
                className={`w-full px-4 py-2 text-left text-sm hover:bg-slate-50 transition-colors ${
                  status.value === currentStatus ? 'bg-slate-50 font-medium' : ''
                }`}
              >
                {status.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
