import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { PartyPicker } from '@/components/party-picker';
import { PaymentPanel } from '@/components/payment-panel';
import { PdfButton } from '@/components/pdf-button';
import { ThemedText } from '@/components/themed-text';
import { Badge, Btn, Card, Chips, Empty, ErrorNote, Hint, Input, NumberBox, Row, Screen, SectionTitle, Sheet, Skeleton, Stack, TextBox, useToast, type Tone } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { useT } from '@/i18n';
import { ApiError } from '@/lib/api';
import { confirmAction } from '@/lib/confirm';
import { useCatalog } from '@/lib/catalog';
import { formatDateTime, num, uuid, type Product } from '@/lib/format';
import { initPay, resetPay, settle } from '@/lib/payments';
import { useOffline } from '@/lib/offline';
import { newLocalOrder, saveLocalOrder, useLocalOrders, withLines, withPaid, withSent, type LocalOrder } from '@/lib/restaurant-local';
import { useShop } from '@/lib/shop';
import type { PageProps } from '../registry';

const API = '/api/shop/restaurant';
const LINE_TONE: Record<string, Tone> = { NEW: 'info', SENT: 'warning', PREPARING: 'warning', READY: 'success', SERVED: 'info', VOID: 'danger' };
const minutesSince = (iso?: string | null) => (iso ? Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000)) : 0);

type Table = { id: string; zone: string; name: string; seats: number; active: boolean; orderId?: string | null; total?: number | null; openedAt?: string | null; readyCount: number; pendingCount: number };
type Line = { id: string; productId: string; name: string; quantity: number | string; unitPrice: number | string; lineTotal: number | string; note?: string; course: number; station: string; status: string; paid: boolean; voidReason?: string };
type Order = { id: string; number: string; channel: string; status: string; tableId?: string | null; tableName?: string | null; covers: number; partyId?: string | null; customerName?: string; phone?: string; address?: string; serverName?: string; openedAt: string; closedAt?: string; total: number | string; paidTotal: number | string; due: number | string; lineCount: number; readyCount: number; saleIds: string[]; lines: Line[] };
type Summary = { openOrders: number; tablesTotal: number; tablesBusy: number; linesWaiting: number; linesReady: number; oldestWaitSeconds: number; openTotal: number };
type Pending = { id: string; productId: string; name: string; price: number; quantity: number; note?: string; product: Product };

/** Rafraichit `load` periodiquement tant que l'ecran est ouvert : la salle se voit en direct. */
function useLive(load: () => void, ms: number) {
  const ref = useRef(load);
  useEffect(() => { ref.current = load; }, [load]);
  useEffect(() => {
    const first = setTimeout(() => ref.current(), 0);
    const id = setInterval(() => ref.current(), ms);
    return () => { clearTimeout(first); clearInterval(id); };
  }, [ms]);
}

function ReasonSheet({ title, onCancel, onOk }: { title: string; onCancel: () => void; onOk: (reason: string) => void }) {
  const { t } = useT();
  const [v, setV] = useState('');
  return (
    <Sheet visible title={title} onClose={onCancel} footer={<Btn title={t('rs.save')} icon="check" disabled={!v.trim()} onPress={() => onOk(v.trim())} />}>
      <TextBox label={title} value={v} onChangeText={setV} autoFocus maxLength={200} />
    </Sheet>
  );
}

function MenuGrid({ onAdd }: { onAdd: (p: Product) => void }) {
  const { t } = useT();
  const th = useTheme();
  const catalog = useCatalog();
  const shop = useShop();
  const toast = useToast();
  const canToggle = shop.can('TABLE_SERVICE', 'update');
  // appui long sur un plat : « epuise » / de nouveau disponible (la copie locale de la carte suit tout de suite)
  async function toggleSoldOut(p: Product) {
    const next = p.attributes?.soldOut !== true;
    try {
      await shop.call(`${API}/dishes/${p.id}/sold-out`, { method: 'POST', body: { soldOut: next } });
      catalog.upsertLocal({ ...p, attributes: { ...(p.attributes ?? {}), soldOut: next } });
    } catch (e) { toast(e instanceof ApiError ? e.message : t('common.network'), 'danger'); }
  }
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const dishes = useMemo(() => catalog.items.filter((p) => p.isActive !== false), [catalog.items]);
  const cats = useMemo(() => {
    const m = new Map<string, string>();
    dishes.forEach((p) => { if (p.categoryId) m.set(p.categoryId, p.categoryName ?? ''); });
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [dishes]);
  const shown = useMemo(() => (q.trim() ? catalog.search(q, 60) : dishes.filter((p) => !cat || p.categoryId === cat)).slice(0, 80), [q, cat, dishes, catalog]);
  const money = useShop().money;
  return (
    <View style={{ gap: 8 }}>
      <Input value={q} onChangeText={setQ} placeholder={t('rs.searchDish')} />
      {!q && cats.length > 0 ? <Chips value={cat} onChange={setCat} options={[{ value: '', label: t('rs.all') }, ...cats.map(([id, name]) => ({ value: id, label: name }))]} /> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {shown.map((p) => {
          const out = p.attributes?.soldOut === true;
          return (
            <Pressable key={p.id} onPress={() => onAdd(p)} onLongPress={canToggle ? () => void toggleSoldOut(p) : undefined} disabled={out && !canToggle} accessibilityRole="button" accessibilityHint={canToggle ? t(out ? 'rs.markAvailable' : 'rs.markSoldOut') : undefined}
              style={({ pressed }) => ({ width: '48%', minHeight: 64, padding: 10, borderRadius: 12, borderWidth: 1, borderColor: th.border, backgroundColor: th.backgroundElement, opacity: out ? 0.5 : pressed ? 0.7 : 1, justifyContent: 'space-between' })}>
              <ThemedText type="smallBold" numberOfLines={2} style={out ? { textDecorationLine: 'line-through' } : undefined}>{p.name}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">{out ? t('rs.soldOut') : money(p.salePrice)}</ThemedText>
            </Pressable>
          );
        })}
        {shown.length === 0 ? <ThemedText type="small" themeColor="textSecondary">{t('rs.noDish')}</ThemedText> : null}
      </View>
    </View>
  );
}

type PayResult = { order: Order; sale: { id: string; number: string; total: number }; queued?: boolean };
function PayStep({ order, onBack, onPaid, submitPay }: { order: Order; onBack: () => void; onPaid: (res: PayResult, change: number) => void; submitPay: (p: { body: object; queuedBody: object; lineIds: string[] | null; saleId: string; due: number }) => Promise<PayResult | null> }) {
  const { t } = useT();
  const shop = useShop();
  const methods: string[] = shop.ws.manifest.paymentMethods?.length ? shop.ws.manifest.paymentMethods : ['CASH'];
  const unpaid = order.lines.filter((l) => !l.paid && l.status !== 'VOID');
  const [chosen, setChosen] = useState<Set<string>>(() => new Set(unpaid.map((l) => l.id)));
  const [partyId, setPartyId] = useState<string | null>(order.partyId ?? null);
  const [discount, setDiscount] = useState(0);
  const [reason, setReason] = useState('');
  const canDiscount = shop.owner || shop.can('SALES', 'update');
  const [pay, setPay] = useState(() => initPay(methods[0]));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const saleId = useRef(uuid());
  const gross = Math.round(unpaid.filter((l) => chosen.has(l.id)).reduce((s, l) => s + num(l.lineTotal), 0) * 100) / 100;
  const due = Math.round(unpaid.filter((l) => chosen.has(l.id)).reduce((s, l) => s + (num(l.lineTotal) - Math.round(num(l.lineTotal) * discount) / 100), 0) * 100) / 100;
  const sett = settle(pay, due);
  const canCredit = partyId != null;
  const valid = (due > 0 || (discount === 100 && gross > 0)) && sett.valid && (sett.remaining === 0 || canCredit) && (discount === 0 || reason.trim().length > 0);
  const toggle = (id: string) => { saleId.current = uuid(); setChosen((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; }); };

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const all = chosen.size === unpaid.length;
      const body = {
        saleId: saleId.current, partyId: partyId || undefined, lineIds: all ? undefined : [...chosen], discountPercent: discount || undefined, discountReason: discount ? reason.trim() : undefined,
        payments: sett.payments.map((p) => ({ id: uuid(), method: p.method, amount: p.amount, reference: p.reference })),
      };
      // hors ligne : l'encaissement part dans la file avec l'heure reelle et s'enregistre au retour du reseau
      const res = await submitPay({ body, queuedBody: { ...body, offline: true, at: new Date().toISOString() }, lineIds: all ? null : [...chosen], saleId: saleId.current, due });
      if (!res) return;
      onPaid(res, sett.change);
      setPay((p) => resetPay(p));
    } catch (e) { setError(e instanceof ApiError ? e.message : t('common.network')); } finally { setBusy(false); }
  }

  return (
    <Stack gap={12}>
      <Btn small variant="ghost" icon="arrow-left" title={t('rs.backToOrder')} onPress={onBack} />
      <ThemedText type="smallBold">{t('rs.payTitle')}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">{t('rs.splitHint')}</ThemedText>
      {unpaid.map((l) => (
        <Row key={l.id} icon={chosen.has(l.id) ? 'square-check' : 'square'} title={`${num(l.quantity)} × ${l.name}`} right={<ThemedText type="smallBold">{shop.money(l.lineTotal)}</ThemedText>} onPress={() => toggle(l.id)} />
      ))}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Btn small variant="secondary" title={t('rs.selectAll')} onPress={() => { saleId.current = uuid(); setChosen(new Set(unpaid.map((l) => l.id))); }} />
        <Btn small variant="secondary" title={t('rs.selectNone')} onPress={() => { saleId.current = uuid(); setChosen(new Set()); }} />
      </View>
      {shop.can('CUSTOMERS', 'view') ? <PartyPicker role="CUSTOMER" label={shop.v('customer')} value={partyId} onChange={setPartyId} /> : null}
      {canDiscount ? (
        <Stack gap={8}>
          <ThemedText type="smallBold">{t('rs.discount')}</ThemedText>
          <Chips value={String(discount)} onChange={(v) => { saleId.current = uuid(); setDiscount(Number(v)); }}
            options={[0, 5, 10, 20, 50, 100].map((v) => ({ value: String(v), label: v === 0 ? t('rs.noDiscount') : v === 100 ? t('rs.offered') : `${v} %` }))} />
          {discount > 0 ? <TextBox label={t('rs.discountReason')} value={reason} onChangeText={setReason} maxLength={120} /> : null}
        </Stack>
      ) : null}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><ThemedText type="smallBold">{t('rs.toPay')}</ThemedText><ThemedText type="subtitle">{shop.money(due)}</ThemedText></View>
      <PaymentPanel pay={pay} setPay={setPay} due={due} methods={methods} res={sett} money={shop.money} currency={shop.currency} />
      {sett.change > 0 ? <Hint icon="coins">{t('ws.changeToGive')} {shop.money(sett.change)}</Hint> : null}
      {sett.remaining > 0 ? <Hint tone={canCredit ? 'warning' : 'danger'}>{canCredit ? t('ws.onCredit', { amount: shop.money(sett.remaining) }) : t('ws.creditNeedsParty')}</Hint> : null}
      {error ? <ErrorNote message={error} /> : null}
      <Btn icon="check" title={busy ? t('ws.saving') : t('ws.charge', { amount: shop.money(due) })} disabled={!valid} loading={busy} onPress={submit} />
    </Stack>
  );
}

function OrderSheet({ tableId, tableLabel, initial, channel, tables, onClose, onChanged }: { tableId?: string; tableLabel?: string; initial?: Order; channel: string; tables: Table[]; onClose: () => void; onChanged: () => void }) {
  const { t } = useT();
  const shop = useShop();
  const toast = useToast();
  const autoSend = shop.config?.autoSendToKitchen === true;
  const [order, setOrder] = useState<Order | undefined>(initial);
  const [covers, setCovers] = useState('2');
  const [guest, setGuest] = useState({ customerName: '', phone: '', address: '' });
  const [step, setStep] = useState<'order' | 'pay' | 'done'>('order');
  const [result, setResult] = useState<(PayResult & { change: number }) | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reasonFor, setReasonFor] = useState<null | { kind: 'line'; line: Line } | { kind: 'order' }>(null);
  const [pending, setPending] = useState<Pending[]>([]);
  const [orderKey] = useState(() => initial?.id ?? uuid());
  const outbox = useOffline();
  const hasPending = outbox.items.some((i) => i.state === 'pending' && i.group === orderKey);
  const queuedFailed = outbox.items.some((i) => i.state === 'failed' && i.group === orderKey);

  // Envoie l'operation ; sans reseau elle part dans la file (dans l'ordre) et la commande locale est mise a jour tout de suite.
  async function run({ kind, label, path, body, queuedBody, local }: { kind: string; label: string; path: string; body: unknown; queuedBody?: unknown; local: () => LocalOrder }) {
    setBusy(true);
    setError(null);
    try {
      const res = await outbox.submit<any>({ id: uuid(), shopId: shop.shopId, method: 'POST', path, body, queuedBody, kind, label, group: orderKey, forceQueue: hasPending });
      let next: Order | undefined;
      if (res.queued) {
        const lo = local();
        saveLocalOrder(shop.shopId, lo);
        next = lo as unknown as Order;
        setOrder(next);
        toast(t('rs.queued'));
      } else {
        const d = (res.data?.order ?? res.data) as Order | undefined;
        if (d?.lines) { next = d; setOrder(d); }
      }
      onChanged();
      return { queued: res.queued, data: res.queued ? undefined : (res as { data: any }).data, order: next };
    } catch (e) { setError(e instanceof ApiError ? e.message : t('common.network')); return null; } finally { setBusy(false); }
  }
  // actions qui exigent le serveur (annuler, deplacer, statut...) : refusees proprement hors ligne ou tant que la commande n'est pas envoyee
  const needsServer = () => {
    if (outbox.online && !hasPending) return false;
    setError(t('rs.needsOnline'));
    return true;
  };

  const reload = useCallback(async () => {
    if (!order) return;
    if (hasPending) return;      // des operations sont encore en file : la copie locale fait foi
    try { setOrder(await shop.call<Order>(`${API}/orders/${orderKey}`)); } catch { /* garde l'etat courant */ }
  }, [shop, order, hasPending]);
  useLive(() => { void reload(); }, 8000);

  async function act<T extends Order | undefined>(fn: () => Promise<T>, ok?: string): Promise<T | null> {
    if (needsServer()) return null;
    setBusy(true);
    setError(null);
    try { const res = await fn(); if (res?.lines) setOrder(res); if (ok) toast(ok); onChanged(); return res; } catch (e) { setError(e instanceof ApiError ? e.message : t('common.network')); return null; } finally { setBusy(false); }
  }
  const post = (path: string, body?: unknown) => shop.call<Order>(`${API}/orders/${orderKey}${path}`, { method: 'POST', body });

  const addDish = (p: Product) => {
    if (p.attributes?.soldOut === true) { toast(t('rs.soldOut'), 'warning'); return; }
    if (!order) { setPending((l) => { const same = l.find((x) => x.productId === p.id && !x.note); return same ? l.map((x) => (x === same ? { ...x, quantity: x.quantity + 1 } : x)) : [...l, { id: uuid(), productId: p.id, name: p.name, price: num(p.salePrice), quantity: 1, product: p }]; }); return; }
    if (order.status !== 'OPEN') return;
    const lineId = uuid();
    void run({ kind: 'rs-lines', label: `${t('rs.title')} · ${order.number} · ${p.name}`, path: `${API}/orders/${order.id}/lines`, body: { lines: [{ id: lineId, productId: p.id, quantity: 1 }], send: autoSend },
      local: () => { const o = withLines(order as unknown as LocalOrder, [{ id: lineId, product: p }]); return autoSend ? withSent(o) : o; } });
  };
  async function open() {
    const body = { id: orderKey, channel, tableId, covers: Number(covers) || 1, send: autoSend, at: new Date().toISOString(),
      ...(channel === 'DINE_IN' ? {} : { customerName: guest.customerName || undefined, phone: guest.phone || undefined, address: guest.address || undefined }),
      lines: pending.map((l) => ({ id: l.id, productId: l.productId, quantity: l.quantity, note: l.note })) };
    const tb = tables.find((x) => x.id === tableId);
    const res = await run({ kind: 'rs-open', label: `${t('rs.title')} · ${tableLabel ?? t(`rs.channel.${channel}`)}`, path: `${API}/orders`, body,
      local: () => {
        const base = newLocalOrder({ id: orderKey, channel, table: tableId ? { id: tableId, name: tb?.name, zone: tb?.zone } : null, covers: Number(covers) || 1, guest });
        const o = withLines(base, pending.map((l) => ({ id: l.id, product: l.product, quantity: l.quantity, note: l.note })));
        return autoSend ? withSent(o) : o;
      } });
    if (res) setPending([]);
  }

  const lines = order?.lines ?? [];
  const newCount = lines.filter((l) => l.status === 'NEW').length;
  const readyCount = lines.filter((l) => l.status === 'READY').length;
  const unpaidCount = lines.filter((l) => !l.paid && l.status !== 'VOID').length;
  const total = order ? num(order.total) : pending.reduce((s, l) => s + l.price * l.quantity, 0);
  const closed = order != null && order.status !== 'OPEN';

  const replaceNew = (l: Line, patch: { quantity?: number; note?: string }) => act(async () => {
    await shop.call(`${API}/orders/${order!.id}/lines/${l.id}`, { method: 'DELETE' });
    return shop.call<Order>(`${API}/orders/${order!.id}/lines`, { method: 'POST', body: { lines: [{ id: uuid(), productId: l.productId, quantity: patch.quantity ?? num(l.quantity), note: patch.note ?? l.note, course: l.course }] } });
  });
  const removeLine = (l: Line, reason?: string) => act(() => shop.call<Order>(`${API}/orders/${order!.id}/lines/${l.id}${reason ? `?reason=${encodeURIComponent(reason)}` : ''}`, { method: 'DELETE' }));
  const setStatus = (l: Line, status: string) => act(() => post(`/lines/${l.id}/status`, { status }));
  async function cancelOrder(reason: string) {
    const res = await act(() => post('/cancel', { reason }), t('rs.cancelled'));
    if (res) onClose();
  }
  async function askCancel() {
    if (!(await confirmAction(t('rs.cancelOrder'), t('rs.cancelConfirm'), t('rs.cancelOrder'), t('ws.close')))) return;
    if (lines.some((l) => l.status !== 'NEW')) setReasonFor({ kind: 'order' }); else void cancelOrder('');
  }

  if (step === 'done' && result) {
    return (
      <Sheet visible title={t('rs.paidTitle', { number: result.sale.number })} onClose={onClose}
        footer={<View style={{ gap: 8 }}>{result.queued ? null : <PdfButton path={`/api/shop/pdf/documents/${result.sale.id}`} name={`addition-${result.sale.number}.pdf`} />}<Btn title={result.order.status === 'OPEN' ? t('rs.continueOrder') : t('ws.close')} onPress={() => (result.order.status === 'OPEN' ? setStep('order') : onClose())} /></View>}>
        <Empty icon="circle-check" title={shop.money(result.sale.total)} text={result.change > 0 ? `${t('ws.changeToGive')} ${shop.money(result.change)}` : t('rs.thanks')} />
        {result.queued ? <Hint icon="cloud-arrow-up" tone="warning">{t('rs.queuedPayNote')}</Hint> : null}
        {result.order.status === 'OPEN' ? <ThemedText type="small" themeColor="textSecondary">{t('rs.stillOpen', { amount: shop.money(result.order.due) })}</ThemedText> : null}
      </Sheet>
    );
  }

  return (
    <Sheet visible tall title={order ? `${(order as unknown as LocalOrder).local ? t('rs.localOrder') : order.number}${order.tableName ? ` · ${t('rs.table')} ${order.tableName}` : ''}` : (tableLabel ?? t(`rs.channel.${channel}`))} onClose={onClose}>
      {hasPending || (order as unknown as LocalOrder | undefined)?.local ? <Hint icon="cloud-arrow-up" tone="warning">{t('rs.waitingSync')}</Hint> : null}
      {queuedFailed ? <ErrorNote message={t('rs.syncFailed')} /> : null}
      {step === 'pay' && order ? (
        <PayStep order={order} onBack={() => setStep('order')}
          submitPay={async ({ body, queuedBody, lineIds, saleId, due }) => {
            const r = await run({ kind: 'rs-pay', label: `${t('rs.title')} · ${order.number} · ${shop.money(due)}`, path: `${API}/orders/${order.id}/pay`, body, queuedBody, local: () => withPaid(order as unknown as LocalOrder, lineIds) });
            if (!r) return null;
            return r.queued ? { queued: true, order: r.order as Order, sale: { id: saleId, number: t('rs.pendingNumber'), total: due } } : (r.data as PayResult);
          }}
          onPaid={(res, change) => { setOrder(res.order); setResult({ ...res, change }); setStep('done'); onChanged(); }} />
      ) : (
        <Stack gap={12}>
          {!order ? (
            <Card>
              {channel === 'DINE_IN' ? <NumberBox label={t('rs.covers')} value={covers} onChange={setCovers} /> : (
                <Stack gap={8}>
                  <TextBox label={t('rs.customerName')} value={guest.customerName} onChangeText={(v) => setGuest({ ...guest, customerName: v })} maxLength={120} />
                  <TextBox label={t('rs.phone')} value={guest.phone} onChangeText={(v) => setGuest({ ...guest, phone: v })} keyboardType="phone-pad" maxLength={40} />
                  {channel === 'DELIVERY' ? <TextBox label={t('rs.address')} value={guest.address} onChangeText={(v) => setGuest({ ...guest, address: v })} maxLength={300} /> : null}
                </Stack>
              )}
            </Card>
          ) : (
            <ThemedText type="small" themeColor="textSecondary">{t('rs.openedSince', { n: minutesSince(order.openedAt) })}{order.covers > 0 ? ` · ${t('rs.coversN', { n: order.covers })}` : ''}{order.serverName ? ` · ${order.serverName}` : ''}{order.customerName ? ` · ${order.customerName}` : ''}{order.address ? ` · ${order.address}` : ''}</ThemedText>
          )}

          <SectionTitle title={t('rs.tab.orders')} right={<ThemedText type="subtitle">{shop.money(total)}</ThemedText>} />
          {(order ? lines : []).map((l) => (
            <Card key={l.id}>
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                <ThemedText type="smallBold" style={{ flex: 1 }}>{num(l.quantity)}× {l.name}</ThemedText>
                <ThemedText type="smallBold">{shop.money(l.lineTotal)}</ThemedText>
              </View>
              <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginTop: 4, alignItems: 'center' }}>
                <Badge tone={LINE_TONE[l.status]}>{t(`rs.line.${l.status}`)}</Badge>
                {l.paid ? <Badge tone="success">{t('rs.linePaid')}</Badge> : null}
                {l.course > 1 ? <ThemedText type="small" themeColor="textSecondary">{t(`rs.course.${l.course}`)}</ThemedText> : null}
                {l.note ? <ThemedText type="small">{l.note}</ThemedText> : null}
                {l.voidReason ? <ThemedText type="small" themeColor="textSecondary">{l.voidReason}</ThemedText> : null}
              </View>
              {!closed && !l.paid && l.status !== 'VOID' ? (
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                  {l.status === 'NEW' ? <>
                    <Btn small variant="secondary" icon="minus" title="" disabled={busy || num(l.quantity) <= 1} onPress={() => replaceNew(l, { quantity: num(l.quantity) - 1 })} />
                    <Btn small variant="secondary" icon="plus" title="" disabled={busy} onPress={() => replaceNew(l, { quantity: num(l.quantity) + 1 })} />
                  </> : null}
                  {l.status === 'READY' ? <Btn small variant="secondary" icon="bell-concierge" title={t('rs.served')} disabled={busy} onPress={() => setStatus(l, 'SERVED')} /> : null}
                  <Btn small variant="danger" icon="trash" title={t('rs.remove')} disabled={busy} onPress={() => (l.status === 'NEW' ? void removeLine(l) : setReasonFor({ kind: 'line', line: l }))} />
                </View>
              ) : null}
            </Card>
          ))}
          {!order ? pending.map((l) => (
            <Card key={l.id}>
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                <ThemedText type="smallBold" style={{ flex: 1 }}>{l.quantity}× {l.name}</ThemedText>
                <ThemedText type="smallBold">{shop.money(l.price * l.quantity)}</ThemedText>
                <Btn small variant="secondary" icon="minus" title="" onPress={() => setPending((p) => p.map((x) => (x.id === l.id ? { ...x, quantity: Math.max(1, x.quantity - 1) } : x)))} />
                <Btn small variant="secondary" icon="plus" title="" onPress={() => setPending((p) => p.map((x) => (x.id === l.id ? { ...x, quantity: x.quantity + 1 } : x)))} />
                <Btn small variant="danger" icon="trash" title="" onPress={() => setPending((p) => p.filter((x) => x.id !== l.id))} />
              </View>
            </Card>
          )) : null}
          {(order ? lines.length : pending.length) === 0 ? <ThemedText type="small" themeColor="textSecondary">{t('rs.emptyOrder')}</ThemedText> : null}
          {order && num(order.paidTotal) > 0 ? <ThemedText type="small" themeColor="textSecondary">{t('rs.alreadyPaid', { amount: shop.money(order.paidTotal), due: shop.money(order.due) })}</ThemedText> : null}
          {error ? <ErrorNote message={error} /> : null}

          {!order ? <Btn icon="check" title={t('rs.openOrder')} loading={busy} disabled={pending.length === 0 || (channel === 'DELIVERY' && !(guest.phone && guest.address))} onPress={open} />
            : !closed ? (
              <Stack gap={8}>
                {newCount > 0 ? <Btn icon="fire-burner" title={t('rs.send', { n: newCount })} loading={busy} onPress={() => void run({ kind: 'rs-send', label: `${t('rs.title')} · ${order.number} · ${t('rs.send', { n: newCount })}`, path: `${API}/orders/${order.id}/send`, body: {}, local: () => withSent(order as unknown as LocalOrder) })} /> : null}
                {readyCount > 0 ? <Btn variant="secondary" icon="bell-concierge" title={t('rs.serveReady', { n: readyCount })} loading={busy} onPress={() => void act(() => post('/serve-ready'))} /> : null}
                <PdfButton path={`/api/shop/pdf/restaurant/orders/${order.id}`} name={`addition-${order.number}.pdf`} />
                {unpaidCount > 0 && shop.can('SALES', 'create') ? <Btn variant="secondary" icon="cash-register" title={t('rs.pay')} disabled={busy} onPress={() => setStep('pay')} /> : null}
                {order.channel === 'DINE_IN' ? (
                  <Chips value="" onChange={(id) => id && void act(() => shop.call<Order>(`${API}/orders/${order.id}`, { method: 'PUT', body: { tableId: id } }), t('rs.moved'))}
                    options={[{ value: '', label: `${t('rs.moveTable')}…` }, ...tables.filter((x) => x.active && !x.orderId).map((x) => ({ value: x.id, label: `${x.zone ? `${x.zone} · ` : ''}${x.name}` }))]} />
                ) : null}
                {shop.can('TABLE_SERVICE', 'delete') && num(order.paidTotal) === 0 ? <Btn small variant="danger" title={t('rs.cancelOrder')} disabled={busy} onPress={askCancel} /> : null}
              </Stack>
            ) : <ThemedText type="small" themeColor="textSecondary">{t(`rs.status.${order.status}`)}{order.closedAt ? ` · ${formatDateTime(order.closedAt, 'fr')}` : ''}</ThemedText>}

          {!closed ? <MenuGrid onAdd={addDish} /> : null}
        </Stack>
      )}
      {reasonFor ? (
        <ReasonSheet title={reasonFor.kind === 'line' ? t('rs.voidReason') : t('rs.cancelReason')} onCancel={() => setReasonFor(null)}
          onOk={(reason) => { const r = reasonFor; setReasonFor(null); if (r.kind === 'line') void removeLine(r.line, reason); else void cancelOrder(reason); }} />
      ) : null}
    </Sheet>
  );
}

function TablesSheet({ tables, onClose, onChanged }: { tables: Table[]; onClose: () => void; onChanged: () => void }) {
  const { t } = useT();
  const shop = useShop();
  const toast = useToast();
  const [draft, setDraft] = useState({ zone: '', name: '', seats: '4' });
  const [range, setRange] = useState({ zone: '', from: '1', to: '10', seats: '4' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try { await fn(); onChanged(); } catch (e) { setError(e instanceof ApiError ? e.message : e instanceof Error ? e.message : t('common.network')); } finally { setBusy(false); }
  }
  const post = (body: object) => shop.call(`${API}/tables`, { method: 'POST', body });
  const patch = (tb: Table, change: object) => run(async () => { await shop.call(`${API}/tables/${tb.id}`, { method: 'PUT', body: { zone: tb.zone, name: tb.name, seats: tb.seats, active: tb.active, ...change } }); });
  return (
    <Sheet visible tall title={t('rs.manageTables')} onClose={onClose}>
      <Stack gap={12}>
        <Card>
          <SectionTitle title={t('rs.addTable')} />
          <TextBox label={t('rs.zone')} value={draft.zone} onChangeText={(v) => setDraft({ ...draft, zone: v })} placeholder={t('rs.zoneHint')} maxLength={40} />
          <TextBox label={t('rs.tableName')} value={draft.name} onChangeText={(v) => setDraft({ ...draft, name: v })} placeholder="6" maxLength={40} />
          <NumberBox label={t('rs.seatsLabel')} value={draft.seats} onChange={(v) => setDraft({ ...draft, seats: v })} />
          <Btn icon="plus" title={t('rs.addTable')} disabled={busy || !draft.name.trim()} onPress={() => void run(async () => { await post({ id: uuid(), zone: draft.zone, name: draft.name, seats: Number(draft.seats) || 4 }); setDraft({ ...draft, name: '' }); toast(t('rs.tableAdded')); })} />
        </Card>
        <Card>
          <SectionTitle title={t('rs.addRange')} />
          <TextBox label={t('rs.zone')} value={range.zone} onChangeText={(v) => setRange({ ...range, zone: v })} maxLength={40} />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}><NumberBox label={t('rs.from')} value={range.from} onChange={(v) => setRange({ ...range, from: v })} /></View>
            <View style={{ flex: 1 }}><NumberBox label={t('rs.to')} value={range.to} onChange={(v) => setRange({ ...range, to: v })} /></View>
          </View>
          <Btn variant="secondary" icon="plus" title={t('rs.addRange')} disabled={busy} onPress={() => void run(async () => {
            const from = Number(range.from), to = Number(range.to);
            if (!(from >= 1 && to >= from && to - from < 100)) throw new Error(t('rs.rangeInvalid'));
            const have = new Set(tables.filter((x) => x.zone.toLowerCase() === range.zone.trim().toLowerCase()).map((x) => x.name.toLowerCase()));
            for (let n = from; n <= to; n += 1) if (!have.has(String(n))) await post({ id: uuid(), zone: range.zone, name: String(n), seats: Number(range.seats) || 4, position: n });
            toast(t('rs.tablesAdded'));
          })} />
        </Card>
        {error ? <ErrorNote message={error} /> : null}
        {tables.map((tb) => (
          <Row key={tb.id} icon="chair" title={`${tb.zone ? `${tb.zone} · ` : ''}${tb.name}`} subtitle={t('rs.seatsN', { n: tb.seats })}
            right={<View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
              {!tb.active ? <Badge tone="danger">{t('rs.inactive')}</Badge> : null}
              <Btn small variant="secondary" title={tb.active ? t('rs.deactivate') : t('rs.activate')} disabled={busy || (tb.active && !!tb.orderId)} onPress={() => void patch(tb, { active: !tb.active })} />
            </View>} />
        ))}
      </Stack>
    </Sheet>
  );
}


type Reservation = { id: string; tableId?: string | null; tableName?: string | null; zone?: string | null; guestName: string; phone?: string; partySize: number; reservedAt: string; durationMin: number; status: string; late: boolean; note?: string; orderId?: string | null; orderNumber?: string | null };
const RES_TONE: Record<string, Tone> = { BOOKED: 'warning', SEATED: 'success', NO_SHOW: 'danger', CANCELLED: 'info' };
const pad2 = (n: number) => String(n).padStart(2, '0');
const isoDay = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const hhmm = (iso: string) => { const d = new Date(iso); return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };

function ReservationSheet({ initial, tables, day, onClose, onSaved }: { initial?: Reservation; tables: Table[]; day: string; onClose: () => void; onSaved: () => void }) {
  const { t } = useT();
  const shop = useShop();
  const id = useRef(initial?.id ?? uuid());
  const [f, setF] = useState({ guestName: initial?.guestName ?? '', phone: initial?.phone ?? '', partySize: String(initial?.partySize ?? 2), date: initial ? isoDay(new Date(initial.reservedAt)) : day, time: initial ? hhmm(initial.reservedAt) : '19:30',
    durationMin: String(initial?.durationMin ?? 90), tableId: initial?.tableId ?? '', note: initial?.note ?? '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function save() {
    setBusy(true); setError(null);
    try {
      const at = new Date(`${f.date}T${f.time}`);
      if (Number.isNaN(at.getTime())) throw new Error(t('rs.resTime'));
      const body = { id: id.current, guestName: f.guestName, phone: f.phone || undefined, partySize: Number(f.partySize) || 2, reservedAt: at.toISOString(), durationMin: Number(f.durationMin) || 90, tableId: f.tableId || undefined, note: f.note || undefined };
      await shop.call(initial ? `${API}/reservations/${initial.id}` : `${API}/reservations`, { method: initial ? 'PUT' : 'POST', body });
      onSaved();
    } catch (e) { setError(e instanceof ApiError ? e.message : e instanceof Error ? e.message : t('common.network')); } finally { setBusy(false); }
  }
  return (
    <Sheet visible tall title={initial ? t('rs.resName') : t('rs.resNew')} onClose={onClose} footer={<Btn icon="check" title={t('rs.save')} loading={busy} disabled={!f.guestName.trim()} onPress={save} />}>
      <Stack gap={10}>
        <TextBox label={t('rs.resName')} value={f.guestName} onChangeText={(v) => setF({ ...f, guestName: v })} maxLength={120} />
        <TextBox label={t('rs.resPhone')} value={f.phone} onChangeText={(v) => setF({ ...f, phone: v })} keyboardType="phone-pad" maxLength={40} />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1 }}><NumberBox label={t('rs.resGuests')} value={f.partySize} onChange={(v) => setF({ ...f, partySize: v })} /></View>
          <View style={{ flex: 1 }}><NumberBox label={t('rs.resDuration')} value={f.durationMin} onChange={(v) => setF({ ...f, durationMin: v })} /></View>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1 }}><TextBox label={`${t('rs.resDate')} (AAAA-MM-JJ)`} value={f.date} onChangeText={(v) => setF({ ...f, date: v })} maxLength={10} /></View>
          <View style={{ flex: 1 }}><TextBox label={`${t('rs.resTime')} (HH:MM)`} value={f.time} onChangeText={(v) => setF({ ...f, time: v })} maxLength={5} /></View>
        </View>
        <ThemedText type="smallBold">{t('rs.resTable')}</ThemedText>
        <Chips value={f.tableId} onChange={(v) => setF({ ...f, tableId: v })} options={[{ value: '', label: t('rs.resNoTable') }, ...tables.filter((x) => x.active).map((x) => ({ value: x.id, label: `${x.zone ? `${x.zone} · ` : ''}${x.name}` }))]} />
        <TextBox label={t('rs.resNote')} value={f.note} onChangeText={(v) => setF({ ...f, note: v })} maxLength={300} />
        {error ? <ErrorNote message={error} /> : null}
      </Stack>
    </Sheet>
  );
}

function Reservations({ tables, onSeated, onChanged }: { tables: Table[]; onSeated: (orderId: string) => void; onChanged: () => void }) {
  const { t } = useT();
  const shop = useShop();
  const toast = useToast();
  const [day, setDay] = useState(() => isoDay(new Date()));
  const [list, setList] = useState<Reservation[] | null>(null);
  const [form, setForm] = useState<null | { initial?: Reservation }>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try { setList(await shop.call<Reservation[]>(`${API}/reservations?date=${day}`)); setError(null); } catch (e) { setError(e instanceof ApiError ? e.message : t('common.network')); }
  }, [shop, day, t]);
  useLive(() => { void load(); }, 30000);
  const act = async (fn: () => Promise<unknown>, ok?: string) => { try { await fn(); if (ok) toast(ok); await load(); onChanged(); } catch (e) { toast(e instanceof ApiError ? e.message : t('common.network'), 'danger'); } };
  const status = (r: Reservation, st: string) => act(() => shop.call(`${API}/reservations/${r.id}/status`, { method: 'POST', body: { status: st } }));
  async function seat(r: Reservation) {
    try {
      const res = await shop.call<Reservation>(`${API}/reservations/${r.id}/seat`, { method: 'POST', body: {} });
      toast(t('rs.resSeated')); await load(); onChanged();
      if (res.orderId) onSeated(res.orderId);
    } catch (e) { toast(e instanceof ApiError ? e.message : t('common.network'), 'danger'); }
  }
  const shift = (n: number) => { const d = new Date(`${day}T12:00`); d.setDate(d.getDate() + n); setDay(isoDay(d)); };
  const expected = (list ?? []).filter((r) => r.status === 'BOOKED').reduce((s, r) => s + r.partySize, 0);
  return (
    <Stack gap={10}>
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
        <Btn small variant="secondary" icon="chevron-left" title="" onPress={() => shift(-1)} />
        <ThemedText type="smallBold" style={{ flex: 1, textAlign: 'center' }}>{day} · {t('rs.resExpected', { n: expected })}</ThemedText>
        <Btn small variant="secondary" icon="chevron-right" title="" onPress={() => shift(1)} />
      </View>
      {shop.can('RESERVATIONS', 'create') ? <Btn icon="plus" title={t('rs.resNew')} onPress={() => setForm({})} /> : null}
      {error ? <ErrorNote message={error} onRetry={load} /> : null}
      {!list ? <Skeleton rows={3} height={70} /> : list.length === 0 ? <Empty icon="calendar" title={t('rs.resEmpty')} /> : list.map((r) => (
        <Card key={r.id}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <ThemedText type="smallBold" style={{ flex: 1 }}>{hhmm(r.reservedAt)} · {r.guestName}</ThemedText>
            <Badge tone={RES_TONE[r.status]}>{t(`rs.res.${r.status}`)}</Badge>
            {r.late ? <Badge tone="danger">{t('rs.resLate')}</Badge> : null}
          </View>
          <ThemedText type="small" themeColor="textSecondary">{t('rs.coversN', { n: r.partySize })}{r.phone ? ` · ${r.phone}` : ''} · {r.tableName ? `${t('rs.table')} ${r.zone ? `${r.zone} ` : ''}${r.tableName}` : t('rs.resNoTable')}{r.note ? ` · ${r.note}` : ''}</ThemedText>
          {r.status === 'BOOKED' && shop.can('RESERVATIONS', 'update') ? (
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
              <Btn small icon="chair" title={t('rs.resSeat')} onPress={() => void seat(r)} />
              <Btn small variant="secondary" icon="pen" title="" onPress={() => setForm({ initial: r })} />
              <Btn small variant="secondary" title={t('rs.resNoShow')} onPress={() => void status(r, 'NO_SHOW')} />
              <Btn small variant="danger" title={t('rs.resCancel')} onPress={async () => { if (await confirmAction(t('rs.resCancel'), r.guestName, t('rs.resCancel'), t('ws.close'))) void status(r, 'CANCELLED'); }} />
            </View>
          ) : null}
          {(r.status === 'NO_SHOW' || r.status === 'CANCELLED') && shop.can('RESERVATIONS', 'update') ? <View style={{ marginTop: 8 }}><Btn small variant="secondary" title={t('rs.resReopen')} onPress={() => void status(r, 'BOOKED')} /></View> : null}
          {r.status === 'SEATED' && r.orderId ? <View style={{ marginTop: 8 }}><Btn small variant="secondary" title={r.orderNumber ?? ''} onPress={() => onSeated(r.orderId!)} /></View> : null}
        </Card>
      ))}
      {form ? <ReservationSheet initial={form.initial} tables={tables} day={day} onClose={() => setForm(null)} onSaved={() => { setForm(null); toast(t('rs.resSaved')); void load(); onChanged(); }} /> : null}
    </Stack>
  );
}

const STATE_TONE: Record<string, Tone> = { free: 'neutral', busy: 'primary', cooking: 'warning', ready: 'success', late: 'danger' };

export default function Floor({ item, tab }: PageProps) {
  const { t } = useT();
  const shop = useShop();
  const th = useTheme();
  const toast = useToast();
  const [tabKey, setTabKey] = useState<'floor' | 'orders' | 'reservations' | 'history'>('floor');
  const [tables, setTables] = useState<Table[] | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<null | { table?: Table; order?: Order; channel: string }>(null);
  const [editor, setEditor] = useState(false);
  const delay = num(shop.config?.kitchenDelayMinutes) || 15;
  const { online, items: queue } = useOffline();
  const liveIds = useMemo(() => new Set(queue.filter((i) => i.group).map((i) => i.group as string)), [queue]);
  const localMap = useLocalOrders(shop.shopId, liveIds);
  const localList = Object.values(localMap);

  const load = useCallback(async () => {
    try {
      const [tb, sm, op] = await Promise.all([shop.call<Table[]>(`${API}/tables?all=true`), shop.call<Summary>(`${API}/summary`), shop.call<{ items: Order[] }>(`${API}/orders?status=${tabKey === 'history' ? '' : 'OPEN'}&size=50`)]);
      setTables(tb); setSummary(sm); setOrders(op.items); setError(null);
    } catch (e) { setError(e instanceof ApiError ? e.message : t('common.network')); }
  }, [shop, t, tabKey]);
  useLive(() => { void load(); }, 6000);

  const openTable = async (tb: Table) => {
    if (tb.orderId && localMap[tb.orderId]) { setDrawer({ table: tb, order: localMap[tb.orderId] as unknown as Order, channel: 'DINE_IN' }); return; }
    if (tb.orderId) {
      try { setDrawer({ table: tb, order: await shop.call<Order>(`${API}/orders/${tb.orderId}`), channel: 'DINE_IN' }); } catch (e) { toast(e instanceof ApiError ? e.message : t('common.network'), 'danger'); }
    } else setDrawer({ table: tb, channel: 'DINE_IN' });
  };
  const openOrder = async (o: Order) => {
    const mine = localMap[o.id];
    if (mine) { setDrawer({ order: mine as unknown as Order, channel: mine.channel, table: mine.tableId ? ({ id: mine.tableId, name: mine.tableName ?? '' } as Table) : undefined }); return; }
    try { setDrawer({ order: await shop.call<Order>(`${API}/orders/${o.id}`), channel: o.channel, table: o.tableId ? ({ id: o.tableId, name: o.tableName ?? '' } as Table) : undefined }); } catch (e) { toast(e instanceof ApiError ? e.message : t('common.network'), 'danger'); }
  };
  // tables vues avec les commandes prises sur CE telephone et pas encore envoyees (occupee / liberee localement)
  const tablesView = useMemo(() => (tables ?? []).map((tb) => {
    const mine = localList.find((o) => o.tableId === tb.id && o.status === 'OPEN');
    if (mine) return { ...tb, orderId: mine.id, total: mine.due, openedAt: mine.openedAt, readyCount: 0, pendingCount: mine.lines.filter((l) => l.status === 'SENT').length };
    if (tb.orderId && localMap[tb.orderId]?.status === 'CLOSED') return { ...tb, orderId: null, total: null };
    return tb;
  }), [tables, localList, localMap]);
  const zones = useMemo(() => {
    const m = new Map<string, Table[]>();
    tablesView.filter((x) => x.active).forEach((x) => { const z = x.zone || ''; if (!m.has(z)) m.set(z, []); m.get(z)!.push(x); });
    return [...m.entries()];
  }, [tablesView]);
  const canCreate = shop.can('TABLE_SERVICE', 'create');
  // commandes prises sur ce telephone et pas encore connues du serveur, en tete de liste
  const shownOrders = tabKey === 'history' ? orders : [...localList.filter((o) => o.status === 'OPEN' && !orders.some((x) => x.id === o.id)) as unknown as Order[], ...orders];

  return (
    <Screen tabs={tab} title={shop.tr(item.label)} onRefresh={load}>
      {!online ? <Hint icon="cloud-off" tone="warning">{t('rs.offlineNote')}</Hint> : null}
      {error ? <ErrorNote message={error} onRetry={load} /> : null}
      {summary ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <Badge tone="primary">{t('rs.stat.open')}: {summary.openOrders}</Badge>
          <Badge tone="info">{t('rs.stat.tables')}: {summary.tablesBusy}/{summary.tablesTotal}</Badge>
          <Badge tone={summary.oldestWaitSeconds > delay * 60 ? 'danger' : 'warning'}>{t('rs.stat.waiting')}: {summary.linesWaiting}</Badge>
          <Badge tone={summary.linesReady ? 'success' : 'neutral'}>{t('rs.stat.ready')}: {summary.linesReady}</Badge>
          <Badge tone="neutral">{t('rs.stat.openTotal')}: {shop.money(summary.openTotal)}</Badge>
        </View>
      ) : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 6 }}>
        {canCreate ? <Btn small variant="secondary" icon="bag-shopping" title={t('rs.newTakeaway')} onPress={() => setDrawer({ channel: 'TAKEAWAY' })} /> : null}
        {canCreate && shop.has('DELIVERIES') ? <Btn small variant="secondary" icon="motorcycle" title={t('rs.newDelivery')} onPress={() => setDrawer({ channel: 'DELIVERY' })} /> : null}
        {shop.can('TABLE_SERVICE', 'update') ? <Btn small variant="secondary" icon="gear" title={t('rs.manageTables')} onPress={() => setEditor(true)} /> : null}
      </ScrollView>
      <Chips value={tabKey} onChange={setTabKey} options={[{ value: 'floor', label: t('rs.tab.floor') }, { value: 'orders', label: t('rs.tab.orders') }, ...(shop.has('RESERVATIONS') && shop.can('RESERVATIONS', 'view') ? [{ value: 'reservations' as const, label: t('rs.tab.reservations') }] : []), { value: 'history', label: t('rs.tab.history') }]} />

      {tabKey === 'reservations' ? <Reservations tables={tables ?? []} onChanged={() => void load()} onSeated={(orderId) => void openOrder({ id: orderId, channel: 'DINE_IN' } as Order)} /> : !tables ? <Skeleton rows={4} height={90} /> : tabKey === 'floor' ? (
        zones.length === 0 ? <Empty icon="chair" title={t('rs.noTables')} text={t('rs.noTablesText')} action={shop.can('TABLE_SERVICE', 'update') ? <Btn title={t('rs.addTable')} onPress={() => setEditor(true)} /> : undefined} /> : (
          zones.map(([zone, list]) => (
            <View key={zone || '_'} style={{ gap: 8 }}>
              <SectionTitle title={zone || t('rs.mainRoom')} />
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                {list.map((tb) => {
                  const busy = !!tb.orderId, waited = minutesSince(tb.openedAt);
                  const state = !busy ? 'free' : tb.readyCount > 0 ? 'ready' : tb.pendingCount > 0 ? (waited > delay * 2 ? 'late' : 'cooking') : 'busy';
                  return (
                    <Pressable key={tb.id} onPress={() => void openTable(tb)} accessibilityRole="button" accessibilityLabel={`${t('rs.table')} ${tb.name}`}
                      style={({ pressed }) => ({ width: '30%', minWidth: 96, minHeight: 104, padding: 8, borderRadius: 16, borderWidth: 2, borderColor: state === 'free' ? th.border : state === 'ready' ? '#1d9a5b' : state === 'late' ? '#d63a3a' : state === 'cooking' ? '#d99a06' : th.primary, backgroundColor: th.backgroundElement, alignItems: 'center', justifyContent: 'center', gap: 2, opacity: pressed ? 0.7 : 1 })}>
                      <ThemedText type="subtitle">{tb.name}</ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">{tb.seats} <ThemedText type="small" themeColor="textSecondary">{t('rs.seatsLabel').toLowerCase()}</ThemedText></ThemedText>
                      {busy ? <>
                        <ThemedText type="smallBold">{shop.money(tb.total ?? 0)}</ThemedText>
                        <Badge tone={STATE_TONE[state]}>{tb.readyCount > 0 ? t('rs.readyN', { n: tb.readyCount }) : tb.pendingCount > 0 ? t('rs.cookingN', { n: tb.pendingCount }) : t('rs.served')} · {t('rs.min', { n: waited })}</Badge>
                      </> : <ThemedText type="small" themeColor="textSecondary">{t('rs.free')}</ThemedText>}
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ))
        )
      )   : shownOrders.length === 0 ? <Empty icon="receipt" title={tabKey === 'history' ? t('rs.noHistory') : t('rs.noOpen')} /> : (
        shownOrders.map((o) => (
          <Row key={o.id} icon={o.channel === 'DINE_IN' ? 'chair' : o.channel === 'DELIVERY' ? 'motorcycle' : 'bag-shopping'} title={`${o.number}${o.tableName ? ` · ${t('rs.table')} ${o.tableName}` : ''}`}
            subtitle={`${o.customerName ?? o.serverName ?? ''} · ${tabKey === 'history' ? formatDateTime(o.openedAt, 'fr') : t('rs.min', { n: minutesSince(o.openedAt) })}`}
            right={<View style={{ alignItems: 'flex-end', gap: 4 }}><ThemedText type="smallBold">{shop.money(tabKey === 'history' ? o.total : o.due)}</ThemedText>{o.readyCount > 0 ? <Badge tone="success">{t('rs.readyN', { n: o.readyCount })}</Badge> : tabKey === 'history' ? <Badge tone={o.status === 'CLOSED' ? 'success' : o.status === 'OPEN' ? 'warning' : 'danger'}>{t(`rs.status.${o.status}`)}</Badge> : null}</View>}
            onPress={() => void openOrder(o)} />
        ))
      )}

      {drawer ? <OrderSheet key={drawer.order?.id ?? drawer.table?.id ?? drawer.channel} tableId={drawer.table?.id} tableLabel={drawer.table ? `${t('rs.table')} ${drawer.table.name}` : undefined} initial={drawer.order} channel={drawer.channel} tables={tables ?? []} onClose={() => { setDrawer(null); void load(); }} onChanged={() => void load()} /> : null}
      {editor ? <TablesSheet tables={tables ?? []} onClose={() => setEditor(false)} onChanged={() => void load()} /> : null}
    </Screen>
  );
}
