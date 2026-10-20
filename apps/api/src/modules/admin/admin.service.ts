import { Injectable } from '@nestjs/common';
import { PERMISSIONS } from '@intandms/core';
import { forbidden } from '../../common/forbidden.exception';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthPrincipal } from '../authorization/authorization.service';
import { AuthorizationService } from '../authorization/authorization.service';

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authz: AuthorizationService,
  ) {}

  async listUsers(principal: AuthPrincipal) {
    if (!this.authz.hasPermission(principal, PERMISSIONS.USERS_MANAGE)) {
      throw forbidden();
    }
    return this.prisma.client.user.findMany({
      orderBy: { login: 'asc' },
      select: {
        id: true,
        login: true,
        displayName: true,
        enabled: true,
        createdAt: true,
        userRoles: { include: { role: true } },
        scopedRoleAssignments: { include: { role: true, repository: true } },
      },
    });
  }

  async assignScopedRole(
    principal: AuthPrincipal,
    input: { userId: string; roleId: string; repositoryId: string },
  ) {
    if (!this.authz.hasPermission(principal, PERMISSIONS.USERS_MANAGE)) {
      throw forbidden();
    }
    const row = await this.prisma.client.scopedRoleAssignment.create({
      data: input,
    });
    await this.authz.writeAudit(principal, 'admin.scoped_role.assign', 'user', input.userId, 'success', input);
    return row;
  }
}
