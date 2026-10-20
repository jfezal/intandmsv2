import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, api, type UploadSession, uploadFile } from '../../lib/api';

export type UploadState = 'transferring' | 'processing' | 'published' | 'rejected' | 'failed' | 'cancelled';

export type UploadItem = {
  id: string;
  name: string;
  size: number;
  repositoryId: string;
  folderId: string | null;
  progress: number;
  state: UploadState;
  error?: string;
};

const POLL_MS = 2000;
const POLL_LIMIT = 90;

export function useUploads(onPublished: (repositoryId: string, folderId: string | null) => void) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const aborts = useRef(new Map<string, () => void>());
  const files = useRef(new Map<string, File>());
  const publishedRef = useRef(onPublished);
  publishedRef.current = onPublished;

  useEffect(() => {
    const pending = aborts.current;
    return () => {
      for (const abort of pending.values()) abort();
    };
  }, []);

  const patch = useCallback((id: string, next: Partial<UploadItem>) => {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, ...next } : item)));
  }, []);

  const pollSession = useCallback(
    async (item: UploadItem, sessionId: string) => {
      for (let attempt = 0; attempt < POLL_LIMIT; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, POLL_MS));
        try {
          const session = await api<UploadSession>(
            `/api/v1/repositories/${item.repositoryId}/documents/uploads/${sessionId}`,
          );
          if (session.status === 'published') {
            patch(item.id, { state: 'published', progress: 1 });
            publishedRef.current(item.repositoryId, item.folderId);
            return;
          }
          if (session.status === 'rejected') {
            patch(item.id, { state: 'rejected' });
            return;
          }
        } catch {
          /* transient; keep polling */
        }
      }
      // Still processing server-side; the document will appear once the worker finishes.
    },
    [patch],
  );

  const start = useCallback(
    (item: UploadItem, file: File) => {
      const { promise, abort } = uploadFile(item.repositoryId, file, item.folderId, (fraction) =>
        patch(item.id, { progress: fraction }),
      );
      aborts.current.set(item.id, abort);
      void promise
        .then((result) => {
          aborts.current.delete(item.id);
          patch(item.id, { state: 'processing', progress: 1 });
          void pollSession(item, result.uploadSessionId);
        })
        .catch((error: unknown) => {
          aborts.current.delete(item.id);
          const message = error instanceof Error ? error.message : String(error);
          if (error instanceof ApiError && message === 'aborted') {
            patch(item.id, { state: 'cancelled' });
          } else {
            patch(item.id, { state: 'failed', error: message });
          }
        });
    },
    [patch, pollSession],
  );

  const enqueue = useCallback(
    (fileList: FileList | File[], repositoryId: string, folderId: string | null) => {
      const created: Array<[UploadItem, File]> = Array.from(fileList).map((file) => [
        {
          id: crypto.randomUUID(),
          name: file.name,
          size: file.size,
          repositoryId,
          folderId,
          progress: 0,
          state: 'transferring',
        },
        file,
      ]);
      setItems((current) => [...created.map(([item]) => item), ...current]);
      for (const [item, file] of created) {
        files.current.set(item.id, file);
        start(item, file);
      }
    },
    [start],
  );

  const cancel = useCallback((id: string) => {
    aborts.current.get(id)?.();
  }, []);

  const retry = useCallback(
    (id: string) => {
      const file = files.current.get(id);
      const item = items.find((candidate) => candidate.id === id);
      if (!file || !item) return;
      const reset: UploadItem = { ...item, state: 'transferring', progress: 0, error: undefined };
      patch(id, reset);
      start(reset, file);
    },
    [items, patch, start],
  );

  const clearFinished = useCallback(() => {
    setItems((current) => {
      const keep = current.filter((item) => item.state === 'transferring' || item.state === 'processing');
      for (const item of current) {
        if (!keep.includes(item)) files.current.delete(item.id);
      }
      return keep;
    });
  }, []);

  return { items, enqueue, cancel, retry, clearFinished };
}
