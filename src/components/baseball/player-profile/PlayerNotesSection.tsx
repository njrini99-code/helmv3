'use client';

import { useState } from 'react';
import { LazyMotion, domAnimation, m, useReducedMotion } from 'framer-motion';
import { IconNote, IconEdit, IconTrash, IconClock } from '@/components/icons';
import { Button, IconButton } from '@/components/ui/button';

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
  const prefersReducedMotion = useReducedMotion();
  const [expandedNote, setExpandedNote] = useState<string | null>(null);

  if (notes.length === 0) {
    return (
      <div className="text-center py-6">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-primary-50 to-primary-100 text-primary-600/80">
          <IconNote size={22} />
        </div>
        <p className="text-sm font-medium text-warm-700">No notes yet</p>
        <p className="mt-1 text-xs leading-relaxed text-warm-500">
          Add notes to track observations and coaching points.
        </p>
      </div>
    );
  }

  const displayNotes = compact ? notes.slice(0, 3) : notes;

  return (
    <LazyMotion features={domAnimation}>
      <ul className="space-y-3">
        {displayNotes.map((note, idx) => {
          const isExpanded = expandedNote === note.id;
          const isLong = note.content.length > 150;
          const panelId = `note-body-${note.id}`;

          return (
            <m.li
              key={note.id}
              initial={prefersReducedMotion ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: prefersReducedMotion ? 0 : 0.22,
                delay: prefersReducedMotion ? 0 : Math.min(idx * 0.04, 0.2),
                ease: 'easeOut',
              }}
              className="bg-warm-50 rounded-xl p-4 group transition-colors hover:bg-warm-100/70"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p
                    id={panelId}
                    className={`text-sm text-warm-700 leading-relaxed whitespace-pre-wrap ${
                      !isExpanded && isLong ? 'line-clamp-3' : ''
                    }`}
                  >
                    {note.content}
                  </p>

                  {isLong && (
                    <Button variant="ghost"
                      onClick={() => setExpandedNote(isExpanded ? null : note.id)}
                      aria-expanded={isExpanded}
                      aria-controls={panelId}
                      className="text-xs font-medium text-primary-600 hover:text-primary-700 hover:bg-transparent mt-1 px-0 min-h-0"
                    >
                      {isExpanded ? 'Show less' : 'Show more'}
                    </Button>
                  )}

                  <div className="flex items-center gap-3 mt-2 text-xs text-warm-400">
                    <span className="flex items-center gap-1">
                      <IconClock size={12} />
                      {new Date(note.created_at).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </span>
                    {note.note_type && (
                      <span className="px-1.5 py-0.5 bg-warm-200 rounded text-warm-500 capitalize">
                        {note.note_type}
                      </span>
                    )}
                  </div>
                </div>

                {!compact && (
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
                    <IconButton variant="default" aria-label="Edit note" className="p-1.5 rounded-lg text-warm-400 hover:text-warm-600 hover:bg-cream-50 active:bg-cream-100/75 transition-colors">
                      <IconEdit size={14} />
                    </IconButton>
                    <IconButton variant="default" aria-label="Delete note" className="p-1.5 rounded-lg text-warm-400 hover:text-red-500 hover:bg-cream-50 active:bg-cream-100/75 transition-colors">
                      <IconTrash size={14} />
                    </IconButton>
                  </div>
                )}
              </div>
            </m.li>
          );
        })}
      </ul>
    </LazyMotion>
  );
}
