import { Injectable, NotFoundException } from '@nestjs/common';
import { PERMISSIONS, REPOSITORY_CAPABILITIES, type RepositoryType } from '@intandms/core';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthPrincipal } from '../authorization/authorization.service';
import { AuthorizationService } from '../authorization/authorization.service';
import { forbidden } from '../../common/forbidden.exception';

@Injectable()
export class RepositoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authz: AuthorizationService,
  ) {}

  async list(principal: AuthPrincipal) {
    if (!this.authz.hasPermission(principal, PERMISSIONS.DOCUMENTS_READ)) {
      throw forbidden();
    }
    const rows = await this.prisma.client.repository.findMany({
      orderBy: { name: 'asc' },
      include: { storageConnection: true },
    });
    return rows.map((row) => this.toDto(row));
  }

  async createManaged(
    principal: AuthPrincipal,
    input: { name: string; description?: string; rootRelativePath: string },
  ) {
    if (!this.authz.hasPermission(principal, PERMISSIONS.REPOSITORIES_MANAGE)) {
      throw forbidden();
    }
    const connection = await this.prisma.client.storageConnection.create({
      data: {
        name: `${input.name} local storage`,
        provider: 'local_fs',
        config: {},
      },
    });

    const repository = await this.prisma.client.repository.create({
      data: {
        name: input.name,
        description: input.description,
        type: 'MANAGED',
        storageConnectionId: connection.id,
        rootRelativePath: input.rootRelativePath.replace(/^\/+/, ''),
      },
      include: { storageConnection: true },
    });

    await this.authz.writeAudit(
      principal,
      'repository.create',
      'repository',
      repository.id,
      'success',
      { type: 'MANAGED' },
    );

    return this.toDto(repository);
  }

  async createFolder(
    principal: AuthPrincipal,
    repositoryId: string,
    input: { name: string; parentId?: string },
  ) {
    if (!this.authz.hasPermission(principal, PERMISSIONS.DOCUMENTS_WRITE)) {
      throw forbidden();
    }
    const repository = await this.requireManaged(repositoryId);
    const parent = input.parentId
      ? await this.prisma.client.folder.findFirst({
          where: { id: input.parentId, repositoryId: repository.id },
        })
      : null;
    if (input.parentId && !parent) {
      throw new NotFoundException('Parent folder not found.');
    }

    const relativePath = parent
      ? `${parent.relativePath}/${input.name}`.replace(/\/+/g, '/')
      : input.name;

    const folder = await this.prisma.client.folder.create({
      data: {
        repositoryId: repository.id,
        parentId: parent?.id,
        name: input.name,
        relativePath,
      },
    });

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

  async listFolders(principal: AuthPrincipal, repositoryId: string, parentId?: string) {
    if (!this.authz.hasPermission(principal, PERMISSIONS.DOCUMENTS_READ)) {
      throw forbidden();
    }
    await this.requireRepository(repositoryId);
    return this.prisma.client.folder.findMany({
      where: { repositoryId, parentId: parentId ?? null },
      orderBy: { name: 'asc' },
    });
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

  private async requireManaged(repositoryId: string) {
    const repository = await this.requireRepository(repositoryId);
    if (repository.type !== 'MANAGED') {
      throw forbidden('Managed repository required.');
    }
    if (repository.status !== 'ACTIVE') {
      throw forbidden('Repository is not active.');
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
