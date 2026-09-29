import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { formatDistanceToNow } from 'date-fns';
import { enUS, zhCN } from 'date-fns/locale';
import zh from './locales/zh-CN.json';
import en from './locales/en.json';

export const LANG_KEY = 'bohemian-agent-control:lang';

const pendingBundles: Array<{ language: string; resources: Record<string, unknown> }> = [];

function addBundle(language: string, resources: Record<string, unknown>): void {
  i18n.addResourceBundle(language, 'translation', resources, true, true);
}

export function addAppTranslations(language: string, resources: Record<string, unknown>): void {
  if (i18n.isInitialized) {
    addBundle(language, resources);
    return;
  }
  pendingBundles.push({ language, resources });
}

export const i18nReady = i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      'zh-CN': { translation: zh },
      en: { translation: en },
    },
    fallbackLng: 'zh-CN',
    supportedLngs: ['zh-CN', 'en'],
    interpolation: { escapeValue: false },
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: LANG_KEY,
      caches: ['localStorage'],
    },
  });

void i18nReady.then(() => {
  for (const bundle of pendingBundles.splice(0)) addBundle(bundle.language, bundle.resources);
});

export function dateLocale() {
  return i18n.language.startsWith('zh') ? zhCN : enUS;
}

export function formatRelativeTime(value: Date | string | number | null | undefined): string {
  if (value == null || value === '') return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return formatDistanceToNow(date, { addSuffix: true, locale: dateLocale() });
}

export function setAppLanguage(lng: 'zh-CN' | 'en') {
  void i18n.changeLanguage(lng);
  document.documentElement.lang = lng === 'en' ? 'en' : 'zh-CN';
}

if (typeof document !== 'undefined') {
  document.documentElement.lang = i18n.language.startsWith('zh') ? 'zh-CN' : 'en';
}

export default i18n;
