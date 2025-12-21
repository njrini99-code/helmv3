'use client';

import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { GOLF_DEV_ACCOUNTS, type GolfDevAccountType, isGolfDevMode } from '@/lib/golf-dev-mode';
import { useGolfAuthStore } from '@/stores/golf-auth-store';
import { IconUser, IconShield, IconGolf } from '@/components/icons';

export default function GolfDevModePage() {
  const router = useRouter();
  const { setDevUser } = useGolfAuthStore();

  if (!isGolfDevMode()) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAF6F1]">
        <Card>
          <CardContent className="p-12 text-center">
            <h1 className="text-2xl font-semibold text-slate-900 mb-2">Dev Mode Disabled</h1>
            <p className="text-sm text-slate-500">Dev mode is only available in development.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleLogin = (accountType: GolfDevAccountType) => {
    const account = GOLF_DEV_ACCOUNTS[accountType];

    // Set user in golf auth store
    setDevUser({
      id: account.id,
      email: account.email,
      role: account.role,
    });

    // Redirect to golf dashboard
    router.push('/golf/dashboard');
  };

  const coachAccounts: GolfDevAccountType[] = ['golf-coach'];
  const playerAccounts: GolfDevAccountType[] = ['golf-player-1', 'golf-player-2', 'golf-player-3'];

  return (
    <div className="min-h-screen bg-[#FAF6F1] py-12">
      <div className="max-w-5xl mx-auto px-6">
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-green-100 text-green-700 text-sm font-medium mb-4">
            <IconGolf size={16} />
            Golf Dev Mode Active
          </div>
          <h1 className="text-3xl font-bold text-slate-900 mb-2">
            GolfHelm Quick Access
          </h1>
          <p className="text-slate-500">
            Select an account to instantly access the golf dashboard without authentication
          </p>
        </div>

        {/* Coach Account */}
        <div className="mb-10">
          <h2 className="text-xl font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <IconShield size={20} className="text-green-600" />
            Coach Dashboard
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {coachAccounts.map((accountType) => {
              const account = GOLF_DEV_ACCOUNTS[accountType];
              const profile = 'coachProfile' in account ? account.coachProfile : null;

              return (
                <Card key={accountType} className="hover:shadow-lg transition-shadow">
                  <CardContent className="p-6">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                        <IconShield size={24} className="text-green-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-slate-900 mb-1">
                          {profile?.full_name}
                        </h3>
                        <p className="text-sm text-slate-600 mb-1">
                          {profile?.organization?.name}
                        </p>
                        <p className="text-xs text-slate-500 mb-3">
                          {profile?.title} • {profile?.team?.name}
                        </p>
                        <Button
                          onClick={() => handleLogin(accountType)}
                          variant="primary"
                          className="w-full"
                        >
                          Access Coach Dashboard
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>

        {/* Player Accounts */}
        <div>
          <h2 className="text-xl font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <IconUser size={20} className="text-blue-600" />
            Player Dashboards
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {playerAccounts.map((accountType) => {
              const account = GOLF_DEV_ACCOUNTS[accountType];
              const profile = 'playerProfile' in account ? account.playerProfile : null;

              return (
                <Card key={accountType} className="hover:shadow-lg transition-shadow">
                  <CardContent className="p-6">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                        <IconUser size={24} className="text-blue-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-slate-900 mb-1">
                          {profile?.first_name} {profile?.last_name}
                        </h3>
                        <p className="text-sm text-slate-600 mb-1">
                          {profile?.year?.charAt(0).toUpperCase()}{profile?.year?.slice(1)} • {profile?.handicap} HCP
                        </p>
                        <p className="text-xs text-slate-500 mb-3">
                          {profile?.major} • {profile?.hometown}, {profile?.state}
                        </p>
                        <Button
                          onClick={() => handleLogin(accountType)}
                          variant="secondary"
                          className="w-full"
                        >
                          Access Dashboard
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>

        <div className="mt-12 text-center">
          <p className="text-sm text-slate-500">
            All features work with these dev accounts.
            <br />
            No authentication required - instant access to golf dashboards.
          </p>
        </div>
      </div>
    </div>
  );
}
