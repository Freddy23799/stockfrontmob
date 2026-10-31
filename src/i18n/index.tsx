import { getLocales } from 'expo-localization';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { setAppLanguage } from '@/lib/locale';
import { storage } from '@/lib/storage';

import { DICTIONARIES, type Lang } from './dictionaries';
import { MOBILE } from './mobile';
import base from './shared/base';
import dash from './shared/dash';
import downloads from './shared/downloads';
import list from './shared/list';
import activity from './shared/activity';
import notif from './shared/notif';
import acct from './shared/acct';
import recovery from './shared/recovery';
import support from './shared/support';
import hr from './shared/hr';
import pricing from './shared/pricing';
import payments from './shared/payments';
import customer from './shared/customer';
import ops from './shared/ops';
import team from './shared/team';
import workspace from './shared/workspace';
import laundry from './shared/laundry';
import beverage from './shared/beverage';
import beverageOps from './shared/beverageOps';
import beverageIns from './shared/beverageIns';
import restaurant from './shared/restaurant';
import salon from './shared/salon';
import tailor from './shared/tailor';
import electronics from './shared/electronics';
import quotes from './shared/quotes';
import transfers from './shared/transfers';
import ins from './shared/ins';
import reminders from './shared/reminders';

// textes propres au mobile, puis textes partages avec le site
const MERGED: Record<Lang, Record<string, string>> = {
  fr: { ...base.fr, ...workspace.fr, ...team.fr, ...hr.fr, ...dash.fr, ...pricing.fr, ...payments.fr, ...customer.fr, ...ops.fr, ...downloads.fr, ...list.fr, ...activity.fr, ...notif.fr, ...acct.fr, ...recovery.fr, ...support.fr, ...beverage.fr, ...beverageOps.fr, ...beverageIns.fr, ...laundry.fr, ...restaurant.fr, ...salon.fr, ...tailor.fr, ...electronics.fr, ...quotes.fr, ...transfers.fr, ...ins.fr, ...reminders.fr, ...MOBILE.fr, ...DICTIONARIES.fr },
  en: { ...base.en, ...workspace.en, ...team.en, ...hr.en, ...dash.en, ...pricing.en, ...payments.en, ...customer.en, ...ops.en, ...downloads.en, ...list.en, ...activity.en, ...notif.en, ...acct.en, ...recovery.en, ...support.en, ...beverage.en, ...beverageOps.en, ...beverageIns.en, ...laundry.en, ...restaurant.en, ...salon.en, ...tailor.en, ...electronics.en, ...quotes.en, ...transfers.en, ...ins.en, ...reminders.en, ...MOBILE.en, ...DICTIONARIES.en },
  es: { ...base.es, ...workspace.es, ...team.es, ...hr.es, ...dash.es, ...pricing.es, ...payments.es, ...customer.es, ...ops.es, ...downloads.es, ...list.es, ...activity.es, ...notif.es, ...acct.es, ...recovery.es, ...support.es, ...beverage.es, ...beverageOps.es, ...beverageIns.es, ...laundry.es, ...restaurant.es, ...salon.es, ...tailor.es, ...electronics.es, ...quotes.es, ...transfers.es, ...ins.es, ...reminders.es, ...MOBILE.es, ...DICTIONARIES.es },
};

const STORAGE_KEY = 'vylaxo.lang';

function deviceLanguage(): Lang {
  const code = getLocales()[0]?.languageCode;
  return code === 'en' || code === 'es' ? code : 'fr';
}

type I18nValue = {
  lang: Lang;
  setLang: (lang: Lang) => void;
  /** Les cles pluriel (ex. home.trial) existent en _one / _other ; on les appelle sans suffixe avec {count}. */
  t: (key: string, vars?: Record<string, string | number>) => string;
  formatMoney: (amount: number | string, currency?: string) => string;
};

const I18nContext = createContext<I18nValue | null>(null);

/** Langue de l'appareil par defaut ; le choix de l'utilisateur (ecran de bienvenue, compte) est memorise. */
export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(deviceLanguage);

  useEffect(() => {
    storage.getItem(STORAGE_KEY)
      .then((saved) => {
        if (saved === 'fr' || saved === 'en' || saved === 'es') setLangState(saved);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    setAppLanguage(lang);
  }, [lang]);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    storage.setItem(STORAGE_KEY, next).catch(() => undefined);
  }, []);

  const value = useMemo<I18nValue>(() => {
    const dict = MERGED[lang];
    return {
      lang,
      setLang,
      t: (key, vars = {}) => {
        let text: string | undefined;
        if (typeof vars.count === 'number') {
          const plural = new Intl.PluralRules(lang).select(vars.count) === 'one' ? 'one' : 'other';
          text = dict[`${key}_${plural}`] ?? MERGED.fr[`${key}_${plural}`];
        }
        text = text ?? dict[key] ?? MERGED.fr[key] ?? key;
        return text.replace(/\{(\w+)\}/g, (_, name: string) => String(vars[name] ?? `{${name}}`));
      },
      formatMoney: (amount, currency = 'XAF') =>
        new Intl.NumberFormat(lang, { style: 'currency', currency, maximumFractionDigits: 0 }).format(Number(amount)).replace(/[  ]/g, ' '),
    };
  }, [lang, setLang]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useT(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useT doit etre utilise dans <I18nProvider>');
  return ctx;
}
