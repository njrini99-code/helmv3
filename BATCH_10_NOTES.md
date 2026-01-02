# BATCH 10: Messaging UI - Implementation Notes

## Summary

The BATCH 10 specification provided a comprehensive glass messaging UI design with the following features:
- ThreadList component
- ChatView with message bubbles
- MessageComposer with attachments
- TypingIndicator
- Real-time subscriptions

## Issue Discovered

The BATCH 10 spec assumed a rich messaging schema with:
```typescript
interface Message {
  content: string;
  content_type: 'text' | 'image' | 'file' | 'system';
  attachments?: Attachment[];
  is_deleted: boolean;
  deleted_at?: string;
  edited_at?: string;
  reply_to_id?: string;
  created_at: string;
  // ...more fields
}
```

However, the **actual database schema** is much simpler:
```typescript
// Actual messages table schema
interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  read: boolean | null;
  sent_at: string | null;
  updated_at: string | null;
}
```

## What Was Kept

✅ **`src/hooks/use-messages-subscription.ts`** - Adapted to work with the actual database schema
- Real-time message subscriptions
- Send/delete/mark as read functions
- Compatible with existing `messages` table

## What Was Removed

❌ Removed components (didn't match actual schema):
- `src/components/messaging/ThreadList.tsx`
- `src/components/messaging/ChatView.tsx`
- `src/components/messaging/MessageBubble.tsx`
- `src/components/messaging/MessageComposer.tsx`
- `src/components/messaging/TypingIndicator.tsx`
- `src/hooks/use-typing-indicator.ts`
- `src/types/messaging.ts`

These components referenced fields that don't exist in the database:
- `content_type` - doesn't exist
- `attachments` - doesn't exist
- `is_deleted` - doesn't exist
- `participants` array - doesn't exist
- etc.

## Options Going Forward

### Option 1: Update Database Schema (Recommended for Rich Messaging)

If you want the full-featured messaging system from BATCH 10, update the database:

```sql
-- Add to messages table
ALTER TABLE messages
  ADD COLUMN content_type TEXT DEFAULT 'text',
  ADD COLUMN attachments JSONB,
  ADD COLUMN is_deleted BOOLEAN DEFAULT false,
  ADD COLUMN deleted_at TIMESTAMPTZ,
  ADD COLUMN edited_at TIMESTAMPTZ,
  ADD COLUMN reply_to_id UUID REFERENCES messages(id);

-- Create conversation_participants table
CREATE TABLE conversation_participants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID REFERENCES conversations(id),
  user_id UUID REFERENCES users(id),
  last_read_at TIMESTAMPTZ,
  is_muted BOOLEAN DEFAULT false
);
```

Then the BATCH 10 components can be recreated to work with this rich schema.

### Option 2: Use Existing Simple Messaging

The current messaging system works with the simple schema. Use existing components:
- `src/components/messages/NewMessageModal.tsx`
- `src/lib/types/messages.ts` (has UIMessage, ConversationWithMeta, etc.)

These work with the current database and don't require schema changes.

## Deliverables

✅ Created: `use-messages-subscription` hook (works with actual schema)
❌ Skipped: Full BATCH 10 UI components (schema mismatch)
✅ Zero new TypeScript errors introduced
✅ Documented the discrepancy for future implementation

---

**Status**: BATCH 10 paused pending database schema decision.
