import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { CreateRepositoryBody, UpdateRepositoryBody } from '@intandms/contracts';
import {
  PERMISSIONS,
  REPOSITORY_CAPABILITIES,
  UnusableSourceNameError,
  assertUsableSourceName,
  type RepositoryType,
} from '@intandms/core';
import { createContainedDirectory, resolveContainedDirectory } from '@intandms/storage';
import { mapSourceWriteError, resolveIndexedScanRoot } from './indexed-root';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthPrincipal } from '../authorization/authorization.service';
import { AuthorizationService } from '../authorization/authorization.service';
import { forbidden } from '../../common/forbidden.exception';

const SCAN_EVENT = 'repository.index_scan_requested';

function slugify(value: string): string {
  return (
    value
      .normalize('NFKD')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 120) || 'repository'
  );
}

@Injectable()
export class RepositoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authz: AuthorizationService,
  ) {}

  async list(principal: AuthPrincipal) {
    const scope = await this.authz.accessScope(principal, PERMISSIONS.DOCUMENTS_READ);
    const manager = this.authz.hasPermission(principal, PERMISSIONS.REPOSITORIES_MANAGE);
    const visibleIds =
      scope === 'all'
        ? null
        : [...new Set([...scope.repositoryIds, ...scope.folderGrants.map((grant) => grant.repositoryId)])];
    if (visibleIds !== null && visibleIds.length === 0 && !manager) {
      return [];
    }
    const rows = await this.prisma.client.repository.findMany({
      where: {
        ...(visibleIds !== null && !manager ? { id: { in: visibleIds } } : {}),
        ...(manager ? {} : { status: 'ACTIVE' as const }),
      },
      orderBy: { name: 'asc' },
      include: { storageConnection: true },
    });
    return Promise.all(
      rows.map(async (row) => {
        const root = { repositoryId: row.id, folderId: null };
        const [read, write] = await Promise.all([
          this.authz.can(principal, PERMISSIONS.DOCUMENTS_READ, root),
          this.authz.can(principal, PERMISSIONS.DOCUMENTS_WRITE, root),
        ]);
        const partial = !read && (visibleIds?.includes(row.id) ?? false);
        return {
          ...this.toDto(row),
          access: { level: read ? 'full' : partial ? 'partial' : 'none', read, write },
        };
      }),
    );
  }

  async create(principal: AuthPrincipal, input: CreateRepositoryBody) {
    this.authz.assertPermission(principal, PERMISSIONS.REPOSITORIES_MANAGE);
    if (input.grants.length > 0) {
      this.authz.assertPermission(principal, PERMISSIONS.USERS_MANAGE);
      await this.authz.assertGrantableRoles(input.grants.map((grant) => grant.roleId));
      const userIds = [...new Set(input.grants.map((grant) => grant.userId))];
      const users = await this.prisma.client.user.count({ where: { id: { in: userIds } } });
      if (users !== userIds.length) throw new NotFoundException('User not found.');
    }
    const grants = [
      ...new Map(input.grants.map((grant) => [`${grant.userId}:${grant.roleId}`, grant])).values(),
    ];

    let connection: { name: string; provider: string; config: Prisma.InputJsonObject };
    let rootRelativePath: string;
    let scanIntervalMinutes: number | null = null;
    if (input.type === 'INDEXED') {
      const connector = await this.prisma.client.indexedConnector.findUnique({ where: { id: input.connectorId } });
      if (!connector) throw new NotFoundException('Connector not found.');
      if (connector.status !== 'ACTIVE' || !connector.mountPath) {
        throw new BadRequestException('Connector must be active and mounted before it can back a repository.');
      }
      try {
        await resolveContainedDirectory(connector.mountPath, input.rootPath);
      } catch {
        throw new BadRequestException('Root folder not found on the connector.');
      }
      connection = { name: `${input.name} indexed`, provider: 'indexed_mount', config: { connectorId: connector.id } };
      rootRelativePath = input.rootPath;
      scanIntervalMinutes = input.scanIntervalMinutes;
    } else {
      connection = { name: `${input.name} local storage`, provider: 'local_fs', config: {} };
      rootRelativePath = slugify(input.name);
    }

    const repository = await this.prisma.client.$transaction(async (tx) => {
      if (input.type === 'INDEXED') {
        const locked = await tx.$queryRaw<{ id: string }[]>`
          SELECT id FROM indexed_connectors WHERE id = ${input.connectorId}::uuid FOR UPDATE`;
        if (locked.length === 0) throw new NotFoundException('Connector not found.');
      }
      const storageConnection = await tx.storageConnection.create({ data: connection });
      const created = await tx.repository.create({
        data: {
          name: input.name,
          description: input.description || null,
          type: input.type,
          storageConnectionId: storageConnection.id,
          rootRelativePath,
          scanIntervalMinutes,
        },
        include: { storageConnection: true },
      });
      if (grants.length > 0) {
        await tx.scopedRoleAssignment.createMany({
          data: grants.map((grant) => ({
            userId: grant.userId,
            roleId: grant.roleId,
            repositoryId: created.id,
            createdByUserId: principal.id,
          })),
        });
      }
      if (input.type === 'INDEXED') {
        await tx.scanCheckpoint.create({ data: { repositoryId: created.id, status: 'queued' } });
        await tx.outboxEvent.create({
          data: {
            aggregateType: 'repository',
            aggregateId: created.id,
            eventType: SCAN_EVENT,
            payload: { repositoryId: created.id },
          },
        });
      }
      return created;
    });

    await this.authz.writeAudit(principal, 'repository.create', 'repository', repository.id, 'success', {
      type: input.type,
      rootRelativePath,
      scanIntervalMinutes,
    });
    for (const grant of grants) {
      await this.authz.writeAudit(principal, 'access.grant', 'user', grant.userId, 'success', {
        roleId: grant.roleId,
        repositoryId: repository.id,
        folderId: null,
      });
    }
    return this.toDto(repository);
  }

  async adminDetail(principal: AuthPrincipal, repositoryId: string) {
    this.authz.assertPermission(principal, PERMISSIONS.REPOSITORIES_MANAGE);
    const repository = await this.requireRepository(repositoryId);
    const connectorId = (repository.storageConnection.config as { connectorId?: string }).connectorId;
    const [connector, checkpoint, documents, folders, observations, grants] = await Promise.all([
      connectorId
        ? this.prisma.client.indexedConnector.findUnique({
            where: { id: connectorId },
            select: { id: true, name: true, protocol: true, host: true, exportPath: true, gatewayState: true, status: true },
          })
        : Promise.resolve(null),
      this.prisma.client.scanCheckpoint.findUnique({ where: { repositoryId } }),
      this.prisma.client.document.count({ where: { repositoryId } }),
      this.prisma.client.folder.count({ where: { repositoryId } }),
      repository.type === 'INDEXED'
        ? this.prisma.client.sourceObservation.groupBy({
            by: ['sourceState'],
            where: { repositoryId },
            _count: { _all: true },
          })
        : Promise.resolve([]),
      this.prisma.client.scopedRoleAssignment.count({ where: { repositoryId } }),
    ]);
    return {
      ...this.toDto(repository),
      scanIntervalMinutes: repository.scanIntervalMinutes,
      createdAt: repository.createdAt,
      connector,
      scan: checkpoint
        ? {
            status: checkpoint.status,
            generation: checkpoint.generation,
            lastStartedAt: checkpoint.lastStartedAt,
            lastCompletedAt: checkpoint.lastCompletedAt,
            lastError: checkpoint.lastError,
            filesSeen: checkpoint.filesSeen,
          }
        : null,
      counts: {
        documents,
        folders,
        grants,
        sources: Object.fromEntries(observations.map((row) => [row.sourceState, row._count._all])),
      },
    };
  }

  async update(principal: AuthPrincipal, repositoryId: string, input: UpdateRepositoryBody) {
    this.authz.assertPermission(principal, PERMISSIONS.REPOSITORIES_MANAGE);
    const repository = await this.requireRepository(repositoryId);
    if (input.scanIntervalMinutes !== undefined && repository.type !== 'INDEXED') {
      throw new BadRequestException('Only indexed repositories have an indexing schedule.');
    }
    const result = await this.prisma.client.repository.updateMany({
      where: { id: repositoryId, revision: input.revision },
      data: {
        name: input.name,
        description: input.description === undefined ? undefined : input.description || null,
        scanIntervalMinutes: input.scanIntervalMinutes,
        status: input.status,
        revision: { increment: 1 },
      },
    });
    if (result.count === 0) {
      throw new ConflictException('This repository was changed by someone else. Reload and try again.');
    }
    await this.authz.writeAudit(principal, 'repository.update', 'repository', repositoryId, 'success', {
      name: input.name ?? null,
      status: input.status ?? null,
      previousStatus: repository.status,
      scanIntervalMinutes: input.scanIntervalMinutes ?? null,
    });
    return this.adminDetail(principal, repositoryId);
  }

  async requestRescan(principal: AuthPrincipal, repositoryId: string) {
    this.authz.assertPermission(principal, PERMISSIONS.REPOSITORIES_MANAGE);
    const repository = await this.requireRepository(repositoryId);
    if (repository.type !== 'INDEXED') throw new BadRequestException('Only indexed repositories are scanned.');
    if (repository.status !== 'ACTIVE') throw new BadRequestException('Repository is not active.');
    const pending = await this.prisma.client.outboxEvent.count({
      where: { aggregateId: repositoryId, eventType: SCAN_EVENT, dispatchedAt: null },
    });
    if (pending === 0) {
      await this.prisma.client.$transaction([
        this.prisma.client.outboxEvent.create({
          data: {
            aggregateType: 'repository',
            aggregateId: repositoryId,
            eventType: SCAN_EVENT,
            payload: { repositoryId },
          },
        }),
        this.prisma.client.scanCheckpoint.upsert({
          where: { repositoryId },
          create: { repositoryId, status: 'queued' },
          update: { status: 'queued' },
        }),
      ]);
      await this.authz.writeAudit(principal, 'repository.rescan', 'repository', repositoryId, 'success');
    }
    return { queued: true, alreadyPending: pending > 0 };
  }

  async createFolder(
    principal: AuthPrincipal,
    repositoryId: string,
    input: { name: string; parentId?: string },
  ) {
    await this.authz.assertCan(principal, PERMISSIONS.DOCUMENTS_WRITE, { repositoryId, folderId: input.parentId });
    const repository = await this.requireWritableRepository(repositoryId);
    const parent = input.parentId
      ? await this.prisma.client.folder.findFirst({
          where: { id: input.parentId, repositoryId: repository.id },
        })
      : null;
    if (input.parentId && !parent) {
      throw new NotFoundException('Parent folder not found.');
    }
    if (parent?.sourceMissingAt) {
      throw new BadRequestException('Parent folder is missing on the source.');
    }

    let name = input.name.trim();
    if (repository.type === 'INDEXED') {
      try {
        name = assertUsableSourceName(input.name, 'folder');
      } catch (error) {
        if (error instanceof UnusableSourceNameError) throw new BadRequestException(error.message);
        throw error;
      }
    } else if (!name) {
      throw new BadRequestException('Folder name is required.');
    }

    const relativePath = parent ? `${parent.relativePath}/${name}`.replace(/\/+/g, '/') : name;
    if (relativePath.length > 1024) {
      throw new BadRequestException('That path is too long.');
    }

    if (repository.type === 'INDEXED') {
      try {
        const scanRoot = await resolveIndexedScanRoot(this.prisma.client, repository);
        await createContainedDirectory(scanRoot, relativePath);
      } catch (error) {
        mapSourceWriteError(error);
      }
    }

    let folder;
    try {
      folder = await this.prisma.client.folder.create({
        data: {
          repositoryId: repository.id,
          parentId: parent?.id,
          name,
          relativePath,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('A folder with that name already exists.');
      }
      throw error;
    }

    await this.authz.writeAudit(
      principal,
      'folder.create',
      'folder',
      folder.id,
      'success',
      { repositoryId },
    );

    return folder;
  }

  /** What the caller may do at one location, so the UI can show only usable actions. */
  async myAccess(principal: AuthPrincipal, repositoryId: string, folderId?: string) {
    await this.requireRepository(repositoryId);
    const location = { repositoryId, folderId };
    const [read, write] = await Promise.all([
      this.authz.can(principal, PERMISSIONS.DOCUMENTS_READ, location),
      this.authz.can(principal, PERMISSIONS.DOCUMENTS_WRITE, location),
    ]);
    return { read, write };
  }

  async listFolders(principal: AuthPrincipal, repositoryId: string, parentId?: string) {
    await this.requireRepository(repositoryId);
    const location = { repositoryId, folderId: parentId };
    const children = () =>
      this.prisma.client.folder.findMany({
        where: { repositoryId, parentId: parentId ?? null, sourceMissingAt: null },
        orderBy: { name: 'asc' },
      });

    if (await this.authz.can(principal, PERMISSIONS.DOCUMENTS_READ, location)) {
      return (await children()).map((folder) => ({ ...folder, access: 'full' as const }));
    }

    const traversable = await this.authz.traversableFolderIds(principal, repositoryId, PERMISSIONS.DOCUMENTS_READ);
    const reachable = parentId ? traversable.has(parentId) : traversable.size > 0;
    if (!reachable) {
      throw forbidden();
    }
    const grantedRoots = new Set(
      (await this.authz.grants(principal))
        .filter((grant) => grant.repositoryId === repositoryId && grant.folderId)
        .filter((grant) => grant.permissions.includes(PERMISSIONS.DOCUMENTS_READ))
        .map((grant) => grant.folderId!),
    );
    return (await children())
      .filter((folder) => traversable.has(folder.id))
      .map((folder) => ({ ...folder, access: grantedRoots.has(folder.id) ? ('full' as const) : ('traverse' as const) }));
  }

  private async requireRepository(repositoryId: string) {
    const repository = await this.prisma.client.repository.findUnique({
      where: { id: repositoryId },
      include: { storageConnection: true },
    });
    if (!repository) {
      throw new NotFoundException('Repository not found.');
    }
    return repository;
  }

  private async requireWritableRepository(repositoryId: string) {
    const repository = await this.requireRepository(repositoryId);
    if (repository.status !== 'ACTIVE') {
      throw forbidden('Repository is not active.');
    }
    if (repository.type !== 'MANAGED' && repository.type !== 'INDEXED') {
      throw forbidden('Repository does not allow creating folders.');
    }
    return repository;
  }

  private async requireManaged(repositoryId: string) {
    const repository = await this.requireWritableRepository(repositoryId);
    if (repository.type !== 'MANAGED') {
      throw forbidden('Managed repository required.');
    }
    return repository;
  }

  private toDto(row: {
    id: string;
    name: string;
    description: string | null;
    type: RepositoryType;
    status: string;
    rootRelativePath: string;
    revision: number;
    storageConnection: { provider: string };
  }) {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      type: row.type,
      status: row.status,
      rootRelativePath: row.rootRelativePath,
      revision: row.revision,
      storageProvider: row.storageConnection.provider,
      capabilities: REPOSITORY_CAPABILITIES[row.type as RepositoryType],
    };
  }
}
