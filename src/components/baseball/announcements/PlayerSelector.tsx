'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { IconUsers, IconUser, IconCheck } from '@/components/icons';

interface Player {
  id: string;
  first_name: string | null;
  last_name: string | null;
}

interface PlayerSelectorProps {
  players: Player[];
  selectedPlayerIds: string[] | null; // null = all team
  onChange: (playerIds: string[] | null) => void;
}

export function PlayerSelector({ players, selectedPlayerIds, onChange }: PlayerSelectorProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const isAllTeam = selectedPlayerIds === null;

  const filteredPlayers = players.filter(p => {
    if (!searchQuery) return true;
    const name = `${p.first_name || ''} ${p.last_name || ''}`.toLowerCase();
    return name.includes(searchQuery.toLowerCase());
  });

  function togglePlayer(playerId: string) {
    if (isAllTeam) return;
    const current = selectedPlayerIds || [];
    if (current.includes(playerId)) {
      onChange(current.filter(id => id !== playerId));
    } else {
      onChange([...current, playerId]);
    }
  }

  function selectAll() {
    onChange(null);
    setSearchQuery('');
  }

  function selectSpecific() {
    onChange([]);
  }

  return (
    <div>
      <label className="text-sm font-medium text-slate-700 block mb-2">
        Send To
      </label>

      <div className="space-y-2">
        <motion.button
          type="button"
          onClick={selectAll}
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.99 }}
          className={cn(
            'w-full p-3 rounded-xl border-2 text-left transition-all flex items-center gap-3',
            isAllTeam
              ? 'border-primary-600 bg-primary-50 shadow-sm'
              : 'border-slate-200 hover:border-slate-300 hover:shadow-sm'
          )}
        >
          <div className={cn(
            'w-9 h-9 rounded-lg flex items-center justify-center',
            isAllTeam ? 'bg-primary-100' : 'bg-slate-100'
          )}>
            <IconUsers size={18} className={isAllTeam ? 'text-primary-600' : 'text-slate-400'} />
          </div>
          <div className="flex-1">
            <p className="font-medium text-slate-900 text-sm">All Team Members</p>
            <p className="text-xs text-slate-500">{players.length} players</p>
          </div>
          {isAllTeam && (
            <div className="w-5 h-5 rounded-full bg-primary-600 flex items-center justify-center">
              <IconCheck size={12} className="text-white" />
            </div>
          )}
        </motion.button>

        <motion.button
          type="button"
          onClick={selectSpecific}
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.99 }}
          className={cn(
            'w-full p-3 rounded-xl border-2 text-left transition-all flex items-center gap-3',
            !isAllTeam
              ? 'border-primary-600 bg-primary-50 shadow-sm'
              : 'border-slate-200 hover:border-slate-300 hover:shadow-sm'
          )}
        >
          <div className={cn(
            'w-9 h-9 rounded-lg flex items-center justify-center',
            !isAllTeam ? 'bg-primary-100' : 'bg-slate-100'
          )}>
            <IconUser size={18} className={!isAllTeam ? 'text-primary-600' : 'text-slate-400'} />
          </div>
          <div className="flex-1">
            <p className="font-medium text-slate-900 text-sm">Specific Players</p>
            <p className="text-xs text-slate-500">
              {!isAllTeam && selectedPlayerIds && selectedPlayerIds.length > 0
                ? `${selectedPlayerIds.length} selected`
                : 'Select players below'}
            </p>
          </div>
          {!isAllTeam && (
            <div className="w-5 h-5 rounded-full bg-primary-600 flex items-center justify-center">
              <IconCheck size={12} className="text-white" />
            </div>
          )}
        </motion.button>
      </div>

      <AnimatePresence>
        {!isAllTeam && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="mt-3 border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-3 py-2 border-b border-slate-100">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search players..."
                  className="w-full text-sm text-slate-900 placeholder:text-slate-400 bg-transparent outline-none"
                />
              </div>
              <div className="max-h-48 overflow-y-auto p-1.5 space-y-0.5">
                {filteredPlayers.map((player, index) => {
                  const isSelected = (selectedPlayerIds || []).includes(player.id);
                  return (
                    <motion.button
                      key={player.id}
                      type="button"
                      onClick={() => togglePlayer(player.id)}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.02 }}
                      whileHover={{ scale: 1.01, x: 2 }}
                      whileTap={{ scale: 0.98 }}
                      className={cn(
                        'w-full px-3 py-2 rounded-lg text-left text-sm transition-all flex items-center gap-2',
                        isSelected
                          ? 'bg-primary-100 text-primary-900'
                          : 'hover:bg-slate-50 active:bg-slate-100 text-slate-700'
                      )}
                    >
                      <div className={cn(
                        'w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors',
                        isSelected
                          ? 'bg-primary-600 border-primary-600'
                          : 'border-slate-300'
                      )}>
                        {isSelected && <IconCheck size={10} className="text-white" />}
                      </div>
                      <span>{player.first_name || ''} {player.last_name || ''}</span>
                    </motion.button>
                  );
                })}
                {filteredPlayers.length === 0 && (
                  <p className="text-sm text-slate-400 text-center py-4">No players found</p>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
