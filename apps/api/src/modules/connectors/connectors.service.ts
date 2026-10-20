import { Injectable } from '@nestjs/common';
import { PERMISSIONS } from '@intandms/core';
import { createConnectorGatewayClient } from '@intandms/connector-gateway-client';
import { forbidden } from '../../common/forbidden.exception';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthPrincipal } from '../authorization/authorization.service';
import { AuthorizationService } from '../authorization/authorization.service';

@Injectable()
export class ConnectorsService {
  private gatewayClient() {
    const baseUrl = process.env.CONNECTOR_GATEWAY_URL;
    const token = process.env.CONNECTOR_GATEWAY_TOKEN;
    if (!baseUrl || !token) {
      return null;
    }
    return createConnectorGatewayClient({ baseUrl, token });
  }

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
      mountPath?: string;
      smbUsername?: string;
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
        mountPath: input.mountPath ?? null,
        smbUsername: input.smbUsername ?? null,
        readOnly: true,
        gatewayState: input.protocol === 'local' ? 'local_path' : 'unconfigured',
        lastHealthAt: new Date(),
        lastHealthNote:
          input.protocol === 'local'
            ? 'Local path connector — validate mountPath.'
            : 'Registered — configure gateway credentials and mount.',
      },
    });
    await this.authz.writeAudit(principal, 'connector.create', 'indexed_connector', connector.id, 'success');
    return connector;
  }

  async setCredentials(
    principal: AuthPrincipal,
    connectorId: string,
    body: { username: string; password: string },
  ) {
    if (!this.authz.hasPermission(principal, PERMISSIONS.CONNECTORS_MANAGE)) {
      throw forbidden();
    }
    const connector = await this.prisma.client.indexedConnector.findUnique({
      where: { id: connectorId },
    });
    if (!connector) {
      throw forbidden('Connector not found.');
    }
    const gateway = this.gatewayClient();
    if (!gateway) {
      throw forbidden('Connector gateway not configured (CONNECTOR_GATEWAY_URL/TOKEN).');
    }
    await gateway.setCredentials(connectorId, body.username, body.password);
    const updated = await this.prisma.client.indexedConnector.update({
      where: { id: connectorId },
      data: {
        smbUsername: body.username,
        gatewayState: 'credentials_ready',
        lastHealthAt: new Date(),
        lastHealthNote: 'Credentials stored on gateway only.',
      },
    });
    await this.authz.writeAudit(principal, 'connector.credentials', 'indexed_connector', connectorId, 'success');
    return updated;
  }

  async connectTest(principal: AuthPrincipal, connectorId: string) {
    if (!this.authz.hasPermission(principal, PERMISSIONS.CONNECTORS_MANAGE)) {
      throw forbidden();
    }
    const connector = await this.prisma.client.indexedConnector.findUnique({
      where: { id: connectorId },
    });
    if (!connector) {
      throw forbidden('Connector not found.');
    }

    if (connector.protocol === 'local' && connector.mountPath) {
      try {
        const { access } = await import('node:fs/promises');
        await access(connector.mountPath);
        return this.prisma.client.indexedConnector.update({
          where: { id: connectorId },
          data: {
            lastHealthAt: new Date(),
            lastHealthNote: 'Local path reachable.',
            gatewayState: 'healthy',
          },
        });
      } catch {
        return this.prisma.client.indexedConnector.update({
          where: { id: connectorId },
          data: {
            lastHealthAt: new Date(),
            lastHealthNote: 'Local path not reachable.',
            gatewayState: 'degraded',
          },
        });
      }
    }

    const gateway = this.gatewayClient();
    if (!gateway) {
      throw forbidden('Connector gateway not configured.');
    }
    const result = await gateway.testSmb(connectorId, connector.host, connector.exportPath);
    return this.prisma.client.indexedConnector.update({
      where: { id: connectorId },
      data: {
        lastHealthAt: new Date(),
        lastHealthNote: result.message,
        gatewayState: result.ok ? 'healthy' : 'degraded',
      },
    });
  }

  async applyMount(principal: AuthPrincipal, connectorId: string) {
    if (!this.authz.hasPermission(principal, PERMISSIONS.CONNECTORS_MANAGE)) {
      throw forbidden();
    }
    const connector = await this.prisma.client.indexedConnector.findUnique({
      where: { id: connectorId },
    });
    if (!connector) {
      throw forbidden('Connector not found.');
    }

    if (connector.protocol === 'local') {
      if (!connector.mountPath) {
        throw forbidden('Local connector requires mountPath.');
      }
      return connector;
    }

    const gateway = this.gatewayClient();
    if (!gateway) {
      throw forbidden('Connector gateway not configured.');
    }

    const nextGeneration = connector.mountGeneration + 1;
    const result = await gateway.mount(connectorId, {
      protocol: connector.protocol,
      host: connector.host,
      exportPath: connector.exportPath,
      generation: nextGeneration,
    });

    if (!result.ok || !result.mountPath) {
      await this.prisma.client.indexedConnector.update({
        where: { id: connectorId },
        data: {
          lastHealthAt: new Date(),
          lastHealthNote: result.message,
          gatewayState: 'error',
        },
      });
      throw forbidden(result.message);
    }

    const updated = await this.prisma.client.indexedConnector.update({
      where: { id: connectorId },
      data: {
        mountPath: result.mountPath,
        mountGeneration: result.mountGeneration ?? nextGeneration,
        gatewayState: 'mounted',
        lastHealthAt: new Date(),
        lastHealthNote: result.message,
      },
    });
    await this.authz.writeAudit(principal, 'connector.mount', 'indexed_connector', connectorId, 'success');
    return updated;
  }

  async healthCheck(principal: AuthPrincipal, connectorId: string) {
    return this.connectTest(principal, connectorId);
  }
}
