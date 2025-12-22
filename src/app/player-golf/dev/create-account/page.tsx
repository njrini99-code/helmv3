'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { IconCheck, IconX } from '@/components/icons';

export default function CreateDevAccountPage() {
  const [creating, setCreating] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const supabase = createClient();

  const testEmail = 'test@golfhelm.com';
  const testPassword = 'TestGolf123!';

  const quickSignIn = async () => {
    setCreating(true);
    setError(null);

    try {
      console.log('Quick sign in...');
      const { data, error } = await supabase.auth.signInWithPassword({
        email: testEmail,
        password: testPassword,
      });

      if (error) {
        throw new Error(`Sign in failed: ${error.message}. Try creating the account first.`);
      }

      console.log('Signed in successfully');
      setSuccess(true);

      setTimeout(() => {
        router.push('/player-golf/dev');
        router.refresh();
      }, 1000);
    } catch (err) {
      console.error('Quick sign in error:', err);
      setError((err as Error).message);
      setCreating(false);
    }
  };

  const createTestAccount = async () => {
    setCreating(true);
    setError(null);

    try {
      // Step 1: Sign up the user
      console.log('Creating auth user...');
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: testEmail,
        password: testPassword,
        options: {
          emailRedirectTo: `${window.location.origin}/player-golf`,
          data: {
            full_name: 'Test Golfer',
          },
        },
      });

      console.log('Signup result:', { authData, authError });

      if (authError) {
        // If user already exists, try to sign in instead
        if (authError.message.includes('already registered')) {
          console.log('User already exists, signing in...');
          const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
            email: testEmail,
            password: testPassword,
          });

          if (signInError) {
            throw new Error(`Account exists but login failed: ${signInError.message}`);
          }

          if (!signInData.user) {
            throw new Error('Login failed - no user returned');
          }

          // Check if golf_player exists
          const { data: existingPlayer } = await supabase
            .from('golf_players')
            .select('*')
            .eq('user_id', signInData.user.id)
            .single();

          if (existingPlayer) {
            console.log('Golf player already exists, redirecting...');
            setSuccess(true);
            setTimeout(() => {
              router.push('/player-golf/dev');
              router.refresh();
            }, 2000);
            return;
          }

          // Create golf_player for existing user
          console.log('Creating golf player profile...');
          const { error: playerError } = await supabase
            .from('golf_players')
            .insert({
              user_id: signInData.user.id,
              first_name: 'Test',
              last_name: 'Golfer',
              email: testEmail,
              handicap_index: 10.5,
            });

          if (playerError) {
            throw new Error(`Failed to create player profile: ${playerError.message}`);
          }

          setSuccess(true);
          setTimeout(() => {
            router.push('/player-golf/dev');
            router.refresh();
          }, 2000);
          return;
        }

        throw authError;
      }

      if (!authData.user) {
        throw new Error('User creation failed - no user returned');
      }

      console.log('Auth user created:', authData.user.id);

      // Step 2: Create golf_player profile
      console.log('Creating golf player profile...');

      // First check if player already exists
      const { data: existingPlayer } = await supabase
        .from('golf_players')
        .select('*')
        .eq('user_id', authData.user.id)
        .single();

      if (!existingPlayer) {
        const { error: playerError } = await supabase
          .from('golf_players')
          .insert({
            user_id: authData.user.id,
            first_name: 'Test',
            last_name: 'Golfer',
            email: testEmail,
            handicap_index: 10.5,
          });

        if (playerError) {
          console.error('Player creation error:', playerError);
          throw new Error(`Failed to create player profile: ${playerError.message}`);
        }

        console.log('Golf player profile created');
      } else {
        console.log('Golf player profile already exists');
      }

      // Success!
      setSuccess(true);

      // Redirect to dev page after 2 seconds
      setTimeout(() => {
        router.push('/player-golf/dev');
        router.refresh();
      }, 2000);

    } catch (err) {
      console.error('Error creating test account:', err);
      setError((err as Error).message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAF6F1] flex items-center justify-center p-6">
      <div className="max-w-lg w-full">
        <Card>
          <CardContent className="p-8">
            <div className="text-center mb-6">
              <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                <span className="text-3xl">🏌️</span>
              </div>
              <h1 className="text-2xl font-semibold text-slate-900 mb-2">
                Golf Dev Testing
              </h1>
              <p className="text-sm text-slate-500">
                Choose how you want to test the golf features
              </p>
            </div>

            {/* Skip Auth Option - Highlighted */}
            <div className="mb-6 p-4 bg-green-50 border-2 border-green-200 rounded-xl">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-lg">⚡</span>
                <h3 className="font-semibold text-green-900">Recommended: Skip Auth</h3>
              </div>
              <p className="text-sm text-green-700 mb-3">
                Test all features immediately without creating an account. Perfect for quick testing!
              </p>
              <Button
                onClick={() => router.push('/player-golf/dev-start')}
                className="w-full bg-green-600 hover:bg-green-700"
                size="lg"
              >
                🚀 Skip Auth & Start Testing
              </Button>
            </div>

            <div className="relative mb-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-200"></div>
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-white px-3 text-slate-500">OR CREATE ACCOUNT</span>
              </div>
            </div>

            {!success && !error && (
              <div className="space-y-6">
                <div className="bg-slate-50 rounded-lg p-4 space-y-2">
                  <div className="flex items-start gap-3">
                    <div className="w-5 h-5 rounded-full bg-green-600 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-white text-xs font-bold">1</span>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-900">Create Test User</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Email: {testEmail}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-5 h-5 rounded-full bg-green-600 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-white text-xs font-bold">2</span>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-900">Create Golf Player Profile</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Sets up all required database records
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-5 h-5 rounded-full bg-green-600 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-white text-xs font-bold">3</span>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-900">Auto Sign In</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Automatically logs you in and redirects to Dev Mode
                      </p>
                    </div>
                  </div>
                </div>

                <Button
                  onClick={createTestAccount}
                  loading={creating}
                  className="w-full"
                  size="lg"
                >
                  {creating ? 'Creating Account...' : 'Create Test Account & Sign In'}
                </Button>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-slate-200"></div>
                  </div>
                  <div className="relative flex justify-center text-xs">
                    <span className="bg-white px-2 text-slate-500">OR</span>
                  </div>
                </div>

                <Button
                  onClick={quickSignIn}
                  loading={creating}
                  variant="secondary"
                  className="w-full"
                  size="lg"
                >
                  {creating ? 'Signing In...' : 'Quick Sign In (if account exists)'}
                </Button>

                <div className="text-center">
                  <Button
                    variant="secondary"
                    onClick={() => router.push('/player-golf/dev')}
                    disabled={creating}
                    size="sm"
                  >
                    ← Back to Dev Mode
                  </Button>
                </div>
              </div>
            )}

            {success && (
              <div className="text-center space-y-4">
                <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto">
                  <IconCheck className="text-green-600" size={32} />
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-slate-900 mb-2">
                    Account Created Successfully!
                  </h2>
                  <p className="text-sm text-slate-600">
                    You're now signed in as <strong>{testEmail}</strong>
                  </p>
                  <p className="text-xs text-slate-500 mt-2">
                    Redirecting to Dev Mode...
                  </p>
                </div>
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <p className="text-sm font-medium text-green-900 mb-2">Test Credentials</p>
                  <div className="text-xs text-green-700 space-y-1 font-mono">
                    <p>Email: {testEmail}</p>
                    <p>Password: {testPassword}</p>
                  </div>
                </div>
              </div>
            )}

            {error && (
              <div className="space-y-4">
                <div className="text-center">
                  <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
                    <IconX className="text-red-600" size={32} />
                  </div>
                  <h2 className="text-xl font-semibold text-slate-900 mb-2">
                    Error Creating Account
                  </h2>
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                    <p className="text-sm text-red-700">{error}</p>
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <Button onClick={createTestAccount} loading={creating}>
                    Try Again
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => router.push('/player-golf/dev')}
                  >
                    ← Back to Dev Mode
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {!success && (
          <div className="mt-6 text-center">
            <p className="text-xs text-slate-500">
              💡 This is a dev-only feature. The account will work for all golf features.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
