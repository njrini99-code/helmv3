'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { loginAction } from '@/app/golf/actions/auth';
import { Input } from '@/components/ui/input';

export function GolfSignInForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const result = await loginAction(email, password);

      if (!result.success) {
        setError(result.error || 'Login failed');
        setIsLoading(false);
        return;
      }

      router.push(result.redirectTo || '/golf/dashboard');
      router.refresh();
    } catch {
      setError('An unexpected error occurred. Please try again.');
      setIsLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Error message */}
      {error && (
        <div className="
          bg-red-50 border border-red-200
          text-red-700 text-sm
          px-4 py-3 rounded-[10px]
        ">
          {error}
        </div>
      )}

      {/* Email */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-warm-700">
          Email
        </label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          required
          autoFocus
          className="
            w-full px-4 py-3
            bg-white
            border border-warm-200
            rounded-[10px]
            text-warm-900 text-sm
            placeholder:text-warm-400
            transition-all duration-200
            focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-600/10
          "
        />
      </div>

      {/* Password */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-warm-700">
            Password
          </label>
          <Link
            href="/golf/forgot-password"
            className="text-xs text-primary-600 hover:text-primary-700 transition-colors"
          >
            Forgot password?
          </Link>
        </div>
        <Input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Enter your password"
          required
        />
      </div>

      {/* Submit button */}
      <button
        type="submit"
        disabled={isLoading}
        className="
          w-full py-3
          bg-primary-600 text-white
          font-medium text-sm
          rounded-[10px]
          shadow-sm
          transition-all duration-200
          hover:bg-primary-700 hover:shadow-md
          active:scale-[0.98]
          disabled:opacity-50 disabled:cursor-not-allowed
          flex items-center justify-center
        "
      >
        {isLoading ? (
          <div className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 bg-white rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
            <span className="w-1.5 h-1.5 bg-white rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
            <span className="w-1.5 h-1.5 bg-white rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
        ) : (
          'Sign in'
        )}
      </button>
    </form>
  );
}
