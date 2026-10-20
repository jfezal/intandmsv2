import { Injectable } from '@nestjs/common';
import { PERMISSIONS, type PermissionKey } from '@intandms/core';
import type { Prisma } from '@prisma/client';
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

  assertPermission(principal: AuthPrincipal, permission: PermissionKey): void {
    if (!this.hasPermission(principal, permission)) {
      throw new Error('FORBIDDEN');
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
