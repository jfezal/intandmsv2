import path from 'node:path';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { CreateConnectorBody, UpdateConnectorBody } from '@intandms/contracts';
import { PERMISSIONS } from '@intandms/core';
import { createConnectorGatewayClient } from '@intandms/connector-gateway-client';
import {
  findWorkspaceRoot,
  IndexedLocalPathError,
  listContainedDirectories,
  listHostDirectories,
  resolveIndexedLocalDirectory,
  type IndexedLocalPathCode,
} from '@intandms/storage';
import { forbidden } from '../../common/forbidden.exception';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthPrincipal } from '../authorization/authorization.service';
import { AuthorizationService } from '../authorization/authorization.service';

const BROWSABLE_STATES = new Set(['local_path', 'healthy', 'mounted']);

/**
 * Optional lockdown: when `INDEXED_LOCAL_ROOTS` is set, local connectors must stay inside those
 * folders. When unset, an administrator picks any readable server folder from the UI.
 */
export function allowedLocalRoots(): string[] {
  const workspace = findWorkspaceRoot(process.cwd()) ?? process.cwd();
  const configured = (process.env.INDEXED_LOCAL_ROOTS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  return configured.map((value) => path.resolve(workspace, value));
}

const LOCAL_PATH_MESSAGES: Record<IndexedLocalPathCode, string> = {
  missing: 'Folder does not exist.',
  not_directory: 'Path is not a folder.',
  unreadable: 'The DMS process cannot read this folder. Check permissions on the server.',
  outside_roots: 'This folder is outside the approved locations for this server.',
  blocked: 'System folders cannot be indexed.',
};

async function requireLocalDirectory(candidate: string): Promise<string> {
  try {
    return await resolveIndexedLocalDirectory(candidate, allowedLocalRoots());
  } catch (error) {
    if (error instanceof IndexedLocalPathError) {
      throw new BadRequestException(LOCAL_PATH_MESSAGES[error.code]);
    }
    throw error;
  }
}

@Injectable()
export class ConnectorsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authz: AuthorizationService,
  ) {}

  private gatewayClient() {
    const baseUrl = process.env.CONNECTOR_GATEWAY_URL;
    const token = process.env.CONNECTOR_GATEWAY_TOKEN;
    if (!baseUrl || !token) {
      return null;
    }
    return createConnectorGatewayClient({ baseUrl, token });
  }

  private requireGateway() {
    const gateway = this.gatewayClient();
    if (!gateway) {
      throw new BadRequestException('Connector gateway is not configured (CONNECTOR_GATEWAY_URL / CONNECTOR_GATEWAY_TOKEN).');
    }
    return gateway;
  }

  private async requireConnector(connectorId: string) {
    const connector = await this.prisma.client.indexedConnector.findUnique({ where: { id: connectorId } });
    if (!connector) {
      throw new NotFoundException('Connector not found.');
    }
    return connector;
  }

  async list(principal: AuthPrincipal) {
    this.authz.assertPermission(principal, PERMISSIONS.CONNECTORS_MANAGE);
    const [connectors, connections] = await Promise.all([
      this.prisma.client.indexedConnector.findMany({ orderBy: { name: 'asc' } }),
      this.prisma.client.storageConnection.findMany({
        where: { provider: 'indexed_mount' },
        select: { config: true, _count: { select: { repositories: true } } },
      }),
    ]);
    const repositoriesByConnector = new Map<string, number>();
    for (const connection of connections) {
      const connectorId = (connection.config as { connectorId?: string }).connectorId;
      if (connectorId) {
        repositoriesByConnector.set(
          connectorId,
          (repositoriesByConnector.get(connectorId) ?? 0) + connection._count.repositories,
        );
      }
    }
    return {
      gatewayConfigured: this.gatewayClient() !== null,
      localRoots: allowedLocalRoots(),
      hostBrowseStart: allowedLocalRoots()[0] ?? '/',
      connectors: connectors.map((connector) => ({
        ...connector,
        repositoryCount: repositoriesByConnector.get(connector.id) ?? 0,
        browsable: Boolean(connector.mountPath) && BROWSABLE_STATES.has(connector.gatewayState),
      })),
    };
  }

  async create(principal: AuthPrincipal, input: CreateConnectorBody) {
    this.authz.assertPermission(principal, PERMISSIONS.CONNECTORS_MANAGE);
    let data: {
      host: string;
      exportPath: string;
      mountPath: string | null;
      smbUsername: string | null;
      gatewayState: string;
      lastHealthNote: string;
    };
    if (input.protocol === 'local') {
      const mountPath = await requireLocalDirectory(input.mountPath);
      data = {
        host: 'localhost',
        exportPath: mountPath,
        mountPath,
        smbUsername: null,
        gatewayState: 'local_path',
        lastHealthNote: 'Local path registered.',
      };
    } else {
      data = {
        host: input.host,
        exportPath: input.exportPath,
        mountPath: null,
        smbUsername: input.protocol === 'smb' ? (input.smbUsername ?? null) : null,
        gatewayState: 'unconfigured',
        lastHealthNote: 'Registered — store credentials on the gateway, test, then mount.',
      };
    }

    const connector = await this.prisma.client.indexedConnector.create({
      data: { name: input.name, protocol: input.protocol, readOnly: true, lastHealthAt: new Date(), ...data },
    });
    await this.authz.writeAudit(principal, 'connector.create', 'indexed_connector', connector.id, 'success', {
      protocol: connector.protocol,
      host: connector.host,
    });
    return connector;
  }

  async update(principal: AuthPrincipal, connectorId: string, input: UpdateConnectorBody) {
    this.authz.assertPermission(principal, PERMISSIONS.CONNECTORS_MANAGE);
    await this.requireConnector(connectorId);
    const updated = await this.prisma.client.indexedConnector.update({
      where: { id: connectorId },
      data: { name: input.name, status: input.status },
    });
    await this.authz.writeAudit(principal, 'connector.update', 'indexed_connector', connectorId, 'success', {
      name: input.name ?? null,
      status: input.status ?? null,
    });
    return updated;
  }

  /** Deletes a connector that no repository (active, disabled or archived) has ever been attached to. */
  async remove(principal: AuthPrincipal, connectorId: string) {
    this.authz.assertPermission(principal, PERMISSIONS.CONNECTORS_MANAGE);
    const connector = await this.prisma.client.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM indexed_connectors WHERE id = ${connectorId}::uuid FOR UPDATE`;
      if (locked.length === 0) {
        throw new NotFoundException('Connector not found.');
      }
      const repositoryCount = await tx.repository.count({
        where: {
          storageConnection: { provider: 'indexed_mount', config: { path: ['connectorId'], equals: connectorId } },
        },
      });
      if (repositoryCount > 0) {
        throw new ConflictException('Connector is used by a repository and can only be disabled.');
      }
      const existing = await tx.indexedConnector.findUniqueOrThrow({ where: { id: connectorId } });
      if (existing.protocol !== 'local' && existing.gatewayState !== 'unconfigured') {
        try {
          await this.requireGateway().unmount(connectorId);
        } catch (error) {
          if (error instanceof BadRequestException) throw error;
          throw new BadRequestException('Gateway could not unmount the share or clear its credentials.');
        }
      }
      await tx.indexedConnector.delete({ where: { id: connectorId } });
      return existing;
    });
    await this.authz.writeAudit(principal, 'connector.delete', 'indexed_connector', connectorId, 'success', {
      name: connector.name,
      protocol: connector.protocol,
      host: connector.host,
    });
  }

  async setCredentials(principal: AuthPrincipal, connectorId: string, body: { username: string; password: string }) {
    this.authz.assertPermission(principal, PERMISSIONS.CONNECTORS_MANAGE);
    const connector = await this.requireConnector(connectorId);
    if (connector.protocol !== 'smb') {
      throw new BadRequestException('Only SMB connectors use credentials.');
    }
    await this.requireGateway().setCredentials(connectorId, body.username, body.password);
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
    this.authz.assertPermission(principal, PERMISSIONS.CONNECTORS_MANAGE);
    const connector = await this.requireConnector(connectorId);

    if (connector.protocol === 'local') {
      let note = 'Local path reachable.';
      let ok = true;
      if (!connector.mountPath) {
        ok = false;
        note = 'Local path is not set.';
      } else {
        try {
          await requireLocalDirectory(connector.mountPath);
        } catch (error) {
          ok = false;
          note = error instanceof BadRequestException ? String(error.message) : 'Local path is not reachable.';
        }
      }
      return this.prisma.client.indexedConnector.update({
        where: { id: connectorId },
        data: { lastHealthAt: new Date(), lastHealthNote: note, gatewayState: ok ? 'local_path' : 'degraded' },
      });
    }

    const result = await this.requireGateway().testSmb(connectorId, connector.host, connector.exportPath);
    const mountedOk = result.ok && connector.mountPath;
    return this.prisma.client.indexedConnector.update({
      where: { id: connectorId },
      data: {
        lastHealthAt: new Date(),
        lastHealthNote: result.message,
        gatewayState: mountedOk ? 'mounted' : result.ok ? 'healthy' : 'degraded',
      },
    });
  }

  async applyMount(principal: AuthPrincipal, connectorId: string) {
    this.authz.assertPermission(principal, PERMISSIONS.CONNECTORS_MANAGE);
    const connector = await this.requireConnector(connectorId);
    if (connector.status !== 'ACTIVE') {
      throw new BadRequestException('Connector is disabled.');
    }
    if (connector.protocol === 'local') {
      return connector;
    }

    const nextGeneration = connector.mountGeneration + 1;
    const result = await this.requireGateway().mount(connectorId, {
      protocol: connector.protocol,
      host: connector.host,
      exportPath: connector.exportPath,
      generation: nextGeneration,
    });

    if (!result.ok || !result.mountPath) {
      await this.prisma.client.indexedConnector.update({
        where: { id: connectorId },
        data: { lastHealthAt: new Date(), lastHealthNote: result.message, gatewayState: 'error' },
      });
      throw new BadRequestException(result.message);
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

  /** Lists host folders so an admin can pick a local indexed path from the UI. */
  async browseHost(principal: AuthPrincipal, candidate: string | undefined) {
    this.authz.assertPermission(principal, PERMISSIONS.CONNECTORS_MANAGE);
    const roots = allowedLocalRoots();
    const start = candidate?.trim() || roots[0] || '/';
    try {
      return await listHostDirectories(start, roots);
    } catch (error) {
      if (error instanceof IndexedLocalPathError) {
        throw new BadRequestException(LOCAL_PATH_MESSAGES[error.code]);
      }
      throw error;
    }
  }

  /** Lists sub-folders of a connector root so admins can pick a repository root. */
  async browse(principal: AuthPrincipal, connectorId: string, relativePath: string) {
    if (
      !this.authz.hasPermission(principal, PERMISSIONS.CONNECTORS_MANAGE) &&
      !this.authz.hasPermission(principal, PERMISSIONS.REPOSITORIES_MANAGE)
    ) {
      throw forbidden();
    }
    const connector = await this.requireConnector(connectorId);
    if (!connector.mountPath || !BROWSABLE_STATES.has(connector.gatewayState)) {
      throw new BadRequestException('Connector is not mounted or reachable yet.');
    }
    try {
      return await listContainedDirectories(connector.mountPath, relativePath);
    } catch {
      throw new BadRequestException('Folder not found or outside the connector root.');
    }
  }
}
