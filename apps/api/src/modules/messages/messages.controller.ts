import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags } from '@nestjs/swagger';
import {
  addMembersBodySchema,
  createDirectConversationBodySchema,
  createGroupConversationBodySchema,
  editMessageBodySchema,
  investigationReasonSchema,
  markReadBodySchema,
  renameConversationBodySchema,
  sendMessageBodySchema,
} from '@intandms/contracts';
import type { FastifyReply } from 'fastify';
import { CsrfGuard } from '../../common/csrf.guard';
import { parseBody } from '../../common/parse-body';
import type { AppEnv } from '../../config/env.schema';
import { AuthService } from '../auth/auth.service';
import { AuthenticatedRequest, SessionAuthGuard } from '../auth/session-auth.guard';
import { MessageHubService, type MessageEvent } from './message-hub.service';
import { MessagesService } from './messages.service';

const HEARTBEAT_MS = 25_000;
const optionalUuid = new ParseUUIDPipe({ optional: true });

@ApiTags('messages')
@Controller('messages')
@UseGuards(SessionAuthGuard, CsrfGuard)
export class MessagesController {
  constructor(
    private readonly messages: MessagesService,
    private readonly hub: MessageHubService,
    private readonly auth: AuthService,
    private readonly config: ConfigService<AppEnv, true>,
  ) {}

  @Get('users')
  users(@Req() request: AuthenticatedRequest, @Query('q') query?: string, @Query('includeDisabled') includeDisabled?: string) {
    return this.messages.listUsers(request.user!, query, includeDisabled === 'true');
  }

  @Get('conversations')
  conversations(@Req() request: AuthenticatedRequest) {
    return this.messages.listConversations(request.user!);
  }

  @Get('unread')
  unread(@Req() request: AuthenticatedRequest) {
    return this.messages.unreadSummary(request.user!);
  }

  @Post('conversations/direct')
  @HttpCode(200)
  openDirect(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return this.messages.openDirect(request.user!, parseBody(createDirectConversationBodySchema, body).userId);
  }

  @Post('conversations/group')
  createGroup(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return this.messages.createGroup(request.user!, parseBody(createGroupConversationBodySchema, body));
  }

  @Get('conversations/:conversationId')
  detail(@Req() request: AuthenticatedRequest, @Param('conversationId', ParseUUIDPipe) conversationId: string) {
    return this.messages.conversationDetail(request.user!, conversationId);
  }

  @Patch('conversations/:conversationId')
  rename(
    @Req() request: AuthenticatedRequest,
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
    @Body() body: unknown,
  ) {
    return this.messages.renameGroup(request.user!, conversationId, parseBody(renameConversationBodySchema, body).title);
  }

  @Post('conversations/:conversationId/members')
  @HttpCode(200)
  addMembers(
    @Req() request: AuthenticatedRequest,
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
    @Body() body: unknown,
  ) {
    return this.messages.addMembers(request.user!, conversationId, parseBody(addMembersBodySchema, body).userIds);
  }

  @Delete('conversations/:conversationId/members/:userId')
  removeMember(
    @Req() request: AuthenticatedRequest,
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    return this.messages.removeMember(request.user!, conversationId, userId);
  }

  @Get('conversations/:conversationId/messages')
  list(
    @Req() request: AuthenticatedRequest,
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
    @Query('before', optionalUuid) before?: string,
  ) {
    return this.messages.listMessages(request.user!, conversationId, before);
  }

  @Post('conversations/:conversationId/messages')
  send(
    @Req() request: AuthenticatedRequest,
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
    @Body() body: unknown,
  ) {
    return this.messages.send(request.user!, conversationId, parseBody(sendMessageBodySchema, body));
  }

  @Post('conversations/:conversationId/read')
  @HttpCode(200)
  markRead(
    @Req() request: AuthenticatedRequest,
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
    @Body() body: unknown,
  ) {
    return this.messages.markRead(request.user!, conversationId, parseBody(markReadBodySchema, body).messageId);
  }

  @Patch(':messageId')
  edit(@Req() request: AuthenticatedRequest, @Param('messageId', ParseUUIDPipe) messageId: string, @Body() body: unknown) {
    return this.messages.edit(request.user!, messageId, parseBody(editMessageBodySchema, body).body);
  }

  @Get('documents/:documentId')
  documentDiscussion(@Req() request: AuthenticatedRequest, @Param('documentId', ParseUUIDPipe) documentId: string) {
    return this.messages.documentDiscussion(request.user!, documentId);
  }

  @Post('documents/:documentId/messages')
  sendToDocument(
    @Req() request: AuthenticatedRequest,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @Body() body: unknown,
  ) {
    return this.messages.sendToDocument(request.user!, documentId, parseBody(sendMessageBodySchema, body));
  }

  @Get('investigation/users/:userId/conversations')
  investigateConversations(
    @Req() request: AuthenticatedRequest,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Query('reason') reason?: string,
  ) {
    return this.messages.investigateConversations(request.user!, userId, parseBody(investigationReasonSchema, reason));
  }

  @Get('investigation/conversations/:conversationId/messages')
  investigateMessages(
    @Req() request: AuthenticatedRequest,
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
    @Query('reason') reason?: string,
    @Query('before', optionalUuid) before?: string,
  ) {
    return this.messages.investigateMessages(request.user!, conversationId, parseBody(investigationReasonSchema, reason), before);
  }

  /** Server-sent events: id-only notifications; the session is re-validated on every heartbeat. */
  @Get('stream')
  stream(@Req() request: AuthenticatedRequest, @Res() reply: FastifyReply): void {
    const user = request.user!;
    const token = request.cookies?.[this.config.get('SESSION_COOKIE_NAME', { infer: true })];
    const raw = reply.raw;
    let closed = false;
    const write = (chunk: string) => {
      if (!closed) raw.write(chunk);
    };
    const unsubscribe = this.hub.subscribe(user.id, (event: MessageEvent) => {
      write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
    });
    if (!unsubscribe) {
      throw new HttpException('Too many open message streams for this user.', HttpStatus.TOO_MANY_REQUESTS);
    }

    reply.hijack();
    raw.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    write('retry: 5000\n\n');

    const close = () => {
      if (closed) return;
      closed = true;
      clearInterval(heartbeat);
      unsubscribe();
      raw.end();
    };
    const heartbeat = setInterval(() => {
      void this.auth
        .resolveUserFromToken(token, { touch: false })
        .then((current) => {
          if (!current || current.id !== user.id || current.mustChangePassword) close();
          else write(': ping\n\n');
        })
        .catch(close);
    }, HEARTBEAT_MS);
    request.raw.on('close', close);
  }
}
