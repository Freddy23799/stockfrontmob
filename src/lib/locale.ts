import { getLocales } from 'expo-localization';

export type SupportedLanguage = 'fr' | 'en' | 'es';

let chosen: SupportedLanguage | null = null;

/** Memorise la langue choisie dans l'application (appelee par I18nProvider). */
export function setAppLanguage(language: SupportedLanguage) {
  chosen = language;
}

/** Langue que le serveur utilise pour le questionnaire et les messages : choix de l'utilisateur, sinon langue de l'appareil. */
export function appLanguage(): SupportedLanguage {
  if (chosen) return chosen;
  const language = getLocales()[0]?.languageCode;
  return language === 'en' || language === 'es' ? language : 'fr';
}
