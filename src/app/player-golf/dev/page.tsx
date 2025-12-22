'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';
import { IconGolf, IconCalendar, IconChartBar, IconClock } from '@/components/icons';

export default function GolfDevModePage() {
  const router = useRouter();

  const devActions = [
    {
      title: 'Start New Round',
      description: '8-step wizard to create and start a new round',
      icon: IconGolf,
      href: '/player-golf/round/new',
      color: 'green',
    },
    {
      title: 'View All Rounds',
      description: 'See all completed and in-progress rounds',
      icon: IconCalendar,
      href: '/player-golf/rounds',
      color: 'blue',
    },
    {
      title: 'Test Shot Tracking',
      description: 'Test with a demo round (auto-creates)',
      action: 'createTestRound',
      icon: IconChartBar,
      color: 'purple',
    },
    {
      title: 'Recent Courses',
      description: 'View recently played courses',
      icon: IconClock,
      href: '/player-golf',
      color: 'orange',
    },
  ];

  const handleAction = async (action: string) => {
    if (action === 'createTestRound') {
      // Create a test round and navigate to it
      try {
        const { createRound } = await import('@/app/player-golf/actions/rounds');

        // Create test round with sample data
        const testHoles = Array.from({ length: 18 }, (_, i) => ({
          hole: i + 1,
          par: i % 3 === 0 ? 3 : i % 5 === 0 ? 5 : 4,
        }));

        const round = await createRound({
          courseName: 'Test Course - Dev Mode',
          courseCity: 'Test City',
          courseState: 'CA',
          teesPlayed: 'Blue Tees',
          courseRating: 72.0,
          courseSlope: 113,
          roundType: 'practice',
          startingHole: 1,
          roundDate: new Date().toISOString().split('T')[0],
          holes: testHoles,
        });

        // Navigate to shot tracking
        router.push(`/player-golf/round/${round.id}`);
      } catch (error) {
        console.error('Error creating test round:', error);
        alert('Failed to create test round. Error: ' + (error as Error).message);
      }
    }
  };

  return (
    <div className="min-h-screen bg-[#FAF6F1]">
      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 rounded-full bg-green-600 flex items-center justify-center">
              <IconGolf className="text-white" size={24} />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-slate-900">Golf Dev Mode</h1>
              <p className="text-slate-500">Quick access to all golf features for testing</p>
            </div>
          </div>

          {/* Dev Mode Banner */}
          <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
            <p className="text-sm text-green-800">
              <strong>✅ DEV MODE ACTIVE - Auth Bypassed:</strong> All features work without authentication. Round creation and shot tracking will use a test player automatically.
            </p>
          </div>

          {/* Account Setup Banner */}
          <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-blue-800">
                  <strong>🔐 Need a test account?</strong> Create one to test all features.
                </p>
              </div>
              <Button
                onClick={() => router.push('/player-golf/dev/create-account')}
                className="bg-blue-600 hover:bg-blue-700"
                size="sm"
              >
                Create Test Account
              </Button>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {devActions.map((action) => {
            const Icon = action.icon;
            return (
              <Card
                key={action.title}
                className="hover:shadow-lg transition-shadow cursor-pointer"
                onClick={() => {
                  if (action.href) {
                    router.push(action.href);
                  } else if (action.action) {
                    handleAction(action.action);
                  }
                }}
              >
                <CardContent className="p-6">
                  <div className="flex items-start gap-4">
                    <div className={`w-12 h-12 rounded-lg bg-${action.color}-100 flex items-center justify-center flex-shrink-0`}>
                      <Icon className={`text-${action.color}-600`} size={24} />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-slate-900 mb-1">
                        {action.title}
                      </h3>
                      <p className="text-sm text-slate-500">
                        {action.description}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Testing Instructions */}
        <Card className="mt-8">
          <CardContent className="p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Testing Flow</h2>
            <div className="space-y-3 text-sm text-slate-600">
              <div className="flex gap-3">
                <span className="w-6 h-6 rounded-full bg-green-600 text-white flex items-center justify-center text-xs font-bold flex-shrink-0">1</span>
                <div>
                  <p className="font-medium text-slate-900">Start New Round</p>
                  <p className="text-slate-500">Complete the 8-step wizard to create a round with custom course data</p>
                </div>
              </div>
              <div className="flex gap-3">
                <span className="w-6 h-6 rounded-full bg-green-600 text-white flex items-center justify-center text-xs font-bold flex-shrink-0">2</span>
                <div>
                  <p className="font-medium text-slate-900">Track Shots</p>
                  <p className="text-slate-500">Test all shot types: Tee shots (with driver selection), Approach shots, Around the green, and Putting (with break/slope)</p>
                </div>
              </div>
              <div className="flex gap-3">
                <span className="w-6 h-6 rounded-full bg-green-600 text-white flex items-center justify-center text-xs font-bold flex-shrink-0">3</span>
                <div>
                  <p className="font-medium text-slate-900">Test Miss Directions</p>
                  <p className="text-slate-500">Try different results (Rough, Sand, Other) to test miss direction selectors (2 for tee, 8 for approach, 5 for putting)</p>
                </div>
              </div>
              <div className="flex gap-3">
                <span className="w-6 h-6 rounded-full bg-green-600 text-white flex items-center justify-center text-xs font-bold flex-shrink-0">4</span>
                <div>
                  <p className="font-medium text-slate-900">Complete Holes</p>
                  <p className="text-slate-500">Select "Hole" result to complete a hole and auto-advance to the next one</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Features to Test */}
        <Card className="mt-4">
          <CardContent className="p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Key Features to Test</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <h3 className="font-medium text-slate-900 mb-2">Course Creation (8 Steps)</h3>
                <ul className="space-y-1 text-slate-600">
                  <li>✓ Course name entry</li>
                  <li>✓ Recently played courses quick-select</li>
                  <li>✓ Tee box name</li>
                  <li>✓ Side-by-side hole entry (Front 9 / Back 9)</li>
                  <li>✓ Course rating (67.0-77.0)</li>
                  <li>✓ Slope rating (55-155)</li>
                  <li>✓ Round type selection</li>
                  <li>✓ Starting hole selection</li>
                </ul>
              </div>
              <div>
                <h3 className="font-medium text-slate-900 mb-2">Shot Tracking</h3>
                <ul className="space-y-1 text-slate-600">
                  <li>✓ Auto shot type detection</li>
                  <li>✓ Driver/Non-Driver (tee shots only)</li>
                  <li>✓ Distance calculation (before - after)</li>
                  <li>✓ Unit auto-switching (yards ↔ feet)</li>
                  <li>✓ 6 universal result options</li>
                  <li>✓ Context-aware miss directions</li>
                  <li>✓ Putting break & slope</li>
                  <li>✓ Shot history display</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Quick Links */}
        <div className="mt-8 flex flex-wrap gap-3">
          <Button variant="secondary" onClick={() => router.push('/')}>
            ← Back to Home
          </Button>
          <Button onClick={() => router.push('/player-golf/round/new')}>
            Start New Round →
          </Button>
        </div>
      </div>
    </div>
  );
}
