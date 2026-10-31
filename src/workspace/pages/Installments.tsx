import { useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { FlatList, View } from 'react-native';

import { ListFooter } from '@/components/list-footer';
import { PdfButton } from '@/components/pdf-button';
import { ThemedText } from '@/components/themed-text';
import { Badge, Btn, Card, Chips, Empty, ErrorNote, Input, NumberBox, Screen, Sheet, Skeleton, useToast } from '@/components/ui';
import { useT } from '@/i18n';
import { API, errText, num } from '@/lib/electronics';
import { formatDate, uuid } from '@/lib/format';
import { LIST_PROPS } from '@/lib/list';
import { useInfinite } from '@/lib/query';
import { useOffline } from '@/lib/offline';
import { useShop } from '@/lib/shop';
import type { PageProps } from '../registry';

type Item = { id: string; seq: number; dueDate: string; amount: number | string; paid: number | string; status: string; daysLate: number };
type Plan = {
  id: string; saleNumber: string; partyName: string; partyPhone?: string | null; frequency: string; installments: number; status: string; saleTotal: number | string; paidTotal: number | string;
  balance: number | string; depositPaid: number | string; overdueAmount: number | string; overdueCount: number; nextDue?: string | null; nextAmount?: number | string | null; note?: string | null; items?: Item[];
};
const FILTERS = ['', 'ACTIVE', 'OVERDUE', 'COMPLETED', 'CANCELLED'];
const TONE: Record<string, 'info' | 'warning' | 'success' | 'danger'> = { ACTIVE: 'info', OVERDUE: 'danger', COMPLETED: 'success', CANCELLED: 'danger', PAID: 'success', PARTIAL: 'warning', DUE: 'info' };

function PlanSheet({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const { t, lang } = useT();
  const shop = useShop();
  const toast = useToast();
  const offline = useOffline();
  const methods: string[] = shop.ws.manifest.paymentMethods?.length ? shop.ws.manifest.paymentMethods : ['CASH'];
  const [p, setP] = useState<Plan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [paying, setPaying] = useState(false);
  const [f, setF] = useState({ amount: '', method: methods[0] });
  const [payId, setPayId] = useState(uuid);
  useState(() => { shop.call<Plan>(`${API}/installments/${id}`).then(setP).catch((e) => setError(errText(e, t('common.error')))); return null; });
  if (!p) return <Sheet visible title="…" onClose={onClose}>{error ? <ErrorNote message={error} /> : <Skeleton rows={3} height={60} />}</Sheet>;
  const open = p.status === 'ACTIVE' || p.status === 'OVERDUE';
  async function pay() {
    setBusy(true); setError(null);
    try {
      const body = { id: payId, method: f.method, amount: num(f.amount) };
      const res = await offline.submit<Plan>({ id: payId, shopId: shop.shopId, method: 'POST', path: `${API}/installments/${id}/payments`, body, kind: 'installment-payment',
        queuedBody: { ...body, paidAt: new Date().toISOString() }, label: `${t('el.recordPayment')} · ${shop.money(body.amount)}` });
      if (res.queued) { toast(t('el.paymentQueued')); } else { setP(res.data); toast(t('el.paymentSaved')); onChanged(); }
      setPaying(false); setPayId(uuid());
    } catch (e) { setError(errText(e, t('common.error'))); } finally { setBusy(false); }
  }
  return (
    <Sheet visible tall title={`${t('el.plan')} · ${p.saleNumber}`} onClose={onClose}
      footer={shop.can('INSTALLMENTS', 'update') && open && !paying ? <Btn title={t('el.recordPayment')} onPress={() => { setF({ amount: String(num(p.nextAmount) || num(p.balance)), method: methods[0] }); setPaying(true); }} /> : undefined}>
      {error ? <ErrorNote message={error} /> : null}
      <ThemedText type="smallBold">{p.partyName}{p.partyPhone ? ` · ${p.partyPhone}` : ''}</ThemedText>
      <Badge tone={TONE[p.status] ?? 'info'}>{t(`el.ps.${p.status}`)}</Badge>
      <ThemedText type="small">{t('el.saleTotal')} : {shop.money(p.saleTotal)} · {t('el.paidTotal')} : {shop.money(p.paidTotal)}</ThemedText>
      <ThemedText type="smallBold">{t('el.balance')} : {shop.money(p.balance)}</ThemedText>
      {num(p.overdueAmount) > 0 ? <ThemedText type="small" themeColor="danger">{t('el.overdue')} : {shop.money(p.overdueAmount)} ({p.overdueCount})</ThemedText> : null}
      {p.nextDue && open ? <ThemedText type="small">{t('el.nextDue')} : {formatDate(p.nextDue, lang)} · {shop.money(p.nextAmount)}</ThemedText> : null}
      {p.note ? <ThemedText type="small" themeColor="textSecondary">{p.note}</ThemedText> : null}
      {(p.items ?? []).map((i) => (
        <View key={i.id} style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <ThemedText type="small" style={{ width: 24 }}>{i.seq}</ThemedText>
          <ThemedText type="small" style={{ flex: 1 }}>{formatDate(i.dueDate, lang)}{i.status === 'OVERDUE' ? ` · ${t('el.daysLate', { count: i.daysLate })}` : ''}</ThemedText>
          <ThemedText type="small">{shop.money(i.paid)} / {shop.money(i.amount)}</ThemedText>
          <Badge tone={TONE[i.status] ?? 'info'}>{t(`el.is.${i.status}`)}</Badge>
        </View>
      ))}
      {paying ? <Card>
        <ThemedText type="small" themeColor="textSecondary">{t('el.payHelp')}</ThemedText>
        <NumberBox label={t('el.amount')} value={f.amount} onChange={(v) => setF({ ...f, amount: v })} />
        <Chips scroll={false} value={f.method} onChange={(v) => setF({ ...f, method: v })} options={methods.map((m) => ({ value: m, label: t(`ws.m.${m}`) }))} />
        <Btn title={t('el.recordPayment')} loading={busy} disabled={num(f.amount) <= 0 || num(f.amount) > num(p.balance)} onPress={() => void pay()} />
        <Btn variant="ghost" title={t('common.cancel')} onPress={() => setPaying(false)} /></Card> : null}
      <PdfButton path={`/api/shop/pdf/electronics/installments/${p.id}`} name={`echeancier-${p.saleNumber}.pdf`} label={t('el.planPdf')} small />
    </Sheet>
  );
}

/** Ventes a credit : chaque versement est un vrai paiement de la vente ; les retards remontent en alertes. */
export default function Installments({ item, tab }: PageProps) {
  const { t, lang } = useT();
  const shop = useShop();
  const [status, setStatus] = useState('ACTIVE');
  const [q, setQ] = useState('');
  const params = useLocalSearchParams<{ open?: string }>();
  const [open, setOpen] = useState<string | null>(params.open ?? null);
  const list = useInfinite<Plan>(`${API}/installments`, { q: q.trim(), status: status || undefined });
  return (
    <Screen tabs={tab} fixed title={shop.tr(item.label)} subtitle={t('el.installmentsSubtitle')}>
      <View style={{ alignItems: 'flex-start', marginBottom: 6 }}><PdfButton path="/api/shop/pdf/electronics/report/credit" name="credits-en-cours.pdf" label={t('el.reportCredit')} small /></View>
      <Chips value={status} onChange={setStatus} options={FILTERS.map((s) => ({ value: s, label: s ? t(`el.ps.${s}`) : t('ws.all') }))} />
      <View style={{ marginVertical: 8 }}><Input value={q} onChangeText={setQ} placeholder={t('el.searchPlans')} autoCapitalize="none" /></View>
      {list.error ? <ErrorNote message={list.error} onRetry={list.reload} /> : null}
      {list.loading && list.items.length === 0 ? <Skeleton rows={4} height={72} /> : (
        <FlatList {...LIST_PROPS} data={list.items} keyExtractor={(p) => p.id} contentContainerStyle={{ gap: 8, paddingBottom: 110 }} onEndReached={list.loadMore} refreshing={list.refreshing} onRefresh={() => void list.reload()} showsVerticalScrollIndicator={false}
          ListEmptyComponent={<Empty icon="calendar-days" title={t('el.plansEmpty')} text={t('el.plansEmptyText')} />}
          ListFooterComponent={<ListFooter shown={list.items.length} total={list.total} hasMore={list.hasMore} loading={list.loadingMore} failed={false} onMore={list.loadMore} />}
          renderItem={({ item: p }) => (
            <Card onPress={() => setOpen(p.id)}>
              <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                <ThemedText type="smallBold" style={{ flex: 1 }} numberOfLines={1}>{p.partyName} · {p.saleNumber}</ThemedText>
                <Badge tone={TONE[p.status] ?? 'info'}>{t(`el.ps.${p.status}`)}</Badge>
              </View>
              <ThemedText type="small" themeColor="textSecondary">{[`${t('el.paidTotal')} ${shop.money(p.paidTotal)} / ${shop.money(p.saleTotal)}`, p.nextDue && (p.status === 'ACTIVE' || p.status === 'OVERDUE') ? `${t('el.nextDue')} ${formatDate(p.nextDue, lang)}` : null].filter(Boolean).join(' · ')}</ThemedText>
              {num(p.overdueAmount) > 0 ? <ThemedText type="small" themeColor="danger">{t('el.overdue')} : {shop.money(p.overdueAmount)}</ThemedText> : null}
            </Card>
          )} />
      )}
      {open ? <PlanSheet id={open} onClose={() => setOpen(null)} onChanged={() => void list.reload()} /> : null}
    </Screen>
  );
}
