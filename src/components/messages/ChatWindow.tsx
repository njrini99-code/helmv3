'use client';

import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  IconArrowLeft,
  IconSend,
  IconCheck,
  IconCheckCheck,
  IconCircle,
  IconMoreVertical,
  IconPaperclip,
  IconSmile,
} from '@/components/icons';
import type { Message } from '@/lib/types';
import type { UIMessage, ParticipantDetails } from '@/lib/types/messages';
import { groupMessagesByDate, formatMessageTime } from '@/lib/types/messages';

interface ChatWindowProps {
  messages: Message[];
  participant: ParticipantDetails | null;
  currentUserId: string;
  loading?: boolean;
  onSend: (message: string) => Promise<boolean>;
  onBack?: () => void;
  className?: string;
}

export function ChatWindow({
  messages,
  participant,
  currentUserId,
  loading = false,
  onSend,
  onBack,
  className,
}: ChatWindowProps) {
  const [inputValue, setInputValue] = useState('');
  const [sending, setSending] = useState(false);
  const [isTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  const scrollToBottom = useCallback(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [inputValue]);

  // Group messages by date
  const groupedMessages = useMemo(() => {
    const uiMessages: UIMessage[] = messages.map(m => ({
      ...m,
      status: m.read ? 'read' : 'sent',
    }));
    return groupMessagesByDate(uiMessages);
  }, [messages]);

  const handleSend = async () => {
    const content = inputValue.trim();
    if (!content || sending) return;

    setSending(true);
    setInputValue('');

    const success = await onSend(content);
    if (!success) {
      setInputValue(content); // Restore on failure
    }

    setSending(false);

    // Focus back on textarea
    textareaRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className={cn('flex flex-col h-full bg-white', className)}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-3">
        {onBack && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onBack}
            className="lg:hidden -ml-2"
          >
            <IconArrowLeft size={20} />
          </Button>
        )}

        <div className="relative flex-shrink-0">
          <Avatar
            name={participant?.name || 'Unknown'}
            src={participant?.avatar}
            size="md"
          />
          {participant?.isOnline && (
            <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 border-2 border-white rounded-full" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-slate-900 truncate">
            {participant?.name || 'Unknown'}
          </h3>
          {participant?.subtitle && (
            <p className="text-xs text-slate-500 truncate">
              {isTyping ? (
                <span className="text-green-600">Typing...</span>
              ) : participant?.isOnline ? (
                <span className="text-green-600">Online</span>
              ) : (
                participant.subtitle
              )}
            </p>
          )}
        </div>

        <Button variant="ghost" size="sm" className="flex-shrink-0">
          <IconMoreVertical size={18} />
        </Button>
      </div>

      {/* Messages Area */}
      <div ref={containerRef} className="flex-1 overflow-y-auto p-4 space-y-6">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-full">
            <div className="animate-spin h-8 w-8 border-2 border-green-600 border-t-transparent rounded-full" />
            <p className="text-sm text-slate-500 mt-3">Loading messages...</p>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <Avatar
              name={participant?.name || 'Unknown'}
              src={participant?.avatar}
              size="xl"
            />
            <h4 className="font-semibold text-slate-900 mt-4">
              {participant?.name}
            </h4>
            {participant?.subtitle && (
              <p className="text-sm text-slate-500">{participant.subtitle}</p>
            )}
            <p className="text-sm text-slate-400 mt-3">
              Start the conversation by sending a message below
            </p>
          </div>
        ) : (
          Array.from(groupedMessages.entries()).map(([date, dateMessages]) => (
            <div key={date}>
              {/* Date Divider */}
              <div className="flex items-center justify-center mb-4">
                <div className="bg-slate-100 text-slate-500 text-xs font-medium px-3 py-1 rounded-full">
                  {date}
                </div>
              </div>

              {/* Messages */}
              <div className="space-y-2">
                {dateMessages.map((message, idx) => {
                  const isFromMe = message.sender_id === currentUserId;
                  const prevMessage = idx > 0 ? dateMessages[idx - 1] : null;
                  const showAvatar =
                    !isFromMe &&
                    (!prevMessage || prevMessage.sender_id !== message.sender_id);

                  return (
                    <MessageBubble
                      key={message.id}
                      message={message}
                      isFromMe={isFromMe}
                      showAvatar={showAvatar}
                      participant={participant}
                    />
                  );
                })}
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="px-4 py-3 border-t border-slate-100">
        <div className="flex items-end gap-2">
          <Button variant="ghost" size="sm" className="flex-shrink-0 mb-1">
            <IconPaperclip size={20} className="text-slate-400" />
          </Button>
          <Button variant="ghost" size="sm" className="flex-shrink-0 mb-1">
            <IconSmile size={20} className="text-slate-400" />
          </Button>

          <div className="flex-1 relative">
            <textarea
              ref={textareaRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a message..."
              className={cn(
                'w-full px-4 py-2.5 rounded-2xl border border-slate-200 resize-none',
                'focus:outline-none focus:border-green-500 focus:ring-2 focus:ring-green-100',
                'text-sm text-slate-900 placeholder:text-slate-400',
                'max-h-[120px] min-h-[44px]'
              )}
              rows={1}
            />
          </div>

          <Button
            variant="primary"
            size="sm"
            onClick={handleSend}
            disabled={!inputValue.trim() || sending}
            className="flex-shrink-0 !rounded-full !p-2.5 mb-1"
          >
            {sending ? (
              <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
            ) : (
              <IconSend size={18} />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

interface MessageBubbleProps {
  message: UIMessage;
  isFromMe: boolean;
  showAvatar: boolean;
  participant: ParticipantDetails | null;
}

function MessageBubble({ message, isFromMe, showAvatar, participant }: MessageBubbleProps) {
  return (
    <div className={cn('flex items-end gap-2', isFromMe && 'flex-row-reverse')}>
      {/* Avatar placeholder for alignment */}
      <div className="w-8 flex-shrink-0">
        {showAvatar && !isFromMe && (
          <Avatar
            name={participant?.name || 'Unknown'}
            src={participant?.avatar}
            size="sm"
          />
        )}
      </div>

      {/* Message Bubble */}
      <div
        className={cn(
          'max-w-[70%] px-4 py-2.5 rounded-2xl',
          isFromMe
            ? 'bg-green-600 text-white rounded-br-sm'
            : 'bg-slate-100 text-slate-900 rounded-bl-sm'
        )}
      >
        <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>
        <div
          className={cn(
            'flex items-center justify-end gap-1 mt-1',
            isFromMe ? 'text-green-200' : 'text-slate-400'
          )}
        >
          <span className="text-[10px]">{message.sent_at ? formatMessageTime(message.sent_at) : ''}</span>
          {isFromMe && <MessageStatusIcon status={message.status} />}
        </div>
      </div>
    </div>
  );
}

function MessageStatusIcon({ status }: { status?: string }) {
  switch (status) {
    case 'sending':
      return <IconCircle size={12} className="animate-pulse" />;
    case 'sent':
      return <IconCheck size={12} />;
    case 'delivered':
      return <IconCheckCheck size={12} />;
    case 'read':
      return <IconCheckCheck size={12} className="text-green-200" />;
    default:
      return <IconCheck size={12} />;
  }
}
