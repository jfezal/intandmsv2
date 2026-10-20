import type { PrismaClient } from '@prisma/client';
import { LocalManagedBlobStore } from '@intandms/storage';

export async function publishUploadSession(
  db: PrismaClient,
  blobStore: LocalManagedBlobStore,
  uploadSessionId: string,
): Promise<void> {
  const session = await db.uploadSession.findUnique({
    where: { id: uploadSessionId },
    include: { storageObject: true },
  });
  if (!session?.storageObject || session.status === 'published') {
    return;
  }

  await db.storageObject.update({
    where: { id: session.storageObject.id },
    data: { scanStatus: 'clean' },
  });

  const published = await db.$transaction(async (tx) => {
    const document = await tx.document.create({
      data: {
        repositoryId: session.repositoryId,
        folderId: session.folderId,
        displayName: session.displayName,
      },
    });

    const version = await tx.documentVersion.create({
      data: {
        documentId: document.id,
        sequence: 1,
        sha256: session.storageObject!.sha256,
        sizeBytes: session.storageObject!.sizeBytes,
        mimeType: session.mimeType,
        storageObjectId: session.storageObject!.id,
        createdByUserId: session.createdByUserId,
      },
    });

    const updatedDocument = await tx.document.update({
      where: { id: document.id },
      data: { currentVersionId: version.id },
    });

    await tx.uploadSession.update({
      where: { id: session.id },
      data: { status: 'published', documentId: document.id, publishedAt: new Date() },
    });

    await tx.outboxEvent.create({
      data: {
        aggregateType: 'document_version',
        aggregateId: version.id,
        eventType: 'document.version.index_requested',
        payload: {
          documentId: document.id,
          versionId: version.id,
          mimeType: session.mimeType,
        },
      },
    });

    await tx.outboxEvent.create({
      data: {
        aggregateType: 'document_version',
        aggregateId: version.id,
        eventType: 'document.version.preview_requested',
        payload: { versionId: version.id, mimeType: session.mimeType },
      },
    });

    return { document: updatedDocument, version };
  });

  void blobStore;
  void published;
}
