import { Injectable } from '@nestjs/common';
import { PERMISSIONS } from '@intandms/core';
import { forbidden } from '../../common/forbidden.exception';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthPrincipal } from '../authorization/authorization.service';
import { AuthorizationService } from '../authorization/authorization.service';

@Injectable()
export class ConnectorsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authz: AuthorizationService,
  ) {}

  list(principal: AuthPrincipal) {
    if (!this.authz.hasPermission(principal, PERMISSIONS.CONNECTORS_MANAGE)) {
      throw forbidden();
    }
    return this.prisma.client.indexedConnector.findMany({ orderBy: { name: 'asc' } });
  }

  async create(
    principal: AuthPrincipal,
    input: {
      name: string;
      protocol: 'smb' | 'nfs' | 'local';
      host: string;
      exportPath: string;
      mountPath: string;
    },
  ) {
    if (!this.authz.hasPermission(principal, PERMISSIONS.CONNECTORS_MANAGE)) {
      throw forbidden();
    }
    const connector = await this.prisma.client.indexedConnector.create({
      data: {
        name: input.name,
        protocol: input.protocol,
        host: input.host,
        exportPath: input.exportPath,
        mountPath: input.mountPath,
        readOnly: true,
        lastHealthAt: new Date(),
        lastHealthNote: 'Registered — validate mount and ACL operationally.',
      },
    });
    await this.authz.writeAudit(principal, 'connector.create', 'indexed_connector', connector.id, 'success');
    return connector;
  }
}
