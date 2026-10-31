import { useMemo, useRef, useState } from 'react';
import { View } from 'react-native';

import { PartyPicker } from '@/components/party-picker';
import { PaymentPanel } from '@/components/payment-panel';
import { ProductPicker } from '@/components/product-picker';
import { ThemedText } from '@/components/themed-text';
import { Btn, Chips, Hint, NumberBox, Row, Sheet, TextBox } from '@/components/ui';
import { useT } from '@/i18n';
import { ApiError } from '@/lib/api';
import { num, uuid, type Product } from '@/lib/format';
import { useOffline } from '@/lib/offline';
import { initPay, resetPay, settle } from '@/lib/payments';
import { patchAppt, patchTicket } from '@/lib/salon-local';
import { useShop } from '@/lib/shop';

export type SalonAppt = {
  id: string; number?: string; status?: string; customerName?: string | null; partyId?: string | null; stylistId?: string | null; stylistName?: string | null;
  group?: string; ticketId?: string;
  services: { id?: string; name: string; unitPrice: number | string; durationMin?: number; stylistName?: string | null; stylistId?: string | null; packageId?: string | null }[];
};
export type CheckoutResult = { queued?: boolean; sale: { total: number | string; id?: string } };

/** Encaissement d'un rendez-vous du salon : prestations, produits ajoutes, remise, pourboire, paiement. Hors ligne : part dans la file. */
export function SalonCheckout({ appt, stylists, onClose, onDone }: { appt: SalonAppt; stylists: { id: string; name: string }[]; onClose: () => void; onDone: (r: CheckoutResult) => void }) {
  const { t } = useT();
  const shop = useShop();
  const outbox = useOffline();
  const methods = shop.ws.manifest.paymentMethods?.length ? shop.ws.manifest.paymentMethods : ['CASH'];
  const [partyId, setPartyId] = useState<string | null>(appt.partyId ?? null);
  const [extras, setExtras] = useState<{ product: Product; quantity: number }[]>([]);
  const [picker, setPicker] = useState<Product | null>(null);
  const [discount, setDiscount] = useState(0);
  const [reason, setReason] = useState('');
  const [tip, setTip] = useState('');
  const [tipStylist, setTipStylist] = useState(appt.stylistId ?? '');
  const [pay, setPay] = useState(() => initPay(methods[0]));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const saleId = useRef(uuid());
  const canDiscount = shop.owner || shop.can('SALES', 'update');

  const gross = useMemo(() => appt.services.reduce((a, s) => a + (s.packageId ? 0 : num(s.unitPrice)), 0) + extras.reduce((a, x) => a + num(x.product.salePrice) * x.quantity, 0), [appt, extras]);
  const due = Math.round((gross - (gross * discount) / 100) * 100) / 100;
  const sett = settle(pay, due);
  const canCredit = partyId != null;
  const valid = (due === 0 || (sett.valid && (sett.remaining === 0 || canCredit))) && (discount === 0 || reason.trim().length > 0);
  const fresh = () => { saleId.current = uuid(); };

  async function submit() {
    setBusy(true); setError(null);
    try {
      const body = {
        saleId: saleId.current, partyId: partyId || undefined, discountPercent: discount || undefined, discountReason: discount ? reason.trim() : undefined,
        tip: num(tip) || undefined, tipStylistId: num(tip) ? tipStylist || undefined : undefined, extras: extras.map((x) => ({ productId: x.product.id, quantity: x.quantity })),
        payments: due === 0 ? [] : sett.payments.map((p) => ({ id: uuid(), method: p.method, amount: p.amount, reference: p.reference })),
      };
      const group = appt.group ?? appt.id;
      const hasPending = outbox.items.some((i) => i.state === 'pending' && i.group === group);
      const sent = await outbox.submit<{ appointment: unknown; sale: { total: number; id: string } }>({ id: uuid(), shopId: shop.shopId, method: 'POST', path: `/api/shop/salon/appointments/${appt.id}/checkout`, body,
        queuedBody: { ...body, offline: true, at: new Date().toISOString() }, kind: 'salon', label: `${t('sl.checkout')} · ${appt.customerName ?? appt.number ?? ''}`, group, forceQueue: hasPending });
      setPay((p) => resetPay(p));
      if (sent.queued) {
        patchAppt(shop.shopId, appt.id, { status: 'DONE' });
        if (appt.ticketId) patchTicket(shop.shopId, appt.ticketId, { status: 'DONE' });
        onDone({ queued: true, sale: { total: due } });
      } else onDone({ sale: sent.data.sale });
    } catch (e) { setError(e instanceof ApiError ? e.message : t('common.network')); } finally { setBusy(false); }
  }

  return (
    <Sheet visible title={t('sl.checkout')} onClose={onClose} tall
      footer={<Btn icon="check" title={busy ? t('ws.saving') : t('ws.charge', { amount: shop.money(due) })} loading={busy} disabled={!valid} onPress={() => void submit()} />}>
      <View style={{ gap: 12 }}>
        {error ? <Hint tone="danger">{error}</Hint> : null}
        <ThemedText type="small" themeColor="textSecondary">{appt.customerName ?? t('sl.walkIn')} · {appt.stylistName ?? t('sl.noPref')}</ThemedText>
        {appt.services.map((s, i) => <Row key={i} title={s.name} meta={shop.money(s.packageId ? 0 : num(s.unitPrice))} subtitle={s.packageId ? t('sl.fromPackage') : undefined} />)}
        {extras.map((x, i) => <Row key={`x${i}`} title={`${x.quantity}× ${x.product.name}`} meta={shop.money(num(x.product.salePrice) * x.quantity)} right={<Btn small variant="ghost" title="−" onPress={() => { fresh(); setExtras((a) => a.filter((_, j) => j !== i)); }} />} />)}
        {shop.has('PRODUCTS') ? <ProductPicker label={t('sl.addProduct')} value={picker} stockedOnly onChange={(p) => { if (!p) return; fresh(); setExtras((a) => (a.some((x) => x.product.id === p.id) ? a.map((x) => (x.product.id === p.id ? { ...x, quantity: x.quantity + 1 } : x)) : [...a, { product: p, quantity: 1 }])); setPicker(null); }} /> : null}
        {shop.can('CUSTOMERS', 'view') ? <PartyPicker role="CUSTOMER" label={shop.v('customer')} value={partyId} onChange={(id) => { fresh(); setPartyId(id); }} /> : null}
        {canDiscount ? (
          <View style={{ gap: 6 }}>
            <ThemedText type="small">{t('rs.discount')}</ThemedText>
            <Chips scroll={false} value={String(discount)} onChange={(v) => { fresh(); setDiscount(Number(v)); }} options={[0, 5, 10, 20, 50].map((v) => ({ value: String(v), label: v === 0 ? t('rs.noDiscount') : `${v} %` }))} />
            {discount > 0 ? <TextBox label={t('rs.discountReason')} value={reason} onChangeText={setReason} maxLength={120} /> : null}
          </View>
        ) : null}
        {shop.has('STYLIST_COMMISSIONS') ? (
          <View style={{ gap: 6 }}>
            <NumberBox label={t('sl.tip')} value={tip} onChange={setTip} />
            {stylists.length > 0 ? <Chips value={tipStylist} onChange={setTipStylist} options={stylists.map((s) => ({ value: s.id, label: s.name }))} /> : null}
          </View>
        ) : null}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><ThemedText type="smallBold">{t('rs.toPay')}</ThemedText><ThemedText type="subtitle">{shop.money(due)}</ThemedText></View>
        {due > 0 ? <PaymentPanel pay={pay} setPay={(p) => { fresh(); setPay(p); }} due={due} methods={methods} res={sett} money={shop.money} currency={shop.currency} /> : null}
        {sett.change > 0 ? <Hint icon="coins">{t('ws.changeToGive')} {shop.money(sett.change)}</Hint> : null}
        {sett.remaining > 0 ? <Hint tone={canCredit ? 'warning' : 'danger'}>{canCredit ? t('ws.onCredit', { amount: shop.money(sett.remaining) }) : t('ws.creditNeedsParty')}</Hint> : null}
      </View>
    </Sheet>
  );
}
