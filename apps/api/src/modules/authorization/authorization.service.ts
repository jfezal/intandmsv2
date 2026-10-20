import { Injectable } from '@nestjs/common';
import { PERMISSIONS, type PermissionKey } from '@intandms/core';
import type { Prisma } from '@prisma/client';
import { forbidden } from '../../common/forbidden.exception';
import { PrismaService } from '../../prisma/prisma.service';

export type AuthPrincipal = {
  id: string;
  login: string;
  permissions: string[];
};

@Injectable()
export class AuthorizationService {
  constructor(private readonly prisma: PrismaService) {}

  hasPermission(principal: AuthPrincipal, permission: PermissionKey): boolean {
    if (principal.permissions.includes(PERMISSIONS.SYSTEM_ADMIN)) {
      return true;
    }
    return principal.permissions.includes(permission);
  }

  async hasRepositoryPermission(
    principal: AuthPrincipal,
    repositoryId: string,
    permission: PermissionKey,
  ): Promise<boolean> {
    if (this.hasPermission(principal, permission)) {
      return true;
    }

    const scoped = await this.prisma.client.scopedRoleAssignment.findMany({
      where: { userId: principal.id, repositoryId },
      include: {
        role: {
          include: {
            rolePermissions: { include: { permission: true } },
          },
        },
      },
    });

    for (const assignment of scoped) {
      for (const rolePermission of assignment.role.rolePermissions) {
        if (rolePermission.permission.key === permission) {
          return true;
        }
      }
    }
    return false;
  }

  async assertRepositoryPermission(
    principal: AuthPrincipal,
    repositoryId: string,
    permission: PermissionKey,
  ): Promise<void> {
    if (!(await this.hasRepositoryPermission(principal, repositoryId, permission))) {
      throw forbidden();
    }
  }

  assertPermission(principal: AuthPrincipal, permission: PermissionKey): void {
    if (!this.hasPermission(principal, permission)) {
      throw forbidden();
    }
  }

  async writeAudit(
    principal: AuthPrincipal | null,
    action: string,
    targetType: string,
    targetId: string,
    outcome: string,
    metadata?: Prisma.InputJsonValue,
  ): Promise<void> {
    await this.prisma.client.auditEvent.create({
      data: {
        actorUserId: principal?.id,
        action,
        targetType,
        targetId,
        outcome,
        metadata: metadata ?? undefined,
      },
    });
  }
}
