'use client';

import { useState, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { IconSend, IconArrowLeft } from '@/components/icons';
import type { Message } from '@/lib/types';
import type { GolfConversationParticipant } from '@/hooks/golf/use-golf-messages';

interface GolfChatWindowProps {
  messages: Message[];
  participant?: GolfConversationParticipant;
  currentUserId: string;
  loading?: boolean;
  onSend: (content: string) => Promise<boolean>;
  onBack?: () => void;
  className?: string;
}

export function GolfChatWindow({
  messages,
  participant,
  currentUserId,
  loading,
  onSend,
  onBack,
  className,
}: GolfChatWindowProps) {
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

  const formatTime = (timestamp: string) => {
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
    <div className={cn('flex flex-col bg-white', className)}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200 bg-white">
        {onBack && (
          <button
            onClick={onBack}
            className="lg:hidden p-2 -ml-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg"
          >
            <IconArrowLeft size={20} />
          </button>
        )}
        {participant && (
          <>
            <Avatar name={participant.name} src={participant.avatar} size="md" />
            <div className="flex-1 min-w-0">
              <p className="font-medium text-slate-900 truncate">{participant.name}</p>
              <p className="text-sm text-slate-500 truncate">{participant.subtitle}</p>
            </div>
          </>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="animate-spin h-6 w-6 border-2 border-green-600 border-t-transparent rounded-full" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <p className="text-slate-500">No messages yet</p>
            <p className="text-sm text-slate-400 mt-1">Send a message to start the conversation</p>
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
                    'max-w-[70%] rounded-2xl px-4 py-2',
                    isOwn
                      ? 'bg-green-600 text-white rounded-br-md'
                      : 'bg-slate-100 text-slate-900 rounded-bl-md'
                  )}
                >
                  <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>
                  <p className={cn(
                    'text-xs mt-1',
                    isOwn ? 'text-green-200' : 'text-slate-400'
                  )}>
                    {formatTime(message.sent_at)}
                  </p>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="p-4 border-t border-slate-200 bg-white">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Type a message..."
            className="flex-1 px-4 py-2 border border-slate-200 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-green-500/40"
            disabled={sending}
          />
          <Button
            type="submit"
            size="icon"
            disabled={!inputValue.trim() || sending}
            className="rounded-full"
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
