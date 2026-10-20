import type { Locale } from '../i18n';

const intlLocale = (locale: Locale) => (locale === 'ms' ? 'ms-MY' : 'en-GB');

export function formatBytes(value: string | number | undefined | null, locale: Locale): string {
  const bytes = Number(value ?? 0);
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '—';
  }
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const scaled = bytes / 1024 ** exponent;
  const formatter = new Intl.NumberFormat(intlLocale(locale), {
    maximumFractionDigits: exponent === 0 ? 0 : 1,
  });
  return `${formatter.format(scaled)} ${units[exponent]}`;
}

export function formatDateTime(value: string | null | undefined, locale: Locale): string {
  if (!value) {
    return '—';
  }
  return new Intl.DateTimeFormat(intlLocale(locale), {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

/** Inbox-style timestamp: time for today, day + month this year, full date otherwise. */
export function formatInboxDate(value: string, locale: Locale, now: Date = new Date()): string {
  const date = new Date(value);
  const sameYear = date.getFullYear() === now.getFullYear();
  const sameDay = sameYear && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
  const options: Intl.DateTimeFormatOptions = sameDay
    ? { hour: 'numeric', minute: '2-digit' }
    : sameYear
      ? { day: 'numeric', month: 'short' }
      : { day: 'numeric', month: 'short', year: 'numeric' };
  return new Intl.DateTimeFormat(intlLocale(locale), options).format(date);
}

export type FileKind = 'pdf' | 'image' | 'text' | 'word' | 'sheet' | 'slide' | 'archive' | 'other';

export function fileKind(mimeType: string | undefined, name: string): FileKind {
  const mime = mimeType ?? '';
  const lower = name.toLowerCase();
  if (mime === 'application/pdf' || lower.endsWith('.pdf')) return 'pdf';
  if (mime.startsWith('image/') || /\.(png|jpe?g|gif|webp|tiff?|bmp)$/.test(lower)) return 'image';
  if (mime.startsWith('text/') || /\.(txt|md|csv|log)$/.test(lower)) return 'text';
  if (mime.includes('wordprocessing') || mime === 'application/msword' || /\.docx?$/.test(lower)) return 'word';
  if (mime.includes('spreadsheet') || mime === 'application/vnd.ms-excel' || /\.xlsx?$/.test(lower)) return 'sheet';
  if (mime.includes('presentation') || mime === 'application/vnd.ms-powerpoint' || /\.pptx?$/.test(lower)) return 'slide';
  if (mime.includes('zip') || /\.(zip|7z|rar|tar|gz)$/.test(lower)) return 'archive';
  return 'other';
}
