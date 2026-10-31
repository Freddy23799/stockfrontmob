import { useState } from 'react';
import { FlatList, View } from 'react-native';

import { ListFooter } from '@/components/list-footer';
import { errText, OrderCard, OrderSheet } from '@/components/laundry-order';
import { ThemedText } from '@/components/themed-text';
import { Btn, Chips, Empty, ErrorNote, Fab, Input, Screen, Skeleton, useToast } from '@/components/ui';
import { useT } from '@/i18n';
import { API, NEXT, num, type Order } from '@/lib/laundry';
import { LIST_PROPS } from '@/lib/list';
import { useGo } from '@/lib/nav';
import { useInfinite, useQuery } from '@/lib/query';
import { useShop } from '@/lib/shop';
import type { PageProps } from '../registry';

type Summary = { byStatus?: Record<string, number>; overdue?: number; dueToday?: number; readyUnpaid?: number; unclaimed?: number; openClaims?: number; todayIn?: number; todayOut?: number; todayRevenue?: number };
const TABS = ['RECEIVED', 'IN_PROGRESS', 'READY', 'DELIVERED', 'DISPUTE', 'overdue', 'unpaid', 'CANCELLED'] as const;

/** Tickets par etape (arrivee, atelier, pret, retire...) : un onglet par statut avec son compteur ; avancer d'un geste ; scan d'etiquette. */
export default function LaundryOrders({ item, tab }: PageProps) {
  const { t } = useT();
  const shop = useShop();
  const toast = useToast();
  const go = useGo();
  const [status, setStatus] = useState<(typeof TABS)[number]>('RECEIVED');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [scan, setScan] = useState('');
  const [scanTo, setScanTo] = useState<'IN_PROGRESS' | 'READY'>('IN_PROGRESS');
  const [scanMsg, setScanMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const summary = useQuery<Summary>(`${API}/orders/summary`);
  const list = useInfinite<Order>(`${API}/orders`, {
    q: q.trim(), status: ['overdue', 'unpaid'].includes(status) ? undefined : status, overdue: status === 'overdue' ? true : undefined, unpaid: status === 'unpaid' ? true : undefined,
  });
  const can = shop.can('LAUNDRY_ORDERS', 'update');
  const s = summary.data;
  const count = (k: string) => (k === 'overdue' ? s?.overdue : k === 'unpaid' ? s?.readyUnpaid : k === 'DISPUTE' ? s?.openClaims : s?.byStatus?.[k]);
  const reload = () => { void list.reload(); void summary.reload(); };

  async function advance(o: Order) {
    const next = NEXT[o.status];
    if (!next) return;
    try { await shop.call(`${API}/orders/${o.id}/status`, { method: 'POST', body: { status: next } }); toast(t('ld.statusDone', { status: t(`ld.s.${next}`) })); reload(); } catch (e) { toast(errText(e, t('common.error')), 'danger'); }
  }
  async function doScan() {
    const code = scan.trim();
    if (!code) return;
    try {
      const res = await shop.call<{ order?: Order; item?: { tagCode: string } }>(`${API}/items/scan-status`, { method: 'POST', body: { code, status: scanTo } });
      setScanMsg({ ok: true, text: t('ld.scanOk', { tag: res.item?.tagCode ?? code, status: t(`ld.s.${scanTo}`), number: res.order?.number ?? '' }) });
      setScan(''); reload();
    } catch (e) { setScanMsg({ ok: false, text: errText(e, t('common.error')) }); }
  }

  return (
    <Screen tabs={tab} fixed title={shop.tr(item.label)} subtitle={t('ld.ordersSubtitle')}>
      {s ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 6 }}>
          {([['todayIn', s.todayIn], ['todayOut', s.todayOut], ['dueToday', s.dueToday], ['overdue', s.overdue]] as [string, number | undefined][]).filter(([, v]) => v != null).map(([k, v]) => (
            <View key={k} style={{ minWidth: 76 }}><ThemedText type="small" themeColor="textSecondary">{t(`ld.k.${k}`)}</ThemedText><ThemedText type="smallBold" themeColor={k === 'overdue' && num(v) > 0 ? 'danger' : undefined} style={{ fontSize: 17 }}>{v}</ThemedText></View>
          ))}
          {s.todayRevenue != null ? <View><ThemedText type="small" themeColor="textSecondary">{t('ld.todayRevenue')}</ThemedText><ThemedText type="smallBold" style={{ fontSize: 17 }}>{shop.money(s.todayRevenue)}</ThemedText></View> : null}
        </View>
      ) : null}
      <Chips value={status} onChange={setStatus} options={TABS.map((k) => ({ value: k, label: `${k === 'overdue' || k === 'unpaid' ? t(`ld.f.${k}`) : t(`ld.s.${k}`)}${count(k) != null ? ` · ${count(k)}` : ''}` }))} />
      <View style={{ marginVertical: 8, gap: 8 }}>
        <Input value={q} onChangeText={setQ} placeholder={t('ld.searchOrders')} autoCapitalize="none" />
        {can ? (
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <View style={{ flex: 1 }}><Input value={scan} onChangeText={setScan} placeholder={t('ld.scanTag')} autoCapitalize="characters" autoCorrect={false} onSubmitEditing={() => void doScan()} returnKeyType="go" /></View>
            <Btn small variant={scanTo === 'READY' ? 'primary' : 'secondary'} title={t(`ld.s.${scanTo}`)} onPress={() => setScanTo(scanTo === 'READY' ? 'IN_PROGRESS' : 'READY')} />
            <Btn small title={t('ld.scanGo')} disabled={!scan.trim()} onPress={() => void doScan()} />
          </View>
        ) : null}
        {scanMsg ? <ThemedText type="small" themeColor={scanMsg.ok ? 'success' : 'danger'}>{scanMsg.text}</ThemedText> : null}
      </View>
      {list.error ? <ErrorNote message={list.error} onRetry={list.reload} /> : null}
      {list.loading && list.items.length === 0 ? <Skeleton rows={5} height={86} /> : (
        <FlatList {...LIST_PROPS} data={list.items} keyExtractor={(o) => o.id} contentContainerStyle={{ gap: 8, paddingBottom: 110 }} onEndReached={list.loadMore} refreshing={list.refreshing} onRefresh={reload} showsVerticalScrollIndicator={false}
          ListEmptyComponent={<Empty icon="shirt" title={t('ld.empty')} text={t('ld.emptyText')} />}
          ListFooterComponent={<ListFooter shown={list.items.length} total={list.total} hasMore={list.hasMore} loading={list.loadingMore} failed={false} onMore={list.loadMore} />}
          renderItem={({ item: o }) => (
            <OrderCard o={o} onPress={() => setOpen(o.id)}>
              {can && NEXT[o.status] ? <Btn small variant="secondary" icon="arrow-right" title={t(o.status === 'RECEIVED' ? 'ld.toProgress' : 'ld.toReady')} onPress={() => void advance(o)} /> : null}
            </OrderCard>
          )} />
      )}
      {shop.can('LAUNDRY_ORDERS', 'create') ? <Fab label={t('ld.newTicket')} onPress={() => go.page('laundry-counter')} /> : null}
      {open ? <OrderSheet id={open} onClose={() => setOpen(null)} onChanged={reload}
        onPickup={(o) => { setOpen(null); go.page('laundry-pickup', { code: o.number }); }} onClaim={(o) => { setOpen(null); go.page('laundry-claims', { orderId: o.id, orderNumber: o.number }); }} /> : null}
    </Screen>
  );
}
