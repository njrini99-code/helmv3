'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { IconSend, IconArrowLeft, IconCheck } from '@/components/icons';
import { AttachmentButton } from './AttachmentButton';
import { AttachmentPreview } from './AttachmentPreview';
import { MessageAttachments, type MessageAttachmentData } from './MessageAttachment';
import {
  type PendingAttachment,
  validateFile,
  getFileType,
  createPreviewUrl,
  revokePreviewUrl,
} from '@/lib/storage/attachments';
import type { Message } from '@/lib/types';
import type { GolfConversationParticipant } from '@/hooks/golf/use-golf-messages';

// Extended message type with attachments (read is already in Message type)
export interface MessageWithAttachments extends Message {
  attachments?: MessageAttachmentData[];
}

// Message status indicator component
function MessageStatus({ read, isOwn }: { read?: boolean | null; isOwn: boolean }) {
  if (!isOwn) return null;

  return (
    <span className="inline-flex items-center ml-1">
      {read ? (
        // Double check for read
        <span className="flex text-green-500">
          <IconCheck size={12} className="-mr-1.5" />
          <IconCheck size={12} />
        </span>
      ) : (
        // Single check for sent/delivered
        <IconCheck size={12} className="text-warm-400" />
      )}
    </span>
  );
}

interface GolfChatWindowProps {
  messages: MessageWithAttachments[];
  participant?: GolfConversationParticipant;
  currentUserId: string;
  conversationId: string;
  loading?: boolean;
  onSend: (content: string, attachments?: PendingAttachment[]) => Promise<boolean>;
  onBack?: () => void;
  className?: string;
}

export function GolfChatWindow({
  messages,
  participant,
  currentUserId,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  conversationId: _conversationId, // Reserved for future use
  loading,
  onSend,
  onBack,
  className,
}: GolfChatWindowProps) {
  const [inputValue, setInputValue] = useState('');
  const [sending, setSending] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Clean up preview URLs on unmount
  useEffect(() => {
    return () => {
      pendingAttachments.forEach((a) => revokePreviewUrl(a.previewUrl));
    };
  }, [pendingAttachments]);

  const handleFilesSelected = useCallback((files: File[]) => {
    const newAttachments: PendingAttachment[] = [];

    for (const file of files) {
      const validation = validateFile(file);
      if (!validation.valid) {
        // Show error - could use toast here
        console.warn(`File validation failed for ${file.name}: ${validation.error}`);
        continue;
      }

      const attachment: PendingAttachment = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        file,
        previewUrl: createPreviewUrl(file),
        metadata: {
          fileName: file.name,
          fileType: getFileType(file.type),
          mimeType: file.type,
          fileSize: file.size,
        },
        uploadProgress: 0,
        status: 'pending',
      };
      newAttachments.push(attachment);
    }

    if (newAttachments.length > 0) {
      setPendingAttachments((prev) => [...prev, ...newAttachments]);
    }
  }, []);

  const handleRemoveAttachment = useCallback((id: string) => {
    setPendingAttachments((prev) => {
      const attachment = prev.find((a) => a.id === id);
      if (attachment) {
        revokePreviewUrl(attachment.previewUrl);
      }
      return prev.filter((a) => a.id !== id);
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const hasContent = inputValue.trim().length > 0;
    const hasAttachments = pendingAttachments.length > 0;

    if ((!hasContent && !hasAttachments) || sending) return;

    setSending(true);

    // Set all attachments to uploading status
    if (hasAttachments) {
      setPendingAttachments((prev) =>
        prev.map((a) => ({ ...a, status: 'uploading' as const, uploadProgress: 10 }))
      );
    }

    const success = await onSend(
      inputValue.trim(),
      hasAttachments ? pendingAttachments : undefined
    );

    if (success) {
      setInputValue('');
      // Clean up preview URLs
      pendingAttachments.forEach((a) => revokePreviewUrl(a.previewUrl));
      setPendingAttachments([]);
    } else {
      // Mark attachments as error
      setPendingAttachments((prev) =>
        prev.map((a) => ({
          ...a,
          status: 'error' as const,
          error: 'Failed to send',
        }))
      );
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

    return (
      date.toLocaleDateString([], { month: 'short', day: 'numeric' }) +
      ' ' +
      date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    );
  };

  const canSend = (inputValue.trim().length > 0 || pendingAttachments.length > 0) && !sending;

  return (
    <div className={cn('flex flex-col bg-white', className)}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-warm-200 bg-white">
        {onBack && (
          <button
            onClick={onBack}
            className="lg:hidden p-2 -ml-2 text-warm-500 hover:text-warm-700 hover:bg-warm-100 rounded-lg"
          >
            <IconArrowLeft size={20} />
          </button>
        )}
        {participant && (
          <>
            <Avatar name={participant.name} src={participant.avatar} size="md" />
            <div className="flex-1 min-w-0">
              <p className="font-medium text-warm-900 truncate">{participant.name}</p>
              <p className="text-sm text-warm-500 truncate">{participant.subtitle}</p>
            </div>
          </>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4" data-scroll-container>
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="animate-spin h-6 w-6 border-2 border-green-600 border-t-transparent rounded-full" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <p className="text-warm-500">No messages yet</p>
            <p className="text-sm text-warm-400 mt-1">
              Send a message to start the conversation
            </p>
          </div>
        ) : (
          messages.map((message, index) => {
            const isOwn = message.sender_id === currentUserId;
            const showAvatar =
              !isOwn && (index === 0 || messages[index - 1]?.sender_id !== message.sender_id);
            const hasAttachments = message.attachments && message.attachments.length > 0;
            const hasContent = message.content && message.content.trim().length > 0;

            return (
              <div
                key={message.id}
                className={cn('flex gap-2', isOwn ? 'justify-end' : 'justify-start')}
              >
                {!isOwn && (
                  <div className="w-8 flex-shrink-0">
                    {showAvatar && participant && (
                      <Avatar name={participant.name} src={participant.avatar} size="sm" />
                    )}
                  </div>
                )}
                <div className={cn('max-w-[70%] space-y-1')}>
                  {/* Attachments */}
                  {hasAttachments && (
                    <MessageAttachments
                      attachments={message.attachments!}
                      isOwnMessage={isOwn}
                    />
                  )}

                  {/* Text content */}
                  {hasContent && (
                    <div
                      className={cn(
                        'rounded-2xl px-4 py-2',
                        isOwn
                          ? 'bg-green-600 text-white rounded-br-md'
                          : 'bg-warm-100 text-warm-900 rounded-bl-md'
                      )}
                    >
                      <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>
                    </div>
                  )}

                  {/* Timestamp & Read Status */}
                  <p
                    className={cn(
                      'text-xs px-1 flex items-center',
                      isOwn ? 'justify-end text-warm-400' : 'text-warm-400'
                    )}
                  >
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

      {/* Attachment Preview */}
      <AttachmentPreview
        attachments={pendingAttachments}
        onRemove={handleRemoveAttachment}
      />

      {/* Input */}
      <form onSubmit={handleSubmit} className="p-4 border-t border-warm-200 bg-white">
        <div className="flex items-center gap-2">
          <AttachmentButton
            onFilesSelected={handleFilesSelected}
            disabled={sending}
          />
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Type a message..."
            enterKeyHint="send"
            autoComplete="off"
            className="flex-1 px-4 py-2 border border-warm-200 rounded-full text-base md:text-sm focus:outline-none focus:ring-2 focus:ring-green-500/40"
            disabled={sending}
          />
          <Button
            type="submit"
            size="sm"
            disabled={!canSend}
            className="rounded-full w-10 h-10 p-0 active:scale-[0.98] transition-transform"
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
