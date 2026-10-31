import { useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';

import { Icon } from '@/components/icon';
import { errText, OrderCard, PayBadge, StatusBadge } from '@/components/laundry-order';
import { PaymentPanel } from '@/components/payment-panel';
import { PdfButton } from '@/components/pdf-button';
import { ThemedText } from '@/components/themed-text';
import { Badge, Btn, Card, Hint, Input, Screen, Switch, TextBox, useToast } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { useT } from '@/i18n';
import { NetworkError } from '@/lib/api';
import { formatDateTime, uuid } from '@/lib/format';
import { API, fmt, num, type Order } from '@/lib/laundry';
import { useOffline } from '@/lib/offline';
import { initPay, resetPay, settle } from '@/lib/payments';
import { useInfinite } from '@/lib/query';
import { useShop } from '@/lib/shop';
import type { PageProps } from '../registry';

/** Retrait au comptoir : saisie ou scan du ticket, controle du code, encaissement du solde, remise des articles prets. */
export default function LaundryPickup({ item, tab }: PageProps) {
  const { t, lang } = useT();
  const shop = useShop();
  const th = useTheme();
  const toast = useToast();
  const offline = useOffline();
  const params = useLocalSearchParams<{ code?: string }>();
  const cfg = shop.config;
  const methods = shop.ws.manifest.paymentMethods ?? ['CASH'];
  const manager = shop.owner || shop.can('PRODUCTS', 'update');
  const pickId = useRef(uuid());
  const payIds = useRef<string[]>([]);
  const [code, setCode] = useState(params.code ?? '');
  const [order, setOrder] = useState<Order | null>(null);
  const [candidates, setCandidates] = useState<Order[]>([]);
  const [looking, setLooking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sel, setSel] = useState<string[]>([]);
  const [pin, setPin] = useState('');
  const [lost, setLost] = useState(false);
  const [proof, setProof] = useState('');
  const [receivedBy, setReceivedBy] = useState('');
  const [onCredit, setOnCredit] = useState(false);
  const [pay, setPay] = useState(() => initPay(methods[0]));
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ queued?: boolean; order: Order } | null>(null);
  // tickets prets : copie gardee sur l'appareil, pour retrouver un ticket sans reseau
  const ready = useInfinite<Order>(`${API}/orders`, { status: 'READY' }, { size: 100 });

  const choose = (o: Order) => {
    pickId.current = uuid(); payIds.current = [];
    setOrder(o); setCandidates([]); setSel(o.items.filter((i) => i.status === 'READY').map((i) => i.id));
    setPin(''); setLost(false); setProof(''); setReceivedBy(''); setOnCredit(false); setPay((p) => resetPay(p));
  };
  async function load(id: string, online = true) { return shop.call<Order>(`${API}/orders/${id}`).catch((e) => { if (online) throw e; throw e; }); }

  async function look(value: string = code) {
    const c = value.trim();
    if (!c) return;
    setLooking(true); setError(null); setDone(null); setOrder(null); setCandidates([]);
    try {
      choose((await shop.call<{ order: Order }>(`${API}/orders/lookup?code=${encodeURIComponent(c)}`)).order);
    } catch (e) {
      const low = c.toLowerCase();
      if (e instanceof NetworkError) {
        const hits = ready.items.filter((o) => o.number.toLowerCase().endsWith(low) || (o.partyName ?? '').toLowerCase().includes(low) || (o.customerPhone ?? '').includes(c));
        if (hits.length === 0) setError(t('ld.notFoundOffline'));
        else if (hits.length === 1) { try { choose(await load(hits[0].id, false)); } catch { setError(t('ld.notFoundOffline')); } } else setCandidates(hits);
      } else if ((e as { status?: number }).status === 404) {
        try {
          const list = await shop.call<{ items: Order[] }>(`${API}/orders?q=${encodeURIComponent(c)}&status=READY,IN_PROGRESS,RECEIVED&size=10`);
          if (list.items.length === 0) setError(t('ld.notFound')); else if (list.items.length === 1) choose(await load(list.items[0].id)); else setCandidates(list.items);
        } catch (e2) { setError(errText(e2, t('common.error'))); }
      } else setError(errText(e, t('common.error')));
    } finally { setLooking(false); }
  }
  useEffect(() => {
    if (!params.code) return undefined;
    const timer = setTimeout(() => void look(params.code as string), 0);
    return () => clearTimeout(timer);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const readyItems = order?.items.filter((i) => i.status === 'READY') ?? [];
  const picked = readyItems.filter((i) => sel.includes(i.id));
  const due = order ? (picked.length === readyItems.length ? num(order.balance) : Math.min(num(order.balance), picked.reduce((s, i) => s + num(i.lineTotal), 0))) : 0;
  const sett = settle(pay, due);
  const needCode = cfg.requirePickupCode !== false;
  const codeOk = !needCode || (lost ? Boolean(proof.trim() && receivedBy.trim()) : pin.trim().length > 0);
  const creditOk = onCredit && manager && cfg.allowPickupOnCredit === true && Boolean(order?.partyId);
  const payOk = due <= 0 || sett.remaining <= 0 || creditOk;
  const closed = order ? ['CANCELLED', 'ABANDONED'].includes(order.status) : false;
  const canPickup = !!order && picked.length > 0 && codeOk && payOk && sett.valid && !closed && shop.can('LAUNDRY_ORDERS', 'update');

  async function confirm() {
    if (!order) return;
    setBusy(true); setError(null);
    try {
      while (payIds.current.length < sett.payments.length) payIds.current.push(uuid());
      const payments = sett.payments.map((p, i) => ({ id: payIds.current[i], method: p.method, amount: p.amount, reference: p.reference }));
      const body = { id: pickId.current, itemIds: picked.map((i) => i.id), code: lost ? undefined : pin.trim() || undefined, ticketLost: lost || undefined, idProof: lost ? proof.trim() : undefined, receivedBy: receivedBy.trim() || undefined, allowUnpaid: creditOk || undefined, payments };
      const res = await offline.submit<Order>({ id: pickId.current, shopId: shop.shopId, method: 'POST', path: `${API}/orders/${order.id}/pickup`, body, kind: 'laundry-pickup', queuedBody: { ...body, offline: true, at: new Date().toISOString() }, label: `${t('ld.labelPickup')} · ${order.number}` });
      if (res.queued) { setDone({ queued: true, order }); toast(t('ld.pickupQueued'), 'warning'); } else { setDone({ order: res.data }); toast(t('ld.pickupDone', { number: res.data.number })); }
      setOrder(null); setCode('');
    } catch (e) { setError(errText(e, t('common.error'))); } finally { setBusy(false); }
  }

  return (
    <Screen tabs={tab} keyboard title={shop.tr(item.label)} subtitle={t('ld.pickupSubtitle')}>
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
        <View style={{ flex: 1 }}><Input value={code} onChangeText={setCode} placeholder={t('ld.lookupHint')} autoCapitalize="characters" autoCorrect={false} returnKeyType="search" onSubmitEditing={() => void look()} accessibilityLabel={t('ld.lookupHint')} /></View>
        <Btn title={t('ld.lookup')} icon="magnifying-glass" loading={looking} disabled={!code.trim()} onPress={() => void look()} />
      </View>
      {error ? <Hint tone="danger" icon="triangle-exclamation">{error}</Hint> : null}
      {!offline.online ? <Hint tone="warning" icon="cloud-arrow-up">{t('ld.pickupOfflineHint')}</Hint> : null}
      {done ? (
        <Card tone="success">
          <ThemedText type="smallBold">{done.queued ? t('ld.pickupQueuedTitle') : t('ld.pickupDone', { number: done.order.number })}</ThemedText>
          <ThemedText type="small">{done.queued ? t('ld.pickupQueuedText') : t('ld.pickupDoneText', { count: done.order.deliveredCount ?? 0 })}</ThemedText>
        </Card>
      ) : null}
      {candidates.length > 0 ? (
        <View style={{ gap: 8 }}>
          <ThemedText type="smallBold">{t('ld.pickCandidate')}</ThemedText>
          {candidates.map((c) => <OrderCard key={c.id} o={c} onPress={async () => { try { choose(await load(c.id)); } catch (e) { setError(errText(e, t('common.error'))); } }} />)}
        </View>
      ) : null}
      {order ? (
        <View style={{ gap: 12 }}>
          <Card>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
              <View style={{ flex: 1 }}><ThemedText type="smallBold">{order.partyName ?? order.customerName ?? t('ld.walkIn')}</ThemedText><ThemedText type="small" themeColor="textSecondary">{order.number}{order.customerPhone ? ` · ${order.customerPhone}` : ''}</ThemedText></View>
              <StatusBadge status={order.status} prev={order.prevStatus} /><PayBadge order={order} />
            </View>
            {order.status === 'DISPUTE' ? <ThemedText type="small" themeColor="warning">{t('ld.disputeNote')}</ThemedText> : null}
            {closed ? <ThemedText type="small" themeColor="danger">{t('ld.closedTicket')}</ThemedText> : null}
            {readyItems.length === 0 && !closed ? <ThemedText type="small" themeColor="warning">{t('ld.nothingReady', { date: order.promisedAt ? formatDateTime(order.promisedAt, lang) : '—' })}</ThemedText> : null}
          </Card>
          {order.items.map((i) => {
            const isReady = i.status === 'READY';
            const on = sel.includes(i.id);
            return (
              <Pressable key={i.id} disabled={!isReady} onPress={() => setSel((s) => (s.includes(i.id) ? s.filter((x) => x !== i.id) : [...s, i.id]))} accessibilityRole="checkbox" accessibilityState={{ checked: on, disabled: !isReady }}
                style={{ flexDirection: 'row', gap: 10, alignItems: 'center', padding: 12, borderRadius: 14, backgroundColor: th.backgroundElement, borderWidth: 2, borderColor: on ? th.primary : 'transparent', opacity: isReady ? 1 : 0.6 }}>
                {isReady ? <Icon name={on ? 'square-check' : 'square'} size={18} color={on ? th.primary : th.textSecondary} /> : null}
                <View style={{ flex: 1 }}>
                  <ThemedText type="smallBold">{i.garmentName} <ThemedText type="small" themeColor="textSecondary">· {i.serviceName}{num(i.quantity) > 1 ? ` × ${fmt(i.quantity)}` : ''}</ThemedText></ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">{i.tagCode}{i.rack ? ` · ${t('ld.rack')} ${i.rack}` : ''}</ThemedText>
                </View>
                <Badge tone={isReady ? 'success' : i.status === 'DELIVERED' ? 'info' : 'warning'}>{t(`ld.s.${i.status}`)}</Badge>
              </Pressable>
            );
          })}
          {readyItems.length > 0 ? (
            <>
              <Card>
                {([[t('ld.total'), shop.money(order.total)], [t('ld.paid'), shop.money(order.paidTotal)], [t('ld.balance'), shop.money(order.balance)]] as [string, string][]).map((r) => (
                  <View key={r[0]} style={{ flexDirection: 'row', justifyContent: 'space-between' }}><ThemedText type="small" themeColor="textSecondary">{r[0]}</ThemedText><ThemedText type="smallBold" themeColor={r[0] === t('ld.balance') && num(order.balance) > 0 ? 'danger' : undefined}>{r[1]}</ThemedText></View>
                ))}
              </Card>
              {needCode ? (
                <Card>
                  <ThemedText type="smallBold">{t('ld.codeCheck')}</ThemedText>
                  {!lost ? <TextBox label={t('ld.pickupCode')} value={pin} onChangeText={setPin} keyboardType="number-pad" maxLength={12} placeholder="000000" /> : (
                    <>
                      <TextBox label={t('ld.idProof')} value={proof} onChangeText={setProof} maxLength={80} placeholder={t('ld.idProofHint')} />
                      <TextBox label={t('ld.receivedBy')} value={receivedBy} onChangeText={setReceivedBy} maxLength={80} />
                    </>
                  )}
                  <Switch value={lost} onChange={setLost} label={t('ld.ticketLost')} hint={lost ? t('ld.lostLogged') : undefined} />
                </Card>
              ) : null}
              {due > 0 ? (
                <Card>
                  <ThemedText type="smallBold">{t('ld.balanceToCollect')} : {shop.money(due)}</ThemedText>
                  {!creditOk ? <PaymentPanel pay={pay} setPay={setPay} due={due} methods={methods} res={sett} money={shop.money} currency={shop.currency} /> : null}
                  {!creditOk && sett.remaining > 0 ? <ThemedText type="small" themeColor="danger">{t('ld.balanceDueMsg', { amount: shop.money(sett.remaining) })}</ThemedText> : null}
                  {manager && cfg.allowPickupOnCredit === true && order.partyId ? <Switch value={onCredit} onChange={setOnCredit} label={t('ld.pickupOnCredit')} /> : null}
                </Card>
              ) : null}
              <Btn icon="check-double" title={busy ? t('ws.saving') : t('ld.confirmPickup', { count: picked.length })} disabled={!canPickup} loading={busy} onPress={() => void confirm()} />
              <PdfButton small path={`/api/shop/pdf/laundry/orders/${order.id}/ticket`} name={`ticket-${order.number}.pdf`} label={t('ld.printTicket')} />
            </>
          ) : null}
        </View>
      ) : null}
      {!order && !done && candidates.length === 0 && !error ? <Hint icon="lightbulb">{t('ld.pickupTip')}</Hint> : null}
    </Screen>
  );
}
