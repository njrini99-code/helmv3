'use client';

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';

const tabs = [
  { id: 'overview', label: 'Overview' },
  { id: 'sg', label: 'Strokes Gained' },
  { id: 'driving', label: 'Driving' },
  { id: 'gir', label: 'GIR' },
  { id: 'putting', label: 'Putting' },
  { id: 'scoring', label: 'Scoring' },
];

export default function StatsPage() {
  const [activeTab, setActiveTab] = useState('overview');

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">

        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Statistics</h1>
            <p className="text-slate-500 mt-1">Detailed performance analysis</p>
          </div>
          <select className="px-4 py-2 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 bg-white">
            <option>Last 20 Rounds</option>
            <option>Last 10 Rounds</option>
            <option>Last 5 Rounds</option>
            <option>Season</option>
          </select>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-2 mb-6 border-b border-slate-200">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 font-medium transition-colors border-b-2 -mb-px ${
                activeTab === tab.id
                  ? 'border-green-600 text-green-700'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div>
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <Card>
                <CardContent className="p-8">
                  <h3 className="text-lg font-semibold text-slate-900 mb-6">Performance Overview</h3>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                    <div>
                      <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                        Scoring Average
                      </div>
                      <div className="text-3xl font-bold text-slate-900">73.2</div>
                      <div className="text-xs text-slate-500 mt-1">+1.2 vs par</div>
                    </div>

                    <div>
                      <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                        Best Round
                      </div>
                      <div className="text-3xl font-bold text-green-600">68</div>
                      <div className="text-xs text-slate-500 mt-1">-4 vs par</div>
                    </div>

                    <div>
                      <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                        Fairways Hit
                      </div>
                      <div className="text-3xl font-bold text-slate-900">72%</div>
                      <div className="text-xs text-slate-500 mt-1">10.1/14 per round</div>
                    </div>

                    <div>
                      <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                        Greens in Reg
                      </div>
                      <div className="text-3xl font-bold text-slate-900">68%</div>
                      <div className="text-xs text-slate-500 mt-1">12.2/18 per round</div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-8">
                  <h3 className="text-lg font-semibold text-slate-900 mb-4">Strokes Gained Breakdown</h3>
                  <div className="space-y-4">
                    <div>
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span className="font-medium text-slate-700">Off Tee</span>
                        <span className="font-bold text-green-600">+0.3</span>
                      </div>
                      <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-green-600" style={{ width: '60%' }}></div>
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span className="font-medium text-slate-700">Approach</span>
                        <span className="font-bold text-green-600">+0.4</span>
                      </div>
                      <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-green-600" style={{ width: '70%' }}></div>
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span className="font-medium text-slate-700">Around Green</span>
                        <span className="font-bold text-green-600">+0.2</span>
                      </div>
                      <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-green-600" style={{ width: '40%' }}></div>
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span className="font-medium text-slate-700">Putting</span>
                        <span className="font-bold text-red-600">-0.1</span>
                      </div>
                      <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-red-500" style={{ width: '20%' }}></div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {activeTab === 'putting' && (
            <Card>
              <CardContent className="p-8">
                <h3 className="text-lg font-semibold text-slate-900 mb-6">Putting Statistics</h3>

                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-slate-200">
                        <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase">Range</th>
                        <th className="text-center py-3 px-4 text-xs font-semibold text-slate-500 uppercase">Attempts</th>
                        <th className="text-center py-3 px-4 text-xs font-semibold text-slate-500 uppercase">Make %</th>
                        <th className="text-center py-3 px-4 text-xs font-semibold text-slate-500 uppercase">Prox</th>
                        <th className="text-center py-3 px-4 text-xs font-semibold text-slate-500 uppercase">Efficiency</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      <tr className="hover:bg-slate-50">
                        <td className="py-3 px-4 text-sm font-medium text-slate-900">0-3 ft</td>
                        <td className="py-3 px-4 text-sm text-center text-slate-600">45</td>
                        <td className="py-3 px-4 text-sm text-center font-semibold text-green-600">98%</td>
                        <td className="py-3 px-4 text-sm text-center text-slate-600">0.2'</td>
                        <td className="py-3 px-4 text-sm text-center">
                          <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">Excellent</span>
                        </td>
                      </tr>
                      <tr className="hover:bg-slate-50">
                        <td className="py-3 px-4 text-sm font-medium text-slate-900">3-5 ft</td>
                        <td className="py-3 px-4 text-sm text-center text-slate-600">38</td>
                        <td className="py-3 px-4 text-sm text-center font-semibold text-green-600">87%</td>
                        <td className="py-3 px-4 text-sm text-center text-slate-600">1.1'</td>
                        <td className="py-3 px-4 text-sm text-center">
                          <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">Good</span>
                        </td>
                      </tr>
                      <tr className="hover:bg-slate-50">
                        <td className="py-3 px-4 text-sm font-medium text-slate-900">5-10 ft</td>
                        <td className="py-3 px-4 text-sm text-center text-slate-600">62</td>
                        <td className="py-3 px-4 text-sm text-center font-semibold text-slate-700">64%</td>
                        <td className="py-3 px-4 text-sm text-center text-slate-600">2.8'</td>
                        <td className="py-3 px-4 text-sm text-center">
                          <span className="px-2 py-1 bg-slate-100 text-slate-700 rounded-full text-xs font-medium">Average</span>
                        </td>
                      </tr>
                      <tr className="hover:bg-slate-50">
                        <td className="py-3 px-4 text-sm font-medium text-slate-900">10-15 ft</td>
                        <td className="py-3 px-4 text-sm text-center text-slate-600">41</td>
                        <td className="py-3 px-4 text-sm text-center font-semibold text-slate-700">41%</td>
                        <td className="py-3 px-4 text-sm text-center text-slate-600">3.2'</td>
                        <td className="py-3 px-4 text-sm text-center">
                          <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">Good</span>
                        </td>
                      </tr>
                      <tr className="hover:bg-slate-50">
                        <td className="py-3 px-4 text-sm font-medium text-slate-900">15-20 ft</td>
                        <td className="py-3 px-4 text-sm text-center text-slate-600">28</td>
                        <td className="py-3 px-4 text-sm text-center font-semibold text-slate-700">28%</td>
                        <td className="py-3 px-4 text-sm text-center text-slate-600">3.9'</td>
                        <td className="py-3 px-4 text-sm text-center">
                          <span className="px-2 py-1 bg-slate-100 text-slate-700 rounded-full text-xs font-medium">Average</span>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Other tabs would have similar content */}
          {!['overview', 'putting'].includes(activeTab) && (
            <Card>
              <CardContent className="p-12 text-center">
                <div className="text-slate-400 mb-2">
                  <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </div>
                <p className="text-slate-500 font-medium">Coming Soon</p>
                <p className="text-sm text-slate-400 mt-1">
                  {tabs.find(t => t.id === activeTab)?.label} statistics will be available here
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
  );
}
