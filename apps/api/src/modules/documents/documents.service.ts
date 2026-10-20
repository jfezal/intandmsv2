import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PERMISSIONS } from '@intandms/core';
import { LocalManagedBlobStore } from '@intandms/storage';
import type { Readable } from 'node:stream';
import type { AppEnv } from '../../config/env.schema';
import { forbidden } from '../../common/forbidden.exception';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthPrincipal } from '../authorization/authorization.service';
import { AuthorizationService } from '../authorization/authorization.service';

@Injectable()
export class DocumentsService {
  private readonly blobStore: LocalManagedBlobStore;

  constructor(
    private readonly prisma: PrismaService,
    private readonly authz: AuthorizationService,
    config: ConfigService<AppEnv, true>,
  ) {
    this.blobStore = new LocalManagedBlobStore(config.get('MANAGED_STORAGE_ROOT', { infer: true }));
  }

  async list(principal: AuthPrincipal, repositoryId: string, folderId?: string) {
    if (!this.authz.hasPermission(principal, PERMISSIONS.DOCUMENTS_READ)) {
      throw forbidden();
    }
    return this.prisma.client.document.findMany({
      where: { repositoryId, folderId: folderId ?? null },
      orderBy: { displayName: 'asc' },
      include: { currentVersion: true },
    });
  }

  async uploadManaged(
    principal: AuthPrincipal,
    repositoryId: string,
    input: {
      folderId?: string;
      displayName: string;
      mimeType: string;
      stream: Readable;
    },
  ) {
    if (!this.authz.hasPermission(principal, PERMISSIONS.DOCUMENTS_WRITE)) {
      throw forbidden();
    }

    const repository = await this.prisma.client.repository.findUnique({
      where: { id: repositoryId },
    });
    if (!repository || repository.type !== 'MANAGED' || repository.status !== 'ACTIVE') {
      throw forbidden('Managed active repository required.');
    }

    const storageDir = `repos/${repository.id}/blobs`;
    const published = await this.blobStore.publishStream(storageDir, input.stream);

    const result = await this.prisma.client.$transaction(async (tx) => {
      const storageObject = await tx.storageObject.create({
        data: {
          storageKey: published.storageKey,
          sha256: published.sha256,
          sizeBytes: BigInt(published.sizeBytes),
          mimeType: input.mimeType,
        },
      });

      const document = await tx.document.create({
        data: {
          repositoryId,
          folderId: input.folderId,
          displayName: input.displayName,
        },
      });

      const version = await tx.documentVersion.create({
        data: {
          documentId: document.id,
          sequence: 1,
          sha256: published.sha256,
          sizeBytes: BigInt(published.sizeBytes),
          mimeType: input.mimeType,
          storageObjectId: storageObject.id,
          createdByUserId: principal.id,
        },
      });

      const updated = await tx.document.update({
        where: { id: document.id },
        data: { currentVersionId: version.id },
        include: { currentVersion: true },
      });

      await tx.outboxEvent.create({
        data: {
          aggregateType: 'document_version',
          aggregateId: version.id,
          eventType: 'document.version.index_requested',
          payload: {
            documentId: document.id,
            versionId: version.id,
            mimeType: input.mimeType,
          },
        },
      });

      return updated;
    });

    await this.authz.writeAudit(
      principal,
      'document.upload',
      'document',
      result.id,
      'success',
      { repositoryId, versionId: result.currentVersionId },
    );

    return result;
  }

  async download(principal: AuthPrincipal, documentId: string) {
    if (!this.authz.hasPermission(principal, PERMISSIONS.DOCUMENTS_READ)) {
      throw forbidden();
    }

    const document = await this.prisma.client.document.findUnique({
      where: { id: documentId },
      include: { currentVersion: { include: { storageObject: true } } },
    });
    if (!document?.currentVersion?.storageObject) {
      throw new NotFoundException('Document not found.');
    }

    const bytes = await this.blobStore.readBytes(document.currentVersion.storageObject.storageKey);

    await this.authz.writeAudit(
      principal,
      'document.download',
      'document',
      document.id,
      'success',
    );

    return {
      displayName: document.displayName,
      mimeType: document.currentVersion.mimeType,
      bytes,
    };
  }
}
