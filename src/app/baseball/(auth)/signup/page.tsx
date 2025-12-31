'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { createClient } from '@/lib/supabase/client';
import { Users, GraduationCap } from 'lucide-react';

// Force dynamic rendering
export const dynamic = 'force-dynamic';

type Role = 'player' | 'coach' | null;

export default function SignupPage() {
  const router = useRouter();
  const [role, setRole] = useState<Role>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!role) {
      setError('Please select whether you are a player or coach');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const supabase = createClient();

      const { data, error: signupError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            role: role,
            sport: 'baseball',
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
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#FAF6F1] via-[#F5F1EC] to-[#EAE6E1] flex items-center justify-center p-4">
      <Card className="max-w-md w-full p-8 bg-white shadow-lg">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Create Account</h1>
          <p className="text-sm text-slate-600">Join Helm Sports Labs</p>
        </div>

        {/* Role Selection */}
        {!role ? (
          <div className="space-y-4">
            <p className="text-center text-slate-700 font-medium mb-6">I am a...</p>

            <button
              onClick={() => setRole('player')}
              className="w-full p-6 border-2 border-slate-200 rounded-xl hover:border-green-600 hover:bg-green-50 transition-all duration-200 flex items-center gap-4 group"
            >
              <div className="p-3 bg-green-100 rounded-lg group-hover:bg-green-200 transition-colors">
                <GraduationCap className="w-8 h-8 text-green-600" />
              </div>
              <div className="text-left flex-1">
                <h3 className="font-semibold text-lg text-slate-900">Player</h3>
                <p className="text-sm text-slate-600">
                  High school, JUCO, or showcase player looking to get recruited
                </p>
              </div>
            </button>

            <button
              onClick={() => setRole('coach')}
              className="w-full p-6 border-2 border-slate-200 rounded-xl hover:border-green-600 hover:bg-green-50 transition-all duration-200 flex items-center gap-4 group"
            >
              <div className="p-3 bg-green-100 rounded-lg group-hover:bg-green-200 transition-colors">
                <Users className="w-8 h-8 text-green-600" />
              </div>
              <div className="text-left flex-1">
                <h3 className="font-semibold text-lg text-slate-900">Coach</h3>
                <p className="text-sm text-slate-600">
                  College, high school, JUCO, or showcase coach/director
                </p>
              </div>
            </button>

            <div className="mt-6 pt-6 border-t border-slate-200 text-center">
              <p className="text-sm text-slate-600">
                Already have an account?{' '}
                <a href="/baseball/login" className="text-green-600 hover:text-green-700 font-medium">
                  Log in
                </a>
              </p>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSignup} className="space-y-4">
            {/* Back to role selection */}
            <button
              type="button"
              onClick={() => {
                setRole(null);
                setError(null);
              }}
              className="text-sm text-slate-600 hover:text-slate-900 flex items-center gap-1 mb-4"
            >
              ← Change role ({role})
            </button>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="you@example.com"
                className="w-full"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                placeholder="Min 8 characters"
                className="w-full"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Confirm Password</label>
              <Input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                className="w-full"
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            <Button
              type="submit"
              disabled={isLoading}
              className="w-full bg-green-600 hover:bg-green-700 text-white font-medium py-2.5"
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="inline-block h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Creating account...
                </span>
              ) : (
                'Create Account'
              )}
            </Button>

            <div className="pt-4 text-center">
              <p className="text-sm text-slate-600">
                Already have an account?{' '}
                <a href="/baseball/login" className="text-green-600 hover:text-green-700 font-medium">
                  Log in
                </a>
              </p>
            </div>
          </form>
        )}
      </Card>
    </div>
  );
}
