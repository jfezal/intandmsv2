import { Injectable } from '@nestjs/common';
import { PERMISSIONS } from '@intandms/core';
import { forbidden } from '../../common/forbidden.exception';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthPrincipal } from '../authorization/authorization.service';
import { AuthorizationService } from '../authorization/authorization.service';

@Injectable()
export class RetentionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authz: AuthorizationService,
  ) {}

  async report(principal: AuthPrincipal, repositoryId: string) {
    if (!this.authz.hasPermission(principal, PERMISSIONS.SYSTEM_ADMIN)) {
      throw forbidden();
    }

    const policies = await this.prisma.client.retentionPolicy.findMany({
      where: { reportOnly: true },
      include: { assignments: true, holds: { where: { active: true } } },
    });

    const documents = await this.prisma.client.document.findMany({
      where: { repositoryId, lifecycleState: 'active' },
      select: { id: true, displayName: true, createdAt: true },
    });

    return {
      repositoryId,
      policies,
      eligibleCount: documents.length,
      heldDocumentIds: policies.flatMap((policy) => policy.holds.map((hold) => hold.documentId)),
      note: 'Report-only mode — no physical purge executed.',
    };
  }

  async placeHold(
    principal: AuthPrincipal,
    input: { policyId: string; documentId: string; reason: string },
  ) {
    if (!this.authz.hasPermission(principal, PERMISSIONS.SYSTEM_ADMIN)) {
      throw forbidden();
    }
    const hold = await this.prisma.client.legalHold.create({
      data: {
        policyId: input.policyId,
        documentId: input.documentId,
        reason: input.reason,
      },
    });
    await this.authz.writeAudit(principal, 'retention.hold.create', 'legal_hold', hold.id, 'success');
    return hold;
  }
}
