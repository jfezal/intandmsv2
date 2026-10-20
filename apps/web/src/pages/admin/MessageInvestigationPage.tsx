import { useState } from 'react';
import { IconArrowLeft, IconShield } from '../../components/icons';
import { Alert, Badge, Button, EmptyState, PageHeader } from '../../components/ui';
import { api, type ChatUser, type InvestigationResult } from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import { useI18n } from '../../i18n';
import { MessageThread, UserPicker, useConversationMessages } from '../messages/chat';
import { Field, useAction } from './shared';

const REASON_MIN = 5;

function InvestigationThread({ conversationId, reason, title, onBack }: { conversationId: string; reason: string; title: string; onBack: () => void }) {
  const { t } = useI18n();
  const thread = useConversationMessages(conversationId, { investigationReason: reason });
  return (
    <section className="card investigation-thread">
      <div className="card-head">
        <Button size="sm" variant="ghost" icon={<IconArrowLeft size={16} />} onClick={onBack}>{t('chatBack')}</Button>
        <h2>{title}</h2>
        <Badge tone="warning">{t('investigationReadOnly')}</Badge>
      </div>
      <MessageThread
        meId=""
        messages={thread.items}
        hasMore={thread.hasMore}
        loading={thread.loading}
        error={thread.error}
        onLoadOlder={() => void thread.loadOlder()}
        onChanged={() => undefined}
        showSenders
        investigation
        emptyText={t('chatNoMessagesYet')}
      />
    </section>
  );
}

export function MessageInvestigationPage() {
  const { t, locale } = useI18n();
  const [reason, setReason] = useState('');
  const [subject, setSubject] = useState<ChatUser | null>(null);
  const [result, setResult] = useState<InvestigationResult | null>(null);
  const [opened, setOpened] = useState<{ id: string; title: string } | null>(null);
  const [usedReason, setUsedReason] = useState('');
  const action = useAction();

  async function search() {
    if (!subject) return;
    const trimmed = reason.trim();
    await action.run(async () => {
      setResult(
        await api<InvestigationResult>(
          `/api/v1/messages/investigation/users/${subject.id}/conversations?reason=${encodeURIComponent(trimmed)}`,
        ),
      );
      setUsedReason(trimmed);
      setOpened(null);
    });
  }

  function conversationLabel(item: InvestigationResult['conversations'][number]): string {
    if (item.kind === 'GROUP') return item.title ?? t('chatUntitledGroup');
    if (item.kind === 'DOCUMENT') return item.document?.displayName ?? t('chatDocumentUnavailable');
    return item.participants.map((participant) => participant.displayName).join(' ↔ ');
  }

  const kindLabel = { DIRECT: t('chatDirect'), GROUP: t('chatGroup'), DOCUMENT: t('chatDocumentDiscussion') } as const;

  return (
    <div className="page">
      <PageHeader title={t('investigationHeading')} subtitle={t('investigationSubtitle')} />
      <Alert tone="warning" title={t('investigationWarningTitle')}>{t('investigationWarning')}</Alert>

      {opened ? (
        <InvestigationThread conversationId={opened.id} reason={usedReason} title={opened.title} onBack={() => setOpened(null)} />
      ) : (
        <>
          <section className="card investigation-form">
            <Field label={t('investigationReason')} hint={t('investigationReasonHint')} htmlFor="investigation-reason">
              <textarea id="investigation-reason" rows={2} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} />
            </Field>
            <Field label={t('investigationSubject')}>
              {subject ? (
                <div className="share-target">
                  <strong>{subject.displayName}</strong>
                  <span className="muted small">@{subject.login}</span>
                  <Button size="sm" variant="ghost" onClick={() => setSubject(null)}>{t('chatChange')}</Button>
                </div>
              ) : (
                <UserPicker label={t('chatFindPeople')} selected={[]} includeDisabled onToggle={setSubject} />
              )}
            </Field>
            {action.error ? <Alert tone="danger">{action.error}</Alert> : null}
            <Button variant="primary" icon={<IconShield size={16} />} disabled={!subject || reason.trim().length < REASON_MIN || action.busy} onClick={() => void search()}>
              {action.busy ? t('loading') : t('investigationSearch')}
            </Button>
          </section>

          {result ? (
            result.conversations.length === 0 ? (
              <EmptyState icon={<IconShield size={28} />} title={t('investigationNone', { name: result.subject.displayName })} />
            ) : (
              <section className="card">
                <div className="card-head"><h2>{t('investigationConversations', { name: result.subject.displayName })}</h2></div>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th scope="col">{t('chatConversation')}</th>
                      <th scope="col">{t('investigationKind')}</th>
                      <th scope="col">{t('investigationMessages')}</th>
                      <th scope="col">{t('investigationLast')}</th>
                      <th scope="col">{t('investigationMembership')}</th>
                      <th scope="col"><span className="sr-only">{t('colActions')}</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.conversations.map((item) => {
                      const label = conversationLabel(item);
                      return (
                        <tr key={item.id}>
                          <td>{label}</td>
                          <td><Badge>{kindLabel[item.kind]}</Badge></td>
                          <td>{item.messageCount}</td>
                          <td className="nowrap">{formatDateTime(item.lastMessageAt, locale)}</td>
                          <td className="small">
                            {item.subjectMembership.leftAt
                              ? t('investigationLeft', { when: formatDateTime(item.subjectMembership.leftAt, locale) })
                              : t('investigationActive')}
                          </td>
                          <td>
                            <Button size="sm" onClick={() => setOpened({ id: item.id, title: label })}>{t('investigationOpen')}</Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </section>
            )
          ) : null}
        </>
      )}
    </div>
  );
}
