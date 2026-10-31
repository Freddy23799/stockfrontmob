import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import AccountSecurity from '@/components/account-security';
import { Icon } from '@/components/icon';
import { NotificationPreferences } from '@/components/notif';
import { Button } from '@/components/form';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { LANGUAGES } from '@/i18n/dictionaries';
import { useT } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { useThemePref, type ThemePref } from '@/lib/theme';

const COMPANY = {
  name: 'DSI SARL',
  site: 'dsi-devsolution.com',
  email: 'contactdsisolution@gmail.com',
  phones: [
    { label: '+237 671 25 72 27', value: '+237671257227' },
    { label: '+237 657 84 74 84', value: '+237657847484' },
  ],
};

export default function AccountScreen() {
  const { t, lang, setLang } = useT();
  const theme = useTheme();
  const { profile, logout } = useAuth();
  const { pref, setPref } = useThemePref();
  const themes: ThemePref[] = ['system', 'light', 'dark'];

  const contact = (icon: 'envelope' | 'phone' | 'globe', label: string, url: string) => (
    <Pressable key={url} onPress={() => void Linking.openURL(url)} accessibilityRole="link" style={styles.contactRow}>
      <Icon name={icon} size={16} color={theme.primary} />
      <ThemedText type="small">{label}</ThemedText>
    </Pressable>
  );

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView contentContainerStyle={styles.content}>
          <ThemedText type="subtitle">{t('account.title')}</ThemedText>
          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText type="smallBold">{profile?.full_name}</ThemedText>
            {typeof profile?.email === 'string' ? <ThemedText type="small" themeColor="textSecondary">{profile.email}</ThemedText> : null}
            {typeof profile?.phone === 'string' ? <ThemedText type="small" themeColor="textSecondary">{profile.phone}</ThemedText> : null}
          </ThemedView>

          <AccountSecurity />

          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText type="smallBold">{t('notif.prefs.title')}</ThemedText>
            <NotificationPreferences />
          </ThemedView>

          <ThemedText type="smallBold">{t('account.language')}</ThemedText>
          <View style={styles.langs}>
            {LANGUAGES.map((l) => (
              <Pressable key={l.code} onPress={() => setLang(l.code)} accessibilityRole="radio" accessibilityState={{ selected: lang === l.code }}
                style={[styles.lang, { backgroundColor: lang === l.code ? theme.primary : theme.backgroundElement }]}>
                <ThemedText type="smallBold" style={{ color: lang === l.code ? theme.primaryText : theme.text }}>{l.label}</ThemedText>
              </Pressable>
            ))}
          </View>

          <ThemedText type="smallBold">{t('account.theme')}</ThemedText>
          <View style={styles.langs} accessibilityRole="radiogroup">
            {themes.map((value) => (
              <Pressable key={value} onPress={() => setPref(value)} accessibilityRole="radio" accessibilityState={{ selected: pref === value }}
                style={[styles.lang, { backgroundColor: pref === value ? theme.primary : theme.backgroundElement }]}>
                <ThemedText type="smallBold" style={{ color: pref === value ? theme.primaryText : theme.text }}>{t(`theme.${value}` as 'theme.system')}</ThemedText>
              </Pressable>
            ))}
          </View>

          <Button title={t('common.logout')} variant="secondary" onPress={logout} />

          <View style={styles.footer}>
            <ThemedText type="smallBold">{t('account.contact')}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">{t('account.address')}</ThemedText>
            {contact('envelope', COMPANY.email, `mailto:${COMPANY.email}`)}
            {COMPANY.phones.map((p) => contact('phone', p.label, `tel:${p.value}`))}
            {contact('globe', COMPANY.site, `https://${COMPANY.site}`)}
            <ThemedText type="small" themeColor="textSecondary" style={styles.credit}>
              © {new Date().getFullYear()} Vylaxo · {t('account.developedBy')} {COMPANY.name}
            </ThemedText>
          </View>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center' },
  safeArea: { flex: 1, width: '100%', maxWidth: MaxContentWidth },
  content: { padding: Spacing.four, gap: Spacing.three },
  card: { gap: 4, padding: Spacing.three, borderRadius: 18 },
  langs: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  lang: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999 },
  footer: { gap: 8, marginTop: Spacing.four },
  contactRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
  credit: { marginTop: Spacing.two },
});
