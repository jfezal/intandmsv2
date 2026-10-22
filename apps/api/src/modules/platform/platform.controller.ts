import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@intandms/core';
import { forbidden } from '../../common/forbidden.exception';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedRequest, SessionAuthGuard } from '../auth/session-auth.guard';
import { AuthorizationService } from '../authorization/authorization.service';

@ApiTags('platform')
@Controller()
@UseGuards(SessionAuthGuard)
export class PlatformController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authz: AuthorizationService,
  ) {}

  @Get('retention/policies')
  listRetention(@Req() request: AuthenticatedRequest) {
    if (!this.authz.hasPermission(request.user!, PERMISSIONS.SYSTEM_ADMIN)) {
      throw forbidden();
    }
    return this.prisma.client.retentionPolicy.findMany({ orderBy: { key: 'asc' } });
  }

  @Get('jobs/outbox/pending-count')
  async pendingOutbox(@Req() request: AuthenticatedRequest) {
    if (!this.authz.hasPermission(request.user!, PERMISSIONS.JOBS_MANAGE)) {
      throw forbidden();
    }
    const count = await this.prisma.client.outboxEvent.count({
      where: { dispatchedAt: null },
    });
    return { pending: count };
  }
}
