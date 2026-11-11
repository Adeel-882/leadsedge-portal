import { z } from 'zod';
import type { ConversationMessage } from './types';

export const DELETED_MESSAGE = 'This message was deleted.';
export const messageEditSchema = z.discriminatedUnion('operation', [
  z.object({ operation: z.literal('edit'), version: z.number().int().min(0).max(2147483646), body: z.string().max(5000).refine(value => Boolean(value.trim())) }).strict(),
  z.object({ operation: z.literal('delete'), version: z.number().int().min(0).max(2147483646) }).strict(),
]);
export function newestMessage(a: ConversationMessage, b: ConversationMessage): ConversationMessage {
  if (a.deletedAt && !b.deletedAt) return a;
  if (b.deletedAt && !a.deletedAt) return b;
  return (a.version ?? 0) > (b.version ?? 0) ? a : b;
}
export function canMutateMessage(message: ConversationMessage, viewerId: string) {
  return message.senderId === viewerId && message.messageType === 'user' && message.version !== undefined && !message.deletedAt && !message.id.startsWith('pending-');
}
