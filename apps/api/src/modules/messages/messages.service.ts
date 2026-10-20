import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  GROUP_MAX_MEMBERS,
  MESSAGE_EDIT_WINDOW_MINUTES,
  type CreateGroupConversationBody,
  type SendMessageBody,
} from '@intandms/contracts';
import { PERMISSIONS, canEditMessage, directConversationKey, isActiveMember } from '@intandms/core';
import { Prisma } from '@prisma/client';
import { RateLimitService } from '../../common/rate-limit.service';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthPrincipal } from '../authorization/authorization.service';
import { AuthorizationService } from '../authorization/authorization.service';
import { MessageHubService } from './message-hub.service';

const USER_SUMMARY = { id: true, login: true, displayName: true, enabled: true } as const;
const DOCUMENT_ACCESS = { id: true, displayName: true, repositoryId: true, folderId: true, lifecycleState: true } as const;
const PAGE_SIZE = 50;
const LIST_LIMIT = 200;
const SEND_LIMIT_PER_MINUTE = 30;
const PREVIEW_LENGTH = 140;

type DocumentAccessRow = { id: string; displayName: string; repositoryId: string; folderId: string | null; lifecycleState: string };
type Tx = Prisma.TransactionClient;

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authz: AuthorizationService,
    private readonly hub: MessageHubService,
    private readonly rateLimit: RateLimitService,
  ) {}

  // ---------------------------------------------------------------- access

  private canReadDocument(principal: AuthPrincipal, document: DocumentAccessRow | null): Promise<boolean> {
    if (!document || document.lifecycleState !== 'active') return Promise.resolve(false);
    return this.authz.can(principal, PERMISSIONS.DOCUMENTS_READ, {
      repositoryId: document.repositoryId,
      folderId: document.folderId,
    });
  }

  private async requireReadableDocument(principal: AuthPrincipal, documentId: string): Promise<DocumentAccessRow> {
    const document = await this.prisma.client.document.findUnique({ where: { id: documentId }, select: DOCUMENT_ACCESS });
    if (!document || !(await this.canReadDocument(principal, document))) {
      throw new NotFoundException('Document not found.');
    }
    return document;
  }

  /** Conversations the principal may not read answer 404 so their existence is not disclosed. */
  private async requireReadableConversation(principal: AuthPrincipal, conversationId: string) {
    const conversation = await this.prisma.client.conversation.findUnique({
      where: { id: conversationId },
      include: {
        document: { select: DOCUMENT_ACCESS },
        participants: { where: { userId: principal.id } },
      },
    });
    if (!conversation) throw new NotFoundException('Conversation not found.');
    const membership = conversation.participants[0] ?? null;
    if (conversation.kind === 'DOCUMENT') {
      if (!(await this.canReadDocument(principal, conversation.document))) {
        throw new NotFoundException('Conversation not found.');
      }
    } else if (!isActiveMember(membership)) {
      throw new NotFoundException('Conversation not found.');
    }
    return { conversation, membership };
  }

  private async recipientsOf(conversationId: string): Promise<string[]> {
    const rows = await this.prisma.client.conversationParticipant.findMany({
      where: { conversationId, leftAt: null },
      select: { userId: true },
    });
    return rows.map((row) => row.userId);
  }

  private async requireEnabledUsers(userIds: string[]): Promise<void> {
    const found = await this.prisma.client.user.count({ where: { id: { in: userIds }, enabled: true } });
    if (found !== userIds.length) {
      throw new BadRequestException('Every member must be an active user.');
    }
  }

  // ---------------------------------------------------------------- directory

  listUsers(principal: AuthPrincipal, query: string | undefined, includeDisabled: boolean) {
    if (includeDisabled) this.authz.assertPermission(principal, PERMISSIONS.MESSAGES_AUDIT);
    const needle = query?.trim();
    return this.prisma.client.user.findMany({
      where: {
        ...(includeDisabled ? {} : { enabled: true, id: { not: principal.id } }),
        ...(needle
          ? {
              OR: [
                { login: { contains: needle, mode: 'insensitive' } },
                { displayName: { contains: needle, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      select: USER_SUMMARY,
      orderBy: { displayName: 'asc' },
      take: 25,
    });
  }

  // ---------------------------------------------------------------- conversations

  async listConversations(principal: AuthPrincipal) {
    const memberships = await this.prisma.client.conversationParticipant.findMany({
      where: { userId: principal.id, leftAt: null },
      include: {
        conversation: {
          include: {
            document: { select: DOCUMENT_ACCESS },
            participants: { where: { leftAt: null }, include: { user: { select: USER_SUMMARY } } },
          },
        },
      },
      orderBy: { conversation: { lastMessageAt: { sort: 'desc', nulls: 'last' } } },
      take: LIST_LIMIT,
    });

    const visible: typeof memberships = [];
    for (const membership of memberships) {
      const { conversation } = membership;
      if (conversation.kind === 'DOCUMENT' && !(await this.canReadDocument(principal, conversation.document))) continue;
      visible.push(membership);
    }
    const ids = visible.map((membership) => membership.conversationId);
    if (ids.length === 0) return [];

    const [lastMessages, unreadRows] = await Promise.all([
      this.prisma.client.$queryRaw<
        Array<{
          conversation_id: string;
          id: string;
          body: string;
          kind: string;
          metadata: Prisma.JsonValue;
          created_at: Date;
          sender_user_id: string | null;
        }>
      >`
        SELECT DISTINCT ON (m.conversation_id) m.conversation_id, m.id, m.body, m.kind, m.metadata, m.created_at, m.sender_user_id
        FROM messages m
        WHERE m.conversation_id = ANY(${ids}::uuid[])
        ORDER BY m.conversation_id, m.created_at DESC, m.id DESC`,
      this.unreadByConversation(principal.id, ids),
    ]);
    const lastById = new Map(lastMessages.map((row) => [row.conversation_id, row]));
    const senderIds = [...new Set(lastMessages.map((row) => row.sender_user_id).filter((id): id is string => Boolean(id)))];
    const senders = new Map(
      (await this.prisma.client.user.findMany({ where: { id: { in: senderIds } }, select: USER_SUMMARY })).map((user) => [user.id, user]),
    );

    return visible.map(({ conversation, role }) => {
      const last = lastById.get(conversation.id);
      return {
        id: conversation.id,
        kind: conversation.kind,
        title: conversation.title,
        myRole: role,
        document: conversation.document ? { id: conversation.document.id, displayName: conversation.document.displayName } : null,
        participants: conversation.participants.map((participant) => ({ ...participant.user, role: participant.role })),
        lastMessageAt: conversation.lastMessageAt,
        lastMessage: last
          ? {
              id: last.id,
              kind: last.kind,
              preview: last.kind === 'text' ? last.body.slice(0, PREVIEW_LENGTH) : last.body,
              metadata: last.kind === 'system' ? last.metadata : null,
              createdAt: last.created_at,
              sender: last.sender_user_id ? (senders.get(last.sender_user_id) ?? null) : null,
            }
          : null,
        unreadCount: unreadRows.get(conversation.id) ?? 0,
      };
    });
  }

  private async unreadByConversation(userId: string, conversationIds: string[]): Promise<Map<string, number>> {
    const rows = await this.prisma.client.$queryRaw<Array<{ conversation_id: string; unread: number }>>`
      SELECT m.conversation_id, count(*)::int AS unread
      FROM messages m
      JOIN conversation_participants p
        ON p.conversation_id = m.conversation_id AND p.user_id = ${userId}::uuid AND p.left_at IS NULL
      WHERE m.conversation_id = ANY(${conversationIds}::uuid[])
        AND (p.last_read_at IS NULL OR m.created_at > p.last_read_at)
        AND m.sender_user_id IS DISTINCT FROM ${userId}::uuid
      GROUP BY m.conversation_id`;
    return new Map(rows.map((row) => [row.conversation_id, row.unread]));
  }

  async unreadSummary(principal: AuthPrincipal) {
    const conversations = await this.listConversations(principal);
    return {
      unreadMessages: conversations.reduce((sum, conversation) => sum + conversation.unreadCount, 0),
      unreadConversations: conversations.filter((conversation) => conversation.unreadCount > 0).length,
    };
  }

  async conversationDetail(principal: AuthPrincipal, conversationId: string) {
    const { conversation, membership } = await this.requireReadableConversation(principal, conversationId);
    const participants = await this.prisma.client.conversationParticipant.findMany({
      where: { conversationId, leftAt: null },
      include: { user: { select: USER_SUMMARY } },
      orderBy: { joinedAt: 'asc' },
    });
    return {
      id: conversation.id,
      kind: conversation.kind,
      title: conversation.title,
      createdAt: conversation.createdAt,
      myRole: membership && membership.leftAt === null ? membership.role : null,
      document: conversation.document
        ? {
            id: conversation.document.id,
            displayName: conversation.document.displayName,
            repositoryId: conversation.document.repositoryId,
            folderId: conversation.document.folderId,
          }
        : null,
      participants: participants.map((participant) => ({ ...participant.user, role: participant.role })),
    };
  }

  async openDirect(principal: AuthPrincipal, otherUserId: string) {
    if (otherUserId === principal.id) throw new BadRequestException('Choose another user.');
    await this.requireEnabledUsers([otherUserId]);
    const directKey = directConversationKey(principal.id, otherUserId);
    const existing = await this.prisma.client.conversation.findUnique({ where: { directKey } });
    if (existing) return { id: existing.id, created: false };
    try {
      const created = await this.prisma.client.conversation.create({
        data: {
          kind: 'DIRECT',
          directKey,
          createdByUserId: principal.id,
          participants: {
            create: [
              { userId: principal.id, role: 'member' },
              { userId: otherUserId, role: 'member' },
            ],
          },
        },
      });
      await this.authz.writeAudit(principal, 'conversation.create', 'conversation', created.id, 'success', { kind: 'DIRECT' });
      return { id: created.id, created: true };
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      const raced = await this.prisma.client.conversation.findUniqueOrThrow({ where: { directKey } });
      return { id: raced.id, created: false };
    }
  }

  async createGroup(principal: AuthPrincipal, input: CreateGroupConversationBody) {
    const memberIds = [...new Set(input.memberIds)].filter((id) => id !== principal.id);
    if (memberIds.length === 0) throw new BadRequestException('Add at least one other member.');
    if (memberIds.length + 1 > GROUP_MAX_MEMBERS) throw new BadRequestException(`A group has at most ${GROUP_MAX_MEMBERS} members.`);
    await this.requireEnabledUsers(memberIds);

    const conversation = await this.prisma.client.$transaction(async (tx) => {
      const created = await tx.conversation.create({
        data: {
          kind: 'GROUP',
          title: input.title,
          createdByUserId: principal.id,
          participants: {
            create: [{ userId: principal.id, role: 'owner' }, ...memberIds.map((userId) => ({ userId, role: 'member' }))],
          },
        },
      });
      await this.systemMessage(tx, created.id, principal.id, 'group_created', {
        title: input.title,
        names: await this.displayNames(tx, memberIds),
      });
      return created;
    });
    await this.authz.writeAudit(principal, 'conversation.create', 'conversation', conversation.id, 'success', {
      kind: 'GROUP',
      memberCount: memberIds.length + 1,
    });
    this.hub.publish([principal.id, ...memberIds], { type: 'conversation', conversationId: conversation.id });
    return { id: conversation.id };
  }

  private async requireGroupOwner(principal: AuthPrincipal, conversationId: string) {
    const { conversation, membership } = await this.requireReadableConversation(principal, conversationId);
    if (conversation.kind !== 'GROUP') throw new BadRequestException('Only groups can be managed.');
    if (membership?.role !== 'owner') throw new ForbiddenException('Only the group owner can do this.');
    return conversation;
  }

  async renameGroup(principal: AuthPrincipal, conversationId: string, title: string) {
    const conversation = await this.requireGroupOwner(principal, conversationId);
    if (conversation.title === title) return { id: conversationId };
    await this.prisma.client.$transaction(async (tx) => {
      await tx.conversation.update({ where: { id: conversationId }, data: { title } });
      await this.systemMessage(tx, conversationId, principal.id, 'group_renamed', { from: conversation.title, to: title });
    });
    await this.authz.writeAudit(principal, 'conversation.rename', 'conversation', conversationId, 'success');
    this.hub.publish(await this.recipientsOf(conversationId), { type: 'conversation', conversationId });
    return { id: conversationId };
  }

  async addMembers(principal: AuthPrincipal, conversationId: string, userIds: string[]) {
    await this.requireGroupOwner(principal, conversationId);
    const requested = [...new Set(userIds)].filter((id) => id !== principal.id);
    if (requested.length === 0) throw new BadRequestException('No new members.');
    await this.requireEnabledUsers(requested);

    const added = await this.prisma.client.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM conversations WHERE id = ${conversationId}::uuid FOR UPDATE`;
      const current = await tx.conversationParticipant.findMany({ where: { conversationId }, select: { userId: true, leftAt: true } });
      const active = new Set(current.filter((row) => row.leftAt === null).map((row) => row.userId));
      const toAdd = requested.filter((id) => !active.has(id));
      if (toAdd.length === 0) return [];
      if (active.size + toAdd.length > GROUP_MAX_MEMBERS) {
        throw new BadRequestException(`A group has at most ${GROUP_MAX_MEMBERS} members.`);
      }
      for (const userId of toAdd) {
        await tx.conversationParticipant.upsert({
          where: { conversationId_userId: { conversationId, userId } },
          create: { conversationId, userId, role: 'member' },
          update: { leftAt: null, role: 'member', joinedAt: new Date(), lastReadAt: null },
        });
      }
      await this.systemMessage(tx, conversationId, principal.id, 'members_added', {
        userIds: toAdd,
        names: await this.displayNames(tx, toAdd),
      });
      return toAdd;
    });
    if (added.length > 0) {
      await this.authz.writeAudit(principal, 'conversation.members_add', 'conversation', conversationId, 'success', { userIds: added });
      this.hub.publish(await this.recipientsOf(conversationId), { type: 'conversation', conversationId });
    }
    return { added };
  }

  /** Owners remove members; anyone may leave a group or stop following a document discussion. */
  async removeMember(principal: AuthPrincipal, conversationId: string, userId: string) {
    const leaving = userId === principal.id;
    const { conversation, membership } = await this.requireReadableConversation(principal, conversationId);
    if (conversation.kind === 'DIRECT') throw new BadRequestException('Direct conversations cannot be left.');
    if (!leaving && (conversation.kind !== 'GROUP' || membership?.role !== 'owner')) {
      throw new ForbiddenException('Only the group owner can remove members.');
    }
    if (leaving && (!membership || membership.leftAt !== null)) return { removed: false };

    const recipientsBefore = await this.recipientsOf(conversationId);
    await this.prisma.client.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM conversations WHERE id = ${conversationId}::uuid FOR UPDATE`;
      const target = await tx.conversationParticipant.findUnique({ where: { conversationId_userId: { conversationId, userId } } });
      if (!target || target.leftAt !== null) throw new NotFoundException('Member not found.');
      await tx.conversationParticipant.update({
        where: { conversationId_userId: { conversationId, userId } },
        data: { leftAt: new Date() },
      });
      if (conversation.kind !== 'GROUP') return;
      if (target.role === 'owner') {
        const successor = await tx.conversationParticipant.findFirst({
          where: { conversationId, leftAt: null },
          orderBy: { joinedAt: 'asc' },
        });
        if (successor) {
          await tx.conversationParticipant.update({
            where: { conversationId_userId: { conversationId, userId: successor.userId } },
            data: { role: 'owner' },
          });
        }
      }
      await this.systemMessage(tx, conversationId, principal.id, leaving ? 'member_left' : 'member_removed', {
        userId,
        names: await this.displayNames(tx, [userId]),
      });
    });
    await this.authz.writeAudit(principal, leaving ? 'conversation.leave' : 'conversation.members_remove', 'conversation', conversationId, 'success', { userId });
    this.hub.publish(recipientsBefore, { type: 'conversation', conversationId });
    return { removed: true };
  }

  // ---------------------------------------------------------------- messages

  async listMessages(principal: AuthPrincipal, conversationId: string, before?: string) {
    await this.requireReadableConversation(principal, conversationId);
    return this.pageOfMessages(principal, conversationId, before, false);
  }

  private async pageOfMessages(principal: AuthPrincipal, conversationId: string, before: string | undefined, investigation: boolean) {
    if (before) {
      const anchor = await this.prisma.client.message.findFirst({ where: { id: before, conversationId }, select: { id: true } });
      if (!anchor) throw new BadRequestException('Unknown message cursor.');
    }
    const rows = await this.prisma.client.message.findMany({
      where: { conversationId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      ...(before ? { cursor: { id: before }, skip: 1 } : {}),
      take: PAGE_SIZE + 1,
      include: {
        sender: { select: USER_SUMMARY },
        documents: { select: { documentId: true } },
        revisions: investigation ? { orderBy: { replacedAt: 'asc' } } : false,
      },
    });
    const hasMore = rows.length > PAGE_SIZE;
    const page = rows.slice(0, PAGE_SIZE).reverse();

    const linkedIds = [...new Set(page.flatMap((row) => row.documents.map((link) => link.documentId)).filter((id): id is string => Boolean(id)))];
    const linked = await this.prisma.client.document.findMany({ where: { id: { in: linkedIds } }, select: DOCUMENT_ACCESS });
    const readable = new Map<string, DocumentAccessRow>();
    for (const document of linked) {
      if (await this.canReadDocument(principal, document)) readable.set(document.id, document);
    }

    return {
      hasMore,
      items: page.map((row) => ({
        id: row.id,
        conversationId: row.conversationId,
        kind: row.kind,
        body: row.body,
        metadata: row.metadata,
        createdAt: row.createdAt,
        editedAt: row.editedAt,
        sender: row.sender,
        canEdit: !investigation && canEditMessage(row, principal.id, MESSAGE_EDIT_WINDOW_MINUTES),
        documents: row.documents.map((link) => {
          const document = link.documentId ? readable.get(link.documentId) : undefined;
          // Unreadable links never reveal the name; investigators still see the id for follow-up.
          return document
            ? { id: document.id, available: true, displayName: document.displayName, repositoryId: document.repositoryId, folderId: document.folderId }
            : { id: investigation ? link.documentId : null, available: false };
        }),
        ...(investigation && 'revisions' in row ? { revisions: row.revisions } : {}),
      })),
    };
  }

  async send(principal: AuthPrincipal, conversationId: string, input: SendMessageBody) {
    await this.assertSendRate(principal);
    const { conversation } = await this.requireReadableConversation(principal, conversationId);
    return this.insertMessage(principal, conversation.id, conversation.kind === 'DOCUMENT', input);
  }

  async sendToDocument(principal: AuthPrincipal, documentId: string, input: SendMessageBody) {
    await this.assertSendRate(principal);
    await this.requireReadableDocument(principal, documentId);
    let conversation = await this.prisma.client.conversation.findUnique({ where: { documentId } });
    if (!conversation) {
      try {
        conversation = await this.prisma.client.conversation.create({
          data: { kind: 'DOCUMENT', documentId, createdByUserId: principal.id },
        });
        await this.authz.writeAudit(principal, 'conversation.create', 'conversation', conversation.id, 'success', {
          kind: 'DOCUMENT',
          documentId,
        });
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
        conversation = await this.prisma.client.conversation.findUniqueOrThrow({ where: { documentId } });
      }
    }
    return this.insertMessage(principal, conversation.id, true, input);
  }

  private async assertSendRate(principal: AuthPrincipal): Promise<void> {
    if (!(await this.rateLimit.increment(`messages:send:${principal.id}`, 60, SEND_LIMIT_PER_MINUTE))) {
      throw new HttpException('Too many messages. Wait a moment and try again.', HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  private async insertMessage(principal: AuthPrincipal, conversationId: string, follow: boolean, input: SendMessageBody) {
    const documentIds = [...new Set(input.documentIds)];
    for (const documentId of documentIds) {
      await this.requireReadableDocument(principal, documentId);
    }
    const message = await this.prisma.client.$transaction(async (tx) => {
      const created = await tx.message.create({
        data: {
          conversationId,
          senderUserId: principal.id,
          kind: 'text',
          body: input.body,
          documents: { create: documentIds.map((documentId) => ({ documentId })) },
        },
      });
      await tx.conversation.update({ where: { id: conversationId }, data: { lastMessageAt: created.createdAt } });
      if (follow) {
        await tx.conversationParticipant.upsert({
          where: { conversationId_userId: { conversationId, userId: principal.id } },
          create: { conversationId, userId: principal.id, role: 'follower', lastReadAt: created.createdAt },
          update: { leftAt: null, lastReadAt: created.createdAt },
        });
      } else {
        await tx.conversationParticipant.update({
          where: { conversationId_userId: { conversationId, userId: principal.id } },
          data: { lastReadAt: created.createdAt },
        });
      }
      return created;
    });
    this.hub.publish(await this.recipientsOf(conversationId), { type: 'message', conversationId, messageId: message.id });
    return { id: message.id, conversationId, createdAt: message.createdAt };
  }

  async edit(principal: AuthPrincipal, messageId: string, body: string) {
    const message = await this.prisma.client.message.findUnique({ where: { id: messageId } });
    if (!message) throw new NotFoundException('Message not found.');
    await this.requireReadableConversation(principal, message.conversationId);
    if (!canEditMessage(message, principal.id, MESSAGE_EDIT_WINDOW_MINUTES)) {
      throw new ForbiddenException(`Messages can only be edited by their sender within ${MESSAGE_EDIT_WINDOW_MINUTES} minutes.`);
    }
    if (message.body === body) return { id: messageId };

    await this.prisma.client.$transaction(async (tx) => {
      const updated = await tx.message.updateMany({
        where: { id: messageId, body: message.body },
        data: { body, editedAt: new Date() },
      });
      if (updated.count === 0) throw new ConflictException('The message changed meanwhile. Reload and try again.');
      await tx.messageRevision.create({ data: { messageId, body: message.body } });
    });
    this.hub.publish(await this.recipientsOf(message.conversationId), {
      type: 'message',
      conversationId: message.conversationId,
      messageId,
    });
    return { id: messageId };
  }

  async markRead(principal: AuthPrincipal, conversationId: string, messageId: string) {
    const { membership } = await this.requireReadableConversation(principal, conversationId);
    if (!membership || membership.leftAt !== null) return { updated: false };
    const message = await this.prisma.client.message.findFirst({ where: { id: messageId, conversationId }, select: { createdAt: true } });
    if (!message) throw new NotFoundException('Message not found.');
    const updated = await this.prisma.client.conversationParticipant.updateMany({
      where: {
        conversationId,
        userId: principal.id,
        OR: [{ lastReadAt: null }, { lastReadAt: { lt: message.createdAt } }],
      },
      data: { lastReadAt: message.createdAt },
    });
    if (updated.count > 0) this.hub.publish([principal.id], { type: 'read', conversationId });
    return { updated: updated.count > 0 };
  }

  // ---------------------------------------------------------------- document discussions

  async documentDiscussion(principal: AuthPrincipal, documentId: string) {
    await this.requireReadableDocument(principal, documentId);
    const conversation = await this.prisma.client.conversation.findUnique({ where: { documentId }, select: { id: true } });
    if (!conversation) return { conversationId: null, following: false };
    const membership = await this.prisma.client.conversationParticipant.findUnique({
      where: { conversationId_userId: { conversationId: conversation.id, userId: principal.id } },
    });
    return { conversationId: conversation.id, following: Boolean(membership && membership.leftAt === null) };
  }

  // ---------------------------------------------------------------- investigation (D-16)

  async investigateConversations(principal: AuthPrincipal, userId: string, reason: string) {
    this.authz.assertPermission(principal, PERMISSIONS.MESSAGES_AUDIT);
    const subject = await this.prisma.client.user.findUnique({ where: { id: userId }, select: USER_SUMMARY });
    if (!subject) throw new NotFoundException('User not found.');
    const memberships = await this.prisma.client.conversationParticipant.findMany({
      where: { userId },
      include: {
        conversation: {
          include: {
            document: { select: { id: true, displayName: true } },
            participants: { include: { user: { select: USER_SUMMARY } } },
            _count: { select: { messages: true } },
          },
        },
      },
      orderBy: { conversation: { lastMessageAt: { sort: 'desc', nulls: 'last' } } },
    });
    await this.authz.writeAudit(principal, 'messages.investigate_list', 'user', userId, 'success', { reason });
    return {
      subject,
      conversations: memberships.map(({ conversation, role, joinedAt, leftAt }) => ({
        id: conversation.id,
        kind: conversation.kind,
        title: conversation.title,
        document: conversation.document,
        lastMessageAt: conversation.lastMessageAt,
        messageCount: conversation._count.messages,
        subjectMembership: { role, joinedAt, leftAt },
        participants: conversation.participants.map((participant) => ({
          ...participant.user,
          role: participant.role,
          leftAt: participant.leftAt,
        })),
      })),
    };
  }

  async investigateMessages(principal: AuthPrincipal, conversationId: string, reason: string, before?: string) {
    this.authz.assertPermission(principal, PERMISSIONS.MESSAGES_AUDIT);
    const conversation = await this.prisma.client.conversation.findUnique({ where: { id: conversationId }, select: { id: true } });
    if (!conversation) throw new NotFoundException('Conversation not found.');
    await this.authz.writeAudit(principal, 'messages.investigate_read', 'conversation', conversationId, 'success', {
      reason,
      before: before ?? null,
    });
    return this.pageOfMessages(principal, conversationId, before, true);
  }

  // ---------------------------------------------------------------- helpers

  /** Names are captured when the event happens so the record stays readable after renames or departures. */
  private async displayNames(tx: Tx, userIds: string[]): Promise<string[]> {
    const users = await tx.user.findMany({ where: { id: { in: userIds } }, select: { id: true, displayName: true } });
    const byId = new Map(users.map((user) => [user.id, user.displayName]));
    return userIds.map((id) => byId.get(id) ?? id);
  }

  private async systemMessage(tx: Tx, conversationId: string, actorId: string, event: string, details: Prisma.InputJsonObject) {
    const message = await tx.message.create({
      data: { conversationId, senderUserId: actorId, kind: 'system', body: event, metadata: details },
    });
    await tx.conversation.update({ where: { id: conversationId }, data: { lastMessageAt: message.createdAt } });
    await tx.conversationParticipant.updateMany({
      where: { conversationId, userId: actorId, leftAt: null },
      data: { lastReadAt: message.createdAt },
    });
  }
}
