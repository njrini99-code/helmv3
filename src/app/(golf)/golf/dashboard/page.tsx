'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { IconPlus, IconTarget, IconChevronRight } from '@/components/icons';

// Sample data - in production this would come from API
const sampleStats = {
  strokesGained: { value: '+0.8', change: '+12%', isPositive: true },
  avgDriveDistance: { value: '280', unit: 'yds', fairwayPct: '72%' },
  greensInRegulation: { value: '68%', perRound: '12.2/rd' },
  puttsPerGIR: { value: '1.75', label: 'putts/GIR' },
};

const recentRounds = [
  { id: '1', course: 'Pebble Beach', score: 72, date: 'Mar 15', scoreToPar: 'E', fairways: '8/14', greens: '6/18' },
  { id: '2', course: 'Spyglass', score: 74, date: 'Mar 12', scoreToPar: '+2', fairways: '6/14', greens: '5/18' },
  { id: '3', course: 'Spanish Bay', score: 71, date: 'Mar 8', scoreToPar: '-1', fairways: '9/14', greens: '7/18' },
];

export default function GolfDashboard() {
  return (
    <div className="min-h-screen bg-[#FAF6F1]">
      <div className="max-w-7xl mx-auto px-6 py-8">

        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Dashboard</h1>
            <p className="text-slate-500 mt-1">Track your golf statistics and performance</p>
          </div>
          <div className="flex items-center gap-3">
            <select className="px-4 py-2 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 bg-white">
              <option>Last 20 Rounds</option>
              <option>Last 10 Rounds</option>
              <option>Last 5 Rounds</option>
              <option>Season</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Main Stats Column */}
          <div className="lg:col-span-2 space-y-6">

            {/* Key Stats Grid */}
            <div className="grid grid-cols-2 gap-4">

              {/* Strokes Gained */}
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-start justify-between mb-2">
                    <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                      Strokes Gained
                    </div>
                    <div className="flex items-center gap-1 text-xs font-medium text-green-600">
                      <span>{sampleStats.strokesGained.change}</span>
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                      </svg>
                    </div>
                  </div>
                  <div className="text-3xl font-bold text-slate-900">
                    {sampleStats.strokesGained.value}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    strokes/round vs field
                  </div>
                </CardContent>
              </Card>

              {/* Driving */}
              <Card>
                <CardContent className="p-6">
                  <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                    Driving
                  </div>
                  <div className="text-3xl font-bold text-slate-900">
                    {sampleStats.avgDriveDistance.value}
                    <span className="text-lg text-slate-500 ml-1">{sampleStats.avgDriveDistance.unit}</span>
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    {sampleStats.avgDriveDistance.fairwayPct} fairway hit rate
                  </div>
                </CardContent>
              </Card>

              {/* GIR */}
              <Card>
                <CardContent className="p-6">
                  <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                    Greens in Regulation
                  </div>
                  <div className="text-3xl font-bold text-slate-900">
                    {sampleStats.greensInRegulation.value}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    {sampleStats.greensInRegulation.perRound} per round
                  </div>
                </CardContent>
              </Card>

              {/* Putting */}
              <Card>
                <CardContent className="p-6">
                  <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                    Putting
                  </div>
                  <div className="text-3xl font-bold text-slate-900">
                    {sampleStats.puttsPerGIR.value}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    {sampleStats.puttsPerGIR.label}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Quick Actions */}
            <Card>
              <CardContent className="p-6">
                <h3 className="text-sm font-bold text-slate-900 mb-4">Quick Actions</h3>
                <div className="grid grid-cols-3 gap-3">
                  <Link href="/golf/round/new">
                    <button className="w-full px-4 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2">
                      <IconPlus size={18} />
                      Start Round
                    </button>
                  </Link>
                  <Link href="/golf/stats">
                    <button className="w-full px-4 py-3 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-lg font-medium transition-colors flex items-center justify-center gap-2">
                      <IconTarget size={18} />
                      View Stats
                    </button>
                  </Link>
                  <button className="w-full px-4 py-3 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-lg font-medium transition-colors">
                    Upload Data
                  </button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Recent Rounds Sidebar */}
          <div>
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-bold text-slate-900">Recent Rounds</h3>
                  <Link href="/golf/rounds" className="text-xs font-medium text-green-600 hover:text-green-700">
                    View All
                  </Link>
                </div>

                <div className="space-y-3">
                  {recentRounds.map((round) => (
                    <Link key={round.id} href={`/golf/round/${round.id}`}>
                      <div className="p-4 bg-slate-50 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer group">
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <div className="font-semibold text-slate-900">{round.course}</div>
                            <div className="text-xs text-slate-500 mt-0.5">{round.date}</div>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className={`text-xl font-bold ${
                              round.scoreToPar.startsWith('-') ? 'text-green-600' :
                              round.scoreToPar === 'E' ? 'text-slate-700' :
                              'text-blue-600'
                            }`}>
                              {round.scoreToPar}
                            </div>
                            <div className="text-xl font-bold text-slate-900">{round.score}</div>
                          </div>
                        </div>
                        <div className="flex items-center justify-between text-xs text-slate-500">
                          <div>
                            <span className="font-medium">{round.fairways}</span> FW
                          </div>
                          <div>
                            <span className="font-medium">{round.greens}</span> GIR
                          </div>
                          <IconChevronRight size={14} className="text-slate-400 group-hover:text-slate-600 transition-colors" />
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>

                {recentRounds.length === 0 && (
                  <div className="text-center py-12">
                    <IconTarget size={32} className="mx-auto text-slate-300 mb-2" />
                    <p className="text-sm text-slate-500">No rounds yet</p>
                    <p className="text-xs text-slate-400 mt-1">Start tracking your rounds</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
