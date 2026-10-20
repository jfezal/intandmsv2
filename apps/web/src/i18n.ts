export type Locale = 'en' | 'ms';

const messages = {
  en: {
    title: 'IntanDMS V2',
    signIn: 'Sign in',
    logout: 'Log out',
    repositories: 'Repositories',
    explorer: 'Explorer',
    search: 'Search',
    workflowTasks: 'My workflow tasks',
  },
  ms: {
    title: 'IntanDMS V2',
    signIn: 'Log masuk',
    logout: 'Log keluar',
    repositories: 'Repositori',
    explorer: 'Explorer',
    search: 'Carian',
    workflowTasks: 'Tugasan aliran kerja saya',
  },
} as const;

export function t(locale: Locale, key: keyof (typeof messages)['en']): string {
  return messages[locale][key];
}
