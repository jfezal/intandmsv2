import { type FormEvent, type KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FileIcon, IconEdit, IconSearch, IconSend } from '../../components/icons';
import { Alert, Button, Spinner } from '../../components/ui';
import {
  api,
  type ChatMessage,
  type ChatUser,
  type ConversationDetail,
  type ConversationSummary,
  type MessagePage,
} from '../../lib/api';
import { fileKind, formatDateTime } from '../../lib/format';
import { useMessageEvents } from '../../lib/messageStream';
import { href } from '../../lib/route';
import { type Translator, useI18n } from '../../i18n';
import { errorText } from '../admin/shared';

export const MESSAGE_MAX_LENGTH = 4000;

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

export function ChatAvatar({ name, group }: { name: string; group?: boolean }) {
  return (
    <span className={`chat-avatar${group ? ' is-group' : ''}`} aria-hidden="true">
      {initials(name) || '?'}
    </span>
  );
}

export function conversationTitle(
  conversation: Pick<ConversationSummary, 'kind' | 'title' | 'document' | 'participants'>,
  meId: string,
  t: Translator,
): string {
  if (conversation.kind === 'GROUP') return conversation.title ?? t('chatUntitledGroup');
  if (conversation.kind === 'DOCUMENT') return conversation.document?.displayName ?? t('chatDocumentUnavailable');
  const other = conversation.participants.find((participant) => participant.id !== meId);
  return other?.displayName ?? t('chatUnknownUser');
}

export function systemText(message: Pick<ChatMessage, 'body' | 'metadata' | 'sender'>, t: Translator): string {
  const actor = message.sender?.displayName ?? t('chatUnknownUser');
  const names = (message.metadata?.names ?? []).join(', ');
  switch (message.body) {
    case 'group_created':
      return t('chatSysGroupCreated', { actor, title: message.metadata?.title ?? '' });
    case 'group_renamed':
      return t('chatSysGroupRenamed', { actor, title: message.metadata?.to ?? '' });
    case 'members_added':
      return t('chatSysMembersAdded', { actor, names });
    case 'member_removed':
      return t('chatSysMemberRemoved', { actor, names });
    case 'member_left':
      return t('chatSysMemberLeft', { names: names || actor });
    default:
      return message.body;
  }
}

export function conversationPreview(item: ConversationSummary, meId: string, t: Translator): string {
  const last = item.lastMessage;
  if (!last) return t('chatNoMessagesYet');
  if (last.kind === 'system') return systemText({ body: last.preview, metadata: last.metadata, sender: last.sender }, t);
  const prefix =
    last.sender?.id === meId ? `${t('chatYou')}: ` : item.kind !== 'DIRECT' && last.sender ? `${last.sender.displayName}: ` : '';
  return `${prefix}${last.preview}`;
}

function dayKey(value: string): string {
  const date = new Date(value);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function formatDay(value: string, locale: string): string {
  return new Intl.DateTimeFormat(locale === 'ms' ? 'ms-MY' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(
    new Date(value),
  );
}

function formatTime(value: string, locale: string): string {
  return new Intl.DateTimeFormat(locale === 'ms' ? 'ms-MY' : 'en-GB', { hour: 'numeric', minute: '2-digit' }).format(new Date(value));
}

/** Messages of one conversation: latest page first, older pages on demand, live refresh. */
export function useConversationMessages(
  conversationId: string | null,
  options: { investigationReason?: string; markRead?: boolean } = {},
) {
  const { t } = useI18n();
  const { investigationReason, markRead = true } = options;
  const [items, setItems] = useState<ChatMessage[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastMarked = useRef<string | null>(null);

  const path = useCallback(
    (before?: string) => {
      if (!conversationId) return null;
      const params = new URLSearchParams();
      if (before) params.set('before', before);
      if (investigationReason) {
        params.set('reason', investigationReason);
        return `/api/v1/messages/investigation/conversations/${conversationId}/messages?${params}`;
      }
      const query = params.toString();
      return `/api/v1/messages/conversations/${conversationId}/messages${query ? `?${query}` : ''}`;
    },
    [conversationId, investigationReason],
  );

  const refresh = useCallback(async () => {
    const url = path();
    if (!url) return;
    try {
      const page = await api<MessagePage>(url);
      setError(null);
      setItems((current) => {
        if (page.items.length === 0) return [];
        const first = page.items[0];
        const fresh = new Set(page.items.map((item) => item.id));
        const older = page.hasMore ? current.filter((item) => !fresh.has(item.id) && item.createdAt < first.createdAt) : [];
        return [...older, ...page.items];
      });
      setHasMore((current) => (page.hasMore ? current || page.hasMore : false));
    } catch (loadError) {
      setError(errorText(loadError, t));
    }
  }, [path, t]);

  useEffect(() => {
    setItems([]);
    setHasMore(false);
    setError(null);
    lastMarked.current = null;
    if (!conversationId) return;
    setLoading(true);
    const url = path();
    if (!url) return;
    api<MessagePage>(url)
      .then((page) => {
        setItems(page.items);
        setHasMore(page.hasMore);
      })
      .catch((loadError: unknown) => setError(errorText(loadError, t)))
      .finally(() => setLoading(false));
  }, [conversationId, path, t]);

  const loadOlder = useCallback(async () => {
    const url = path(items[0]?.id);
    if (!url || !items[0]) return;
    setLoading(true);
    try {
      const page = await api<MessagePage>(url);
      setItems((current) => [...page.items, ...current]);
      setHasMore(page.hasMore);
    } catch (loadError) {
      setError(errorText(loadError, t));
    } finally {
      setLoading(false);
    }
  }, [items, path, t]);

  useMessageEvents((event) => {
    if (investigationReason) return;
    if (event.type === 'resync') void refresh();
    else if ((event.type === 'message' || event.type === 'conversation') && event.conversationId === conversationId) void refresh();
  });

  const latestId = items.at(-1)?.id ?? null;
  useEffect(() => {
    if (!markRead || investigationReason || !conversationId || !latestId || lastMarked.current === latestId) return;
    const mark = () => {
      if (document.visibilityState !== 'visible' || lastMarked.current === latestId) return;
      lastMarked.current = latestId;
      void api(`/api/v1/messages/conversations/${conversationId}/read`, {
        method: 'POST',
        body: JSON.stringify({ messageId: latestId }),
      }).catch(() => {
        lastMarked.current = null;
      });
    };
    mark();
    document.addEventListener('visibilitychange', mark);
    return () => document.removeEventListener('visibilitychange', mark);
  }, [conversationId, investigationReason, latestId, markRead]);

  return { items, hasMore, loading, error, refresh, loadOlder };
}

function MessageBubble({
  message,
  mine,
  showSender,
  onEdited,
  investigation,
}: {
  message: ChatMessage;
  mine: boolean;
  showSender: boolean;
  onEdited: () => void;
  investigation?: boolean;
}) {
  const { t, locale } = useI18n();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.body);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (message.kind === 'system') {
    return (
      <li className="chat-system">
        <span>{systemText(message, t)}</span>
        <time dateTime={message.createdAt} title={formatDateTime(message.createdAt, locale)}>
          {formatTime(message.createdAt, locale)}
        </time>
      </li>
    );
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    const body = draft.trim();
    if (!body || body === message.body) {
      setEditing(false);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api(`/api/v1/messages/${message.id}`, { method: 'PATCH', body: JSON.stringify({ body }) });
      setEditing(false);
      onEdited();
    } catch (saveError) {
      setError(errorText(saveError, t));
    } finally {
      setBusy(false);
    }
  }

  const senderName = message.sender?.displayName ?? t('chatUnknownUser');
  return (
    <li className={`chat-message${mine ? ' is-mine' : ''}`}>
      {!mine ? <ChatAvatar name={senderName} /> : null}
      <div className="chat-bubble-wrap">
        {showSender && !mine ? <span className="chat-sender">{senderName}</span> : null}
        <div className="chat-bubble">
          {editing ? (
            <form className="chat-edit" onSubmit={save}>
              <textarea
                aria-label={t('chatEditMessage')}
                value={draft}
                maxLength={MESSAGE_MAX_LENGTH}
                rows={3}
                autoFocus
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') setEditing(false);
                }}
              />
              {error ? <Alert tone="danger">{error}</Alert> : null}
              <div className="chat-edit-actions">
                <Button size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={busy}>{t('cancel')}</Button>
                <Button size="sm" variant="primary" type="submit" disabled={busy}>{busy ? t('saving') : t('save')}</Button>
              </div>
            </form>
          ) : (
            <p className="chat-body">{message.body}</p>
          )}
          {message.documents.length ? (
            <ul className="chat-docs">
              {message.documents.map((link, index) =>
                link.available ? (
                  <li key={link.id}>
                    <a className="chat-doc" href={href({ name: 'documents', repositoryId: link.repositoryId, folderId: link.folderId ?? undefined })}>
                      <FileIcon kind={fileKind(undefined, link.displayName)} size={28} />
                      <span>
                        <strong>{link.displayName}</strong>
                        <span className="muted small">{t('chatOpenInFolder')}</span>
                      </span>
                    </a>
                  </li>
                ) : (
                  <li key={link.id ?? `missing-${index}`} className="chat-doc is-unavailable">
                    <FileIcon kind="other" size={28} />
                    <span className="muted small">
                      {t('chatDocumentNoAccess')}
                      {investigation && link.id ? <span className="mono"> ({link.id})</span> : null}
                    </span>
                  </li>
                ),
              )}
            </ul>
          ) : null}
          {investigation && message.revisions?.length ? (
            <details className="chat-revisions">
              <summary>{t('chatRevisions', { count: message.revisions.length })}</summary>
              <ol>
                {message.revisions.map((revision) => (
                  <li key={revision.id}>
                    <span className="muted small">{t('chatRevisionReplaced', { when: formatDateTime(revision.replacedAt, locale) })}</span>
                    <p className="chat-body">{revision.body}</p>
                  </li>
                ))}
              </ol>
            </details>
          ) : null}
        </div>
        <div className="chat-meta">
          <time dateTime={message.createdAt} title={formatDateTime(message.createdAt, locale)}>
            {formatTime(message.createdAt, locale)}
          </time>
          {message.editedAt ? <span title={formatDateTime(message.editedAt, locale)}>· {t('chatEdited')}</span> : null}
          {message.canEdit && !editing ? (
            <button
              type="button"
              className="chat-edit-btn"
              onClick={() => {
                setDraft(message.body);
                setEditing(true);
              }}
            >
              <IconEdit size={13} /> {t('chatEdit')}
            </button>
          ) : null}
        </div>
      </div>
    </li>
  );
}

export function MessageThread({
  meId,
  messages,
  hasMore,
  loading,
  error,
  onLoadOlder,
  onChanged,
  showSenders,
  investigation,
  emptyText,
}: {
  meId: string;
  messages: ChatMessage[];
  hasMore: boolean;
  loading: boolean;
  error: string | null;
  onLoadOlder: () => void;
  onChanged: () => void;
  showSenders: boolean;
  investigation?: boolean;
  emptyText: string;
}) {
  const { t, locale } = useI18n();
  const scroller = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const lastId = messages.at(-1)?.id;

  useEffect(() => {
    const node = scroller.current;
    if (node && stickToBottom.current) node.scrollTop = node.scrollHeight;
  }, [lastId]);

  const groups = useMemo(() => {
    const result: Array<{ key: string; label: string; items: ChatMessage[] }> = [];
    for (const message of messages) {
      const key = dayKey(message.createdAt);
      const current = result.at(-1);
      if (current?.key === key) current.items.push(message);
      else result.push({ key, label: formatDay(message.createdAt, locale), items: [message] });
    }
    return result;
  }, [messages, locale]);

  return (
    <div
      className="chat-scroll"
      ref={scroller}
      onScroll={(event) => {
        const node = event.currentTarget;
        stickToBottom.current = node.scrollHeight - node.scrollTop - node.clientHeight < 80;
      }}
      role="log"
      aria-live="polite"
      aria-label={t('chatMessages')}
    >
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {hasMore ? (
        <div className="chat-older">
          <Button size="sm" variant="ghost" disabled={loading} onClick={onLoadOlder}>
            {loading ? t('loading') : t('chatLoadOlder')}
          </Button>
        </div>
      ) : null}
      {loading && messages.length === 0 ? <Spinner label={t('loading')} /> : null}
      {!loading && !error && messages.length === 0 ? <p className="chat-empty muted">{emptyText}</p> : null}
      {groups.map((group) => (
        <section key={group.key} className="chat-day" aria-label={group.label}>
          <h3 className="chat-day-label"><span>{group.label}</span></h3>
          <ul className="chat-list">
            {group.items.map((message, index) => {
              const previous = group.items[index - 1];
              const continued = previous?.kind === 'text' && previous.sender?.id === message.sender?.id;
              return (
                <MessageBubble
                  key={message.id}
                  message={message}
                  mine={!investigation && message.sender?.id === meId}
                  showSender={showSenders && !continued}
                  onEdited={onChanged}
                  investigation={investigation}
                />
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

export function Composer({
  onSend,
  placeholder,
  disabled,
}: {
  onSend: (body: string) => Promise<void>;
  placeholder: string;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const node = textarea.current;
    if (!node) return;
    node.style.height = 'auto';
    node.style.height = `${Math.min(node.scrollHeight, 180)}px`;
  }, [draft]);

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    const body = draft.trim();
    if (!body || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onSend(body);
      setDraft('');
      textarea.current?.focus();
    } catch (sendError) {
      setError(errorText(sendError, t));
    } finally {
      setBusy(false);
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void submit();
    }
  }

  const remaining = MESSAGE_MAX_LENGTH - draft.length;
  return (
    <form className="chat-composer" onSubmit={submit}>
      {error ? <Alert tone="danger" onDismiss={() => setError(null)}>{error}</Alert> : null}
      <div className="chat-composer-row">
        <textarea
          ref={textarea}
          rows={1}
          aria-label={placeholder}
          placeholder={placeholder}
          value={draft}
          maxLength={MESSAGE_MAX_LENGTH}
          disabled={disabled}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
        />
        <Button type="submit" variant="primary" icon={<IconSend size={16} />} disabled={disabled || busy || !draft.trim()}>
          {t('chatSend')}
        </Button>
      </div>
      <div className="chat-composer-hint muted small">
        <span>{t('chatComposerHint')}</span>
        {remaining < 500 ? <span className={remaining < 100 ? 'is-warning' : undefined}>{t('chatCharsLeft', { count: remaining })}</span> : null}
      </div>
    </form>
  );
}

/** Searches users for messaging; `multiple` keeps a selection, otherwise `onPick` fires once. */
export function UserPicker({
  selected,
  onToggle,
  excludeIds = [],
  includeDisabled,
  label,
}: {
  selected: ChatUser[];
  onToggle: (user: ChatUser) => void;
  excludeIds?: string[];
  includeDisabled?: boolean;
  label: string;
}) {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ChatUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams();
      if (query.trim()) params.set('q', query.trim());
      if (includeDisabled) params.set('includeDisabled', 'true');
      api<ChatUser[]>(`/api/v1/messages/users?${params}`)
        .then((users) => {
          if (!cancelled) {
            setResults(users);
            setError(null);
          }
        })
        .catch((loadError: unknown) => !cancelled && setError(errorText(loadError, t)));
    }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, includeDisabled, t]);

  const selectedIds = new Set(selected.map((user) => user.id));
  const visible = (results ?? []).filter((user) => !excludeIds.includes(user.id));
  return (
    <div className="user-picker">
      <label className="filter-input">
        <IconSearch size={16} />
        <input type="search" aria-label={label} placeholder={label} value={query} onChange={(event) => setQuery(event.target.value)} />
      </label>
      {selected.length ? (
        <div className="chip-row">
          {selected.map((user) => (
            <button key={user.id} type="button" className="chip" onClick={() => onToggle(user)} aria-label={t('chatRemovePerson', { name: user.displayName })}>
              {user.displayName} ×
            </button>
          ))}
        </div>
      ) : null}
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {results === null ? (
        <Spinner label={t('loading')} />
      ) : visible.length === 0 ? (
        <p className="muted small">{t('chatNoPeopleFound')}</p>
      ) : (
        <ul className="user-picker-list">
          {visible.map((user) => (
            <li key={user.id}>
              <button
                type="button"
                className={selectedIds.has(user.id) ? 'is-selected' : undefined}
                aria-pressed={selectedIds.has(user.id)}
                onClick={() => onToggle(user)}
              >
                <ChatAvatar name={user.displayName} />
                <span>
                  <strong>{user.displayName}</strong>
                  <span className="muted small">@{user.login}{user.enabled ? '' : ` · ${t('disabled')}`}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function useConversationDetail(conversationId: string | null) {
  const { t } = useI18n();
  const [detail, setDetail] = useState<ConversationDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    if (!conversationId) return;
    try {
      setDetail(await api<ConversationDetail>(`/api/v1/messages/conversations/${conversationId}`));
      setError(null);
    } catch (loadError) {
      setError(errorText(loadError, t));
      setDetail(null);
    }
  }, [conversationId, t]);
  useEffect(() => {
    setDetail(null);
    void load();
  }, [load]);
  useMessageEvents((event) => {
    if (event.type === 'conversation' && event.conversationId === conversationId) void load();
  });
  return { detail, error, reload: load };
}
