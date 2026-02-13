'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { IconUsers } from '@/components/icons';

export default function JoinTeamPage() {
  const [code, setCode] = useState('');
  const router = useRouter();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = code.trim();
    if (trimmed) {
      router.push(`/golf/join/${trimmed}`);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAF6F1] flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white rounded-2xl border border-slate-200 p-8">
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <IconUsers size={32} className="text-green-600" />
          </div>
          <h1 className="text-xl font-semibold text-slate-900 mb-2">Join a Team</h1>
          <p className="text-slate-500 text-sm">
            Enter the invite code your coach gave you to join their team.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="e.g. ABC123"
            maxLength={10}
            className="w-full px-4 py-3 text-center text-lg font-mono tracking-widest border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent placeholder:text-slate-300 placeholder:tracking-normal placeholder:font-sans placeholder:text-base"
            autoFocus
          />
          <button
            type="submit"
            disabled={!code.trim()}
            className="w-full px-4 py-3 bg-green-600 text-white font-medium rounded-xl hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Join Team
          </button>
        </form>

        <p className="text-center text-xs text-slate-400 mt-4">
          Don&apos;t have a code? Ask your coach for the team invite code.
        </p>
      </div>
    </div>
  );
}
