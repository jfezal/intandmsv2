import { z } from 'zod';

export const MESSAGE_MAX_LENGTH = 4000;
export const MESSAGE_EDIT_WINDOW_MINUTES = 15;
export const GROUP_MAX_MEMBERS = 50;
export const MESSAGE_MAX_DOCUMENTS = 5;

const uuid = z.string().uuid();
const body = z.string().trim().min(1).max(MESSAGE_MAX_LENGTH);
const title = z.string().trim().min(1).max(200);

export const sendMessageBodySchema = z.object({
  body,
  documentIds: z.array(uuid).max(MESSAGE_MAX_DOCUMENTS).default([]),
});

export const editMessageBodySchema = z.object({ body });

export const createDirectConversationBodySchema = z.object({ userId: uuid });

export const createGroupConversationBodySchema = z.object({
  title,
  memberIds: z.array(uuid).min(1).max(GROUP_MAX_MEMBERS - 1),
});

export const renameConversationBodySchema = z.object({ title });

export const addMembersBodySchema = z.object({ userIds: z.array(uuid).min(1).max(GROUP_MAX_MEMBERS) });

export const markReadBodySchema = z.object({ messageId: uuid });

/** Every investigation read states why; the reason is stored in the audit record. */
export const investigationReasonSchema = z.string().trim().min(5).max(500);

export type SendMessageBody = z.infer<typeof sendMessageBodySchema>;
export type CreateGroupConversationBody = z.infer<typeof createGroupConversationBodySchema>;
