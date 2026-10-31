import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { DateField } from '@/components/date-field';
import { PdfButton } from '@/components/pdf-button';
import { ProductPicker } from '@/components/product-picker';
import { ThemedText } from '@/components/themed-text';
import { Badge, Btn, Card, Chips, ErrorNote, Hint, NumberBox, Row, Screen, SectionTitle, Sheet, Skeleton, Stack, TextBox, useToast } from '@/components/ui';
import { useT } from '@/i18n';
import { ApiError } from '@/lib/api';
import { formatDateTime, num, type Product } from '@/lib/format';
import { qs, useQuery } from '@/lib/query';
import { useShop } from '@/lib/shop';
import type { PageProps } from '../registry';

const API = '/api/shop/salon';
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
type Total = { stylistId: string; stylistName: string; commission: number | string; tips: number | string; due: number | string; services: number };
type Line = { id: string; stylistName: string; earnedAt: string; serviceName: string; base: number | string; percent: number | string; amount: number | string; tip: number | string; status: string };
type Statement = { totals: Total[]; lines: { items: Line[]; total: number } };
type Stylist = { id: string; name: string };
type Rule = { id: string; stylistName?: string | null; productName: string; percent: number | string };
type Payout = { id: string; number: string; stylistName: string; from: string; to: string; total: number | string };

function Pay({ total, from, to, onClose, onPaid }: { total: Total; from: string; to: string; onClose: () => void; onPaid: () => void }) {
  const { t } = useT();
  const shop = useShop();
  const [advance, setAdvance] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const net = num(total.due) - num(advance);
  async function submit() {
    setBusy(true); setError(null);
    try { await shop.call(`${API}/commissions/payouts`, { method: 'POST', body: { stylistId: total.stylistId, from, to, advance: num(advance) || undefined, note: note.trim() || undefined } }); onPaid(); }
    catch (e) { setError(e instanceof ApiError ? e.message : t('common.network')); } finally { setBusy(false); }
  }
  return (
    <Sheet visible title={t('sl.payTitle', { name: total.stylistName })} onClose={onClose} footer={<Btn icon="check" title={`${t('sl.payDo')} · ${shop.money(net)}`} loading={busy} disabled={net < 0} onPress={() => void submit()} />}>
      <View style={{ gap: 12 }}>
        {error ? <Hint tone="danger">{error}</Hint> : null}
        <ThemedText type="small" themeColor="textSecondary">{from} → {to}</ThemedText>
        <Row title={t('sl.commissionLabel')} meta={shop.money(total.commission)} /><Row title={t('sl.tips')} meta={shop.money(total.tips)} />
        <NumberBox label={t('sl.advanceDeduct')} value={advance} onChange={setAdvance} />
        <TextBox label={t('sl.note')} value={note} onChangeText={setNote} maxLength={300} />
        <ThemedText type="small" themeColor="textSecondary">{t('sl.payHint')}</ThemedText>
      </View>
    </Sheet>
  );
}

function Rules({ stylists }: { stylists: Stylist[] }) {
  const { t } = useT();
  const shop = useShop();
  const q = useQuery<Rule[]>(`${API}/commissions/rules`);
  const [product, setProduct] = useState<Product | null>(null);
  const [stylistId, setStylistId] = useState('');
  const [percent, setPercent] = useState('');
  const [error, setError] = useState<string | null>(null);
  const canWrite = shop.can('STYLIST_COMMISSIONS', 'update');
  async function add() {
    setError(null);
    try { await shop.call(`${API}/commissions/rules`, { method: 'PUT', body: { stylistId: stylistId || undefined, productId: product!.id, percent: Number(percent) } }); setProduct(null); setPercent(''); await q.reload(); }
    catch (e) { setError(e instanceof ApiError ? e.message : t('common.network')); }
  }
  return (
    <>
      <SectionTitle title={t('sl.rules')} hint={t('sl.rulesHint')} />
      {error ? <Hint tone="danger">{error}</Hint> : null}
      {(q.data ?? []).map((r) => <Row key={r.id} title={r.productName} subtitle={r.stylistName ?? t('sl.everyone')} meta={`${r.percent} %`} right={canWrite ? <Btn small variant="ghost" title={t('ws.delete')} onPress={async () => { await shop.call(`${API}/commissions/rules/${r.id}`, { method: 'DELETE' }); await q.reload(); }} /> : undefined} />)}
      {canWrite ? (
        <Card>
          <ProductPicker label={t('sl.service')} value={product} onChange={setProduct} />
          <Chips value={stylistId} onChange={setStylistId} options={[{ value: '', label: t('sl.everyone') }, ...stylists.map((s) => ({ value: s.id, label: s.name }))]} />
          <NumberBox label="%" value={percent} onChange={setPercent} />
          <Btn small icon="plus" title={t('sl.addRule')} disabled={!product || percent === ''} onPress={() => void add()} />
        </Card>
      ) : null}
    </>
  );
}

/** Commissions et pourboires : releve par periode et par praticien, regles par prestation, paiement. */
export default function SalonCommissions({ item, tab }: PageProps) {
  const { t, lang } = useT();
  const shop = useShop();
  const toast = useToast();
  const now = new Date();
  const [from, setFrom] = useState(() => iso(new Date(now.getFullYear(), now.getMonth(), 1)));
  const [to, setTo] = useState(() => iso(now));
  const [stylistId, setStylistId] = useState('');
  const [size, setSize] = useState(25);
  const [pay, setPay] = useState<Total | null>(null);
  const stylists = useQuery<Stylist[]>(`${API}/stylists`);
  const st = useQuery<Statement>(`${API}/commissions/statement${qs({ from, to, stylistId, page: 0, size })}`);
  const payouts = useQuery<{ items: Payout[] }>(`${API}/commissions/payouts?size=10`);
  const sum = useMemo(() => (st.data?.totals ?? []).reduce((a, x) => a + num(x.due), 0), [st.data]);
  const reload = async () => { await Promise.all([st.reload(), payouts.reload()]); };
  return (
    <Screen tabs={tab} title={shop.tr(item.label)} onRefresh={reload} right={<PdfButton path="/api/shop/pdf/salon/commissions" params={{ from, to, stylistId: stylistId || undefined }} name={`commissions-${from}_${to}.pdf`} label="PDF" small />}>
      <DateField label={t('sl.from')} value={from} onChange={setFrom} max={to} />
      <DateField label={t('sl.to')} value={to} onChange={setTo} min={from} />
      {(stylists.data ?? []).length > 1 ? <Chips value={stylistId} onChange={setStylistId} options={[{ value: '', label: t('sl.allStylists') }, ...(stylists.data ?? []).map((s) => ({ value: s.id, label: s.name }))]} /> : null}
      {st.error && !st.data ? <ErrorNote message={st.error} onRetry={st.reload} /> : null}
      {!st.data ? <Skeleton rows={3} /> : (
        <>
          <Card tone="info"><ThemedText type="small" themeColor="textSecondary">{t('sl.toPayTotal')}</ThemedText><ThemedText type="subtitle">{shop.money(sum)}</ThemedText></Card>
          <Stack gap={8}>
            {st.data.totals.map((x) => (
              <Card key={x.stylistId}>
                <ThemedText type="smallBold">{x.stylistName} · {x.services} {t('sl.servicesDone').toLowerCase()}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">{t('sl.commissionLabel')} {shop.money(x.commission)} · {t('sl.tips')} {shop.money(x.tips)}</ThemedText>
                <ThemedText type="smallBold">{t('sl.toPay')} : {shop.money(x.due)}</ThemedText>
                {shop.can('STYLIST_COMMISSIONS', 'update') && num(x.due) !== 0 ? <View style={{ marginTop: 8 }}><Btn small title={t('sl.payDo')} onPress={() => setPay(x)} /></View> : null}
              </Card>
            ))}
          </Stack>
          <SectionTitle title={t('sl.detail')} />
          {st.data.lines.items.length === 0 ? <ThemedText themeColor="textSecondary">{t('sl.noCommission')}</ThemedText> : st.data.lines.items.map((l) => (
            <Row key={l.id} title={l.serviceName === 'TIP' ? t('sl.tip') : l.serviceName} subtitle={`${formatDateTime(l.earnedAt, lang)} · ${l.stylistName}${l.serviceName === 'TIP' ? '' : ` · ${l.percent} %`}`}
              meta={<Badge tone={l.status === 'ACCRUED' ? 'warning' : l.status === 'PAID' ? 'success' : 'danger'}>{shop.money(l.serviceName === 'TIP' ? l.tip : l.amount)}</Badge>} />
          ))}
          {st.data.lines.total > st.data.lines.items.length ? <Btn variant="secondary" title={t('list.more')} onPress={() => setSize((s) => s + 25)} /> : null}
        </>
      )}
      <Rules stylists={stylists.data ?? []} />
      {payouts.data && payouts.data.items.length > 0 ? (
        <>
          <SectionTitle title={t('sl.payouts')} />
          {payouts.data.items.map((p) => <Row key={p.id} title={`${p.number} · ${p.stylistName}`} subtitle={`${p.from} → ${p.to}`} meta={shop.money(p.total)} right={<PdfButton path={`/api/shop/pdf/salon/payouts/${p.id}`} name={`paiement-${p.number}.pdf`} label={t('sl.pdf.payout')} small />} />)}
        </>
      ) : null}
      {pay ? <Pay total={pay} from={from} to={to} onClose={() => setPay(null)} onPaid={() => { setPay(null); toast(t('sl.payoutDone')); void reload(); }} /> : null}
    </Screen>
  );
}
