import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Pressable, View } from 'react-native';

import { Icon } from '@/components/icon';
import { errText } from '@/components/laundry-order';
import { PartyPicker, type Party } from '@/components/party-picker';
import { PaymentPanel } from '@/components/payment-panel';
import { PdfButton } from '@/components/pdf-button';
import { ThemedText } from '@/components/themed-text';
import { Badge, Btn, Card, Chips, Empty, ErrorNote, Hint, Input, NumberBox, Screen, SectionTitle, Sheet, Skeleton, Stack, Stepper, Switch, TextBox, useToast } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { useT } from '@/i18n';
import { formatDateTime, uuid } from '@/lib/format';
import { API, newPickupCode, num, quoteLocal, tempRef, type Catalog, type Line, type Order, type Quote } from '@/lib/laundry';
import { useOffline } from '@/lib/offline';
import { initPay, resetPay, settle } from '@/lib/payments';
import { useQuery } from '@/lib/query';
import { useShop } from '@/lib/shop';
import type { PageProps } from '../registry';

const DEFECTS = ['STAIN', 'TEAR', 'MISSING_BUTTON', 'BROKEN_ZIP', 'FADED', 'SHRUNK', 'BURN', 'ODOR', 'PILLING', 'LOOSE_THREAD', 'YELLOWING', 'OTHER'];
const blank = (g: { id: string; name: string }, serviceId: string): Line => ({ key: uuid(), garmentTypeId: g.id, garmentName: g.name, serviceId, quantity: '1', weightKg: '', color: '', brand: '', size: '', defects: [], conditionNotes: '', instructions: '', unitPrice: '', open: false });

/** Depot rapide : client, articles (vetement x prestation), express, acompte, puis ticket et etiquettes. Fonctionne sans reseau. */
export default function LaundryCounter({ item, tab }: PageProps) {
  const { t, lang } = useT();
  const shop = useShop();
  const th = useTheme();
  const toast = useToast();
  const offline = useOffline();
  const params = useLocalSearchParams<{ stop?: string }>();
  const stop = useMemo(() => { try { return params.stop ? JSON.parse(params.stop) : null; } catch { return null; } }, [params.stop]);
  const cat = useQuery<Catalog>(`${API}/catalog`);
  const catalog = cat.data;
  const methods = shop.ws.manifest.paymentMethods ?? ['CASH'];
  const manager = shop.owner || shop.can('PRODUCTS', 'update');
  const cfg = catalog?.config ?? {};

  const orderId = useRef(uuid());
  const code = useRef(newPickupCode());
  const payIds = useRef<string[]>([]);
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [family, setFamily] = useState('');
  const [filter, setFilter] = useState('');
  const [lines, setLines] = useState<Line[]>([]);
  const [party, setParty] = useState<Party | null>(null);
  const [name, setName] = useState<string>(stop?.contactName ?? '');
  const [phone, setPhone] = useState<string>(stop?.phone ?? '');
  const [express, setExpress] = useState(false);
  const [rack, setRack] = useState('');
  const [notes, setNotes] = useState('');
  const [discount, setDiscount] = useState('');
  const [delivery, setDelivery] = useState(false);
  const [address, setAddress] = useState<string>(stop?.address ?? '');
  const [pay, setPay] = useState(() => initPay(methods[0]));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<(Order & { queued?: boolean; code: string }) | null>(null);
  const [edit, setEdit] = useState<string | null>(null);
  const [serverQuote, setServerQuote] = useState<{ key: string; data: Quote } | null>(null);
  const [settingUp, setSettingUp] = useState(false);
  const [subId, setSubId] = useState('');

  const services = useMemo(() => (catalog?.services ?? []).filter((s) => s.active !== false), [catalog]);
  const garments = useMemo(() => (catalog?.garmentTypes ?? []).filter((g) => g.active !== false).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name)), [catalog]);
  const families = useMemo(() => [...new Set(garments.map((g) => g.family).filter(Boolean) as string[])], [garments]);
  const activeService = serviceId ?? services[0]?.id ?? null;
  const partyId = party?.id ?? null;
  const subs = useQuery<{ id: string; planName: string; remaining: number }[]>(shop.has('LAUNDRY_PLANS') && partyId ? `${API}/subscriptions/active?partyId=${partyId}` : null);

  const canExpress = shop.has('LAUNDRY_EXPRESS') && lines.some((l) => services.find((s) => s.id === l.serviceId)?.expressable);
  const useExpress = express && canExpress;
  const feeAmount = delivery ? num(cfg.deliveryFee) : 0;
  const discountPct = Math.min(100, num(discount));
  const capped = !manager && discountPct > num(cfg.maxCashierDiscountPercent ?? 10);
  const payload = useMemo(() => lines.map((l) => ({ garmentTypeId: l.garmentTypeId, serviceId: l.serviceId, quantity: num(l.quantity) || 1, weightKg: num(l.weightKg) || undefined, unitPrice: l.unitPrice !== '' ? num(l.unitPrice) : undefined, subscriptionId: subId || undefined })), [lines, subId]);
  const local = useMemo(() => quoteLocal(catalog, lines, { express: useExpress, discountPercent: discountPct, deliveryFee: feeAmount }), [catalog, lines, useExpress, discountPct, feeAmount]);
  const qKey = JSON.stringify([payload, useExpress, discountPct, feeAmount, partyId]);
  const online = offline.online;
  useEffect(() => {
    if (lines.length === 0 || !online) return undefined;
    const timer = setTimeout(() => {
      shop.call<Quote>(`${API}/price-quote`, { method: 'POST', body: { items: payload, express: useExpress, discountPercent: discountPct || undefined, deliveryFee: feeAmount || undefined, partyId: partyId || undefined } })
        .then((data) => setServerQuote({ key: qKey, data })).catch(() => setServerQuote(null));
    }, 350);
    return () => clearTimeout(timer);
  }, [qKey, online]); // eslint-disable-line react-hooks/exhaustive-deps
  const quote = serverQuote?.key === qKey ? serverQuote.data : local;
  const total = num(quote.total);
  const itemErrors = quote.items.filter((i) => i.error);
  const minDeposit = num(quote.minDeposit);
  const sett = settle(pay, total);
  const paid = sett.paid;
  const unpaid = Math.max(0, total - paid);
  const needsCustomer = !partyId && (!name.trim() || !phone.trim());
  const depositOk = paid + 0.005 >= minDeposit;
  const valid = lines.length > 0 && sett.valid && !needsCustomer && depositOk && !capped && itemErrors.length === 0
    && lines.every((l) => (services.find((s) => s.id === l.serviceId)?.pricingMode === 'PER_KG' ? num(l.weightKg) > 0 : num(l.quantity) > 0));

  const patch = (key: string, c: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...c } : l)));
  const add = (g: { id: string; name: string }) => {
    if (!activeService) return;
    setError(null);
    const perKg = services.find((s) => s.id === activeService)?.pricingMode === 'PER_KG';
    setLines((ls) => {
      const same = ls.find((l) => l.garmentTypeId === g.id && l.serviceId === activeService && !l.color && !l.brand && l.defects.length === 0 && !perKg);
      return same ? ls.map((l) => (l === same ? { ...l, quantity: String(num(l.quantity) + 1) } : l)) : [...ls, blank(g, activeService)];
    });
  };
  const reset = () => {
    orderId.current = uuid(); code.current = newPickupCode(); payIds.current = [];
    setLines([]); setParty(null); setName(''); setPhone(''); setExpress(false); setRack(''); setNotes(''); setDiscount(''); setDelivery(false); setAddress(''); setSubId('');
    setPay((p) => resetPay(p)); setDone(null); setError(null); setServerQuote(null);
    if (stop) router.setParams({ stop: undefined });
  };

  async function setup() {
    setSettingUp(true);
    try { await shop.call(`${API}/setup`, { method: 'POST' }); await cat.reload(); } catch (e) { setError(errText(e, t('common.error'))); } finally { setSettingUp(false); }
  }

  async function submit() {
    setBusy(true); setError(null);
    try {
      while (payIds.current.length < sett.payments.length) payIds.current.push(uuid());
      const payments = sett.payments.map((p, i) => ({ id: payIds.current[i], method: p.method, amount: Math.min(p.amount, total), reference: p.reference }));
      const body = {
        id: orderId.current, partyId: partyId || undefined, customerName: partyId ? undefined : name.trim(), customerPhone: partyId ? undefined : phone.trim(),
        source: stop ? 'PICKUP' : 'COUNTER', stopId: stop?.id, express: useExpress || undefined, notes: notes.trim() || undefined, rack: rack.trim() || undefined,
        deliveryRequested: delivery || undefined, deliveryAddress: delivery ? address.trim() || undefined : undefined,
        discountPercent: discountPct || undefined, deliveryFee: feeAmount || undefined, pickupCode: code.current,
        items: lines.map((l) => ({ id: l.key, garmentTypeId: l.garmentTypeId, serviceId: l.serviceId, quantity: num(l.quantity) || 1, weightKg: num(l.weightKg) || undefined, color: l.color || undefined, brand: l.brand || undefined, size: l.size || undefined,
          defects: l.defects, conditionNotes: l.conditionNotes || undefined, instructions: l.instructions || undefined, unitPrice: l.unitPrice !== '' ? num(l.unitPrice) : undefined, subscriptionId: subId || undefined })),
        payments,
      };
      const ref = tempRef();
      const preview = { id: orderId.current, number: ref, pending: true, pickupCode: code.current, total, paidTotal: paid, balance: unpaid, promisedAt: quote.promisedAt, itemsCount: lines.length, items: [] };
      const res = await offline.submit<Order>({ id: orderId.current, shopId: shop.shopId, method: 'POST', path: `${API}/orders`, body, kind: 'laundry-order', preview, queuedBody: { ...body, offline: true, clientRef: ref, at: new Date().toISOString() }, label: `${t('ld.labelOrder')} · ${shop.money(total)}` });
      if (res.queued) { setDone({ ...(preview as unknown as Order), queued: true, code: code.current }); toast(t('ld.orderQueued'), 'warning'); } else { setDone({ ...res.data, code: res.data.pickupCode ?? code.current }); toast(t('ld.orderDone', { number: res.data.number })); }
    } catch (e) { setError(errText(e, t('common.error'))); } finally { setBusy(false); }
  }

  const title = shop.tr(item.label);
  if (cat.loading && !catalog) return <Screen tabs={tab} title={title}><Skeleton rows={5} height={70} /></Screen>;
  if (cat.error && !catalog) return <Screen tabs={tab} title={title}><ErrorNote message={cat.error} onRetry={cat.reload} /></Screen>;
  if (catalog?.setupNeeded || (catalog && services.length === 0)) {
    return (
      <Screen tabs={tab} title={title}>
        <Empty icon="shirt" title={t('ld.setupTitle')} text={t('ld.setupText')} action={shop.can('PRODUCTS', 'create') || manager ? <Btn title={t('ld.setupGo')} loading={settingUp} onPress={() => void setup()} /> : <ThemedText type="small" themeColor="textSecondary">{t('ld.setupAsk')}</ThemedText>} />
        {error ? <ErrorNote message={error} /> : null}
      </Screen>
    );
  }

  const visible = garments.filter((g) => (!family || g.family === family) && (!filter || g.name.toLowerCase().includes(filter.toLowerCase())));
  const svc = services.find((s) => s.id === activeService);
  const editing = lines.find((l) => l.key === edit) ?? null;
  const editingIdx = editing ? lines.indexOf(editing) : -1;

  return (
    <Screen tabs={tab} keyboard title={title}
      right={lines.length > 0 ? <Btn small variant="ghost" icon="trash" title={t('ld.clear')} onPress={reset} /> : undefined}
      footer={lines.length > 0 ? <Btn icon="check" title={busy ? t('ws.saving') : t('ld.createTicket', { amount: shop.money(total) })} disabled={!valid || busy || itemErrors.length > 0} loading={busy} onPress={() => void submit()} /> : undefined}>
      <Stack>
        {!online ? <Hint tone="warning" icon="cloud-arrow-up">{t('ld.offlineHint')}</Hint> : null}
        {stop ? <Hint icon="truck">{t('ld.fromStop', { name: stop.contactName ?? '', address: stop.address ?? '' })}</Hint> : null}

        <SectionTitle title={t('ld.stepService')} />
        <Chips value={activeService ?? ''} onChange={setServiceId} options={services.map((s) => ({ value: s.id, label: s.pricingMode === 'PER_KG' ? `${s.name} · ${t('ld.perKg')}` : s.name }))} />
        {svc ? <ThemedText type="small" themeColor="textSecondary">{t('ld.serviceHint', { days: svc.turnaroundDays ?? cfg.defaultTurnaroundDays ?? 3 })}{svc.expressable ? ` · ${t('ld.expressOk')}` : ''}</ThemedText> : null}

        <SectionTitle title={t('ld.stepGarment')} />
        <Input value={filter} onChangeText={setFilter} placeholder={t('ld.searchGarment')} autoCapitalize="none" />
        {families.length > 1 ? <Chips value={family} onChange={setFamily} options={[{ value: '', label: t('ws.all') }, ...families.map((f) => ({ value: f, label: t(`ld.family.${f}`) === `ld.family.${f}` ? f : t(`ld.family.${f}`) }))]} /> : null}
        {visible.length === 0 ? <ThemedText type="small" themeColor="textSecondary">{t('ld.noGarment')}</ThemedText> : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {visible.map((g) => (
              <Pressable key={g.id} onPress={() => add(g)} accessibilityRole="button" accessibilityLabel={g.name} style={({ pressed }) => ({ width: '31%', flexGrow: 1, minWidth: 96, minHeight: 74, borderRadius: 14, padding: 8, alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: th.backgroundElement, opacity: pressed ? 0.7 : 1 })}>
                <Icon name="shirt" size={20} color={th.primary} />
                <ThemedText type="smallBold" style={{ textAlign: 'center', fontSize: 13 }} numberOfLines={2}>{g.name}</ThemedText>
              </Pressable>
            ))}
          </View>
        )}

        <SectionTitle title={t('ld.cart')} right={lines.length > 0 ? <Badge>{String(lines.length)}</Badge> : undefined} />
        {lines.length === 0 ? <ThemedText type="small" themeColor="textSecondary">{t('ld.cartEmpty')}</ThemedText> : lines.map((l, idx) => {
          const s = services.find((x) => x.id === l.serviceId);
          const perKg = s?.pricingMode === 'PER_KG';
          const q = quote.items[idx];
          return (
            <Card key={l.key}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <ThemedText type="smallBold">{l.garmentName}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">{s?.name}</ThemedText>
                </View>
                <ThemedText type="smallBold">{q?.covered ? t('ld.covered') : shop.money(q?.lineTotal ?? 0)}</ThemedText>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                {perKg ? <View style={{ flex: 1, minWidth: 120 }}><NumberBox label={t('ld.weight')} value={l.weightKg} onChange={(v) => patch(l.key, { weightKg: v })} suffix="kg" /></View>
                  : <Stepper value={num(l.quantity)} min={1} onChange={(v) => patch(l.key, { quantity: String(v) })} />}
                <View style={{ flex: 1 }} />
                <Btn small variant="secondary" icon="pen" title={t('ld.details')} onPress={() => setEdit(l.key)} />
                <Btn small variant="ghost" icon="xmark" title="" onPress={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} />
              </View>
              {q?.error ? <ThemedText type="small" themeColor="danger">{t(`ld.err.${q.error}`) === `ld.err.${q.error}` ? q.error : t(`ld.err.${q.error}`)}</ThemedText> : null}
              {l.defects.length > 0 ? <ThemedText type="small" themeColor="warning">{l.defects.map((d) => t(`ld.defect.${d}`)).join(' · ')}</ThemedText> : null}
            </Card>
          );
        })}

        {lines.length > 0 ? (
          <>
            <Card>
              <PartyPicker role="CUSTOMER" label={shop.v('customer')} value={partyId} selected={party} onChange={(id, p) => { setParty(id ? p ?? null : null); setSubId(''); }} />
              {!partyId ? (
                <>
                  <TextBox label={t('ld.customerName')} value={name} onChangeText={setName} maxLength={120} />
                  <TextBox label={t('ld.customerPhone')} value={phone} onChangeText={setPhone} keyboardType="phone-pad" maxLength={30} />
                  {needsCustomer ? <ThemedText type="small" themeColor="warning">{t('ld.customerNeeded')}</ThemedText> : null}
                </>
              ) : null}
              {subs.data && subs.data.length > 0 ? (
                <View style={{ gap: 6 }}>
                  <ThemedText type="smallBold">{t('ld.useSubscription')}</ThemedText>
                  <Chips scroll={false} value={subId} onChange={setSubId} options={[{ value: '', label: '—' }, ...subs.data.map((s) => ({ value: s.id, label: `${s.planName} · ${t('ld.remaining', { n: num(s.remaining) })}` }))]} />
                </View>
              ) : null}
            </Card>
            <Card>
              {canExpress ? <Switch value={express} onChange={setExpress} label={t('ld.expressLabel', { pct: num(cfg.expressSurchargePercent ?? 50), hours: num(cfg.expressHours ?? 24) })} /> : null}
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}><TextBox label={t('ld.rack')} value={rack} onChangeText={setRack} maxLength={20} placeholder="A-12" /></View>
                <View style={{ flex: 1 }}><NumberBox label={t('ld.discountPct')} value={discount} onChange={setDiscount} suffix="%" error={capped ? t('ld.discountCap', { max: num(cfg.maxCashierDiscountPercent ?? 10) }) : null} /></View>
              </View>
              {shop.has('LAUNDRY_ROUTES') ? (
                <>
                  <Switch value={delivery} onChange={setDelivery} label={`${t('ld.deliveryWanted')}${num(cfg.deliveryFee) > 0 ? ` (+${shop.money(cfg.deliveryFee)})` : ''}`} />
                  {delivery ? <TextBox label={t('ld.address')} value={address} onChangeText={setAddress} maxLength={200} /> : null}
                </>
              ) : null}
              <TextBox label={t('ld.notes')} value={notes} onChangeText={setNotes} multiline />
            </Card>
            <Card>
              {([[t('ld.subtotal'), shop.money(quote.subtotal)], num(quote.discountTotal) > 0 ? [t('ld.discount'), `−${shop.money(quote.discountTotal)}`] : null, num(quote.deliveryFee) > 0 ? [t('ld.deliveryFee'), shop.money(quote.deliveryFee)] : null,
                [t('ld.promised'), formatDateTime(quote.promisedAt, lang)]] as ([string, string] | null)[]).filter(Boolean).map((r) => (
                <View key={r![0]} style={{ flexDirection: 'row', justifyContent: 'space-between' }}><ThemedText type="small" themeColor="textSecondary">{r![0]}</ThemedText><ThemedText type="smallBold">{r![1]}</ThemedText></View>
              ))}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><ThemedText type="smallBold" style={{ fontSize: 17 }}>{t('ld.total')}</ThemedText><ThemedText type="smallBold" style={{ fontSize: 17 }}>{shop.money(total)}</ThemedText></View>
              <ThemedText type="small" themeColor="textSecondary">{serverQuote?.key !== qKey && online ? t('ld.estimating') : !online ? t('ld.estimate') : ' '}</ThemedText>
              {itemErrors.length > 0 ? <ThemedText type="small" themeColor="danger">{t('ld.fixPrices')}</ThemedText> : null}
            </Card>
            <Card>
              <ThemedText type="smallBold">{t('ld.deposit')}{minDeposit > 0 ? ` · ${t('ld.minDeposit', { amount: shop.money(minDeposit) })}` : ''}</ThemedText>
              <PaymentPanel pay={pay} setPay={setPay} due={total} methods={methods} res={sett} money={shop.money} currency={shop.currency} />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><ThemedText type="small" themeColor="textSecondary">{t('ld.balanceAtPickup')}</ThemedText><ThemedText type="smallBold">{shop.money(unpaid)}</ThemedText></View>
              {!depositOk ? <ThemedText type="small" themeColor="danger">{t('ld.depositLow', { amount: shop.money(minDeposit) })}</ThemedText> : null}
              {!partyId && unpaid > 0 ? <ThemedText type="small" themeColor="textSecondary">{t('ld.balanceNote')}</ThemedText> : null}
            </Card>
            {error ? <ErrorNote message={error} /> : null}
          </>
        ) : null}
      </Stack>

      {editing ? (
        <Sheet visible tall title={editing.garmentName} onClose={() => setEdit(null)} footer={<Btn title={t('common.save')} onPress={() => setEdit(null)} />}>
          <Chips scroll={false} value={editing.serviceId} onChange={(v) => patch(editing.key, { serviceId: v })} options={services.map((s) => ({ value: s.id, label: s.name }))} />
          <TextBox label={t('ld.color')} value={editing.color} onChangeText={(v) => patch(editing.key, { color: v })} maxLength={40} />
          <TextBox label={t('ld.brand')} value={editing.brand} onChangeText={(v) => patch(editing.key, { brand: v })} maxLength={40} />
          <TextBox label={t('ld.size')} value={editing.size} onChangeText={(v) => patch(editing.key, { size: v })} maxLength={12} />
          <ThemedText type="smallBold">{t('ld.defects')}</ThemedText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {(catalog?.defects ?? DEFECTS).map((d) => {
              const on = editing.defects.includes(d);
              return <Pressable key={d} onPress={() => patch(editing.key, { defects: on ? editing.defects.filter((x) => x !== d) : [...editing.defects, d] })} accessibilityRole="checkbox" accessibilityState={{ checked: on }}
                style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 99, backgroundColor: on ? th.warning : th.backgroundElement }}><ThemedText type="smallBold" style={{ color: on ? th.background : th.text }}>{t(`ld.defect.${d}`)}</ThemedText></Pressable>;
            })}
          </View>
          <TextBox label={t('ld.condition')} value={editing.conditionNotes} onChangeText={(v) => patch(editing.key, { conditionNotes: v })} maxLength={200} />
          <TextBox label={t('ld.instructions')} value={editing.instructions} onChangeText={(v) => patch(editing.key, { instructions: v })} maxLength={200} placeholder={t('ld.instructionsHint')} />
          {manager ? <NumberBox label={t('ld.manualPrice')} value={editing.unitPrice} onChange={(v) => patch(editing.key, { unitPrice: v })} placeholder={String(quote.items[editingIdx]?.unitPrice ?? '')} /> : null}
        </Sheet>
      ) : null}

      {done ? (
        <Sheet visible tall title={t('ld.ticketCreated', { number: done.number })} onClose={reset}
          footer={<Btn icon="plus" title={t('ld.newTicket')} onPress={reset} />}>
          <ThemedText type="small" themeColor="textSecondary">{done.queued ? t('ld.queuedText') : t('ld.doneText')}</ThemedText>
          <View style={{ alignItems: 'center', padding: 16, borderRadius: 16, backgroundColor: th.backgroundSelected, gap: 4 }}>
            <ThemedText type="small" themeColor="textSecondary">{t('ld.pickupCode')}</ThemedText>
            <ThemedText type="title" style={{ letterSpacing: 6 }}>{done.code}</ThemedText>
          </View>
          <Card>
            {([[t('ld.total'), shop.money(done.total)], [t('ld.paid'), shop.money(done.paidTotal)], [t('ld.balance'), shop.money(done.balance)], [t('ld.promised'), done.promisedAt ? formatDateTime(done.promisedAt, lang) : '—']] as [string, string][]).map((r) => (
              <View key={r[0]} style={{ flexDirection: 'row', justifyContent: 'space-between' }}><ThemedText type="small" themeColor="textSecondary">{r[0]}</ThemedText><ThemedText type="smallBold">{r[1]}</ThemedText></View>
            ))}
          </Card>
          {done.items?.length > 0 ? done.items.map((i) => <ThemedText key={i.id} type="small">{i.garmentName} · {i.serviceName} · {i.tagCode}</ThemedText>) : null}
          {!done.queued ? (
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              <PdfButton small path={`/api/shop/pdf/laundry/orders/${done.id}/ticket`} name={`ticket-${done.number}.pdf`} label={t('ld.printTicket')} />
              <PdfButton small path={`/api/shop/pdf/laundry/orders/${done.id}/labels`} name={`etiquettes-${done.number}.pdf`} label={t('ld.printLabels')} />
              <Btn small variant="secondary" icon="message" title={t('ld.sendReceipt')} onPress={async () => { try { const m = await shop.call<{ whatsappUrl?: string }>(`${API}/orders/${done.id}/message?kind=RECEIVED`); if (m.whatsappUrl) await Linking.openURL(m.whatsappUrl); } catch { /* indisponible */ } }} />
            </View>
          ) : null}
        </Sheet>
      ) : null}
    </Screen>
  );
}
