'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { IconPlus, IconChevronRight, IconTarget } from '@/components/icons';

// Sample data - in production this would come from API
const sampleRounds = [
  {
    id: '1',
    course: 'Pebble Beach Golf Links',
    location: 'Pebble Beach, CA',
    date: '2024-03-15',
    score: 72,
    scoreToPar: 0,
    putts: 28,
    fairways: '8/14',
    greens: '12/18',
  },
  {
    id: '2',
    course: 'Spyglass Hill Golf Course',
    location: 'Pebble Beach, CA',
    date: '2024-03-12',
    score: 74,
    scoreToPar: 2,
    putts: 32,
    fairways: '6/14',
    greens: '10/18',
  },
  {
    id: '3',
    course: 'Spanish Bay Golf Links',
    location: 'Pebble Beach, CA',
    date: '2024-03-08',
    score: 71,
    scoreToPar: -1,
    putts: 27,
    fairways: '9/14',
    greens: '13/18',
  },
];

export default function RoundsPage() {
  const [filterType, setFilterType] = useState<'all' | 'tournament' | 'practice'>('all');

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatScoreToPar = (score: number) => {
    if (score === 0) return 'E';
    if (score > 0) return `+${score}`;
    return `${score}`;
  };

  const getScoreColor = (scoreToPar: number) => {
    if (scoreToPar < 0) return 'text-slate-600';
    if (scoreToPar === 0) return 'text-slate-700';
    return 'text-blue-600';
  };

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">

        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">My Rounds</h1>
            <p className="text-slate-500 mt-1">View and track all your golf rounds</p>
          </div>
          <Link href="/golf/round/new">
            <Button className="flex items-center gap-2">
              <IconPlus size={18} />
              Start New Round
            </Button>
          </Link>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => setFilterType('all')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              filterType === 'all'
                ? 'bg-slate-900 text-white'
                : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            All Rounds
          </button>
          <button
            onClick={() => setFilterType('tournament')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              filterType === 'tournament'
                ? 'bg-slate-900 text-white'
                : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            Tournaments
          </button>
          <button
            onClick={() => setFilterType('practice')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              filterType === 'practice'
                ? 'bg-slate-900 text-white'
                : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            Practice Rounds
          </button>
        </div>

        {/* Rounds List */}
        {sampleRounds.length > 0 ? (
          <div className="space-y-4">
            {sampleRounds.map((round) => (
              <Link key={round.id} href={`/golf/round/${round.id}`}>
                <Card glass className="hover:border-slate-200 hover:shadow-md transition-all cursor-pointer">
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      {/* Course Info */}
                      <div className="flex-1">
                        <h3 className="text-lg font-semibold tracking-tight text-slate-900 mb-1">
                          {round.course}
                        </h3>
                        <div className="flex items-center gap-4 text-sm text-slate-500">
                          <span>{round.location}</span>
                          <span>•</span>
                          <span>{formatDate(round.date)}</span>
                        </div>
                      </div>

                      {/* Score */}
                      <div className="flex items-center gap-6">
                        <div className="text-center">
                          <div className={`text-3xl font-bold ${getScoreColor(round.scoreToPar)}`}>
                            {formatScoreToPar(round.scoreToPar)}
                          </div>
                          <div className="text-sm leading-relaxed text-slate-500 mt-1">
                            Score: {round.score}
                          </div>
                        </div>

                        {/* Stats */}
                        <div className="flex items-center gap-4 text-sm">
                          <div className="text-center">
                            <div className="font-semibold text-slate-900">{round.putts}</div>
                            <div className="text-slate-500">Putts</div>
                          </div>
                          <div className="text-center">
                            <div className="font-semibold text-slate-900">{round.fairways}</div>
                            <div className="text-slate-500">FW</div>
                          </div>
                          <div className="text-center">
                            <div className="font-semibold text-slate-900">{round.greens}</div>
                            <div className="text-slate-500">GIR</div>
                          </div>
                        </div>

                        <IconChevronRight size={20} className="text-slate-400" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        ) : (
          <Card glass>
            <CardContent className="p-12 text-center">
              <IconTarget size={48} className="mx-auto text-slate-300 mb-4" />
              <h3 className="text-lg font-medium text-slate-900 mb-2">
                No rounds yet
              </h3>
              <p className="text-sm leading-relaxed text-slate-500 mb-6 max-w-sm mx-auto">
                Start tracking your golf rounds to analyze your performance and improvement over time.
              </p>
              <Link href="/golf/round/new">
                <Button>
                  <IconPlus size={18} className="mr-2" />
                  Start Your First Round
                </Button>
              </Link>
            </CardContent>
          </Card>
        )}
      </div>
  );
}
