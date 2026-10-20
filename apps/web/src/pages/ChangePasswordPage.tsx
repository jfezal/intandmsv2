import { type FormEvent, useState } from 'react';
import { IconLock } from '../components/icons';
import { Alert, Button } from '../components/ui';
import { api } from '../lib/api';
import { useI18n } from '../i18n';
import { errorText } from './admin/shared';

const PASSWORD_MIN = 12;

export function ChangePasswordPage({
  displayName,
  forced,
  onDone,
  onLogout,
}: {
  displayName: string;
  forced: boolean;
  onDone: () => void;
  onLogout: () => void;
}) {
  const { t } = useI18n();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (newPassword.length < PASSWORD_MIN) return setError(t('passwordRuleHint', { min: PASSWORD_MIN }));
    if (newPassword !== confirm) return setError(t('passwordMismatch'));
    if (newPassword === currentPassword) return setError(t('passwordSameAsOld'));
    setBusy(true);
    try {
      await api<void>('/api/v1/auth/change-password', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) });
      onDone();
    } catch (changeError) {
      setError(errorText(changeError, t));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="boot">
      <form className="card change-password" onSubmit={(event) => void submit(event)}>
        <div className="change-password-head">
          <span className="stat-icon tone-warning"><IconLock /></span>
          <div>
            <h1>{t('changePasswordHeading')}</h1>
            <p className="muted small">{forced ? t('changePasswordForced', { name: displayName }) : t('changePasswordHint')}</p>
          </div>
        </div>
        {error ? <Alert tone="danger">{error}</Alert> : null}
        <div className="field">
          <label htmlFor="cp-current">{t('currentPassword')}</label>
          <input id="cp-current" type="password" autoComplete="current-password" required value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="cp-new">{t('newPassword')}</label>
          <input id="cp-new" type="password" autoComplete="new-password" required minLength={PASSWORD_MIN} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} />
          <p className="hint">{t('passwordRuleHint', { min: PASSWORD_MIN })}</p>
        </div>
        <div className="field">
          <label htmlFor="cp-confirm">{t('confirmPassword')}</label>
          <input id="cp-confirm" type="password" autoComplete="new-password" required value={confirm} onChange={(event) => setConfirm(event.target.value)} />
        </div>
        <Button type="submit" variant="primary" className="btn-block" disabled={busy}>{busy ? t('saving') : t('changePasswordAction')}</Button>
        <Button variant="ghost" className="btn-block" onClick={onLogout}>{t('logout')}</Button>
      </form>
    </div>
  );
}
