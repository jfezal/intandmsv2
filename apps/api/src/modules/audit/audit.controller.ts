import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@intandms/core';
import { forbidden } from '../../common/forbidden.exception';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedRequest, SessionAuthGuard } from '../auth/session-auth.guard';
import { AuthorizationService } from '../authorization/authorization.service';

@ApiTags('audit')
@Controller('audit')
@UseGuards(SessionAuthGuard)
export class AuditController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authz: AuthorizationService,
  ) {}

  @Get('events')
  async list(
    @Req() request: AuthenticatedRequest,
    @Query('limit') limit = '50',
  ) {
    if (!this.authz.hasPermission(request.user!, PERMISSIONS.AUDIT_READ)) {
      throw forbidden();
    }
    const take = Math.min(Number.parseInt(limit, 10) || 50, 200);
    const events = await this.prisma.client.auditEvent.findMany({
      orderBy: { createdAt: 'desc' },
      take,
    });
    const actorIds = [...new Set(events.map((event) => event.actorUserId).filter((id): id is string => Boolean(id)))];
    const actors = actorIds.length
      ? await this.prisma.client.user.findMany({
          where: { id: { in: actorIds } },
          select: { id: true, login: true, displayName: true },
        })
      : [];
    const actorById = new Map(actors.map((actor) => [actor.id, { login: actor.login, displayName: actor.displayName }]));
    return events.map((event) => ({
      ...event,
      actor: event.actorUserId ? (actorById.get(event.actorUserId) ?? null) : null,
    }));
  }
}
