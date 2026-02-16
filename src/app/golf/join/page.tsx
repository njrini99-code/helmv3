'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { IconUsers } from '@/components/icons';

export default function JoinTeamPage() {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const trimmed = code.trim();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!trimmed) {
      setError('Please enter an invite code.');
      return;
    }

    if (trimmed.length < 4) {
      setError('Invite code must be at least 4 characters.');
      return;
    }

    router.push(`/golf/join/${trimmed}`);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCode(e.target.value.toUpperCase());
    if (error) setError(null);
  };

  return (
    <div className="min-h-screen bg-cream flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white rounded-2xl border border-warm-200 p-8">
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-primary-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <IconUsers size={32} className="text-primary-600" />
          </div>
          <h1 className="text-xl font-semibold text-warm-900 mb-2">Join a Team</h1>
          <p className="text-warm-500 text-sm">
            Enter the invite code your coach gave you to join their team.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <input
              type="text"
              value={code}
              onChange={handleChange}
              placeholder="e.g. ABC123"
              maxLength={10}
              aria-describedby={error ? 'invite-code-error' : 'invite-code-hint'}
              aria-invalid={error ? true : undefined}
              className={`w-full px-4 py-3 text-center text-lg font-mono tracking-widest border rounded-xl focus:outline-none focus:ring-2 focus:border-transparent placeholder:text-warm-300 placeholder:tracking-normal placeholder:font-sans placeholder:text-base transition-colors ${
                error
                  ? 'border-red-400 focus:ring-red-200'
                  : 'border-warm-200 focus:ring-primary-500'
              }`}
              autoFocus
            />
            {error ? (
              <p id="invite-code-error" role="alert" className="mt-2 text-sm text-red-600 text-center">
                {error}
              </p>
            ) : (
              <p id="invite-code-hint" className="mt-2 text-xs text-warm-400 text-center">
                {trimmed.length > 0
                  ? `${trimmed.length} / 10 characters`
                  : '4\u201310 characters, letters and numbers'}
              </p>
            )}
          </div>
          <button
            type="submit"
            disabled={!trimmed}
            className="w-full px-4 py-3 bg-primary-600 text-white font-medium rounded-xl hover:bg-primary-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Join Team
          </button>
        </form>

        <p className="text-center text-xs text-warm-400 mt-4">
          Don&apos;t have a code? Ask your coach for the team invite code.
        </p>
      </div>
    </div>
  );
}
