import { useMemo, useState } from 'react';
import { FlatList, Share, View } from 'react-native';

import { Icon } from '@/components/icon';
import { PdfButton } from '@/components/pdf-button';
import { ThemedText } from '@/components/themed-text';
import { Badge, Btn, Card, Chips, Empty, ErrorNote, Hint, Input, Screen, Skeleton } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { useT } from '@/i18n';
import { formatDateTime, num } from '@/lib/format';
import { qs, useInfinite } from '@/lib/query';
import { useShop } from '@/lib/shop';
import { LIST_PROPS } from '@/lib/list';
import type { PageProps } from '../registry';

const iso = (d: Date) => d.toISOString().slice(0, 10);
type Entry = { movementId: string; at: string; productName: string; lotNumber?: string; quantity: number; balance: number; documentNumber?: string; patient?: string; prescriber?: string; prescriptionNumber?: string; buyerName?: string; buyerId?: string; actor?: string };

/** Registre legal des produits controles : chaque entree / sortie avec l'ordonnance, l'acheteur et le solde. */
export default function Register({ item, tab }: PageProps) {
  const { t, lang } = useT();
  const shop = useShop();
  const th = useTheme();
  const [period, setPeriod] = useState('month');
  const [q, setQ] = useState('');
  const range = useMemo(() => {
    const now = new Date();
    const from = period === 'month' ? new Date(now.getFullYear(), now.getMonth(), 1) : period === 'year' ? new Date(now.getFullYear(), 0, 1) : new Date(now.getTime() - (Number(period) - 1) * 86400000);
    return { from: iso(from), to: iso(now) };
  }, [period]);
  const list = useInfinite<Entry>('/api/shop/registers/controlled', { ...range, q: q.trim() });

  async function exportCsv() {
    const rows: Entry[] = [];
    for (let page = 0; page < 50; page += 1) {
      const res = await shop.call<{ items: Entry[]; total: number }>(`/api/shop/registers/controlled${qs({ ...range, q: q.trim(), size: 100, page })}`);
      rows.push(...res.items);
      if ((page + 1) * 100 >= res.total) break;
    }
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const head = [t('reg.date'), t('reg.product'), t('reg.lot'), t('reg.in'), t('reg.out'), t('reg.balance'), t('reg.doc'), t('reg.patient'), t('reg.prescriber'), t('reg.prescription'), t('reg.buyer'), t('reg.buyerId'), t('reg.by')];
    const body = rows.map((r) => [r.at, r.productName, r.lotNumber, num(r.quantity) > 0 ? r.quantity : '', num(r.quantity) < 0 ? -r.quantity : '', r.balance, r.documentNumber, r.patient, r.prescriber, r.prescriptionNumber, r.buyerName, r.buyerId, r.actor].map(esc).join(','));
    await Share.share({ message: `${head.map(esc).join(',')}\n${body.join('\n')}`, title: `registre-${range.from}-${range.to}.csv` });
  }

  return (
    <Screen tabs={tab} fixed title={shop.tr(item.label)} subtitle={t('mob.countOf', { count: list.total })} right={list.total > 0 ? <View style={{ flexDirection: 'row', gap: 8 }}><PdfButton small path="/api/shop/pdf/controlled-register" params={{ ...range, q: q.trim() }} name={`registre-${range.from}-${range.to}.pdf`} /><Btn small icon="share-nodes" variant="secondary" title="CSV" onPress={exportCsv} /></View> : undefined}>
      <Hint icon="book-medical">{t('reg.subtitle')}</Hint>
      <View style={{ justifyContent: 'center', marginVertical: 8 }}>
        <Icon name="magnifying-glass" size={15} color={th.textSecondary} style={{ position: 'absolute', left: 15, zIndex: 1 }} />
        <Input value={q} onChangeText={setQ} placeholder={t('reg.search')} style={{ paddingLeft: 40 }} autoCapitalize="none" />
      </View>
      <View style={{ marginBottom: 8 }}><Chips value={period} onChange={setPeriod} options={[{ value: '7', label: t('dash.days', { count: 7 }) }, { value: 'month', label: t('mob.thisMonth') }, { value: '90', label: t('dash.days', { count: 90 }) }, { value: 'year', label: t('mob.thisYear') }]} /></View>
      {list.error ? <ErrorNote message={list.error} onRetry={list.reload} /> : null}
      {list.loading && list.items.length === 0 ? <Skeleton rows={4} height={90} /> : (
        <FlatList {...LIST_PROPS} data={list.items} keyExtractor={(r) => r.movementId} contentContainerStyle={{ gap: 8, paddingBottom: 100 }} onEndReached={list.loadMore} onEndReachedThreshold={0.6} refreshing={list.refreshing} onRefresh={list.reload} showsVerticalScrollIndicator={false}
          ListEmptyComponent={<Empty icon="book-medical" title={t('reg.empty')} text={t('reg.emptyText')} />}
          renderItem={({ item: r }) => {
            const out = num(r.quantity) < 0;
            return (
              <Card style={{ gap: 6 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <ThemedText type="smallBold" numberOfLines={2}>{r.productName}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 12 }}>{formatDateTime(r.at, lang)}{r.lotNumber ? ` · ${shop.v('lot')} ${r.lotNumber}` : ''}</ThemedText>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <ThemedText type="smallBold" style={{ fontSize: 17, color: out ? th.danger : th.success }}>{out ? '' : '+'}{num(r.quantity)}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 12 }}>{t('reg.balance')} {num(r.balance)}</ThemedText>
                  </View>
                </View>
                {r.documentNumber ? <View style={{ flexDirection: 'row' }}><Badge tone="info">{r.documentNumber}</Badge></View> : null}
                <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 12 }}>
                  {[r.patient && `${shop.v('customer')} : ${r.patient}`, r.prescriber && `${t('reg.prescriber')} : ${r.prescriber}`, r.prescriptionNumber && `${t('reg.prescription')} : ${r.prescriptionNumber}`, r.buyerName && `${t('reg.buyer')} : ${r.buyerName}${r.buyerId ? ` (${r.buyerId})` : ''}`, r.actor && `${t('reg.by')} ${r.actor}`].filter(Boolean).join(' · ')}
                </ThemedText>
              </Card>
            );
          }} />
      )}
    </Screen>
  );
}
