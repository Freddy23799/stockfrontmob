import { router } from 'expo-router';
import { Linking, View } from 'react-native';

import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Btn, Card, Screen } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { useT } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { useShop } from '@/lib/shop';
import pkg from '../../../package.json';

const COMPANY = { name: 'DSI SARL', address: 'Bafoussam, Marché B, Ouest Cameroun', email: 'contactdsisolution@gmail.com', site: 'dsi-devsolution.com' };

/** A propos de Vylaxo : version, editeur, contact, compte connecte. */
export default function About() {
  const { t, lang } = useT();
  const th = useTheme();
  const shop = useShop();
  const { profile } = useAuth();
  const role = profile?.accountType === 'EMPLOYEE' ? (shop.siteAdmin ? 'SITE_ADMIN' : 'EMPLOYEE') : 'MERCHANT';
  const line = (label: string, value?: string | null, onPress?: () => void) => value ? (
    <View style={{ gap: 2 }}>
      <ThemedText type="small" themeColor="textSecondary">{label}</ThemedText>
      <ThemedText type="smallBold" selectable onPress={onPress} style={onPress ? { color: th.primary } : undefined}>{value}</ThemedText>
    </View>
  ) : null;
  return (
    <Screen title={t('about.title')}>
      <Card style={{ alignItems: 'center', gap: 6, paddingVertical: 24 }}>
        <View style={{ width: 64, height: 64, borderRadius: 18, backgroundColor: th.primary, alignItems: 'center', justifyContent: 'center' }}><Icon name="store" size={28} color={th.primaryText} /></View>
        <ThemedText type="subtitle">Vylaxo</ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center' }}>{t('about.tagline')}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">{t('about.version')} {pkg.version}</ThemedText>
      </Card>
      <Card style={{ gap: 12 }}>
        <ThemedText type="smallBold">{t('about.publisher')}</ThemedText>
        {line(t('about.publisher'), COMPANY.name)}
        {line(t('about.address'), COMPANY.address)}
        {line(t('about.email'), COMPANY.email, () => void Linking.openURL(`mailto:${COMPANY.email}`))}
        {line(t('about.website'), COMPANY.site, () => void Linking.openURL(`https://${COMPANY.site}`))}
      </Card>
      <Card style={{ gap: 12 }}>
        <ThemedText type="smallBold">{t('about.account')}</ThemedText>
        {line(t('about.account'), `${profile?.full_name ?? ''} · ${t(`about.account.${role}`)}`)}
        {line(t('about.shop'), shop.ws.shop.settings.name)}
        {line(t('about.language'), { fr: 'Français', en: 'English', es: 'Español' }[lang])}
      </Card>
      <Card style={{ gap: 8 }}>
        <ThemedText type="smallBold">{t('about.help')}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">{t('about.helpText')}</ThemedText>
        <Btn icon="headset" title={t('about.contactSupport')} onPress={() => router.push(`/shop/${shop.shopId}/support` as never)} />
      </Card>
      <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center' }}>© {new Date().getFullYear()} {COMPANY.name} · {t('about.rights')} {t('about.thanks')}</ThemedText>
    </Screen>
  );
}
