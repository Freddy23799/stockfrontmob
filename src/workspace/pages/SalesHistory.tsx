import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/icon';
import { Receipt, type Doc } from '@/components/receipt';
import { ReturnFromSale } from '@/components/return-from-sale';
import { ThemedText } from '@/components/themed-text';
import { Badge, Btn, Card, Chips, Empty, ErrorNote, Hint, Input, NumberBox, Screen, Sheet, Skeleton, Switch, TextBox, useToast, type Tone } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { OfflineAdvice } from '@/components/offline-advice';
import { useT } from '@/i18n';
import { ApiError } from '@/lib/api';
import { formatDate, formatDateTime, uuid } from '@/lib/format';
import { useInfinite, useQuery } from '@/lib/query';
import { useOffline } from '@/lib/offline';
import { useShop } from '@/lib/shop';
import { LIST_PROPS } from '@/lib/list';
import type { PageProps } from '../registry';

const iso = (d: Date) => d.toISOString().slice(0, 10);
const payTone = (s: string): Tone => (s === 'PAID' ? 'success' : s === 'PARTIAL' ? 'warning' : 'danger');
type Row = { id: string; number: string; partyName?: string; issuedAt: string; lineCount: number; total: number; paymentStatus: string; cancelled?: boolean };

export default function SalesHistory({ item, tab }: PageProps) {
  const { t, lang } = useT();
  const shop = useShop();
  const th = useTheme();
  const [period, setPeriod] = useState('7');
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const offline = useOffline();
  const [pendingOpen, setPendingOpen] = useState<any>(null);
  const pendingSales = offline.items.filter((i) => i.kind === 'sale' && i.shopId === shop.shopId && i.preview);
  const range = useMemo(() => {
    const today = new Date();
    const from = period === 'month' ? new Date(today.getFullYear(), today.getMonth(), 1) : new Date(today.getTime() - (Number(period) - 1) * 86400000);
    return { from: iso(from), to: iso(today) };
  }, [period]);
  const list = useInfinite<Row>('/api/shop/documents', { type: 'SALE', attr: (item.params?.attr as string) ?? '', ...range, q: q.trim(), unpaid: filter === 'unpaid' ? true : undefined, status: filter === 'cancelled' ? 'CANCELLED' : undefined });
  const total = list.items.filter((d) => !d.cancelled).reduce((a, d) => a + Number(d.total), 0);

  return (
    <Screen tabs={tab} fixed title={item.params?.titleKey ? shop.v(item.params.titleKey as string) : shop.v('sales')} subtitle={t('mob.countOf', { count: list.total })}>
      <View style={{ justifyContent: 'center', marginBottom: 6 }}>
        <Icon name="magnifying-glass" size={15} color={th.textSecondary} style={{ position: 'absolute', left: 15, zIndex: 1 }} />
        <Input value={q} onChangeText={setQ} placeholder={t('ws.searchDoc')} style={{ paddingLeft: 40 }} autoCapitalize="none" />
      </View>
      <View style={{ gap: 6, marginBottom: 6 }}>
        <Chips value={period} onChange={setPeriod} options={[{ value: '1', label: t('mob.today') }, { value: '7', label: t('dash.days', { count: 7 }) }, { value: '30', label: t('dash.days', { count: 30 }) }, { value: 'month', label: t('mob.thisMonth') }]} />
        <Chips value={filter} onChange={setFilter} options={[{ value: '', label: t('ws.all') }, { value: 'unpaid', label: t('ws.unpaid') }, { value: 'cancelled', label: t('ws.cancelled') }]} />
      </View>
      {list.items.length > 0 ? <ThemedText type="small" themeColor="textSecondary" style={{ marginBottom: 6 }}>{t('ws.pageTotal')} : <ThemedText type="smallBold">{shop.money(total)}</ThemedText></ThemedText> : null}
      {list.stale ? <Hint icon="cloud" tone="warning">{t('mob.showingSaved')}</Hint> : null}
      {list.error ? <ErrorNote message={list.error} onRetry={list.reload} /> : null}
      {list.loading && list.items.length === 0 ? <Skeleton rows={6} height={64} /> : (
        <FlatList {...LIST_PROPS} data={list.items} keyExtractor={(d) => d.id}
          ListHeaderComponent={pendingSales.length > 0 && !item.params?.attr ? (
            <Card style={{ gap: 8, marginBottom: 8 }}>
              <ThemedText type="smallBold">{t('mob.pendingSales')} ({pendingSales.length})</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">{t('mob.pendingSalesText')}</ThemedText>
              {pendingSales.map((p) => (
                <Pressable key={p.id} onPress={() => setPendingOpen(p)} accessibilityRole="button" style={({ pressed }) => [s.row, { backgroundColor: th.background, opacity: pressed ? 0.75 : 1 }]}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <ThemedText type="smallBold">{t('mob.provisional')}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 12 }}>{p.preview.partyName ?? t('ws.walkIn')} · {formatDate(p.preview.issuedAt, lang, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</ThemedText>
                  </View>
                  <ThemedText type="smallBold">{shop.money(p.preview.total)}</ThemedText>
                  <Badge tone={p.state === 'failed' ? 'danger' : 'warning'}>{p.state === 'failed' ? t('mob.badgeFailed') : t('mob.badgePending')}</Badge>
                </Pressable>
              ))}
            </Card>
          ) : undefined} contentContainerStyle={{ gap: 8, paddingBottom: 100 }} onEndReached={list.loadMore} onEndReachedThreshold={0.6} refreshing={list.refreshing} onRefresh={list.reload} showsVerticalScrollIndicator={false}
          ListEmptyComponent={<Empty icon="receipt" title={t('ws.noSales')} text={t('ws.noSalesText')} />}
          renderItem={({ item: d }) => (
            <Pressable onPress={() => setOpen(d.id)} accessibilityRole="button" style={({ pressed }) => [s.row, { backgroundColor: th.backgroundElement, opacity: pressed ? 0.75 : 1 }]}>
              <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                <ThemedText type="smallBold" style={d.cancelled ? { textDecorationLine: 'line-through' } : undefined}>{d.number}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary" numberOfLines={2} style={{ fontSize: 12 }}>{d.partyName ?? t('ws.walkIn')} · {formatDate(d.issuedAt, lang, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · {t('ws.itemsCount', { count: d.lineCount })}</ThemedText>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                <ThemedText type="smallBold">{shop.money(d.total)}</ThemedText>
                {d.cancelled ? <Badge tone="danger">{t('ws.cancelled')}</Badge> : <Badge tone={payTone(d.paymentStatus)}>{t(`ws.p.${d.paymentStatus}`)}</Badge>}
              </View>
            </Pressable>
          )} />
      )}
      {pendingOpen ? <Sheet visible tall title={t('mob.provisional')} onClose={() => setPendingOpen(null)}><Hint icon="cloud" tone="warning">{t('mob.pendingSalesText')}</Hint><Receipt doc={pendingOpen.preview} /></Sheet> : null}
      {open ? <SaleSheet id={open} onClose={() => setOpen(null)} onChanged={() => void list.reload()} /> : null}
    </Screen>
  );
}

type FullDoc = Doc & { paymentStatus: string; paidTotal: number | string; marginTotal?: number; cancelReason?: string };

function SaleSheet({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const { t, lang } = useT();
  const shop = useShop();
  const offline = useOffline();
  const toast = useToast();
  const q = useQuery<FullDoc>(`/api/shop/documents/${id}`);
  const [doc, setDoc] = useState<FullDoc | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('CASH');
  const [cancelling, setCancelling] = useState(false);
  const [returning, setReturning] = useState(false);
  const [reason, setReason] = useState('');
  const [refund, setRefund] = useState(true);
  const d = doc ?? q.data;

  async function pay() {
    try {
      const body = { id: uuid(), method, amount: Number(amount), paidAt: new Date().toISOString() };
      const res = await offline.submit<FullDoc>({ id: body.id, shopId: shop.shopId, method: 'POST', path: `/api/shop/documents/${id}/payments`, body, kind: 'payment', label: `${t('mob.labelPayment')} · ${d!.number ?? ''} · ${shop.money(body.amount)}` });
      if (res.queued) {
        // hors ligne : le solde affiche baisse tout de suite ; le serveur recevra l'encaissement avec son heure reelle
        const balance = Math.max(0, Number(d!.balance) - body.amount);
        setDoc({ ...d!, balance, paidTotal: Number(d!.paidTotal) + body.amount, paymentStatus: balance === 0 ? 'PAID' : 'PARTIAL' } as FullDoc);
        toast(t('mob.queuedGeneric'), 'warning');
      } else {
        setDoc(res.data);
        toast(t('ws.saved'));
      }
      setAmount('');
      onChanged();
    } catch (e) { setError(e instanceof ApiError ? e.message : t('common.network')); }
  }
  async function cancel() {
    try {
      const body = { reason, refund: Number(d!.paidTotal) > 0 && refund };
      const res = await offline.submit<FullDoc>({ id: uuid(), shopId: shop.shopId, method: 'POST', path: `/api/shop/sales/${id}/cancel`, body, kind: 'sale-cancel', label: `${t('mob.labelCancel')} · ${d!.number ?? ''}` });
      if (res.queued) {
        setDoc({ ...d!, cancelledAt: new Date().toISOString(), cancelReason: reason } as FullDoc);   // hors ligne : annulee ici tout de suite, envoyee plus tard
        toast(t('mob.queuedGeneric'), 'warning');
      } else {
        setDoc(res.data);
        toast(t('ws.saleCancelled'));
      }
      setCancelling(false);
      onChanged();
    } catch (e) { setError(e instanceof ApiError ? e.message : t('common.network')); }
  }

  return (
    <Sheet visible tall title={d ? `${shop.v('receipt')} ${d.number}` : '…'} onClose={onClose}
      footer={d && !d.cancelledAt && (shop.can('SALES', 'delete') || shop.can('CUSTOMER_RETURNS', 'create')) ? (
        <View style={{ gap: 8 }}>
          {shop.can('CUSTOMER_RETURNS', 'create') ? <Btn variant="secondary" icon="rotate-left" title={t('ret.c.startFrom')} onPress={() => setReturning(true)} /> : null}
          {shop.can('SALES', 'delete') ? <Btn variant="danger" icon="rotate-left" title={t('ws.cancelSale')} onPress={() => setCancelling(true)} /> : null}
        </View>
      ) : undefined}>
      {!d ? (q.error ? <ErrorNote message={q.error} onRetry={q.reload} /> : <Skeleton rows={3} height={80} />) : (
        <>
          {error ? <Hint icon="circle-xmark" tone="danger">{error}</Hint> : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {d.cancelledAt ? <Badge tone="danger">{t('ws.cancelled')}</Badge> : <Badge tone={payTone(d.paymentStatus)}>{t(`ws.p.${d.paymentStatus}`)}</Badge>}
            <ThemedText type="small" themeColor="textSecondary">{formatDateTime(d.issuedAt, lang)}</ThemedText>
          </View>
          {d.cancelReason ? <ThemedText type="small" themeColor="textSecondary">{t('ws.reason')} : {d.cancelReason}</ThemedText> : null}
          <Receipt doc={d} />
          {shop.owner && d.marginTotal != null && !d.cancelledAt ? <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center' }}>{t('ws.margin')} : <ThemedText type="smallBold">{shop.money(d.marginTotal)}</ThemedText></ThemedText> : null}
          {!d.cancelledAt && Number(d.balance) > 0 && shop.can('SALES', 'update') ? (
            <Card style={{ gap: 12 }}>
              <ThemedText type="smallBold">{t('ws.collectPayment')}</ThemedText>
              <Chips scroll={false} value={method} onChange={setMethod} options={(shop.ws.manifest.paymentMethods ?? ['CASH']).map((m) => ({ value: m, label: t(`ws.m.${m}`) }))} />
              <NumberBox label={t('ws.amountPaid')} value={amount} onChange={setAmount} placeholder={String(d.balance)} suffix={shop.currency} />
              <Btn title={t('ws.collect')} disabled={!(Number(amount) > 0)} onPress={pay} />
            </Card>
          ) : null}
          {returning ? <ReturnFromSale saleId={id} onClose={() => setReturning(false)} onDone={(r) => { setReturning(false); toast(r ? t('ret.c.done', { number: r.number ?? '' }) : t('ret.c.queued'), r ? 'success' : 'warning'); onChanged(); setDoc(null); void q.reload(); }} /> : null}
          {cancelling ? (
            <Sheet visible title={t('ws.cancelSaleTitle', { number: d.number ?? '' })} onClose={() => setCancelling(false)} footer={<Btn variant="danger" icon="rotate-left" title={t('ws.cancelSale')} onPress={cancel} />}>
              <OfflineAdvice kind="cancel" />
              <Hint icon="triangle-exclamation" tone="warning">{t('ws.cancelSaleText')}</Hint>
              <TextBox label={t('ws.reason')} value={reason} onChangeText={setReason} maxLength={200} autoCapitalize="sentences" />
              {Number(d.paidTotal) > 0 ? <Switch value={refund} onChange={setRefund} label={t('ws.refundAlso', { amount: shop.money(d.paidTotal) })} /> : null}
            </Sheet>
          ) : null}
        </>
      )}
    </Sheet>
  );
}

const s = StyleSheet.create({ row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 18 } });
