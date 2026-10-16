import { z } from 'zod';
import { CONTACT_LIMITS } from '../constants';
import { CONTACT_TOPICS } from '../enums';

export const contactMessageSchema = z.object({
  name: z.string().trim().min(1).max(CONTACT_LIMITS.nameMax),
  email: z.email().max(CONTACT_LIMITS.emailMax),
  topic: z.enum(CONTACT_TOPICS),
  message: z.string().trim().min(CONTACT_LIMITS.messageMin).max(CONTACT_LIMITS.messageMax),
  /** Honeypot. Hidden from people; bots fill it in. The route treats a filled value as spam. */
  hp: z.string().max(200).default(''),
});

export type ContactMessageInput = z.infer<typeof contactMessageSchema>;
