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
            <p className="text-sm leading-relaxed text-slate-500 mt-3">Loading messages...</p>
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
              <p className="text-sm leading-relaxed text-slate-500">{participant.subtitle}</p>
            )}
            <p className="text-sm leading-relaxed text-slate-400 mt-3">
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
                  const nextMessage = idx < dateMessages.length - 1 ? dateMessages[idx + 1] : null;

                  // Show avatar only for first message in a group
                  const showAvatar =
                    !isFromMe &&
                    (!prevMessage || prevMessage.sender_id !== message.sender_id);

                  // Determine if this message is part of a group
                  const isGroupStart = !prevMessage || prevMessage.sender_id !== message.sender_id;
                  const isGroupEnd = !nextMessage || nextMessage.sender_id !== message.sender_id;

                  return (
                    <MessageBubble
                      key={message.id}
                      message={message}
                      isFromMe={isFromMe}
                      showAvatar={showAvatar}
                      isGroupStart={isGroupStart}
                      isGroupEnd={isGroupEnd}
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
      <div className="px-4 py-3 border-t border-slate-100 bg-white">
        <div className="flex items-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="flex-shrink-0 mb-1 hover:bg-slate-100"
            title="Attach file (coming soon)"
            disabled
          >
            <IconPaperclip size={20} className="text-slate-300" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="flex-shrink-0 mb-1 hover:bg-slate-100"
            title="Add emoji (coming soon)"
            disabled
          >
            <IconSmile size={20} className="text-slate-300" />
          </Button>

          <div className="flex-1 relative">
            <textarea
              ref={textareaRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a message..."
              maxLength={2000}
              className={cn(
                'w-full px-4 py-2.5 pr-16 rounded-2xl border border-slate-200 resize-none',
                'focus:outline-none focus:border-green-500 focus:ring-2 focus:ring-green-100',
                'text-sm text-slate-900 placeholder:text-slate-400',
                'max-h-[120px] min-h-[44px] transition-all'
              )}
              rows={1}
            />
            {/* Character count */}
            {inputValue.length > 0 && (
              <div className="absolute bottom-2 right-3 text-[10px] text-slate-400 font-medium pointer-events-none">
                {inputValue.length}/2000
              </div>
            )}
          </div>

          <Button
            variant="primary"
            size="sm"
            onClick={handleSend}
            disabled={!inputValue.trim() || sending}
            className={cn(
              'flex-shrink-0 !rounded-full !p-2.5 mb-1 transition-all',
              inputValue.trim()
                ? 'opacity-100 scale-100'
                : 'opacity-50 scale-95'
            )}
            title={inputValue.trim() ? 'Send message (Enter)' : 'Type a message to send'}
          >
            {sending ? (
              <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
            ) : (
              <IconSend size={18} />
            )}
          </Button>
        </div>
        {/* Hint text */}
        <p className="text-[10px] text-slate-400 mt-2 text-center">
          Press <kbd className="px-1.5 py-0.5 bg-slate-100 border border-slate-200 rounded text-[9px] font-medium">Enter</kbd> to send • <kbd className="px-1.5 py-0.5 bg-slate-100 border border-slate-200 rounded text-[9px] font-medium">Shift+Enter</kbd> for new line
        </p>
      </div>
    </div>
  );
}

interface MessageBubbleProps {
  message: UIMessage;
  isFromMe: boolean;
  showAvatar: boolean;
  isGroupStart: boolean;
  isGroupEnd: boolean;
  participant: ParticipantDetails | null;
}

function MessageBubble({ message, isFromMe, showAvatar, isGroupStart, isGroupEnd, participant }: MessageBubbleProps) {
  const [showActions, setShowActions] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  // Determine bubble corner radius based on position in group
  const getBubbleRadius = () => {
    if (isFromMe) {
      if (!isGroupStart && !isGroupEnd) return 'rounded-2xl rounded-br-md'; // Middle of group
      if (!isGroupStart) return 'rounded-2xl rounded-br-sm'; // End of group
      if (!isGroupEnd) return 'rounded-2xl rounded-tr-md'; // Start of group
      return 'rounded-2xl rounded-br-sm'; // Single message
    } else {
      if (!isGroupStart && !isGroupEnd) return 'rounded-2xl rounded-bl-md'; // Middle of group
      if (!isGroupStart) return 'rounded-2xl rounded-bl-sm'; // End of group
      if (!isGroupEnd) return 'rounded-2xl rounded-tl-md'; // Start of group
      return 'rounded-2xl rounded-bl-sm'; // Single message
    }
  };

  return (
    <div
      className={cn(
        'flex items-end gap-2 group',
        isFromMe && 'flex-row-reverse',
        !isGroupEnd && 'mb-0.5' // Tighter spacing for grouped messages
      )}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
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
      <div className="relative flex items-end gap-2">
        {/* Message Actions (appears on hover) */}
        {showActions && (
          <div
            className={cn(
              'flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity',
              isFromMe ? 'order-2' : 'order-1'
            )}
          >
            <button
              onClick={handleCopy}
              className="p-1.5 rounded-lg hover:bg-slate-200 transition-colors"
              title={copied ? 'Copied!' : 'Copy message'}
            >
              {copied ? (
                <IconCheck size={14} className="text-green-600" />
              ) : (
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-slate-500"
                >
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                </svg>
              )}
            </button>
          </div>
        )}

        <div
          className={cn(
            'max-w-[70%] px-4 py-2.5 transition-all',
            getBubbleRadius(),
            isFromMe
              ? 'bg-green-600 text-white shadow-sm'
              : 'bg-slate-100 text-slate-900 hover:bg-slate-150 shadow-sm',
            isFromMe ? 'order-1' : 'order-2'
          )}
          title={message.sent_at ? new Date(message.sent_at).toLocaleString() : ''}
        >
          <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">
            {message.content}
          </p>
          {isGroupEnd && (
            <div
              className={cn(
                'flex items-center justify-end gap-1 mt-1.5',
                isFromMe ? 'text-green-200' : 'text-slate-400'
              )}
            >
              <span className="text-[10px] font-medium">
                {message.sent_at ? formatMessageTime(message.sent_at) : ''}
              </span>
              {isFromMe && <MessageStatusIcon status={message.status} />}
            </div>
          )}
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
