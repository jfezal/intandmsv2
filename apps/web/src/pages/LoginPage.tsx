import { type FormEvent, useState } from 'react';
import { BrandFooter } from '../components/BrandFooter';
import { Alert, Button } from '../components/ui';
import { IconEye, IconEyeOff, IconLock } from '../components/icons';
import { type Locale, useI18n } from '../i18n';

export function LoginPage({
  onLogin,
  locale,
  onLocaleChange,
  notice,
}: {
  onLogin: (login: string, password: string) => Promise<void>;
  locale: Locale;
  onLocaleChange: (locale: Locale) => void;
  notice?: string | null;
}) {
  const { t } = useI18n();
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [reveal, setReveal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onLogin(login.trim(), password);
      setPassword('');
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : t('errorGeneric'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-screen">
      <section className="login-aside">
        <div className="brand brand-lg">
          <span className="brand-mark">i</span>
          <span className="brand-name">{t('appName')}</span>
        </div>
        <BrandFooter variant="hero" />
      </section>

      <section className="login-panel">
        <div className="login-top">
          <div className="segmented" role="group" aria-label={t('language')}>
            {(['ms', 'en'] as const).map((option) => (
              <button
                key={option}
                type="button"
                className={locale === option ? 'active' : ''}
                aria-pressed={locale === option}
                onClick={() => onLocaleChange(option)}
              >
                {option === 'ms' ? 'BM' : 'EN'}
              </button>
            ))}
          </div>
        </div>

        <form className="login-form" onSubmit={(event) => void onSubmit(event)} noValidate>
          <span className="login-lock" aria-hidden="true">
            <IconLock size={22} />
          </span>
          <h1>{t('signInHeading')}</h1>
          <p className="muted">{t('signInHint')}</p>

          {notice ? <Alert tone="warning">{notice}</Alert> : null}
          {error ? <Alert tone="danger">{error}</Alert> : null}

          <div className="field">
            <label htmlFor="login">{t('login')}</label>
            <input
              id="login"
              value={login}
              onChange={(event) => setLogin(event.target.value)}
              autoComplete="username"
              autoFocus
              required
            />
          </div>
          <div className="field">
            <label htmlFor="password">{t('password')}</label>
            <div className="input-affix">
              <input
                id="password"
                type={reveal ? 'text' : 'password'}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                className="affix-btn"
                aria-label={reveal ? t('hidePassword') : t('showPassword')}
                aria-pressed={reveal}
                onClick={() => setReveal((value) => !value)}
              >
                {reveal ? <IconEyeOff size={16} /> : <IconEye size={16} />}
              </button>
            </div>
          </div>

          <Button type="submit" variant="primary" className="btn-block" disabled={busy || !login || !password}>
            {busy ? t('signingIn') : t('signIn')}
          </Button>
        </form>
        <BrandFooter />
      </section>
    </div>
  );
}
