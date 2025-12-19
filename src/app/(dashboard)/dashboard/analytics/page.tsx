'use client';

import { Header } from '@/components/layout/header';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { PageLoading } from '@/components/ui/loading';
import { IconEye, IconStar, IconVideo, IconMessage, IconTrendingUp, IconCalendar } from '@/components/icons';
import { useAnalytics } from '@/hooks/use-analytics';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';

export default function AnalyticsPage() {
  const { data, loading } = useAnalytics();

  if (loading) {
    return (
      <>
        <Header title="Analytics" subtitle="Track your recruiting activity" />
        <PageLoading />
      </>
    );
  }

  if (!data) {
    return (
      <>
        <Header title="Analytics" subtitle="Track your recruiting activity" />
        <div className="p-8">
          <Card>
            <CardContent className="p-12 text-center">
              <IconEye size={48} className="mx-auto text-slate-300 mb-4" />
              <h3 className="text-lg font-semibold text-slate-900 mb-2">No Analytics Data</h3>
              <p className="text-sm text-slate-500">
                Analytics data will appear once coaches start viewing your profile.
              </p>
            </CardContent>
          </Card>
        </div>
      </>
    );
  }

  const { stats, viewsOverTime, topSchools } = data;

  return (
    <>
      <Header
        title="Analytics"
        subtitle="Track your recruiting activity over the last 30 days"
      />
      <div className="p-8 space-y-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 rounded-lg bg-green-50">
                  <IconEye size={20} className="text-green-600" />
                </div>
                <p className="text-sm font-medium text-slate-500">Profile Views</p>
              </div>
              <p className="text-3xl font-semibold text-slate-900 tabular-nums">{stats.profileViews.toLocaleString()}</p>
              <p className="text-xs text-slate-400 mt-1">Last 30 days</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 rounded-lg bg-blue-50">
                  <IconStar size={20} className="text-blue-600" />
                </div>
                <p className="text-sm font-medium text-slate-500">Watchlist Adds</p>
              </div>
              <p className="text-3xl font-semibold text-slate-900 tabular-nums">{stats.watchlistAdds.toLocaleString()}</p>
              <p className="text-xs text-slate-400 mt-1">Coaches interested</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 rounded-lg bg-purple-50">
                  <IconVideo size={20} className="text-purple-600" />
                </div>
                <p className="text-sm font-medium text-slate-500">Video Views</p>
              </div>
              <p className="text-3xl font-semibold text-slate-900 tabular-nums">{stats.videoViews.toLocaleString()}</p>
              <p className="text-xs text-slate-400 mt-1">Highlight reel views</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 rounded-lg bg-amber-50">
                  <IconMessage size={20} className="text-amber-600" />
                </div>
                <p className="text-sm font-medium text-slate-500">Messages</p>
              </div>
              <p className="text-3xl font-semibold text-slate-900 tabular-nums">{stats.messagesSent.toLocaleString()}</p>
              <p className="text-xs text-slate-400 mt-1">Coach messages</p>
            </CardContent>
          </Card>
        </div>

        {/* Views Over Time Chart */}
        <Card>
          <CardHeader className="border-b border-slate-200">
            <div className="flex items-center gap-2">
              <IconTrendingUp size={20} className="text-green-600" />
              <h3 className="text-lg font-semibold text-slate-900">Profile Views Over Time</h3>
            </div>
            <p className="text-sm text-slate-500 mt-1">Daily profile views for the last 30 days</p>
          </CardHeader>
          <CardContent className="p-6">
            {viewsOverTime.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={viewsOverTime}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis
                    dataKey="date"
                    stroke="#94A3B8"
                    fontSize={12}
                    tickFormatter={(value) => {
                      const date = new Date(value);
                      return `${date.getMonth() + 1}/${date.getDate()}`;
                    }}
                  />
                  <YAxis stroke="#94A3B8" fontSize={12} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#FFFFFF',
                      border: '1px solid #E2E8F0',
                      borderRadius: '8px',
                      fontSize: '12px',
                    }}
                    labelFormatter={(value) => {
                      const date = new Date(value);
                      return date.toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric'
                      });
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="views"
                    stroke="#16A34A"
                    strokeWidth={2}
                    dot={{ fill: '#16A34A', r: 4 }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-center py-12">
                <IconCalendar size={48} className="mx-auto text-slate-300 mb-3" />
                <p className="text-sm text-slate-500">No profile views yet</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top Schools Viewing */}
        <Card>
          <CardHeader className="border-b border-slate-200">
            <h3 className="text-lg font-semibold text-slate-900">Top Schools Viewing Your Profile</h3>
            <p className="text-sm text-slate-500 mt-1">Schools that have shown the most interest</p>
          </CardHeader>
          <CardContent className="p-6">
            {topSchools.length > 0 ? (
              <div className="space-y-4">
                {topSchools.map((school, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-4 p-4 rounded-lg hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex items-center gap-3 flex-1">
                      <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center text-slate-600 font-semibold">
                        #{idx + 1}
                      </div>
                      <div className="flex-1">
                        <p className="font-medium text-slate-900">{school.school_name}</p>
                        {school.division && (
                          <p className="text-xs text-slate-500 mt-0.5">{school.division}</p>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-semibold text-slate-900 tabular-nums">{school.view_count.toLocaleString()}</p>
                      <p className="text-xs text-slate-500">
                        {school.view_count === 1 ? 'view' : 'views'}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <IconEye size={48} className="mx-auto text-slate-300 mb-3" />
                <p className="text-sm text-slate-500">No school views yet</p>
                <p className="text-xs text-slate-400 mt-1">
                  Make sure your profile is complete and recruiting is activated
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
