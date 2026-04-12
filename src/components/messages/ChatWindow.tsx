'use client';

import { useState, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { IconSend, IconArrowLeft, IconCheck } from '@/components/icons';
import type { Message } from '@/lib/types';
import type { ParticipantDetails } from '@/lib/types/messages';

// Message type already has read field from database

// Message status indicator component
function MessageStatus({ read, isOwn }: { read?: boolean | null; isOwn: boolean }) {
  if (!isOwn) return null;

  return (
    <span className="inline-flex items-center ml-1">
      {read ? (
        // Double check for read
        <span className="flex text-primary-300">
          <IconCheck size={12} className="-mr-1.5" />
          <IconCheck size={12} />
        </span>
      ) : (
        // Single check for sent/delivered
        <IconCheck size={12} className="text-primary-200/60" />
      )}
    </span>
  );
}

interface ChatWindowProps {
  messages: Message[];
  participant?: ParticipantDetails | null;
  currentUserId: string;
  loading?: boolean;
  onSend: (content: string) => Promise<boolean>;
  onBack?: () => void;
  className?: string;
}

export function ChatWindow({
  messages,
  participant,
  currentUserId,
  loading,
  onSend,
  onBack,
  className,
}: ChatWindowProps) {
  const [inputValue, setInputValue] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || sending) return;

    setSending(true);
    const success = await onSend(inputValue.trim());
    if (success) {
      setInputValue('');
    }
    setSending(false);
  };

  const formatTime = (timestamp: string | null) => {
    if (!timestamp) return '';

    const date = new Date(timestamp);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();

    if (isToday) {
      return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    }

    return date.toLocaleDateString([], { month: 'short', day: 'numeric' }) +
           ' ' + date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  };

  return (
    <div className={cn('flex flex-col bg-[#FFFEFA]', className)}>
      {/* Header — iOS-native chat title bar with back chevron on mobile */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-warm-200/70 bg-white/90 backdrop-blur-xl sticky top-0 z-10">
        {onBack && (
          <button
            onClick={onBack}
            aria-label="Back"
            className="lg:hidden p-2 -ml-2 text-warm-500 hover:text-warm-800 hover:bg-warm-100 rounded-lg active:scale-95 transition-all"
          >
            <IconArrowLeft size={20} />
          </button>
        )}
        {participant && (
          <>
            <Avatar name={participant.name} src={participant.avatar} size="md" />
            <div className="flex-1 min-w-0">
              <p className="text-[15px] font-semibold text-warm-900 tracking-[-0.01em] truncate">{participant.name}</p>
              <p className="text-[12px] text-warm-500 truncate">{participant.subtitle}</p>
            </div>
          </>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto overscroll-contain p-4 space-y-4 [-webkit-overflow-scrolling:touch]">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="animate-spin h-6 w-6 border-2 border-primary-600 border-t-transparent rounded-full" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary-100/60 to-emerald-100/50 flex items-center justify-center mb-4">
              <IconSend size={22} className="text-primary-600/80" />
            </div>
            <p className="text-[15px] font-semibold text-warm-900">No messages yet</p>
            <p className="text-[13px] text-warm-500 mt-1">Send a message to start the conversation</p>
          </div>
        ) : (
          messages.map((message, index) => {
            const isOwn = message.sender_id === currentUserId;
            const showAvatar = !isOwn && (index === 0 || messages[index - 1]?.sender_id !== message.sender_id);

            return (
              <div
                key={message.id}
                className={cn(
                  'flex gap-2',
                  isOwn ? 'justify-end' : 'justify-start'
                )}
              >
                {!isOwn && (
                  <div className="w-8 flex-shrink-0">
                    {showAvatar && participant && (
                      <Avatar name={participant.name} src={participant.avatar} size="sm" />
                    )}
                  </div>
                )}
                <div
                  className={cn(
                    'max-w-[75%] rounded-[18px] px-3.5 py-2 shadow-[0_1px_1px_rgba(16,24,40,0.05)]',
                    isOwn
                      ? 'bg-primary-600 text-white rounded-br-[6px]'
                      : 'bg-warm-100 text-warm-900 rounded-bl-[6px]'
                  )}
                >
                  <p className="text-[15px] whitespace-pre-wrap break-words leading-snug">{message.content}</p>
                  <p className={cn(
                    'text-[11px] mt-1 flex items-center',
                    isOwn ? 'text-primary-100/90 justify-end' : 'text-warm-400'
                  )}>
                    {formatTime(message.created_at)}
                    <MessageStatus read={message.read} isOwn={isOwn} />
                  </p>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form
        onSubmit={handleSubmit}
        className="px-4 pt-3 border-t border-warm-200/70 bg-white/90 backdrop-blur-xl"
        style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
      >
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Message"
            className="flex-1 px-4 py-2.5 bg-warm-100/80 border border-warm-200/60 rounded-full text-[15px] text-warm-900 placeholder:text-warm-400 focus:outline-none focus:ring-2 focus:ring-primary-500/40 focus:bg-white transition-colors"
            disabled={sending}
          />
          <Button
            type="submit"
            size="sm"
            disabled={!inputValue.trim() || sending}
            className="rounded-full w-10 h-10 p-0"
          >
            {sending ? (
              <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
            ) : (
              <IconSend size={18} />
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
