'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Users, GraduationCap } from 'lucide-react';

type Role = 'player' | 'coach' | null;

export function BaseballSignUpForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [role, setRole] = useState<Role>(null);
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Get returnTo from URL params (e.g., /baseball/signup?returnTo=/baseball/join/ABC123)
  const returnTo = searchParams.get('returnTo');

  // Store returnTo in sessionStorage so it persists through signup and onboarding
  useEffect(() => {
    if (returnTo) {
      sessionStorage.setItem('baseball_signup_returnTo', returnTo);
    }
  }, [returnTo]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!role) {
      setError('Please select whether you are a player or coach');
      return;
    }

    if (formData.password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const supabase = createClient();

      const { error: signupError } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          data: {
            role: role,
            sport: 'baseball',
            first_name: formData.firstName,
            last_name: formData.lastName,
          },
        },
      });

      if (signupError) throw signupError;

      // Redirect to appropriate onboarding
      if (role === 'player') {
        router.push('/baseball/player');
      } else {
        router.push('/baseball/coach-onboarding');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Signup failed');
    } finally {
      setIsLoading(false);
    }
  }

  // Role selection view
  if (!role) {
    return (
      <div className="space-y-5">
        <p className="text-center text-warm-700 font-medium mb-4">I am a...</p>

        <button
          onClick={() => setRole('player')}
          type="button"
          className="
            w-full p-5
            border-2 border-warm-200
            rounded-[12px]
            hover:border-primary-600 hover:bg-primary-50/50
            transition-all duration-200
            flex items-center gap-4
            group
          "
        >
          <div className="p-3 bg-primary-100 rounded-[10px] group-hover:bg-primary-200 transition-colors">
            <GraduationCap className="w-7 h-7 text-primary-600" />
          </div>
          <div className="text-left flex-1">
            <h3 className="font-semibold text-base text-warm-900">Player</h3>
            <p className="text-sm text-warm-500 mt-0.5">
              High school, JUCO, or showcase player
            </p>
          </div>
        </button>

        <button
          onClick={() => setRole('coach')}
          type="button"
          className="
            w-full p-5
            border-2 border-warm-200
            rounded-[12px]
            hover:border-primary-600 hover:bg-primary-50/50
            transition-all duration-200
            flex items-center gap-4
            group
          "
        >
          <div className="p-3 bg-primary-100 rounded-[10px] group-hover:bg-primary-200 transition-colors">
            <Users className="w-7 h-7 text-primary-600" />
          </div>
          <div className="text-left flex-1">
            <h3 className="font-semibold text-base text-warm-900">Coach</h3>
            <p className="text-sm text-warm-500 mt-0.5">
              College, high school, JUCO, or showcase coach
            </p>
          </div>
        </button>
      </div>
    );
  }

  // Sign up form view
  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Back button */}
      <button
        type="button"
        onClick={() => {
          setRole(null);
          setError(null);
        }}
        className="text-sm text-warm-500 hover:text-warm-700 flex items-center gap-1 transition-colors"
      >
        ← Change role ({role})
      </button>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-[10px]">
          {error}
        </div>
      )}

      {/* Name fields - side by side */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-warm-700">
            First name
          </label>
          <input
            type="text"
            value={formData.firstName}
            onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
            placeholder="John"
            required
            className="
              w-full px-4 py-3
              bg-white border border-warm-200 rounded-[10px]
              text-warm-900 text-sm placeholder:text-warm-400
              transition-all duration-200
              focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-600/10
            "
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-warm-700">
            Last name
          </label>
          <input
            type="text"
            value={formData.lastName}
            onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
            placeholder="Doe"
            required
            className="
              w-full px-4 py-3
              bg-white border border-warm-200 rounded-[10px]
              text-warm-900 text-sm placeholder:text-warm-400
              transition-all duration-200
              focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-600/10
            "
          />
        </div>
      </div>

      {/* Email */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-warm-700">
          Email
        </label>
        <input
          type="email"
          value={formData.email}
          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
          placeholder="you@example.com"
          required
          className="
            w-full px-4 py-3
            bg-white border border-warm-200 rounded-[10px]
            text-warm-900 text-sm placeholder:text-warm-400
            transition-all duration-200
            focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-600/10
          "
        />
      </div>

      {/* Password */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-warm-700">
          Password
        </label>
        <input
          type="password"
          value={formData.password}
          onChange={(e) => setFormData({ ...formData, password: e.target.value })}
          placeholder="••••••••"
          required
          minLength={8}
          className="
            w-full px-4 py-3
            bg-white border border-warm-200 rounded-[10px]
            text-warm-900 text-sm placeholder:text-warm-400
            transition-all duration-200
            focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-600/10
          "
        />
        <p className="text-xs text-warm-400">
          Must be at least 8 characters
        </p>
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={isLoading}
        className="
          w-full py-3
          bg-primary-600 text-white font-medium text-sm
          rounded-[10px] shadow-sm
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
          'Create account'
        )}
      </button>

      {/* Divider */}
      <div className="flex items-center gap-4 my-6">
        <div className="flex-1 h-px bg-gradient-to-r from-transparent to-warm-200" />
        <span className="text-xs text-warm-400 font-medium">or</span>
        <div className="flex-1 h-px bg-gradient-to-l from-transparent to-warm-200" />
      </div>

      {/* Google SSO - placeholder */}
      <button
        type="button"
        disabled
        className="
          w-full py-3
          bg-white text-warm-700 font-medium text-sm
          rounded-[10px] border border-warm-200
          transition-all duration-200
          hover:bg-warm-50 hover:border-warm-300
          active:scale-[0.98]
          disabled:opacity-50 disabled:cursor-not-allowed
          flex items-center justify-center gap-3
        "
      >
        <svg className="w-5 h-5" viewBox="0 0 24 24">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
        </svg>
        Continue with Google
      </button>

      {/* Terms */}
      <p className="text-xs text-warm-400 text-center mt-4">
        By creating an account, you agree to our{' '}
        <Link href="/terms" className="text-warm-600 hover:underline">Terms</Link>
        {' '}and{' '}
        <Link href="/privacy" className="text-warm-600 hover:underline">Privacy Policy</Link>
      </p>
    </form>
  );
}
