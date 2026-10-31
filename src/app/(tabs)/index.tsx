import { Redirect, router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { Button } from '@/components/form';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';
import { useT } from '@/i18n';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';

type Billing = { state: 'TRIAL' | 'ACTIVE' | 'PAST_DUE' | 'EXPIRED' | 'SUSPENDED'; severity: string; daysLeft: number | null };
type Shop = { id: string; organizationId?: string; name: string; city?: string; country?: string; billing?: Billing };
type Org = { id: string; name: string; siteCount: number };

// Couleur du badge d'abonnement : de plus en plus pressante a l'approche de la fin de l'essai
const BADGE = {
  light: {
    NONE: { bg: '#E0F2FE', fg: '#075985' }, INFO: { bg: '#E0F2FE', fg: '#075985' }, NOTICE: { bg: '#FEF9C3', fg: '#854D0E' },
    WARNING: { bg: '#FFEDD5', fg: '#9A3412' }, CRITICAL: { bg: '#FEE2E2', fg: '#991B1B' }, EXPIRED: { bg: '#1F2937', fg: '#FFFFFF' },
  },
  dark: {
    NONE: { bg: '#12385B', fg: '#B9E3FF' }, INFO: { bg: '#12385B', fg: '#B9E3FF' }, NOTICE: { bg: '#423715', fg: '#FDE68A' },
    WARNING: { bg: '#4A2B11', fg: '#FED7AA' }, CRITICAL: { bg: '#551D28', fg: '#FECDD3' }, EXPIRED: { bg: '#1E293B', fg: '#F8FAFC' },
  },
} as const;

export default function ShopsScreen() {
  const { t } = useT();
  const theme = useTheme();
  const palette = BADGE[useColorScheme()];
  const { profile, offline } = useAuth();
  const [shops, setShops] = useState<Shop[] | null>(null);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (offline || profile?.accountType === 'EMPLOYEE') return;   // un employe n'a pas de liste de boutiques
    try {
      const [list, chains] = await Promise.all([api<Shop[]>('/api/merchant/shops'), api<Org[]>('/api/merchant/organizations').catch(() => [] as Org[])]);
      setShops(list);
      setOrgs(chains);
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('home.loadError'));
    }
  }, [offline, profile?.accountType, t]);

  // recharge a chaque retour sur l'ecran (ex. apres la creation d'une boutique)
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  // sites regroupes par enseigne ; l'en-tete n'apparait que s'il y a plusieurs sites ou plusieurs enseignes
  const groups = (() => {
    const known = new Map(orgs.map((o) => [o.id, o]));
    const by = new Map<string, Shop[]>();
    (shops ?? []).forEach((shop) => { const k = shop.organizationId && known.has(shop.organizationId) ? shop.organizationId : ''; by.set(k, [...(by.get(k) ?? []), shop]); });
    return [...by.entries()].map(([k, list]) => ({ org: k ? known.get(k) ?? null : null, shops: list }));
  })();
  const showHeaders = orgs.length > 1 || (shops?.length ?? 0) > 1;

  const firstName = (profile?.full_name ?? '').split(' ')[0];
  // un employe n'a qu'une boutique : on l'y emmene directement
  if (profile?.accountType === 'EMPLOYEE' && typeof profile.shop_id === 'string') return <Redirect href={`/shop/${profile.shop_id}`} />;

  const renderShop = (shop: Shop) => {
    const badge = palette[(shop.billing?.severity ?? 'INFO') as keyof typeof palette] ?? palette.INFO;
    const label = shop.billing?.state === 'TRIAL' ? t('home.trial', { count: shop.billing.daysLeft ?? 0 }) : shop.billing ? t(`state.${shop.billing.state}` as 'state.ACTIVE') : '';
    return (
      <Pressable key={shop.id} onPress={() => router.push(`/shop/${shop.id}`)} accessibilityRole="button" accessibilityLabel={shop.name}>
      <ThemedView type="backgroundElement" style={styles.shopCard}>
        <View style={styles.shopHead}>
          <ThemedText type="smallBold" style={styles.shopName}>{shop.name}</ThemedText>
          <Icon name="chevron-right" size={14} color={theme.textSecondary} />
        </View>
        <ThemedText type="small" themeColor="textSecondary">{[shop.city, shop.country].filter(Boolean).join(' · ')}</ThemedText>
        {label ? (
          <View style={[styles.badge, { backgroundColor: badge.bg }]}>
            <ThemedText type="smallBold" style={{ color: badge.fg }}>{label}</ThemedText>
          </View>
        ) : null}
      </ThemedView>
      </Pressable>
    );
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}>
          <ThemedText type="subtitle">{t('home.hello', { name: firstName })}</ThemedText>
          <ThemedText themeColor="textSecondary">{offline ? t('home.offline') : t('home.subtitle')}</ThemedText>

          {!offline && !shops && !error ? <ActivityIndicator color={theme.primary} style={styles.loader} /> : null}
          {error ? <ThemedText themeColor="danger">{error}</ThemedText> : null}

          {!offline && shops?.length === 0 ? (
            <ThemedView type="backgroundElement" style={styles.empty}>
              <View style={[styles.emptyIcon, { backgroundColor: theme.backgroundSelected }]}>
                <Icon name="store" size={34} color={theme.primary} />
              </View>
              <ThemedText type="subtitle" style={styles.center}>{t('home.empty.title')}</ThemedText>
              <ThemedText themeColor="textSecondary" style={styles.center}>{t('home.empty.text')}</ThemedText>
              <Button title={t('home.empty.cta')} onPress={() => router.push('/onboarding')} />
            </ThemedView>
          ) : null}

          {shops && shops.length > 0 ? groups.map((group) => (
            <View key={group.org?.id ?? 'none'} style={styles.group}>
              {group.org && showHeaders ? (
                <View style={styles.groupHead}>
                  <View style={{ flex: 1 }}>
                    <ThemedText type="small" themeColor="textSecondary">{t('org.chain')}</ThemedText>
                    <ThemedText type="smallBold" style={styles.shopName} numberOfLines={1}>{group.org.name}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">{t('org.sitesCount', { count: group.shops.length })}</ThemedText>
                  </View>
                  {group.shops.length > 1 ? <Button title={t('org.manage')} onPress={() => router.push(`/organization/${group.org!.id}`)} /> : null}
                </View>
              ) : null}
              {group.shops.map((shop) => renderShop(shop))}
            </View>
          )) : null}

          {shops && shops.length > 0 && !offline ? <Button title={t('ops.titleAll')} onPress={() => router.push('/operations')} /> : null}
          {shops && shops.length > 0 ? <Button title={`+ ${t('home.new')}`} onPress={() => router.push('/onboarding')} /> : null}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center' },
  safeArea: { flex: 1, width: '100%', maxWidth: MaxContentWidth },
  content: { padding: Spacing.four, gap: Spacing.three, flexGrow: 1 },
  loader: { marginTop: Spacing.four },
  center: { textAlign: 'center' },
  empty: { alignItems: 'stretch', gap: Spacing.three, padding: Spacing.four, borderRadius: 24, marginTop: Spacing.three },
  emptyIcon: { alignSelf: 'center', width: 76, height: 76, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  group: { gap: Spacing.three },
  groupHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, marginTop: Spacing.two },
  shopCard: { gap: 6, padding: Spacing.three, borderRadius: 18 },
  shopHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  shopName: { fontSize: 17, flex: 1 },
  badge: { alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 999, marginTop: 4 },
});
