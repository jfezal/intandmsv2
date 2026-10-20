import { useCallback, useEffect, useMemo, useState } from 'react';
import { FileIcon, IconArrowLeft, IconFolderOpen, IconMessage, IconPlus, IconSearch, IconUsers } from '../../components/icons';
import { Alert, Badge, Button, EmptyState, IconButton, SkeletonRows } from '../../components/ui';
import { api, type ChatUser, type ConversationDetail, type ConversationSummary, type MeUser } from '../../lib/api';
import { fileKind, formatDateTime, formatInboxDate } from '../../lib/format';
import { useMessageEvents } from '../../lib/messageStream';
import { href, navigate } from '../../lib/route';
import { useI18n } from '../../i18n';
import { Field, LoadError, Modal, Tabs, errorText, useAction } from '../admin/shared';
import {
  ChatAvatar,
  Composer,
  MessageThread,
  UserPicker,
  conversationTitle,
  systemText,
  useConversationDetail,
  useConversationMessages,
} from './chat';

function useConversations() {
  const { t } = useI18n();
  const [items, setItems] = useState<ConversationSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      setItems(await api<ConversationSummary[]>('/api/v1/messages/conversations'));
      setError(null);
    } catch (loadError) {
      setError(errorText(loadError, t));
    }
  }, [t]);
  useEffect(() => {
    void load();
  }, [load]);
  useMessageEvents(() => void load());
  return { items, error, reload: load };
}

function ConversationList({
  me,
  items,
  activeId,
  onNew,
}: {
  me: MeUser;
  items: ConversationSummary[];
  activeId?: string;
  onNew: () => void;
}) {
  const { t, locale } = useI18n();
  const [filter, setFilter] = useState('');
  const visible = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((item) =>
      [conversationTitle(item, me.id, t), ...item.participants.map((participant) => participant.displayName)].some((value) =>
        value.toLowerCase().includes(needle),
      ),
    );
  }, [items, filter, me.id, t]);

  return (
    <>
      <div className="messenger-list-head">
        <label className="filter-input">
          <IconSearch size={16} />
          <input type="search" aria-label={t('chatFilter')} placeholder={t('chatFilter')} value={filter} onChange={(event) => setFilter(event.target.value)} />
        </label>
        <IconButton label={t('chatNew')} onClick={onNew}>
          <IconPlus size={18} />
        </IconButton>
      </div>
      {items.length === 0 ? (
        <EmptyState
          icon={<IconMessage size={28} />}
          title={t('chatNoConversations')}
          hint={t('chatNoConversationsHint')}
          action={<Button variant="primary" icon={<IconPlus size={16} />} onClick={onNew}>{t('chatNew')}</Button>}
        />
      ) : visible.length === 0 ? (
        <p className="muted small messenger-nomatch">{t('chatFilterNoMatch')}</p>
      ) : (
        <ul className="conversation-list">
          {visible.map((item) => {
            const title = conversationTitle(item, me.id, t);
            const last = item.lastMessage;
            const preview = last
              ? last.kind === 'system'
                ? systemText({ body: last.preview, metadata: last.metadata, sender: last.sender }, t)
                : `${last.sender?.id === me.id ? `${t('chatYou')}: ` : item.kind !== 'DIRECT' && last.sender ? `${last.sender.displayName}: ` : ''}${last.preview}`
              : t('chatNoMessagesYet');
            return (
              <li key={item.id}>
                <a
                  href={href({ name: 'messages', conversationId: item.id })}
                  className={`conversation-item${item.id === activeId ? ' active' : ''}${item.unreadCount ? ' is-unread' : ''}`}
                  aria-current={item.id === activeId ? 'page' : undefined}
                >
                  {item.kind === 'DOCUMENT' ? (
                    <span className="chat-avatar is-doc"><FileIcon kind={fileKind(undefined, title)} size={22} /></span>
                  ) : (
                    <ChatAvatar name={title} group={item.kind === 'GROUP'} />
                  )}
                  <span className="conversation-text">
                    <span className="conversation-top">
                      <strong>{title}</strong>
                      {item.lastMessageAt ? (
                        <time dateTime={item.lastMessageAt} title={formatDateTime(item.lastMessageAt, locale)}>
                          {formatInboxDate(item.lastMessageAt, locale)}
                        </time>
                      ) : null}
                    </span>
                    <span className="conversation-bottom">
                      <span className="conversation-preview">{preview}</span>
                      {item.unreadCount ? (
                        <span className="nav-badge" aria-label={t('chatUnreadCount', { count: item.unreadCount })}>
                          {item.unreadCount}
                        </span>
                      ) : null}
                    </span>
                  </span>
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

function NewConversationModal({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const [mode, setMode] = useState<'direct' | 'group'>('direct');
  const [selected, setSelected] = useState<ChatUser[]>([]);
  const [title, setTitle] = useState('');
  const action = useAction();

  function toggle(user: ChatUser) {
    if (mode === 'direct') {
      void action.run(async () => {
        const result = await api<{ id: string }>('/api/v1/messages/conversations/direct', {
          method: 'POST',
          body: JSON.stringify({ userId: user.id }),
        });
        onClose();
        navigate({ name: 'messages', conversationId: result.id });
      });
      return;
    }
    setSelected((current) => (current.some((item) => item.id === user.id) ? current.filter((item) => item.id !== user.id) : [...current, user]));
  }

  async function createGroup() {
    await action.run(async () => {
      const result = await api<{ id: string }>('/api/v1/messages/conversations/group', {
        method: 'POST',
        body: JSON.stringify({ title: title.trim(), memberIds: selected.map((user) => user.id) }),
      });
      onClose();
      navigate({ name: 'messages', conversationId: result.id });
    });
  }

  return (
    <Modal
      title={t('chatNew')}
      onClose={onClose}
      footer={
        mode === 'group' ? (
          <>
            <Button onClick={onClose}>{t('cancel')}</Button>
            <Button variant="primary" disabled={action.busy || !title.trim() || selected.length === 0} onClick={() => void createGroup()}>
              {action.busy ? t('saving') : t('chatCreateGroup')}
            </Button>
          </>
        ) : undefined
      }
    >
      <Tabs
        tabs={[
          { id: 'direct', label: t('chatDirect') },
          { id: 'group', label: t('chatGroup') },
        ]}
        value={mode}
        onChange={(next) => {
          setMode(next);
          setSelected([]);
        }}
      />
      {action.error ? <Alert tone="danger">{action.error}</Alert> : null}
      {mode === 'group' ? (
        <Field label={t('chatGroupName')} htmlFor="group-title">
          <input id="group-title" value={title} maxLength={200} onChange={(event) => setTitle(event.target.value)} />
        </Field>
      ) : (
        <p className="muted small">{t('chatDirectHint')}</p>
      )}
      <UserPicker label={t('chatFindPeople')} selected={mode === 'group' ? selected : []} onToggle={toggle} />
      <p className="muted small">{t('chatRecordNotice')}</p>
    </Modal>
  );
}

function GroupSettingsModal({ me, detail, onClose, onChanged }: { me: MeUser; detail: ConversationDetail; onClose: () => void; onChanged: () => void }) {
  const { t } = useI18n();
  const owner = detail.myRole === 'owner';
  const [title, setTitle] = useState(detail.title ?? '');
  const [adding, setAdding] = useState<ChatUser[]>([]);
  const action = useAction();
  const base = `/api/v1/messages/conversations/${detail.id}`;

  async function run(work: () => Promise<unknown>) {
    if (await action.run(work)) onChanged();
  }

  return (
    <Modal title={t('chatGroupSettings')} onClose={onClose} footer={<Button onClick={onClose}>{t('close')}</Button>}>
      {action.error ? <Alert tone="danger">{action.error}</Alert> : null}
      {owner ? (
        <form
          className="inline-form"
          onSubmit={(event) => {
            event.preventDefault();
            void run(() => api(base, { method: 'PATCH', body: JSON.stringify({ title: title.trim() }) }));
          }}
        >
          <Field label={t('chatGroupName')} htmlFor="group-rename">
            <input id="group-rename" value={title} maxLength={200} onChange={(event) => setTitle(event.target.value)} />
          </Field>
          <Button type="submit" disabled={action.busy || !title.trim() || title.trim() === detail.title}>{t('save')}</Button>
        </form>
      ) : null}

      <h3 className="section-title">{t('chatMembers', { count: detail.participants.length })}</h3>
      <ul className="member-list">
        {detail.participants.map((participant) => (
          <li key={participant.id}>
            <ChatAvatar name={participant.displayName} />
            <span className="member-name">
              <strong>{participant.displayName}</strong>
              <span className="muted small">@{participant.login}</span>
            </span>
            {participant.role === 'owner' ? <Badge tone="info">{t('chatOwner')}</Badge> : null}
            {owner && participant.id !== me.id ? (
              <Button
                size="sm"
                variant="ghost"
                disabled={action.busy}
                onClick={() => {
                  if (window.confirm(t('chatConfirmRemove', { name: participant.displayName }))) {
                    void run(() => api(`${base}/members/${participant.id}`, { method: 'DELETE' }));
                  }
                }}
              >
                {t('chatRemove')}
              </Button>
            ) : null}
          </li>
        ))}
      </ul>

      {owner ? (
        <>
          <h3 className="section-title">{t('chatAddMembers')}</h3>
          <UserPicker
            label={t('chatFindPeople')}
            selected={adding}
            excludeIds={detail.participants.map((participant) => participant.id)}
            onToggle={(user) =>
              setAdding((current) => (current.some((item) => item.id === user.id) ? current.filter((item) => item.id !== user.id) : [...current, user]))
            }
          />
          <Button
            variant="primary"
            disabled={action.busy || adding.length === 0}
            onClick={() =>
              void run(async () => {
                await api(`${base}/members`, { method: 'POST', body: JSON.stringify({ userIds: adding.map((user) => user.id) }) });
                setAdding([]);
              })
            }
          >
            {t('chatAddSelected', { count: adding.length })}
          </Button>
        </>
      ) : null}

      <div className="danger-zone">
        <Button
          variant="danger"
          disabled={action.busy}
          onClick={() => {
            if (!window.confirm(t('chatConfirmLeave'))) return;
            void action.run(async () => {
              await api(`${base}/members/${me.id}`, { method: 'DELETE' });
              onClose();
              navigate({ name: 'messages' });
            });
          }}
        >
          {t('chatLeaveGroup')}
        </Button>
      </div>
    </Modal>
  );
}

function ConversationPane({ me, conversationId, onChanged }: { me: MeUser; conversationId: string; onChanged: () => void }) {
  const { t } = useI18n();
  const { detail, error: detailError, reload } = useConversationDetail(conversationId);
  const thread = useConversationMessages(conversationId);
  const [settings, setSettings] = useState(false);

  if (detailError) {
    return (
      <EmptyState
        icon={<IconMessage size={28} />}
        title={t('chatNotFound')}
        hint={detailError}
        action={<Button icon={<IconArrowLeft size={16} />} onClick={() => navigate({ name: 'messages' })}>{t('chatBack')}</Button>}
      />
    );
  }
  if (!detail) return <SkeletonRows rows={4} />;

  const title = conversationTitle(detail, me.id, t);
  const subtitle =
    detail.kind === 'GROUP'
      ? t('chatMembers', { count: detail.participants.length })
      : detail.kind === 'DOCUMENT'
        ? t('chatDocumentDiscussion')
        : `@${detail.participants.find((participant) => participant.id !== me.id)?.login ?? ''}`;

  async function send(body: string) {
    await api(`/api/v1/messages/conversations/${conversationId}/messages`, { method: 'POST', body: JSON.stringify({ body }) });
    await thread.refresh();
    onChanged();
  }

  return (
    <>
      <header className="messenger-thread-head">
        <IconButton className="messenger-back" label={t('chatBack')} onClick={() => navigate({ name: 'messages' })}>
          <IconArrowLeft size={18} />
        </IconButton>
        {detail.kind === 'DOCUMENT' ? (
          <span className="chat-avatar is-doc"><FileIcon kind={fileKind(undefined, title)} size={22} /></span>
        ) : (
          <ChatAvatar name={title} group={detail.kind === 'GROUP'} />
        )}
        <div className="messenger-thread-title">
          <h2>{title}</h2>
          <span className="muted small">{subtitle}</span>
        </div>
        {detail.kind === 'DOCUMENT' && detail.document ? (
          <a className="btn btn-ghost btn-sm" href={href({ name: 'documents', repositoryId: detail.document.repositoryId, folderId: detail.document.folderId ?? undefined })}>
            <IconFolderOpen size={16} />
            <span>{t('chatOpenInFolder')}</span>
          </a>
        ) : null}
        {detail.kind === 'GROUP' ? (
          <Button size="sm" variant="ghost" icon={<IconUsers size={16} />} onClick={() => setSettings(true)}>
            {t('chatGroupSettings')}
          </Button>
        ) : null}
      </header>
      <MessageThread
        meId={me.id}
        messages={thread.items}
        hasMore={thread.hasMore}
        loading={thread.loading}
        error={thread.error}
        onLoadOlder={() => void thread.loadOlder()}
        onChanged={() => void thread.refresh()}
        showSenders={detail.kind !== 'DIRECT'}
        emptyText={t('chatStartConversation')}
      />
      <Composer onSend={send} placeholder={t('chatComposerPlaceholder', { name: title })} />
      {settings ? (
        <GroupSettingsModal
          me={me}
          detail={detail}
          onClose={() => setSettings(false)}
          onChanged={() => {
            void reload();
            void thread.refresh();
            onChanged();
          }}
        />
      ) : null}
    </>
  );
}

export function MessagesPage({ user, conversationId }: { user: MeUser; conversationId?: string }) {
  const { t } = useI18n();
  const { items, error, reload } = useConversations();
  const [creating, setCreating] = useState(false);

  return (
    <div className="page page-messages">
      <div className={`messenger${conversationId ? ' has-thread' : ''}`}>
        <aside className="messenger-list" aria-label={t('chatConversations')}>
          <div className="messenger-list-title">
            <h1>{t('chatHeading')}</h1>
          </div>
          {error ? <LoadError message={error} onRetry={() => void reload()} /> : null}
          {items === null && !error ? (
            <SkeletonRows rows={5} />
          ) : items ? (
            <ConversationList me={user} items={items} activeId={conversationId} onNew={() => setCreating(true)} />
          ) : null}
        </aside>
        <section className="messenger-thread" aria-label={t('chatConversation')}>
          {conversationId ? (
            <ConversationPane key={conversationId} me={user} conversationId={conversationId} onChanged={() => void reload()} />
          ) : (
            <EmptyState icon={<IconMessage size={32} />} title={t('chatSelectConversation')} hint={t('chatSelectConversationHint')} />
          )}
        </section>
      </div>
      {creating ? <NewConversationModal onClose={() => setCreating(false)} /> : null}
    </div>
  );
}
