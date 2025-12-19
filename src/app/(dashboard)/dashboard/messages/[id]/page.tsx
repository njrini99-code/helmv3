'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import { Header } from '@/components/layout/header';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { PageLoading } from '@/components/ui/loading';
import { IconSend } from '@/components/icons';
import { useMessages, useConversations } from '@/hooks/use-messages';
import { useAuth } from '@/hooks/use-auth';
import { getFullName, formatDateTime, cn } from '@/lib/utils';

export default function ConversationPage() {
  const params = useParams();
  const conversationId = params.id as string;
  const { user } = useAuth();
  const { conversations } = useConversations();
  const { messages, loading, sendMessage } = useMessages(conversationId);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const conversation = conversations.find(c => c.id === conversationId);
  const other = conversation?.other_user;
  const otherName = other?.coach?.full_name || getFullName(other?.player?.first_name, other?.player?.last_name) || 'Unknown';
  const otherSubtitle = other?.coach?.school_name || (other?.player ? `${other.player.primary_position} • ${other.player.grad_year}` : '');

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || sending) return;

    setSending(true);
    const success = await sendMessage(input.trim());
    if (success) setInput('');
    setSending(false);
  };

  if (loading) return <PageLoading />;

  return (
    <>
      <Header title={otherName} subtitle={otherSubtitle} backHref="/dashboard/messages" />
      <div className="flex flex-col h-[calc(100vh-4rem)]">
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {messages.map((msg) => {
            const isOwn = msg.sender_id === user?.id;
            return (
              <div key={msg.id} className={cn('flex', isOwn ? 'justify-end' : 'justify-start')}>
                <div className={cn('max-w-md', isOwn ? 'order-2' : 'order-1')}>
                  {!isOwn && <Avatar name={otherName} size="sm" className="mb-1" />}
                  <div className={cn('px-4 py-2 rounded-2xl', isOwn ? 'bg-brand-600 text-white rounded-br-md' : 'bg-cream-200 text-gray-900 rounded-bl-md')}>
                    <p className="text-sm">{msg.content}</p>
                  </div>
                  <p className={cn('text-xs text-gray-400 mt-1', isOwn ? 'text-right' : 'text-left')}>
                    {formatDateTime(msg.sent_at)}
                  </p>
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        <form onSubmit={handleSend} className="p-4 border-t border-border-light bg-white">
          <div className="flex items-center gap-3 max-w-3xl mx-auto">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type a message..."
              autoComplete="off"
              className="flex-1 px-4 py-3 text-sm bg-cream-50 border border-border-light rounded-xl focus:outline-none focus:border-brand-500 focus:bg-white"
            />
            <Button type="submit" disabled={!input.trim() || sending}>
              <IconSend size={18} />
            </Button>
          </div>
        </form>
      </div>
    </>
  );
}
