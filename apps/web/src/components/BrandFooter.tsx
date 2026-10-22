import { useI18n, type MessageKey } from '../i18n';

const TERMS: Array<{ letter: string; word: MessageKey; meaning: MessageKey }> = [
  { letter: 'I', word: 'intanIntegrated', meaning: 'intanIntegratedMeaning' },
  { letter: 'N', word: 'intanNotation', meaning: 'intanNotationMeaning' },
  { letter: 'T', word: 'intanTracking', meaning: 'intanTrackingMeaning' },
  { letter: 'A', word: 'intanArchival', meaning: 'intanArchivalMeaning' },
  { letter: 'N', word: 'intanNetwork', meaning: 'intanNetworkMeaning' },
];

export function BrandFooter({ variant = 'bar' }: { variant?: 'bar' | 'hero' }) {
  const { t } = useI18n();
  return (
    <footer className={`brand-footer brand-footer-${variant}`}>
      <div className="brand-footer-lockup">
        <p className="brand-footer-name">{t('appName')}</p>
        <p className="brand-footer-expansion">
          {variant === 'hero' ? (
            <>
              {t('appExpansion')}
              <span className="brand-footer-kind">{t('appExpansionKind')}</span>
            </>
          ) : (
            t('appExpansionFull')
          )}
        </p>
      </div>
      <ul className="brand-footer-terms">
        {TERMS.map((term) => (
          <li key={term.word} title={`${t(term.word)} — ${t(term.meaning)}`}>
            <span className="brand-footer-letter" aria-hidden="true">
              {term.letter}
            </span>
            <span>
              <strong>{t(term.word)}</strong>
              <span>{t(term.meaning)}</span>
            </span>
          </li>
        ))}
      </ul>
    </footer>
  );
}
