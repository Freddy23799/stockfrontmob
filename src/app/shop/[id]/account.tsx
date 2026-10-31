import { View } from 'react-native';

import AccountSecurity from '@/components/account-security';
import { HelpRows } from '@/components/help-rows';
import { NotificationPreferences, NotificationsRow } from '@/components/notif';
import { ThemedText } from '@/components/themed-text';
import { Btn, Card, Chips, Hint, Screen } from '@/components/ui';
import { useT } from '@/i18n';
import { LANGUAGES } from '@/i18n/dictionaries';
import { useAuth } from '@/lib/auth';
import { useShop } from '@/lib/shop';
import { useThemePref, type ThemePref } from '@/lib/theme';

/** Mon compte (employe) : identite, mot de passe, appareils connectes, notifications, langue et theme. */
export default function EmployeeAccount() {
  const { t, lang, setLang } = useT();
  const shop = useShop();
  const { profile, logout } = useAuth();
  const { pref, setPref } = useThemePref();
  const forced = profile?.must_change_password === true;
  const themes: ThemePref[] = ['system', 'light', 'dark'];
  return (
    <Screen title={t('account.title')} back={!forced} keyboard>
      {forced ? <Hint icon="triangle-exclamation" tone="warning">{t('account.forced')}</Hint> : null}
      {!forced ? <NotificationsRow shopId={shop.shopId} /> : null}
      {!forced ? <HelpRows shopId={shop.shopId} /> : null}
      <AccountSecurity />
      {!forced ? (
        <Card style={{ gap: 12 }}>
          <ThemedText type="smallBold">{t('notif.prefs.title')}</ThemedText>
          <NotificationPreferences />
        </Card>
      ) : null}
      <Card style={{ gap: 12 }}>
        <ThemedText type="smallBold">{t('settings.preferences')}</ThemedText>
        <View style={{ gap: 6 }}><ThemedText type="small">{t('settings.pref.language')}</ThemedText><Chips scroll={false} value={lang} onChange={(l) => setLang(l as 'fr' | 'en' | 'es')} options={LANGUAGES.map((l) => ({ value: l.code, label: l.label }))} /></View>
        <View style={{ gap: 6 }}><ThemedText type="small">{t('settings.pref.theme')}</ThemedText><Chips scroll={false} value={pref} onChange={(v) => setPref(v as ThemePref)} options={themes.map((p) => ({ value: p, label: t(`theme.${p}`) }))} /></View>
      </Card>
      <Btn variant="secondary" icon="right-from-bracket" title={t('common.logout')} onPress={() => void logout()} />
    </Screen>
  );
}
