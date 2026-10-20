import { useCallback, useEffect, useState } from 'react';
import { IconMessage } from '../../components/icons';
import { Alert, Button, Spinner } from '../../components/ui';
import { api, type ChatUser, type ConversationSummary } from '../../lib/api';
import { href } from '../../lib/route';
import { useI18n } from '../../i18n';
import { Field, Modal, errorText, useAction } from '../admin/shared';
import { ChatAvatar, Composer, MessageThread, UserPicker, conversationTitle, useConversationMessages } from './chat';

type Discussion = { conversationId: string | null; following: boolean };

/** Discussion thread attached to one document; visible to everyone who can read the document. */
export function DocumentDiscussion({ documentId, meId }: { documentId: string; meId: string }) {
  const { t } = useI18n();
  const [meta, setMeta] = useState<Discussion | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadMeta = useCallback(async () => {
    try {
      setMeta(await api<Discussion>(`/api/v1/messages/documents/${documentId}`));
      setError(null);
    } catch (loadError) {
      setError(errorText(loadError, t));
    }
  }, [documentId, t]);

  useEffect(() => {
    setMeta(null);
    void loadMeta();
  }, [loadMeta]);

  const thread = useConversationMessages(meta?.conversationId ?? null, { markRead: Boolean(meta?.following) });

  async function send(body: string) {
    await api(`/api/v1/messages/documents/${documentId}/messages`, { method: 'POST', body: JSON.stringify({ body }) });
    if (!meta?.conversationId || !meta.following) await loadMeta();
    else await thread.refresh();
  }

  return (
    <section className="doc-discussion" aria-labelledby={`discussion-${documentId}`}>
      <div className="doc-discussion-head">
        <h3 id={`discussion-${documentId}`}>{t('chatDocumentDiscussion')}</h3>
        {meta?.conversationId && meta.following ? (
          <a className="small" href={href({ name: 'messages', conversationId: meta.conversationId })}>{t('chatOpenInMessages')}</a>
        ) : null}
      </div>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {meta === null && !error ? (
        <Spinner label={t('loading')} />
      ) : meta ? (
        <>
          {meta.conversationId ? (
            <MessageThread
              meId={meId}
              messages={thread.items}
              hasMore={thread.hasMore}
              loading={thread.loading}
              error={thread.error}
              onLoadOlder={() => void thread.loadOlder()}
              onChanged={() => void thread.refresh()}
              showSenders
              emptyText={t('chatDiscussionEmpty')}
            />
          ) : (
            <p className="muted small">{t('chatDiscussionEmpty')}</p>
          )}
          <Composer onSend={send} placeholder={t('chatDiscussionPlaceholder')} />
          <p className="muted small">{t('chatDiscussionNotice')}</p>
        </>
      ) : null}
    </section>
  );
}

/** Shares a document link; recipients only see it when they can read the document themselves. */
export function ShareToChatModal({ documentId, documentName, meId, onClose }: { documentId: string; documentName: string; meId: string; onClose: () => void }) {
  const { t } = useI18n();
  const [conversations, setConversations] = useState<ConversationSummary[] | null>(null);
  const [target, setTarget] = useState<{ kind: 'conversation'; id: string; label: string } | { kind: 'user'; user: ChatUser } | null>(null);
  const [note, setNote] = useState(() => t('chatShareDefaultNote'));
  const [sentTo, setSentTo] = useState<string | null>(null);
  const action = useAction();

  useEffect(() => {
    api<ConversationSummary[]>('/api/v1/messages/conversations')
      .then((items) => setConversations(items.filter((item) => item.kind !== 'DOCUMENT')))
      .catch(() => setConversations([]));
  }, []);

  async function share() {
    if (!target) return;
    await action.run(async () => {
      const conversationId =
        target.kind === 'conversation'
          ? target.id
          : (
              await api<{ id: string }>('/api/v1/messages/conversations/direct', {
                method: 'POST',
                body: JSON.stringify({ userId: target.user.id }),
              })
            ).id;
      await api(`/api/v1/messages/conversations/${conversationId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ body: note.trim(), documentIds: [documentId] }),
      });
      setSentTo(conversationId);
    });
  }

  if (sentTo) {
    return (
      <Modal title={t('chatShareTitle')} onClose={onClose} footer={<Button variant="primary" onClick={onClose}>{t('close')}</Button>}>
        <Alert tone="success" action={<a className="btn btn-secondary btn-sm" href={href({ name: 'messages', conversationId: sentTo })}>{t('chatOpenInMessages')}</a>}>
          {t('chatShareSent')}
        </Alert>
      </Modal>
    );
  }

  return (
    <Modal
      title={t('chatShareTitle')}
      description={documentName}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('cancel')}</Button>
          <Button variant="primary" icon={<IconMessage size={16} />} disabled={!target || !note.trim() || action.busy} onClick={() => void share()}>
            {action.busy ? t('saving') : t('chatShareSend')}
          </Button>
        </>
      }
    >
      {action.error ? <Alert tone="danger">{action.error}</Alert> : null}
      <Alert tone="info">{t('chatShareAccessNote')}</Alert>
      {target ? (
        <div className="share-target">
          <span>{t('chatShareTo')}</span>
          <strong>{target.kind === 'conversation' ? target.label : target.user.displayName}</strong>
          <Button size="sm" variant="ghost" onClick={() => setTarget(null)}>{t('chatChange')}</Button>
        </div>
      ) : (
        <>
          {conversations === null ? (
            <Spinner label={t('loading')} />
          ) : conversations.length ? (
            <>
              <h3 className="section-title">{t('chatRecentConversations')}</h3>
              <ul className="user-picker-list">
                {conversations.slice(0, 6).map((item) => {
                  const label = conversationTitle(item, meId, t);
                  return (
                    <li key={item.id}>
                      <button type="button" onClick={() => setTarget({ kind: 'conversation', id: item.id, label })}>
                        <ChatAvatar name={label} group={item.kind === 'GROUP'} />
                        <span><strong>{label}</strong></span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          ) : null}
          <h3 className="section-title">{t('chatOrPickPerson')}</h3>
          <UserPicker label={t('chatFindPeople')} selected={[]} onToggle={(user) => setTarget({ kind: 'user', user })} />
        </>
      )}
      <Field label={t('chatShareNote')} htmlFor="share-note">
        <textarea id="share-note" rows={3} maxLength={4000} value={note} onChange={(event) => setNote(event.target.value)} />
      </Field>
    </Modal>
  );
}
