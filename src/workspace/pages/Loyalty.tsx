import { useState } from 'react';
import { FlatList, View } from 'react-native';

import { CustomerAccount } from '@/components/customer-account';
import { ThemedText } from '@/components/themed-text';
import { Badge, Empty, ErrorNote, Hint, Input, Row, Screen, Sheet, Skeleton } from '@/components/ui';
import { useT } from '@/i18n';
import { useInfinite } from '@/lib/query';
import { useShop } from '@/lib/shop';
import { LIST_PROPS } from '@/lib/list';
import type { PageProps } from '../registry';

type Acc = { partyId: string; name: string; phone?: string; points: number; credit: number | string; cardNumber?: string };

/** Fidelite : clients avec leurs points et leur avoir ; recherche par nom, telephone ou numero de carte (scan). */
export default function Loyalty({ item, tab }: PageProps) {
  const { t } = useT();
  const shop = useShop();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<Acc | null>(null);
  const list = useInfinite<Acc>('/api/shop/loyalty/accounts', { q: q.trim() });
  const cfg = (shop.ws.config ?? {}) as Record<string, any>;
  return (
    <Screen tabs={tab} fixed title={shop.tr(item.label)} subtitle={t('loy.subtitle')}>
      <Hint icon="gift">{t('loy.rates', { every: shop.money(cfg.loyaltyEarnEvery ?? 100), value: shop.money(cfg.loyaltyPointValue ?? 1), max: cfg.loyaltyMaxRedeemPercent ?? 50 })}</Hint>
      <View style={{ marginVertical: 8 }}><Input value={q} onChangeText={setQ} placeholder={t('loy.search')} autoCapitalize="none" /></View>
      {list.error ? <ErrorNote message={list.error} onRetry={list.reload} /> : null}
      {list.loading && list.items.length === 0 ? <Skeleton rows={5} height={60} /> : (
        <FlatList {...LIST_PROPS} data={list.items} keyExtractor={(a) => a.partyId} contentContainerStyle={{ gap: 8, paddingBottom: 100 }} onEndReached={list.loadMore} refreshing={list.refreshing} onRefresh={list.reload} showsVerticalScrollIndicator={false}
          ListEmptyComponent={<Empty icon="users" title={t('loy.empty')} />}
          renderItem={({ item: a }) => (
            <Row icon="gift" title={a.name} subtitle={[a.phone, a.cardNumber && `${t('loy.cardNumber')} ${a.cardNumber}`].filter(Boolean).join(' · ') || '—'}
              right={<View style={{ alignItems: 'flex-end', gap: 4 }}><Badge tone="primary">{t('loy.points', { n: a.points })}</Badge>{Number(a.credit) > 0 ? <ThemedText type="small" themeColor="textSecondary">{shop.money(a.credit)}</ThemedText> : null}</View>}
              onPress={() => setOpen(a)} />
          )} />
      )}
      {open ? <Sheet visible tall title={open.name} onClose={() => { setOpen(null); void list.reload(); }}><CustomerAccount partyId={open.partyId} /></Sheet> : null}
    </Screen>
  );
}
