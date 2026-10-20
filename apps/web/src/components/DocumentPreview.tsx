import { useEffect, useState } from 'react';
import { IconEye } from './icons';
import { Spinner } from './ui';
import { useI18n } from '../i18n';

type PreviewState =
  | { kind: 'loading' }
  | { kind: 'unavailable' }
  | { kind: 'image' | 'pdf'; url: string }
  | { kind: 'text'; text: string };

function usePreview(documentId: string): PreviewState {
  const [state, setState] = useState<PreviewState>({ kind: 'loading' });

  useEffect(() => {
    let objectUrl: string | null = null;
    let active = true;
    setState({ kind: 'loading' });
    void (async () => {
      try {
        const response = await fetch(`/api/v1/documents/${documentId}/preview`, { credentials: 'include' });
        if (!response.ok) throw new Error(String(response.status));
        const type = response.headers.get('content-type') ?? '';
        if (type.startsWith('text/')) {
          const text = await response.text();
          if (active) setState({ kind: 'text', text: text.slice(0, 20_000) });
          return;
        }
        const blob = await response.blob();
        objectUrl = URL.createObjectURL(blob);
        if (!active) return;
        if (type.startsWith('image/')) setState({ kind: 'image', url: objectUrl });
        else if (type === 'application/pdf') setState({ kind: 'pdf', url: objectUrl });
        else setState({ kind: 'unavailable' });
      } catch {
        if (active) setState({ kind: 'unavailable' });
      }
    })();
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [documentId]);

  return state;
}

export function DocumentPreview({
  documentId,
  displayName,
  large = false,
}: {
  documentId: string;
  displayName: string;
  large?: boolean;
}) {
  const { t } = useI18n();
  const preview = usePreview(documentId);

  return (
    <section className={`preview-box${large ? ' preview-box-lg' : ''}`} aria-label={t('preview')}>
      {preview.kind === 'loading' ? (
        <div className="preview-placeholder">
          <Spinner label={t('previewLoading')} />
          <span className="muted small">{t('previewLoading')}</span>
        </div>
      ) : preview.kind === 'image' ? (
        <img src={preview.url} alt={displayName} />
      ) : preview.kind === 'pdf' ? (
        <object data={preview.url} type="application/pdf" aria-label={displayName}>
          <p className="muted small">{t('previewUnavailable')}</p>
        </object>
      ) : preview.kind === 'text' ? (
        <pre>{preview.text}</pre>
      ) : (
        <div className="preview-placeholder">
          <IconEye size={28} />
          <strong>{t('previewUnavailable')}</strong>
          <span className="muted small">{t('previewUnavailableHint')}</span>
        </div>
      )}
    </section>
  );
}
