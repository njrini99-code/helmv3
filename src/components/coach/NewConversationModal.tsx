'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createConversation, sendMessage } from '@/app/baseball/actions/messages';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { IconSearch, IconX } from '@/components/icons';
import { useToast } from '@/components/ui/toast';

interface NewConversationModalProps {
  open: boolean;
  onClose: () => void;
  preselectedUserId?: string;
}

type SearchResult = {
  user_id: string;
  name: string;
  subtitle: string;
  avatar_url?: string | null;
  type: 'player' | 'coach';
};

export function NewConversationModal({ open, onClose, preselectedUserId }: NewConversationModalProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | undefined>(preselectedUserId);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);

  const handleSearch = async (query: string) => {
    setSearchQuery(query);

    if (!query || query.length < 2) {
      setSearchResults([]);
      return;
    }

    setLoading(true);
    const supabase = createClient();

    // Search players
    const { data: players } = await supabase
      .from('players')
      .select('user_id, first_name, last_name, primary_position, grad_year, avatar_url, recruiting_activated')
      .or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%`)
      .eq('recruiting_activated', true)
      .limit(10);

    // Search coaches
    const { data: coaches } = await supabase
      .from('coaches')
      .select('user_id, full_name, school_name, avatar_url')
      .or(`full_name.ilike.%${query}%,school_name.ilike.%${query}%`)
      .limit(10);

    const playerResults: SearchResult[] = (players || [])
      .filter((p): p is typeof p & { user_id: string } => !!p.user_id)
      .map(p => ({
        user_id: p.user_id,
        name: `${p.first_name} ${p.last_name}`,
        subtitle: `${p.primary_position} • ${p.grad_year}`,
        avatar_url: p.avatar_url,
        type: 'player' as const,
      }));

    const coachResults: SearchResult[] = (coaches || [])
      .filter((c): c is typeof c & { user_id: string; full_name: string } => !!c.user_id && !!c.full_name)
      .map(c => ({
        user_id: c.user_id,
        name: c.full_name,
        subtitle: c.school_name || '',
        avatar_url: c.avatar_url,
        type: 'coach' as const,
      }));

    const results: SearchResult[] = [...playerResults, ...coachResults];

    setSearchResults(results);
    setLoading(false);
  };

  const handleSend = async () => {
    if (!selectedUserId || !message.trim()) return;

    setSending(true);
    try {
      // Create or get conversation
      const { conversationId } = await createConversation([selectedUserId]);

      // Send first message
      await sendMessage(conversationId, message.trim());

      // Navigate to conversation
      router.push(`/dashboard/messages/${conversationId}`);
      onClose();
    } catch (error) {
      console.error('Error creating conversation:', error);
      showToast('Failed to send message. Please try again.', 'error');
    }
    setSending(false);
  };

  const selectedResult = searchResults.find(r => r.user_id === selectedUserId);

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">New Message</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            aria-label="Close new message dialog"
          >
            <IconX size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Recipient Selection */}
          {!selectedUserId ? (
            <>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  To:
                </label>
                <div className="relative">
                  <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => handleSearch(e.target.value)}
                    placeholder="Search for a player or coach..."
                    className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-slate-200
                               focus:border-green-500 focus:ring-2 focus:ring-green-100
                               text-slate-900 placeholder:text-slate-400"
                    autoFocus
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
                  />
                </div>
              </div>

              {/* Search Results */}
              {searchResults.length > 0 && (
                <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-64 overflow-y-auto">
                  {searchResults.map((result) => (
                    <button
                      key={result.user_id}
                      onClick={() => setSelectedUserId(result.user_id)}
                      className="w-full flex items-center gap-3 p-3 hover:bg-slate-50 transition-colors text-left"
                    >
                      {result.avatar_url ? (
                        <img
                          src={result.avatar_url}
                          alt={result.name}
                          className="w-10 h-10 rounded-full object-cover"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center">
                          <span className="text-sm font-medium text-slate-600">
                            {result.name.split(' ').map(n => n[0]).join('')}
                          </span>
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-900 truncate">
                          {result.name}
                        </p>
                        <p className="text-xs text-slate-500 truncate">
                          {result.subtitle}
                        </p>
                      </div>
                      <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-slate-100 text-slate-600">
                        {result.type === 'player' ? 'Player' : 'Coach'}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {loading && (
                <p className="text-sm leading-relaxed text-slate-500 text-center py-4">
                  Searching...
                </p>
              )}
            </>
          ) : (
            <>
              {/* Selected Recipient */}
              <div className="flex items-center gap-3 p-3 bg-green-50 rounded-lg border border-green-200">
                {selectedResult?.avatar_url ? (
                  <img
                    src={selectedResult.avatar_url}
                    alt={selectedResult.name}
                    className="w-10 h-10 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                    <span className="text-sm font-medium text-green-700">
                      {selectedResult?.name.split(' ').map(n => n[0]).join('')}
                    </span>
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 truncate">
                    {selectedResult?.name}
                  </p>
                  <p className="text-xs text-slate-600 truncate">
                    {selectedResult?.subtitle}
                  </p>
                </div>
                <button
                  onClick={() => {
                    setSelectedUserId(undefined);
                    setSearchQuery('');
                    setSearchResults([]);
                  }}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-white transition-colors"
                >
                  <IconX size={16} />
                </button>
              </div>

              {/* Message Input */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Message:
                </label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Type your message..."
                  rows={6}
                  className="w-full px-4 py-2.5 rounded-lg border border-slate-200
                             focus:border-green-500 focus:ring-2 focus:ring-green-100
                             text-slate-900 placeholder:text-slate-400 resize-none"
                  autoFocus
                />
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        {selectedUserId && (
          <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-end gap-3">
            <Button variant="ghost" onClick={onClose} disabled={sending}>
              Cancel
            </Button>
            <Button
              onClick={handleSend}
              disabled={!message.trim() || sending}
            >
              {sending ? 'Sending...' : 'Send Message'}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
