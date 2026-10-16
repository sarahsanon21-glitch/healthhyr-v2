import { z } from 'zod';
import { MESSAGE_LIMITS } from '../constants';

export const sendMessageSchema = z.object({
  recipientId: z.uuid(),
  applicationId: z.uuid().optional(),
  body: z.string().trim().min(1).max(MESSAGE_LIMITS.bodyMax),
});

export type SendMessageInput = z.infer<typeof sendMessageSchema>;
