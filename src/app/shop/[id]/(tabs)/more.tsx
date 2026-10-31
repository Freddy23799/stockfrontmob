import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { ConflictsRow } from '@/components/conflicts';
import { NotificationsRow, UnreadDot } from '@/components/notif';
import { Grid, Row, Screen, SectionTitle } from '@/components/ui';
import { ThemedText } from '@/components/themed-text';
import { useT } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { useGo } from '@/lib/nav';
import { useOffline } from '@/lib/offline';
import { useShop, type MenuItem } from '@/lib/shop';

/** Tout le reste, range comme sur le site : d'abord le metier (menu du pack), puis la gestion de la boutique. */
export default function More() {
  const { t } = useT();
  const shop = useShop();
  const go = useGo();
  const off = useOffline();
  const { profile } = useAuth();
  const isEmployee = profile?.accountType === 'EMPLOYEE';
  const inTabs = new Set(['dashboard', 'pos', 'products']);
  const visible = shop.ws.manifest.menu.filter((m) => !inTabs.has(m.page) && shop.has(m.feature) && shop.can(m.feature, 'view'));
  const sections = shop.ws.manifest.sections as Record<string, any> | undefined;
  const order: string[] = [];
  const by = new Map<string, MenuItem[]>();
  visible.forEach((m) => { const k = m.section ?? '_'; if (!by.has(k)) { by.set(k, []); order.push(k); } by.get(k)!.push(m); });

  const manage: { icon: string; title: string; text: string; path: string; show: boolean }[] = [
    { icon: 'id-card', title: t('nav.hr'), text: t('mob.hrText'), path: 'hr', show: shop.has('HR') && shop.can('HR', 'view') },
    { icon: 'scale-balanced', title: t('nav.accounting'), text: t('mob.accountingText'), path: 'accounting', show: shop.has('ACCOUNTING') && shop.can('ACCOUNTING', 'view') },
    { icon: 'users', title: t('nav.team'), text: t('mob.teamText'), path: 'team', show: shop.owner || (shop.siteAdmin && shop.delegated('CREATE_EMPLOYEES')) },
    { icon: 'paper-plane', title: t('req.title'), text: t('req.menuText'), path: 'requests', show: shop.siteAdmin && shop.delegated('REQUEST_FEATURES') },
    { icon: 'list-check', title: t('ops.nav'), text: t('ops.subtitle'), path: 'operations', show: shop.owner },
    { icon: 'download', title: t('dl.nav'), text: t('dl.menuText'), path: 'downloads', show: true },
    { icon: 'clipboard-list', title: t('nav.activity'), text: t('mob.activityText'), path: 'activity', show: shop.owner && shop.has('ACTIVITY_LOG') },
    { icon: 'sliders', title: t('nav.features'), text: t('mob.featuresText'), path: 'features', show: shop.owner },
    { icon: 'gear', title: t('nav.settings'), text: t('mob.settingsText'), path: 'settings', show: shop.owner },
  ];

  return (
    <Screen tabs back={false} title={t('mob.tab.more')} subtitle={shop.ws.shop.settings.name}>
      {off.pending + off.failed > 0 ? (
        <Row icon="cloud-arrow-up" tone={off.failed ? 'danger' : 'warning'} title={t('mob.syncTitle')} subtitle={off.failed ? t('sync.failed', { count: off.failed }) : t('sync.offlinePending', { count: off.pending })} onPress={() => router.push('/sync')} />
      ) : null}

      <ConflictsRow />

      {order.map((k) => (
        <View key={k} style={{ gap: 8 }}>
          <SectionTitle title={k === '_' ? t('mob.tab.more') : shop.tr(sections?.[k]) || k} />
          <Grid min={300} gap={8}>
            {by.get(k)!.map((m) => <Row key={m.key} icon={m.icon ?? 'circle'} title={shop.tr(m.label)} onPress={() => go.item(m.key)} />)}
          </Grid>
        </View>
      ))}

      {manage.some((m) => m.show) ? (
        <View style={{ gap: 8 }}>
          <SectionTitle title={t('mob.management')} hint={t('mob.managementHint')} />
          <Grid min={300} gap={8}>
            {manage.filter((m) => m.show).map((m) => <Row key={m.path} icon={m.icon} tone="info" title={m.title} subtitle={m.text} right={m.path === 'settings' ? <UnreadDot /> : undefined} onPress={() => go.to(m.path)} />)}
          </Grid>
        </View>
      ) : null}

      <View style={{ gap: 8 }}>
        <SectionTitle title={t('mob.myAccount')} />
        <Grid min={300} gap={8}>
          {[
            <NotificationsRow key="n" shopId={shop.shopId} />,
            <Row key="a" icon="user" tone="neutral" title={profile?.full_name ?? t('account.title')} subtitle={isEmployee ? t('mob.employeeOf', { shop: shop.ws.shop.settings.name }) : t('account.title')} right={isEmployee ? <UnreadDot /> : undefined} onPress={() => router.push(isEmployee ? `/shop/${shop.shopId}/account` : '/(tabs)/account')} />,
            !isEmployee ? <Row key="s" icon="store" tone="neutral" title={t('mob.switchShop')} subtitle={t('mob.switchShopText')} onPress={() => router.replace('/(tabs)')} /> : null,
          ]}
        </Grid>
      </View>
      <ThemedText type="small" themeColor="textSecondary" style={s.foot}>Vylaxo · DSI SARL</ThemedText>
    </Screen>
  );
}

const s = StyleSheet.create({ foot: { textAlign: 'center', marginTop: 8 } });
