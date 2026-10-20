import { useCallback, useEffect, useRef, useState } from 'react';
import { FileIcon, IconMessage, IconX } from '../../components/icons';
import { IconButton } from '../../components/ui';
import { api, type ConversationSummary } from '../../lib/api';
import { fileKind, formatInboxDate } from '../../lib/format';
import { useMessageEvents } from '../../lib/messageStream';
import { href } from '../../lib/route';
import { useI18n } from '../../i18n';
import { ChatAvatar, conversationPreview, conversationTitle } from './chat';

const MENU_ITEMS = 8;
const TOAST_MS = 6000;

export type InboxState = {
  items: ConversationSummary[] | null;
  unreadConversations: number;
  toast: ConversationSummary | null;
  dismissToast: () => void;
};

/**
 * Keeps the signed-in user's conversation summaries fresh from the message stream and raises a
 * pop-up when another person's message arrives in a conversation that is not open on screen.
 */
export function useInbox(meId: string | null, openConversationId: string | undefined, onError: (error: unknown) => void): InboxState {
  const [items, setItems] = useState<ConversationSummary[] | null>(null);
  const [toast, setToast] = useState<ConversationSummary | null>(null);
  const previous = useRef<Map<string, number> | null>(null);
  const openRef = useRef(openConversationId);
  openRef.current = openConversationId;
  const timer = useRef<number | undefined>(undefined);

  const load = useCallback(() => {
    if (!meId) return;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      api<ConversationSummary[]>('/api/v1/messages/conversations')
        .then((next) => {
          const before = previous.current;
          if (before) {
            const arrived = next.find(
              (item) =>
                item.unreadCount > (before.get(item.id) ?? 0) &&
                item.id !== openRef.current &&
                item.lastMessage?.sender?.id !== meId,
            );
            if (arrived) setToast(arrived);
          }
          previous.current = new Map(next.map((item) => [item.id, item.unreadCount]));
          setItems(next);
        })
        .catch(onError);
    }, 250);
  }, [meId, onError]);

  useEffect(() => {
    previous.current = null;
    setItems(null);
    setToast(null);
    load();
    return () => window.clearTimeout(timer.current);
  }, [load]);

  useMessageEvents(() => load());

  useEffect(() => {
    if (!toast) return;
    const handle = window.setTimeout(() => setToast(null), TOAST_MS);
    return () => window.clearTimeout(handle);
  }, [toast]);

  useEffect(() => {
    if (toast && toast.id === openConversationId) setToast(null);
  }, [toast, openConversationId]);

  const unreadConversations = items?.filter((item) => item.unreadCount > 0).length ?? 0;

  useEffect(() => {
    const base = document.title.replace(/^\(\d+\)\s+/, '');
    document.title = unreadConversations > 0 ? `(${unreadConversations}) ${base}` : base;
  }, [unreadConversations]);

  return { items, unreadConversations, toast, dismissToast: () => setToast(null) };
}

function ConversationAvatar({ item, title }: { item: ConversationSummary; title: string }) {
  return item.kind === 'DOCUMENT' ? (
    <span className="chat-avatar is-doc">
      <FileIcon kind={fileKind(undefined, title)} size={22} />
    </span>
  ) : (
    <ChatAvatar name={title} group={item.kind === 'GROUP'} />
  );
}

export function InboxMenu({ meId, inbox }: { meId: string; inbox: InboxState }) {
  const { t, locale } = useI18n();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const { items, unreadConversations } = inbox;

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        root.current?.querySelector<HTMLButtonElement>('.inbox-trigger')?.focus();
      }
    };
    const onRoute = () => setOpen(false);
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    window.addEventListener('hashchange', onRoute);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('hashchange', onRoute);
    };
  }, [open]);

  const label = unreadConversations > 0 ? t('inboxLabelUnread', { count: unreadConversations }) : t('inboxLabel');
  const shown = (items ?? []).slice(0, MENU_ITEMS);

  return (
    <div className="topbar-inbox" ref={root}>
      <IconButton
        className="inbox-trigger"
        label={label}
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls="inbox-panel"
        onClick={() => setOpen((value) => !value)}
      >
        <IconMessage />
        {unreadConversations > 0 ? (
          <span className="inbox-badge" aria-hidden="true">
            {unreadConversations > 99 ? '99+' : unreadConversations}
          </span>
        ) : null}
      </IconButton>
      {open ? (
        <div className="inbox-panel" id="inbox-panel" role="region" aria-label={t('inboxLabel')}>
          <div className="inbox-head">
            <h2>{t('chatHeading')}</h2>
            {unreadConversations > 0 ? <span className="muted small">{t('inboxUnreadSummary', { count: unreadConversations })}</span> : null}
          </div>
          {items === null ? (
            <p className="inbox-empty muted small">{t('loading')}</p>
          ) : shown.length === 0 ? (
            <p className="inbox-empty muted small">{t('chatNoConversations')}</p>
          ) : (
            <ul className="inbox-list">
              {shown.map((item) => {
                const title = conversationTitle(item, meId, t);
                return (
                  <li key={item.id}>
                    <a
                      className={`conversation-item${item.unreadCount ? ' is-unread' : ''}`}
                      href={href({ name: 'messages', conversationId: item.id })}
                      onClick={() => setOpen(false)}
                    >
                      <ConversationAvatar item={item} title={title} />
                      <span className="conversation-text">
                        <span className="conversation-top">
                          <strong>{title}</strong>
                          {item.lastMessageAt ? <time dateTime={item.lastMessageAt}>{formatInboxDate(item.lastMessageAt, locale)}</time> : null}
                        </span>
                        <span className="conversation-bottom">
                          <span className="conversation-preview">{conversationPreview(item, meId, t)}</span>
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
          <a className="inbox-foot" href={href({ name: 'messages' })} onClick={() => setOpen(false)}>
            {t('inboxSeeAll')}
          </a>
        </div>
      ) : null}
    </div>
  );
}

export function InboxToast({ meId, inbox }: { meId: string; inbox: InboxState }) {
  const { t } = useI18n();
  const item = inbox.toast;
  return (
    <div className="inbox-toast-region" aria-live="polite">
      {item ? (
        <div className="inbox-toast">
          <a className="inbox-toast-body" href={href({ name: 'messages', conversationId: item.id })} onClick={inbox.dismissToast}>
            <ConversationAvatar item={item} title={conversationTitle(item, meId, t)} />
            <span className="conversation-text">
              <strong>{t('inboxNewFrom', { name: item.lastMessage?.sender?.displayName ?? conversationTitle(item, meId, t) })}</strong>
              <span className="conversation-preview">{conversationPreview(item, meId, t)}</span>
            </span>
          </a>
          <IconButton label={t('close')} onClick={inbox.dismissToast}>
            <IconX size={16} />
          </IconButton>
        </div>
      ) : null}
    </div>
  );
}
