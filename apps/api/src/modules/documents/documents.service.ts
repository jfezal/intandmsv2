import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PERMISSIONS } from '@intandms/core';
import { LocalManagedBlobStore, resolveManagedStorageRoot } from '@intandms/storage';
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
    this.blobStore = new LocalManagedBlobStore(
      resolveManagedStorageRoot(config.get('MANAGED_STORAGE_ROOT', { infer: true })),
    );
  }

  async list(principal: AuthPrincipal, repositoryId: string, folderId?: string) {
    if (!(await this.authz.can(principal, PERMISSIONS.DOCUMENTS_READ, { repositoryId, folderId }))) {
      // Traverse-only folders (on the way to a deeper grant) list no documents.
      const traversable = await this.authz.traversableFolderIds(principal, repositoryId, PERMISSIONS.DOCUMENTS_READ);
      const reachable = folderId ? traversable.has(folderId) : traversable.size > 0;
      if (!reachable) throw forbidden();
      return [];
    }
    return this.prisma.client.document.findMany({
      where: { repositoryId, folderId: folderId ?? null, lifecycleState: 'active' },
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
    await this.authz.assertCan(principal, PERMISSIONS.DOCUMENTS_WRITE, { repositoryId, folderId: input.folderId });

    const repository = await this.prisma.client.repository.findUnique({
      where: { id: repositoryId },
    });
    if (!repository || repository.type !== 'MANAGED' || repository.status !== 'ACTIVE') {
      throw forbidden('Managed active repository required.');
    }

    const storageDir = `quarantine/${repository.id}`;
    const published = await this.blobStore.publishStream(storageDir, input.stream);

    const session = await this.prisma.client.$transaction(async (tx) => {
      const storageObject = await tx.storageObject.create({
        data: {
          storageKey: published.storageKey,
          sha256: published.sha256,
          sizeBytes: BigInt(published.sizeBytes),
          mimeType: input.mimeType,
          scanStatus: 'pending',
        },
      });

      const uploadSession = await tx.uploadSession.create({
        data: {
          repositoryId,
          folderId: input.folderId,
          displayName: input.displayName,
          mimeType: input.mimeType,
          status: 'quarantine',
          storageObjectId: storageObject.id,
          createdByUserId: principal.id,
        },
      });

      await tx.outboxEvent.create({
        data: {
          aggregateType: 'upload_session',
          aggregateId: uploadSession.id,
          eventType: 'upload.scan_requested',
          payload: { uploadSessionId: uploadSession.id },
        },
      });

      return uploadSession;
    });

    await this.authz.writeAudit(
      principal,
      'document.upload.quarantine',
      'upload_session',
      session.id,
      'success',
      { repositoryId },
    );

    return {
      uploadSessionId: session.id,
      status: session.status,
      message: 'File accepted into quarantine; publication follows scan/index pipeline.',
    };
  }

  async getUploadSession(principal: AuthPrincipal, uploadSessionId: string) {
    const session = await this.prisma.client.uploadSession.findUnique({
      where: { id: uploadSessionId },
    });
    const visible =
      session &&
      (session.createdByUserId === principal.id ||
        (await this.authz.can(principal, PERMISSIONS.DOCUMENTS_READ, {
          repositoryId: session.repositoryId,
          folderId: session.folderId,
        })));
    if (!session || !visible) {
      throw new NotFoundException('Upload session not found.');
    }
    return session;
  }

  async download(principal: AuthPrincipal, documentId: string) {
    const document = await this.prisma.client.document.findUnique({
      where: { id: documentId },
      include: {
        currentVersion: { include: { storageObject: true } },
      },
    });
    if (!document?.currentVersion?.storageObject || !(await this.canRead(principal, document))) {
      throw new NotFoundException('Document not found.');
    }

    if (document.currentVersion.storageObject.scanStatus !== 'clean') {
      throw forbidden('Document is not cleared for download.');
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

  async preview(principal: AuthPrincipal, documentId: string) {
    const document = await this.prisma.client.document.findUnique({
      where: { id: documentId },
      include: { currentVersion: { include: { storageObject: true } } },
    });
    if (!document?.currentVersion?.storageObject || !(await this.canRead(principal, document))) {
      throw new NotFoundException('Document not found.');
    }

    const artifact = await this.prisma.client.previewArtifact.findUnique({
      where: {
        documentVersionId_kind: {
          documentVersionId: document.currentVersion.id,
          kind: 'inline',
        },
      },
    });
    if (artifact) {
      const bytes = await this.blobStore.readBytes(artifact.storageKey);
      return { mimeType: artifact.mimeType, bytes };
    }

    const mime = document.currentVersion.mimeType;
    if (mime.startsWith('image/') || mime === 'application/pdf' || mime.startsWith('text/')) {
      const bytes = await this.blobStore.readBytes(document.currentVersion.storageObject.storageKey);
      return { mimeType: mime, bytes };
    }

    throw new NotFoundException('Preview not available for this format yet.');
  }

  /** Inaccessible documents answer 404 so their existence is not disclosed. */
  private canRead(principal: AuthPrincipal, document: { repositoryId: string; folderId: string | null; lifecycleState: string }) {
    if (document.lifecycleState !== 'active') return Promise.resolve(false);
    return this.authz.can(principal, PERMISSIONS.DOCUMENTS_READ, {
      repositoryId: document.repositoryId,
      folderId: document.folderId,
    });
  }
}
