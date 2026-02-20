'use client';

import { useState } from 'react';
import { IconNote, IconEdit, IconTrash, IconClock } from '@/components/icons';

interface Note {
  id: string;
  content: string;
  created_at: string;
  note_type?: string;
}

interface PlayerNotesSectionProps {
  notes: Note[];
  playerId?: string;
  coachId?: string;
  compact?: boolean;
}

export function PlayerNotesSection({ notes, compact = false }: PlayerNotesSectionProps) {
  const [expandedNote, setExpandedNote] = useState<string | null>(null);

  if (notes.length === 0) {
    return (
      <div className="text-center py-6">
        <IconNote size={24} className="mx-auto text-slate-300 mb-2" />
        <p className="text-sm text-slate-500">No notes yet</p>
        <p className="text-xs text-slate-400 mt-1">
          Add notes to track observations and coaching points
        </p>
      </div>
    );
  }

  const displayNotes = compact ? notes.slice(0, 3) : notes;

  return (
    <div className="space-y-3">
      {displayNotes.map((note) => {
        const isExpanded = expandedNote === note.id;
        const isLong = note.content.length > 150;

        return (
          <div
            key={note.id}
            className="bg-slate-50 rounded-xl p-4 group"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <p className={`text-sm text-slate-700 whitespace-pre-wrap ${
                  !isExpanded && isLong ? 'line-clamp-3' : ''
                }`}>
                  {note.content}
                </p>

                {isLong && (
                  <button
                    onClick={() => setExpandedNote(isExpanded ? null : note.id)}
                    className="text-xs text-green-600 hover:text-green-700 mt-1"
                  >
                    {isExpanded ? 'Show less' : 'Show more'}
                  </button>
                )}

                <div className="flex items-center gap-3 mt-2 text-xs text-slate-400">
                  <span className="flex items-center gap-1">
                    <IconClock size={12} />
                    {new Date(note.created_at).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </span>
                  {note.note_type && (
                    <span className="px-1.5 py-0.5 bg-slate-200 rounded text-slate-500 capitalize">
                      {note.note_type}
                    </span>
                  )}
                </div>
              </div>

              {!compact && (
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-white active:bg-white/70 transition-colors">
                    <IconEdit size={14} />
                  </button>
                  <button className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-white active:bg-white/70 transition-colors">
                    <IconTrash size={14} />
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
