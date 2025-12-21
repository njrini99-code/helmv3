'use client';

import { Header } from '@/components/layout/header';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { PageLoading } from '@/components/ui/loading';
import { IconNote, IconTarget, IconCheck, IconClock } from '@/components/icons';
import { useAuth } from '@/hooks/use-auth';

export default function PlayerDevPlanPage() {
  const { user, loading: authLoading } = useAuth();

  if (authLoading) return <PageLoading />;

  if (user?.role !== 'player') {
    return (
      <div className="p-8">
        <Card>
          <CardContent className="p-12 text-center">
            <p className="text-slate-500">Only players can access this page.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <>
      <Header
        title="My Development Plan"
        subtitle="Track your progress and complete goals set by your coach"
      />
      <div className="p-8">
        {/* Progress Overview */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-500">Active Goals</p>
                  <p className="text-2xl font-semibold text-slate-900 mt-1">0</p>
                </div>
                <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center">
                  <IconTarget size={24} className="text-blue-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-500">Completed</p>
                  <p className="text-2xl font-semibold text-slate-900 mt-1">0</p>
                </div>
                <div className="w-12 h-12 rounded-full bg-green-50 flex items-center justify-center">
                  <IconCheck size={24} className="text-green-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-500">In Progress</p>
                  <p className="text-2xl font-semibold text-slate-900 mt-1">0</p>
                </div>
                <div className="w-12 h-12 rounded-full bg-amber-50 flex items-center justify-center">
                  <IconClock size={24} className="text-amber-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-500">Completion</p>
                  <p className="text-2xl font-semibold text-slate-900 mt-1">0%</p>
                </div>
                <div className="w-12 h-12 rounded-full bg-purple-50 flex items-center justify-center">
                  <IconNote size={24} className="text-purple-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Content */}
        <Card>
          <CardHeader>
            <h2 className="font-semibold text-gray-900">Your Development Plan</h2>
          </CardHeader>
          <CardContent>
            {/* Empty State */}
            <div className="text-center py-16">
              <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
                <IconNote size={32} className="text-slate-400" />
              </div>
              <h3 className="text-lg font-medium text-slate-900 mb-2">No active development plan</h3>
              <p className="text-sm text-slate-500 mb-4 max-w-md mx-auto">
                Your coach will create a personalized development plan to help you improve your skills and reach your goals. Check back soon!
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Info Card */}
        <Card className="mt-6">
          <CardHeader>
            <h2 className="font-semibold text-gray-900">How Development Plans Work</h2>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3 text-sm text-slate-600">
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-green-100 text-green-700 font-medium flex items-center justify-center text-xs">
                  1
                </span>
                <div>
                  <span className="font-medium text-slate-900">Coach creates your plan</span>
                  <p className="text-slate-500 mt-0.5">Your coach will set specific goals and drills tailored to your needs</p>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-green-100 text-green-700 font-medium flex items-center justify-center text-xs">
                  2
                </span>
                <div>
                  <span className="font-medium text-slate-900">Work on your goals</span>
                  <p className="text-slate-500 mt-0.5">Follow the drills and practice routines to improve your skills</p>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-green-100 text-green-700 font-medium flex items-center justify-center text-xs">
                  3
                </span>
                <div>
                  <span className="font-medium text-slate-900">Track your progress</span>
                  <p className="text-slate-500 mt-0.5">Mark goals as complete and see how far you've come</p>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-green-100 text-green-700 font-medium flex items-center justify-center text-xs">
                  4
                </span>
                <div>
                  <span className="font-medium text-slate-900">Celebrate achievements</span>
                  <p className="text-slate-500 mt-0.5">Your coach will review your progress and set new goals</p>
                </div>
              </li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
