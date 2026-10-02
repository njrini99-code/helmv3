/**
 * The conversation-kind rules now live in `@/lib/golf/conversation-kind`, outside
 * the Fairway folder, so a surface that is not Fairway can ask "is this a group?"
 * and label a thread the same way without importing Fairway. This file keeps the
 * old import path working for the Fairway messages components and their tests.
 */
export * from '@/lib/golf/conversation-kind';
