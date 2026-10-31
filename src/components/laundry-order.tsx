import { useRef, useState } from 'react';
import { Linking, Pressable, View } from 'react-native';

import { Icon } from '@/components/icon';
import { PaymentPanel } from '@/components/payment-panel';
import { PdfButton } from '@/components/pdf-button';
import { ThemedText } from '@/components/themed-text';
import { Badge, Btn, Card, Chips, ErrorNote, Hint, Sheet, Skeleton, TextBox, useToast } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { useT } from '@/i18n';
import { ApiError } from '@/lib/api';
import { confirmAction } from '@/lib/confirm';
import { formatDate, formatDateTime, uuid } from '@/lib/format';
import { API, fmt, num, STATUS_ICON, TONE, type Order, type Status } from '@/lib/laundry';
import { initPay, resetPay, settle } from '@/lib/payments';
import { useQuery } from '@/lib/query';
import { useShop } from '@/lib/shop';

export const errText = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);

export function StatusBadge({ status, prev }: { status: Status; prev?: Status }) {
  const { t } = useT();
  return <Badge tone={TONE[status] ?? 'info'}>{t(`ld.s.${status}`)}{status === 'DISPUTE' && prev ? ` · ${t(`ld.s.${prev}`)}` : ''}</Badge>;
}

export function PayBadge({ order }: { order: Pick<Order, 'balance' | 'paidTotal' | 'status'> }) {
  const { t } = useT();
  if (order.status === 'CANCELLED') return null;
  const s = num(order.balance) <= 0 ? 'PAID' : num(order.paidTotal) > 0 ? 'PARTIAL' : 'UNPAID';
  return <Badge tone={s === 'PAID' ? 'success' : s === 'PARTIAL' ? 'warning' : 'danger'}>{t(`ld.pay.${s}`)}</Badge>;
}

/** Ligne de liste d'un ticket : numero, client, delai promis, reste a payer. */
export function OrderCard({ o, onPress, children }: { o: Order; onPress: () => void; children?: React.ReactNode }) {
  const { t, lang } = useT();
  const shop = useShop();
  const th = useTheme();
  return (
    <Card onPress={onPress}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <ThemedText type="smallBold" style={{ flex: 1 }}>{o.number}</ThemedText>
        {o.express ? <Badge tone="warning">{t('ld.express')}</Badge> : null}
        <StatusBadge status={o.status} />
      </View>
      <ThemedText type="small" themeColor="textSecondary">
        {[o.partyName ?? t('ld.walkIn'), o.customerPhone, `${o.readyCount ?? 0}/${o.itemsCount} ${t('ld.itemsReady')}`, o.rack && `${t('ld.rack')} ${o.rack}`, o.promisedAt && `${t('ld.promised')} ${formatDate(o.promisedAt, lang)}`].filter(Boolean).join(' · ')}
      </ThemedText>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        {o.overdue ? <ThemedText type="small" themeColor="danger">{t('ld.late', { count: o.daysLate ?? 0 })}</ThemedText> : <View />}
        <View style={{ alignItems: 'flex-end' }}>
          <ThemedText type="smallBold">{shop.money(o.total)}</ThemedText>
          {num(o.balance) > 0 ? <ThemedText type="small" style={{ color: th.danger }}>{t('ld.balanceDue', { amount: shop.money(o.balance) })}</ThemedText> : null}
        </View>
      </View>
      {children}
    </Card>
  );
}

type Ev = { id: string; kind: string; toStatus?: Status; note?: string; actor?: string; at: string };

/** Detail d'un ticket : articles et avancement, encaissement du solde, relance, annulation, impressions, historique. */
export function OrderSheet({ id, onClose, onChanged, onPickup, onClaim }: { id: string; onClose: () => void; onChanged?: () => void; onPickup?: (o: Order) => void; onClaim?: (o: Order) => void }) {
  const { t, lang } = useT();
  const shop = useShop();
  const toast = useToast();
  const th = useTheme();
  const q = useQuery<Order>(`${API}/orders/${id}`);
  const ev = useQuery<Ev[]>(`${API}/orders/${id}/events`);
  const methods = shop.ws.manifest.paymentMethods ?? ['CASH'];
  const [pay, setPay] = useState(() => initPay(methods[0]));
  const payId = useRef(uuid());
  const [sel, setSel] = useState<string[]>([]);
  const [panel, setPanel] = useState<null | 'pay' | 'remind' | 'cancel'>(null);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [channel, setChannel] = useState('WHATSAPP');
  const [refund, setRefund] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const o = q.data;
  const canUpdate = shop.can('LAUNDRY_ORDERS', 'update');
  const canCancel = shop.can('LAUNDRY_ORDERS', 'delete') && shop.can('SALES', 'delete');

  async function run(path: string, body: unknown, done: string) {
    setBusy(true); setError(null);
    try { await shop.call(`${API}/orders/${id}${path}`, { method: 'POST', body }); toast(done); setSel([]); setPanel(null); onChanged?.(); await q.reload(); await ev.reload(); return true; } catch (e) { setError(errText(e, t('common.error'))); return false; } finally { setBusy(false); }
  }

  if (!o) return <Sheet visible tall title="…" onClose={onClose}>{q.error ? <ErrorNote message={q.error} onRetry={q.reload} /> : <Skeleton rows={4} height={70} />}</Sheet>;
  const closed = o.status === 'CANCELLED' || o.status === 'ABANDONED';
  const due = num(o.balance);
  const sett = settle(pay, due);
  const itemIds = sel.length ? sel : undefined;
  const scope = o.items.filter((i) => (sel.length ? sel.includes(i.id) : true));
  const canProgress = scope.some((i) => i.status === 'RECEIVED' || i.status === 'READY');
  const canReady = scope.some((i) => i.status === 'IN_PROGRESS');
  const setStatus = (status: Status) => run('/status', { status, itemIds }, t('ld.statusDone', { status: t(`ld.s.${status}`) }));
  const toggle = (iid: string) => setSel((s) => (s.includes(iid) ? s.filter((x) => x !== iid) : [...s, iid]));
  const openMsg = async (kind: string) => {
    try {
      const m = await shop.call<{ whatsappUrl?: string; smsUrl?: string }>(`${API}/orders/${id}/message?kind=${kind}`);
      const url = channel === 'SMS' ? m.smsUrl : m.whatsappUrl;
      if (url) await Linking.openURL(url);
    } catch (e) { setError(errText(e, t('common.error'))); }
  };

  return (
    <Sheet visible tall title={`${t('ld.ticket')} ${o.number}`} onClose={onClose}
      footer={onPickup && !closed && num(o.readyCount) > 0 && canUpdate ? <Btn title={t('ld.pickup')} icon="check-double" onPress={() => onPickup(o)} /> : undefined}>
      {error ? <ErrorNote message={error} /> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
        <ThemedText type="smallBold" style={{ flex: 1 }}>{o.partyName ?? o.customerName ?? t('ld.walkIn')}{o.customerPhone ? ` · ${o.customerPhone}` : ''}</ThemedText>
        <StatusBadge status={o.status} prev={o.prevStatus} />{o.express ? <Badge tone="warning">{t('ld.express')}</Badge> : null}<PayBadge order={o} />
      </View>
      <Card>
        {([
          [t('ld.received'), o.receivedAt && formatDateTime(o.receivedAt, lang)],
          [t('ld.promised'), o.promisedAt ? `${formatDateTime(o.promisedAt, lang)}${o.overdue ? ` (${t('ld.late', { count: o.daysLate ?? 0 })})` : ''}` : '—'],
          [t('ld.total'), shop.money(o.total)], [t('ld.paid'), shop.money(o.paidTotal)], [t('ld.balance'), shop.money(due)],
          o.rack ? [t('ld.rack'), o.rack] : null, o.pickupCode && !closed ? [t('ld.pickupCode'), o.pickupCode] : null, o.saleNumber ? [t('ld.sale'), o.saleNumber] : null,
          o.deliveryRequested ? [t('ld.delivery'), o.deliveryAddress ?? '✓'] : null,
        ] as ([string, string | undefined | null] | null)[]).filter(Boolean).map((r) => (
          <View key={r![0]} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
            <ThemedText type="small" themeColor="textSecondary">{r![0]}</ThemedText><ThemedText type="smallBold" style={{ flexShrink: 1, textAlign: 'right' }}>{r![1] ?? '—'}</ThemedText>
          </View>
        ))}
      </Card>
      {o.notes ? <Hint icon="note-sticky">{o.notes}</Hint> : null}
      {o.cancelReason ? <Hint tone="danger" icon="ban" title={t('ld.cancelReason')}>{o.cancelReason}</Hint> : null}
      {num(o.openClaims) > 0 ? <Hint tone="danger" icon="triangle-exclamation">{t('ld.openClaims', { count: o.openClaims ?? 0 })}</Hint> : null}

      <ThemedText type="smallBold">{t('ld.items')} ({o.items.length})</ThemedText>
      {canUpdate && !closed ? <ThemedText type="small" themeColor="textSecondary">{t('ld.selectHint')}</ThemedText> : null}
      {o.items.map((i) => {
        const selectable = canUpdate && !closed && ['RECEIVED', 'IN_PROGRESS', 'READY'].includes(i.status);
        const on = sel.includes(i.id);
        return (
          <Pressable key={i.id} disabled={!selectable} onPress={() => toggle(i.id)} accessibilityRole="checkbox" accessibilityState={{ checked: on, disabled: !selectable }}
            style={{ flexDirection: 'row', gap: 10, padding: 12, borderRadius: 14, backgroundColor: th.backgroundElement, borderWidth: 2, borderColor: on ? th.primary : 'transparent', opacity: ['DELIVERED', 'CANCELLED', 'ABANDONED'].includes(i.status) ? 0.65 : 1 }}>
            {selectable ? <Icon name={on ? 'square-check' : 'square'} size={18} color={on ? th.primary : th.textSecondary} /> : null}
            <View style={{ flex: 1, gap: 2 }}>
              <ThemedText type="smallBold">{i.garmentName} <ThemedText type="small" themeColor="textSecondary">· {i.serviceName}{i.pricingMode === 'PER_KG' ? ` · ${fmt(i.weightKg)} kg` : num(i.quantity) > 1 ? ` × ${fmt(i.quantity)}` : ''}</ThemedText></ThemedText>
              <ThemedText type="small" themeColor="textSecondary">{[i.tagCode, [i.color, i.brand, i.size].filter(Boolean).join(' / ')].filter(Boolean).join(' · ')}</ThemedText>
              {(i.defects?.length || i.conditionNotes) ? <ThemedText type="small" themeColor="warning">{[...(i.defects ?? []).map((d) => t(`ld.defect.${d}`)), i.conditionNotes].filter(Boolean).join(' · ')}</ThemedText> : null}
              {i.instructions ? <ThemedText type="small" themeColor="textSecondary">{i.instructions}</ThemedText> : null}
              {num(i.redoCount) > 0 ? <ThemedText type="small" themeColor="danger">{t('ld.redo', { count: i.redoCount ?? 0 })}</ThemedText> : null}
            </View>
            <View style={{ alignItems: 'flex-end', gap: 4 }}>
              <Badge tone={TONE[i.status] ?? 'info'}>{t(`ld.s.${i.status}`)}</Badge>
              <ThemedText type="smallBold">{i.covered ? t('ld.covered') : shop.money(i.lineTotal)}</ThemedText>
            </View>
          </Pressable>
        );
      })}
      {canUpdate && !closed ? (
        <View style={{ gap: 8 }}>
          {canProgress ? <Btn variant="secondary" title={t('ld.toProgress')} icon={STATUS_ICON.IN_PROGRESS} disabled={busy} onPress={() => void setStatus('IN_PROGRESS')} /> : null}
          {canReady ? <Btn title={t('ld.toReady')} icon="check-double" disabled={busy} onPress={() => void setStatus('READY')} /> : null}
          {o.items.some((i) => i.status === 'READY' || i.status === 'IN_PROGRESS') ? <Btn variant="ghost" small title={t('ld.toReceived')} disabled={busy} onPress={() => void setStatus('RECEIVED')} /> : null}
        </View>
      ) : null}

      {!closed ? (
        <View style={{ gap: 8 }}>
          {due > 0 && shop.can('SALES', 'update') ? <Btn variant="secondary" icon="coins" title={t('ld.collectBalance')} onPress={() => setPanel(panel === 'pay' ? null : 'pay')} /> : null}
          {canUpdate ? <Btn variant="secondary" icon="bell" title={t('ld.remind')} onPress={() => setPanel(panel === 'remind' ? null : 'remind')} /> : null}
          {onClaim && shop.has('LAUNDRY_CLAIMS') && shop.can('LAUNDRY_CLAIMS', 'create') ? <Btn variant="secondary" icon="triangle-exclamation" title={t('ld.newClaim')} onPress={() => onClaim(o)} /> : null}
          {canCancel && num(o.deliveredCount) === 0 ? <Btn variant="danger" small title={t('ld.cancelTicket')} onPress={() => setPanel('cancel')} /> : null}
        </View>
      ) : null}

      {panel === 'pay' ? (
        <Card>
          <ThemedText type="smallBold">{t('ld.balance')} : {shop.money(due)}</ThemedText>
          <PaymentPanel pay={pay} setPay={setPay} due={due} methods={methods} res={sett} money={shop.money} currency={shop.currency} />
          <Btn title={t('ld.collect', { amount: shop.money(sett.paid) })} disabled={busy || sett.paid <= 0 || !sett.valid} loading={busy} onPress={async () => {
            const p = sett.payments[0];
            const ok = await run('/payments', { id: payId.current, method: p.method, amount: Math.min(sett.paid, due), reference: p.reference }, t('ld.paymentDone'));
            if (ok) { payId.current = uuid(); setPay((x) => resetPay(x)); }
          }} />
        </Card>
      ) : null}
      {panel === 'remind' ? (
        <Card>
          <Chips scroll={false} value={channel} onChange={setChannel} options={['WHATSAPP', 'SMS', 'CALL', 'OTHER'].map((c) => ({ value: c, label: t(`ld.ch.${c}`) }))} />
          {channel === 'WHATSAPP' || channel === 'SMS' ? (
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              <Btn small variant="secondary" title={t('ld.openMessage')} onPress={() => void openMsg(o.status === 'READY' ? 'READY' : 'RECEIVED')} />
              <Btn small variant="secondary" title={t('ld.openReminder')} onPress={() => void openMsg('REMINDER')} />
            </View>
          ) : null}
          <TextBox label={t('ld.note')} value={note} onChangeText={setNote} />
          <Btn title={t('ld.logReminder')} loading={busy} onPress={() => void run('/reminders', { channel, note: note || undefined }, t('ld.reminderLogged'))} />
        </Card>
      ) : null}
      {panel === 'cancel' ? (
        <Card tone="danger">
          <ThemedText type="small">{t('ld.cancelHelp')}</ThemedText>
          <TextBox label={t('ld.cancelReason')} value={reason} onChangeText={setReason} multiline />
          {num(o.paidTotal) > 0 ? <Pressable onPress={() => setRefund(!refund)} style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}><Icon name={refund ? 'square-check' : 'square'} size={18} color={th.primary} /><ThemedText type="small" style={{ flex: 1 }}>{t('ld.refund', { amount: shop.money(o.paidTotal) })}</ThemedText></Pressable> : null}
          <Btn variant="danger" title={t('ld.cancelTicket')} disabled={busy || !reason.trim()} onPress={async () => { if (await confirmAction(t('ld.cancelTitle'), t('ld.cancelText'), t('ld.cancelTicket'), t('common.cancel'))) void run('/cancel', { reason: reason.trim(), refund }, t('ld.cancelled')); }} />
        </Card>
      ) : null}

      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        <PdfButton small path={`/api/shop/pdf/laundry/orders/${o.id}/ticket`} name={`ticket-${o.number}.pdf`} label={t('ld.printTicket')} />
        <PdfButton small path={`/api/shop/pdf/laundry/orders/${o.id}/labels`} name={`etiquettes-${o.number}.pdf`} label={t('ld.printLabels')} />
        <PdfButton small path={`/api/shop/pdf/laundry/orders/${o.id}`} name={`ticket-A4-${o.number}.pdf`} label="A4" />
      </View>

      {ev.data && ev.data.length > 0 ? (
        <View style={{ gap: 6 }}>
          <ThemedText type="smallBold">{t('ld.timeline')}</ThemedText>
          {ev.data.map((e) => (
            <ThemedText key={e.id} type="small" themeColor="textSecondary">
              {formatDateTime(e.at, lang)} · <ThemedText type="smallBold">{t(`ld.ev.${e.kind}`) === `ld.ev.${e.kind}` ? e.kind : t(`ld.ev.${e.kind}`)}</ThemedText>{e.toStatus ? ` → ${t(`ld.s.${e.toStatus}`)}` : ''}{e.note ? ` · ${e.note}` : ''}{e.actor ? ` · ${e.actor}` : ''}
            </ThemedText>
          ))}
        </View>
      ) : null}
      {o.payments && o.payments.length > 0 ? (
        <View style={{ gap: 6 }}>
          <ThemedText type="smallBold">{t('ld.payments')}</ThemedText>
          {o.payments.map((p) => (
            <View key={p.id} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <ThemedText type="small" themeColor="textSecondary">{t(`ws.m.${p.method}`)}{p.reference ? ` · ${p.reference}` : ''}{p.paidAt ? ` · ${formatDate(p.paidAt, lang)}` : ''}</ThemedText>
              <ThemedText type="smallBold" themeColor={p.direction === 'OUT' ? 'danger' : undefined}>{p.direction === 'OUT' ? '−' : ''}{shop.money(p.amount)}</ThemedText>
            </View>
          ))}
        </View>
      ) : null}
    </Sheet>
  );
}
