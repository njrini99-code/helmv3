'use client';

import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { IconGolf, IconCheck } from '@/components/icons';

export default function DevStartPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-[#FAF6F1] flex items-center justify-center p-6">
      <div className="max-w-2xl w-full">
        <Card>
          <CardContent className="p-8">
            <div className="text-center mb-8">
              <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                <IconGolf className="text-green-600" size={40} />
              </div>
              <h1 className="text-3xl font-semibold text-slate-900 mb-3">
                🚀 Dev Mode Ready!
              </h1>
              <p className="text-lg text-slate-600">
                Full shot tracking access - No authentication required
              </p>
            </div>

            <div className="bg-green-50 border-2 border-green-200 rounded-xl p-6 mb-8">
              <div className="flex items-start gap-3 mb-4">
                <IconCheck className="text-green-600 flex-shrink-0 mt-1" size={24} />
                <div>
                  <h3 className="font-semibold text-green-900 mb-1">Auth Bypassed</h3>
                  <p className="text-sm text-green-700">
                    All features work without logging in. A test player is automatically created for you.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <IconCheck className="text-green-600 flex-shrink-0 mt-1" size={24} />
                <div>
                  <h3 className="font-semibold text-green-900 mb-1">Full Access</h3>
                  <p className="text-sm text-green-700">
                    Create rounds, track shots, test all features including miss directions, putting breaks, and club selection.
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-4 mb-8">
              <h2 className="text-lg font-semibold text-slate-900">Quick Start:</h2>

              <div className="flex gap-3 items-start">
                <span className="w-7 h-7 rounded-full bg-green-600 text-white flex items-center justify-center text-sm font-bold flex-shrink-0">1</span>
                <div>
                  <p className="font-medium text-slate-900">Start New Round</p>
                  <p className="text-sm text-slate-600">Go through the 8-step wizard to set up your course</p>
                </div>
              </div>

              <div className="flex gap-3 items-start">
                <span className="w-7 h-7 rounded-full bg-green-600 text-white flex items-center justify-center text-sm font-bold flex-shrink-0">2</span>
                <div>
                  <p className="font-medium text-slate-900">Track Your Shots</p>
                  <p className="text-sm text-slate-600">
                    Test all shot types: Tee (with driver selection), Approach, Around the green, Putting (with break/slope)
                  </p>
                </div>
              </div>

              <div className="flex gap-3 items-start">
                <span className="w-7 h-7 rounded-full bg-green-600 text-white flex items-center justify-center text-sm font-bold flex-shrink-0">3</span>
                <div>
                  <p className="font-medium text-slate-900">Test Miss Directions</p>
                  <p className="text-sm text-slate-600">
                    Try different results (Rough, Sand, Other) to see miss direction selectors
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <Button
                onClick={() => router.push('/player-golf/round/new')}
                className="w-full bg-green-600 hover:bg-green-700"
                size="lg"
              >
                🏌️ Start New Round
              </Button>

              <Button
                onClick={() => router.push('/player-golf/dev')}
                variant="secondary"
                className="w-full"
                size="lg"
              >
                View All Dev Options
              </Button>
            </div>

            <div className="mt-8 p-4 bg-slate-50 rounded-lg">
              <p className="text-xs text-slate-500 text-center">
                💡 <strong>Dev Mode Only:</strong> In production, users would log in and create their own account.
                This bypass is for testing purposes.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
