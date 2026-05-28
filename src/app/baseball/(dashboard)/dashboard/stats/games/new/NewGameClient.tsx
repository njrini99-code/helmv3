'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createGame } from '@/app/baseball/actions/games';
import type { BaseballGameType, BaseballHomeAway } from '@/lib/types';
import { Button } from '@/components/ui/button';

interface NewGameClientProps {
  teamId: string;
  teamName: string;
}

export function NewGameClient({ teamId, teamName }: NewGameClientProps) {
  const router = useRouter();
  const today = new Date().toISOString().split('T')[0];

  const [gameDate, setGameDate] = useState(today ?? '');
  const [gameType, setGameType] = useState<BaseballGameType>('game');
  const [opponentName, setOpponentName] = useState('');
  const [location, setLocation] = useState('');
  const [homeAway, setHomeAway] = useState<BaseballHomeAway>('home');
  const [eventTime, setEventTime] = useState('');
  const [createCalendarEvent, setCreateCalendarEvent] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!gameDate) {
      setError('Please select a game date');
      return;
    }

    setSaving(true);
    setError(null);

    const result = await createGame(teamId, {
      game_date: gameDate,
      game_type: gameType,
      opponent_name: opponentName || undefined,
      location: location || undefined,
      home_away: homeAway,
      event_time: eventTime || undefined,
      create_calendar_event: createCalendarEvent,
    });

    if (result.success && result.data) {
      router.push(`/baseball/dashboard/stats/games/${result.data.id}`);
    } else {
      setError(result.error ?? 'Failed to create game');
      setSaving(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-warm-900">Add Game / Scrimmage</h1>
        <p className="text-warm-500 mt-1 text-sm">{teamName}</p>
      </div>

      <div className="bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl p-6 shadow-sm">
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Game type */}
          <div>
            <label className="text-sm font-medium text-warm-700 block mb-2">Type</label>
            <div className="flex gap-3">
              {(['game', 'scrimmage'] as BaseballGameType[]).map((t) => (
                <Button variant="primary"
                  key={t}
                  type="button"
                  onClick={() => setGameType(t)}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-medium border transition-all capitalize ${
                    gameType === t
                      ? t === 'scrimmage'
                        ? 'bg-purple-600 text-white border-purple-600'
                        : 'bg-primary-600 text-white border-primary-600'
                      : 'bg-white text-warm-600 border-warm-200 hover:border-warm-300'
                  }`}
                >
                  {t}
                </Button>
              ))}
            </div>
          </div>

          {/* Date */}
          <div>
            <label className="text-sm font-medium text-warm-700 block mb-1.5">Date</label>
            <input
              type="date"
              value={gameDate}
              onChange={(e) => setGameDate(e.target.value)}
              required
              className="w-full border border-warm-200 rounded-xl px-4 py-2.5 text-sm text-warm-900 bg-white/80 focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          {/* Opponent */}
          <div>
            <label className="text-sm font-medium text-warm-700 block mb-1.5">
              Opponent Name
              <span className="ml-1 text-warm-400 font-normal">(optional)</span>
            </label>
            <input
              type="text"
              value={opponentName}
              onChange={(e) => setOpponentName(e.target.value)}
              placeholder="e.g. State University"
              className="w-full border border-warm-200 rounded-xl px-4 py-2.5 text-sm text-warm-900 bg-white/80 focus:outline-none focus:ring-2 focus:ring-primary-500 placeholder:text-warm-300"
            />
          </div>

          {/* Home/Away */}
          <div>
            <label className="text-sm font-medium text-warm-700 block mb-2">Location</label>
            <div className="flex gap-2">
              {(['home', 'away', 'neutral'] as BaseballHomeAway[]).map((ha) => (
                <Button variant="ghost"
                  key={ha}
                  type="button"
                  onClick={() => setHomeAway(ha)}
                  className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-all capitalize ${
                    homeAway === ha
                      ? 'bg-warm-800 text-white border-warm-800'
                      : 'bg-white text-warm-500 border-warm-200 hover:border-warm-300'
                  }`}
                >
                  {ha}
                </Button>
              ))}
            </div>
          </div>

          {/* Venue */}
          <div>
            <label className="text-sm font-medium text-warm-700 block mb-1.5">
              Venue / Field
              <span className="ml-1 text-warm-400 font-normal">(optional)</span>
            </label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g. Alumni Field"
              className="w-full border border-warm-200 rounded-xl px-4 py-2.5 text-sm text-warm-900 bg-white/80 focus:outline-none focus:ring-2 focus:ring-primary-500 placeholder:text-warm-300"
            />
          </div>

          {/* Calendar event option */}
          <div className="flex items-center gap-3 p-3 bg-warm-50 rounded-xl">
            <input
              type="checkbox"
              id="createCalendar"
              checked={createCalendarEvent}
              onChange={(e) => setCreateCalendarEvent(e.target.checked)}
              className="w-4 h-4 rounded text-primary-600 border-warm-300 focus:ring-primary-500"
            />
            <label htmlFor="createCalendar" className="text-sm text-warm-600 cursor-pointer flex-1">
              Also add to team calendar
            </label>
            {createCalendarEvent && (
              <input
                type="time"
                value={eventTime}
                onChange={(e) => setEventTime(e.target.value)}
                className="text-sm border border-warm-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder="Start time"
              />
            )}
          </div>

          {error && (
            <div className="bg-red-50 border border-red-100 rounded-xl p-3 text-sm text-red-600">
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.back()}
              className="flex-1"
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={saving}
              className="flex-1 bg-primary-600 hover:bg-primary-700 text-white"
            >
              {saving ? 'Creating…' : 'Create Game → Enter Box Score'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
