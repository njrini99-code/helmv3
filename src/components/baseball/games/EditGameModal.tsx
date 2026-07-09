'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/sonner';
import { updateGame } from '@/app/baseball/actions/games';
import type { BaseballGame, BaseballGameType, BaseballHomeAway } from '@/lib/types';

interface EditGameModalProps {
  game: BaseballGame;
  open: boolean;
  onClose: () => void;
}

/**
 * Coach-only edit surface for a scheduled/completed game's metadata (date,
 * opponent, location, home/away, notes, weather). Fixes the P2 gap where a
 * mistyped field could only be corrected by deleting the game — which
 * cascade-destroys its box score. Calls the existing `updateGame` server
 * action; does not touch box-score data.
 */
export function EditGameModal({ game, open, onClose }: EditGameModalProps) {
  const router = useRouter();
  const { showToast } = useToast();

  const [gameDate, setGameDate] = useState(game.game_date);
  const [gameType, setGameType] = useState<BaseballGameType>(game.game_type);
  const [opponentName, setOpponentName] = useState(game.opponent_name ?? '');
  const [location, setLocation] = useState(game.location ?? '');
  const [homeAway, setHomeAway] = useState<BaseballHomeAway>(game.home_away ?? 'home');
  const [notes, setNotes] = useState(game.notes ?? '');
  const [weather, setWeather] = useState(game.weather ?? '');
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

    const result = await updateGame(game.id, {
      game_date: gameDate,
      game_type: gameType,
      // Send `null` (not `undefined`) for cleared optional fields — updateGame
      // skips `undefined` keys entirely before building the .update() payload,
      // so an emptied field would otherwise leave the old value in the row.
      // `null` is a real value for these nullable columns and clears them.
      opponent_name: opponentName.trim() || null,
      location: location.trim() || null,
      home_away: homeAway,
      notes: notes.trim() || null,
      weather: weather.trim() || null,
    });

    setSaving(false);

    if (result.success) {
      showToast('Game updated', 'success');
      onClose();
      router.refresh();
    } else {
      setError(result.error ?? 'Failed to update game');
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Edit Game" size="md">
      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Game type */}
        <div>
          <p id="edit-game-type-label" className="text-sm font-medium text-warm-700 block mb-2">Type</p>
          <div className="flex gap-3" role="group" aria-labelledby="edit-game-type-label">
            {(['game', 'scrimmage'] as BaseballGameType[]).map((t) => (
              <Button
                variant="ghost"
                key={t}
                type="button"
                onClick={() => setGameType(t)}
                aria-pressed={gameType === t}
                className={`flex-1 py-2.5 rounded-xl text-sm font-medium border transition-all capitalize ${
                  gameType === t
                    ? t === 'scrimmage'
                      ? 'bg-warm-800 text-white border-warm-800'
                      : 'bg-primary-600 text-white border-primary-600'
                    : 'bg-cream-50 text-warm-600 border-warm-200 hover:border-warm-300'
                }`}
              >
                {t}
              </Button>
            ))}
          </div>
        </div>

        {/* Date */}
        <div>
          <label htmlFor="edit-game-date" className="text-sm font-medium text-warm-700 block mb-1.5">
            Date
          </label>
          <Input
            id="edit-game-date"
            type="date"
            value={gameDate}
            onChange={(e) => setGameDate(e.target.value)}
            required
            className="rounded-xl border-warm-200 text-warm-900 bg-cream-50/80 focus:ring-2 focus:ring-primary-500"
          />
        </div>

        {/* Opponent */}
        <div>
          <label htmlFor="edit-game-opponent" className="text-sm font-medium text-warm-700 block mb-1.5">
            Opponent Name
            <span className="ml-1 text-warm-400 font-normal">(optional)</span>
          </label>
          <Input
            id="edit-game-opponent"
            type="text"
            value={opponentName}
            onChange={(e) => setOpponentName(e.target.value)}
            placeholder="e.g. State University"
            className="rounded-xl border-warm-200 text-warm-900 bg-cream-50/80 focus:ring-2 focus:ring-primary-500 placeholder:text-warm-300"
          />
        </div>

        {/* Home/Away */}
        <div>
          <p id="edit-game-homeaway-label" className="text-sm font-medium text-warm-700 block mb-2">Location</p>
          <div className="flex gap-2" role="group" aria-labelledby="edit-game-homeaway-label">
            {(['home', 'away', 'neutral'] as BaseballHomeAway[]).map((ha) => (
              <Button
                variant="ghost"
                key={ha}
                type="button"
                onClick={() => setHomeAway(ha)}
                aria-pressed={homeAway === ha}
                className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-all capitalize ${
                  homeAway === ha
                    ? 'bg-warm-800 text-white border-warm-800'
                    : 'bg-cream-50 text-warm-500 border-warm-200 hover:border-warm-300'
                }`}
              >
                {ha}
              </Button>
            ))}
          </div>
        </div>

        {/* Venue */}
        <div>
          <label htmlFor="edit-game-venue" className="text-sm font-medium text-warm-700 block mb-1.5">
            Venue / Field
            <span className="ml-1 text-warm-400 font-normal">(optional)</span>
          </label>
          <Input
            id="edit-game-venue"
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="e.g. Alumni Field"
            className="rounded-xl border-warm-200 text-warm-900 bg-cream-50/80 focus:ring-2 focus:ring-primary-500 placeholder:text-warm-300"
          />
        </div>

        {/* Weather */}
        <div>
          <label htmlFor="edit-game-weather" className="text-sm font-medium text-warm-700 block mb-1.5">
            Weather
            <span className="ml-1 text-warm-400 font-normal">(optional)</span>
          </label>
          <Input
            id="edit-game-weather"
            type="text"
            value={weather}
            onChange={(e) => setWeather(e.target.value)}
            placeholder="e.g. 72°F, clear"
            className="rounded-xl border-warm-200 text-warm-900 bg-cream-50/80 focus:ring-2 focus:ring-primary-500 placeholder:text-warm-300"
          />
        </div>

        {/* Notes */}
        <Textarea
          id="edit-game-notes"
          label="Notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Optional notes about this game"
          rows={3}
        />

        {error && (
          <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <Button type="button" variant="outline" onClick={onClose} className="flex-1" disabled={saving}>
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={saving}
            className="flex-1 bg-primary-600 hover:bg-primary-700 text-white"
          >
            {saving ? 'Saving…' : 'Save Changes'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
