import { useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { DynamicFields, SelectField, cleanAttributes } from '@/components/dynamic-fields';
import { Icon } from '@/components/icon';
import { PartyPicker, type Party } from '@/components/party-picker';
import { Receipt, type Doc } from '@/components/receipt';
import { ThemedText } from '@/components/themed-text';
import { Thumb } from '@/components/thumb';
import { Badge, Btn, Card, Chips, Empty, Hint, IconBtn, Input, NumberBox, Sheet, Stepper, Switch, TextBox, useToast, Screen } from '@/components/ui';
import { qs, useQuery, type Page } from '@/lib/query';
import { useLayout } from '@/hooks/use-layout';
import { useTheme } from '@/hooks/use-theme';
import { useT } from '@/i18n';
import { ApiError } from '@/lib/api';
import { useCatalog } from '@/lib/catalog';
import { num, sellable, uuid, type Product } from '@/lib/format';
import { activeUnits, baseUnitName, defaultUnit, factorOf } from '@/lib/units';
import { useOffline } from '@/lib/offline';
import { CheckoutWallet, NO_WALLET, type Wallet } from '@/components/checkout-wallet';
import { usePricing } from '@/lib/pricing';
import { initPay, resetPay, settle } from '@/lib/payments';
import { useShop } from '@/lib/shop';
import { useCashSession } from '../cash';
import { PaymentPanel } from '@/components/payment-panel';

type Line = { key: string; product: Product; quantity: number; unitPrice: number; discount: number; unitId: string | null; manual?: boolean };
const RX_KEYS = ['prescriber', 'prescriptionNumber', 'prescriptionDate'];
const BUYER_KEYS = ['buyerName', 'buyerId'];
/** Libelle du badge de prix d'une ligne : "Promo : Ramadan", "Prix gros dès 10", "Tarif VIP", "Prix modifié". */
function priceBadge(t: (k: string, v?: Record<string, string | number>) => string, source: string, label: string | null) {
  if (source === 'TIER_QTY') return t('price.badge.tierFrom', { qty: label ?? '' });
  if (source === 'PROMO') return label ? t('price.badge.promoNamed', { name: label }) : t('price.badge.PROMO');
  if (source === 'NEGOTIATED') return t('price.badge.NEGOTIATED');
  if (source === 'CUSTOMER_TYPE') return t('price.badge.CUSTOMER_TYPE', { name: label ?? '' });
  return t('price.badge.MANUAL');
}

export default function Pos() {
  const { t } = useT();
  const shop = useShop();
  const th = useTheme();
  const toast = useToast();
  const layout = useLayout();
  const catalog = useCatalog();
  const offline = useOffline();
  const [wallet, setWallet] = useState<Wallet>(NO_WALLET);   // points / avoir utilises (fidelite) : deja regles
  const cash = useCashSession();
  const pricing = usePricing();
  const saleId = useRef(uuid());                        // identifiant choisi ici : un renvoi apres coupure ne cree jamais deux ventes
  const [q, setQ] = useState('');
  const [cart, setCart] = useState<Line[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [partyId, setPartyId] = useState<string | null>(null);
  const [party, setParty] = useState<Party | null>(null);
  const payMethods = shop.ws.manifest.paymentMethods?.length ? shop.ws.manifest.paymentMethods : ['CASH'];
  const [pay, setPay] = useState(() => initPay(payMethods[0]));
  const [attrs, setAttrs] = useState<Record<string, any>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Doc | null>(null);
  const [insure, setInsure] = useState({ on: false, insurerId: '', coverage: '', member: '' });
  const insurers = useQuery<Page<Party>>(shop.can('INSURANCE', 'view') ? `/api/shop/parties${qs({ role: 'INSURER', size: 100 })}` : null);

  const [catW, setCatW] = useState(0);                  // largeur reelle du catalogue : le nombre de colonnes s'adapte a elle, pas a l'ecran
  const split = layout.width >= 820;                    // tablette / ordinateur : panier toujours visible a droite
  const results = useMemo(() => (q.trim() ? catalog.search(q) : []), [q, catalog.items, catalog.search]); // eslint-disable-line react-hooks/exhaustive-deps
  const tiles = useMemo(() => catalog.items.filter((p) => p.isActive).slice(0, 60), [catalog.items]);
  const shown = q.trim() ? results : tiles;

  // Prix : la regle (palier, promo, type de client) est appliquee ici pour l'apercu et le hors-ligne ; le serveur la recalcule a la vente.
  const customerType: string | null = party?.customerType ?? null;
  const lines = cart.map((l) => {
    const rule = pricing.active && !l.manual ? pricing.resolve(l.product, l.product.units?.find((x) => x.id === l.unitId) ?? null, num(l.quantity) || 1, customerType, partyId) : null;
    const unitPrice = rule ? rule.price : l.unitPrice;
    const gross = num(l.quantity) * num(unitPrice);
    const priceSource = pricing.active ? (l.manual ? 'MANUAL' : rule!.source) : null;
    return { ...l, unitPrice, priceSource, priceLabel: l.manual ? null : rule?.label ?? null, listPrice: rule?.listPrice ?? null, total: Math.max(0, gross - num(l.discount)) };
  });
  const total = lines.reduce((a, l) => a + l.total, 0);
  const count = lines.reduce((a, l) => a + num(l.quantity), 0);
  const coverage = insure.on ? Math.min(100, Math.max(0, num(insure.coverage))) : 0;
  const insurerShare = insure.on ? Math.round((total * coverage) / 100 * 100) / 100 : 0;   // meme arrondi que le serveur
  const dueBeforeWallet = total - insurerShare;
  const due = Math.max(0, dueBeforeWallet - wallet.amount);                                                       // ce que le client doit regler
  const sett = settle(pay, due);
  const { change, onCredit } = sett;
  const canCredit = shop.has('DEBTS') && Boolean(partyId);

  const rxOn = shop.has('PRESCRIPTIONS'), ctrlOn = shop.has('CONTROLLED_REGISTER');
  const needsControlled = ctrlOn && lines.some((l) => l.product.attributes?.controlled === true);
  const needsRx = rxOn && (needsControlled || lines.some((l) => l.product.attributes?.prescription === true));
  const filled = (k: string) => String(attrs[k] ?? '').trim() !== '';
  const rxOk = !needsRx || (filled('prescriber') && filled('prescriptionNumber'));
  const buyerOk = !needsControlled || (filled('buyerName') && filled('buyerId'));
  const sessionOk = !(shop.config.requireCashSession && cash.enabled) || Boolean(cash.session);
  const insuranceOk = !insure.on || (Boolean(insure.insurerId) && coverage > 0 && Boolean(partyId));
  const valid = lines.length > 0 && lines.every((l) => num(l.quantity) > 0) && (onCredit === 0 || canCredit) && sett.valid && rxOk && buyerOk && sessionOk && insuranceOk;
  const saleFields = shop.ws.manifest.documentFields?.SALE ?? [];

  // code-barres exact saisi (douchette) : le produit est ajoute tout de suite
  function onSearch(v: string) {
    const hit = v.trim().length >= 6 ? catalog.byBarcode(v) : undefined;
    if (hit) { add(hit.product, hit.unitId); setQ(''); } else setQ(v);
  }

  function add(p: Product, forcedUnit?: string | null) {
    setError(null);
    setCart((c) => {
      const du = forcedUnit ? p.units?.find((x) => x.id === forcedUnit) ?? null : defaultUnit(p);
      const i = c.findIndex((l) => l.product.id === p.id && l.unitId === (du?.id ?? null));
      if (i >= 0) return c.map((l, k) => (k === i ? { ...l, quantity: num(l.quantity) + 1 } : l));
      return [...c, { key: uuid(), product: p, quantity: 1, unitPrice: du ? Number(du.price) : Number(p.salePrice), discount: 0, unitId: du?.id ?? null }];
    });
  }
  function pickParty(id: string | null, p?: Party) {
    setPartyId(id);
    setParty(p ?? null);
    if (!id) setInsure((i) => ({ ...i, on: false }));
    else if (p?.attributes?.insurance) {   // le client a une assurance enregistree : on la propose
      const match = insurers.data?.items.find((x) => x.name.toLowerCase() === String(p.attributes!.insurance).trim().toLowerCase());
      if (match) setInsure({ on: true, insurerId: match.id, coverage: String(match.attributes?.coveragePercent ?? ''), member: String(p.attributes.insuranceNumber ?? '') });
    }
  }
  function pickInsurer(id: string) {
    const ins = insurers.data?.items.find((x) => x.id === id);
    setInsure((i) => ({ ...i, insurerId: id, coverage: ins?.attributes?.coveragePercent != null ? String(ins.attributes.coveragePercent) : i.coverage, member: i.member || String(party?.attributes?.insuranceNumber ?? '') }));
  }
  const patch = (key: string, changes: Partial<Line>) => setCart((c) => c.map((l) => (l.key === key ? { ...l, ...changes } : l)));

  async function submit() {
    setBusy(true);
    setError(null);
    const body = {
      id: saleId.current, partyId: partyId || undefined, attributes: cleanAttributes(attrs),
      insurance: insure.on ? { insurerId: insure.insurerId, coveragePercent: coverage, memberNumber: insure.member.trim() || undefined } : undefined,
      lines: lines.map((l) => ({ productId: l.product.id, quantity: num(l.quantity), unitPrice: num(l.unitPrice), discount: num(l.discount), unitId: l.unitId ?? undefined, priceManual: l.manual ? true : undefined })),
      payments: [...sett.payments.map((p) => ({ id: uuid(), ...p })), ...wallet.payments],
    };
    const issuedAt = new Date().toISOString();
    // recu provisoire : garde avec l'operation (reste consultable et reimprimable tant que la vente n'est pas envoyee)
    const offlineDoc = {
      id: saleId.current, docType: 'SALE', pending: true, total, balance: onCredit, partyName: party?.name, issuedAt, attributes: { tendered: sett.tendered > 0 ? sett.tendered : undefined, change },
      lines: lines.map((l) => { const u = l.product.units?.find((x) => x.id === l.unitId); return { id: l.key, description: l.product.name, quantity: l.quantity, unitPrice: l.unitPrice, discount: l.discount, lineTotal: l.total, unitLabel: u?.label ?? null, displayQuantity: l.quantity, displayUnitPrice: l.unitPrice, priceSource: l.priceSource, priceLabel: l.priceLabel, displayListPrice: l.listPrice }; }),
      payments: body.payments.map((p) => ({ id: p.id, method: p.method, amount: p.amount })),
    };
    try {
      // envoyee plus tard : la vente a deja eu lieu au comptoir (prix et heure reels conserves, stock serveur insuffisant accepte)
      const res = await offline.submit<Doc>({ id: saleId.current, shopId: shop.shopId, method: 'POST', path: '/api/shop/sales', body, kind: 'sale', preview: offlineDoc, queuedBody: { ...body, offline: true, issuedAt }, label: `${t('ws.newSale')} · ${shop.money(due)}` });
      setCartOpen(false);
      if (res.queued) {
        // hors ligne : la vente est gardee sur l'appareil et partira seule ; le recu est deja imprimable
        catalog.consume(lines.map((l) => ({ productId: l.product.id, quantity: num(l.quantity) * factorOf(l.product, l.unitId) })));
        setDone(offlineDoc as unknown as Doc);
        toast(t('mob.saleQueued'), 'warning');
      } else {
        setDone(res.data);
        toast(t('ws.saleDone', { number: res.data.number ?? '' }));
        void catalog.refresh();
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setWallet(NO_WALLET);
    saleId.current = uuid();
    setCart([]); setPartyId(null); setParty(null); setInsure({ on: false, insurerId: '', coverage: '', member: '' }); setPay(resetPay(pay)); setAttrs({}); setDone(null); setError(null); setCartOpen(false); setQ('');
    void cash.reload();
  }

  const cols = Math.max(2, Math.floor(((catW || layout.width - layout.gutter * 2) + 10) / 150));

  const catalogView = (
    <View style={s.flex} onLayout={(e) => setCatW(e.nativeEvent.layout.width)}>
      {cash.enabled && cash.session === null && shop.can('CASH_SESSIONS', 'create') ? (
        <Hint icon="cash-register" tone={shop.config.requireCashSession ? 'warning' : 'info'} title={shop.config.requireCashSession ? t('pos.cashRequired') : t('pos.cashClosed')}>
          {t('mob.cashHint')}
        </Hint>
      ) : null}
      <View style={s.search}>
        <Icon name="magnifying-glass" size={15} color={th.textSecondary} style={s.searchIcon} />
        <Input value={q} onChangeText={onSearch} placeholder={t('mob.searchProduct', { products: shop.v('products').toLowerCase() })} style={s.searchInput} autoCapitalize="none" returnKeyType="search" />
        {q ? <Pressable onPress={() => setQ('')} hitSlop={10} style={s.clear} accessibilityLabel={t('ws.clear')}><Icon name="xmark" size={14} color={th.textSecondary} /></Pressable> : null}
      </View>
      <ScrollView contentContainerStyle={[s.grid, !split && { paddingBottom: 110 }]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {shown.map((p) => {
          const left = sellable(p);
          const out = p.trackStock && left <= 0 && !shop.config.allowNegativeStock;
          const inCart = cart.find((l) => l.product.id === p.id);
          return (
            <Pressable key={p.id} disabled={out} onPress={() => add(p)} accessibilityRole="button" accessibilityLabel={p.name}
              style={({ pressed }) => [s.tile, { width: `${100 / cols - 2}%`, backgroundColor: th.backgroundElement, opacity: out ? 0.45 : pressed ? 0.75 : 1, borderColor: inCart ? th.primary : 'transparent' }]}>
              <Thumb image={p.image} size={56} />
              <ThemedText type="smallBold" numberOfLines={2} style={s.tileName}>{p.name}</ThemedText>
              <ThemedText type="smallBold" themeColor="primary">{shop.money(p.salePrice)}</ThemedText>
              {p.trackStock ? <ThemedText type="small" style={{ fontSize: 12, color: left <= 0 ? th.danger : th.textSecondary }}>{left} {p.unit}</ThemedText> : null}
              {inCart ? <View style={[s.qtyBadge, { backgroundColor: th.primary }]}><ThemedText type="smallBold" style={{ color: th.primaryText, fontSize: 12 }}>{num(inCart.quantity)}</ThemedText></View> : null}
            </Pressable>
          );
        })}
        {shown.length === 0 ? (
          <View style={{ width: '100%' }}>
            {q.trim()
              ? <Empty icon="magnifying-glass" title={t('mob.noResult')} text={t('mob.noProductHint')} />
              : catalog.ready ? <Empty icon="box-open" title={t('mob.catalogEmpty')} text={t('mob.catalogEmptyHint')} /> : null}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );

  const cartBody = (
    <View style={{ gap: 14 }}>
      {lines.length === 0 ? <Empty icon="basket-shopping" title={t('ws.cartEmpty')} text={t('ws.cartEmptyText')} /> : (
        <>
          {lines.map((l) => (
            <Card key={l.key} style={{ gap: 10 }}>
              <View style={s.lineHead}>
                <Thumb image={l.product.image} size={40} />
                <View style={s.flex}>
                  <ThemedText type="smallBold" numberOfLines={2}>{l.product.name}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 12 }}>{shop.money(l.unitPrice)}</ThemedText>
                </View>
                <IconBtn name="xmark" label={t('ws.remove')} size={34} onPress={() => setCart((c) => c.filter((x) => x.key !== l.key))} />
              </View>
              <View style={s.lineHead}>
                <Stepper value={num(l.quantity)} onChange={(v) => patch(l.key, { quantity: v })} />
                <View style={s.flex} />
                <ThemedText type="smallBold" style={{ fontSize: 16 }}>{shop.money(l.total)}</ThemedText>
              </View>
              {activeUnits(l.product).length > 0 ? (
                <View style={{ gap: 6 }}>
                  <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 12 }}>{t('mob.soldBy')}</ThemedText>
                  <Chips value={l.unitId ?? ''} onChange={(v) => { const u = l.product.units?.find((x) => x.id === v); patch(l.key, { unitId: v || null, unitPrice: u ? Number(u.price) : Number(l.product.salePrice), manual: false }); }}
                    options={[{ value: '', label: baseUnitName(shop, l.product.unit) }, ...activeUnits(l.product).map((u) => ({ value: u.id, label: u.label }))]} />
                </View>
              ) : null}
              <View style={s.badges}>
                {l.priceSource && l.priceSource !== 'BASE' ? <Badge tone={l.priceSource === 'MANUAL' ? 'warning' : 'success'}>{priceBadge(t, l.priceSource, l.priceLabel)}</Badge> : null}
                {l.listPrice != null && l.priceSource && !['BASE', 'MANUAL'].includes(l.priceSource) ? <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 12, textDecorationLine: 'line-through' }}>{shop.money(l.listPrice)}</ThemedText> : null}
                {l.product.trackStock && num(l.quantity) * factorOf(l.product, l.unitId) > sellable(l.product) ? <Badge tone="danger">{t('ws.onlyInStock', { n: Math.max(0, sellable(l.product)) })}</Badge> : null}
                {l.product.attributes?.prescription === true ? <Badge tone="warning">{t('ws.needsPrescription')}</Badge> : null}
              </View>
              <View style={s.lineHead}>
                <View style={s.flex}><NumberBox label={t('ws.unitPrice')} value={l.unitPrice} onChange={(v) => patch(l.key, { unitPrice: v as unknown as number, manual: true })} /></View>
                <View style={s.flex}><NumberBox label={t('ws.discount')} value={l.discount || ''} onChange={(v) => patch(l.key, { discount: v as unknown as number })} placeholder="0" /></View>
              </View>
            </Card>
          ))}

          {shop.has('CUSTOMERS') ? <PartyPicker role="CUSTOMER" label={shop.v('customer')} value={partyId} selected={party} onChange={pickParty} /> : null}
          {shop.has('CUSTOMERS') ? <CheckoutWallet key={partyId ?? 'none'} partyId={partyId} due={dueBeforeWallet} onPickParty={pickParty} onChange={setWallet} /> : null}

          {shop.can('INSURANCE', 'view') && partyId && (insurers.data?.items.length ?? 0) > 0 ? (
            <Card style={{ gap: 12 }}>
              <Switch value={insure.on} onChange={(on) => setInsure((i) => ({ ...i, on }))} label={t('pos.insurance')} hint={t('mob.insuranceHint')} />
              {insure.on ? (
                <>
                  <SelectField required label={shop.v('insurer')} value={insure.insurerId} onChange={pickInsurer} options={insurers.data!.items.map((x) => ({ value: x.id, label: x.name }))} />
                  <NumberBox label={t('pos.coverage')} value={insure.coverage} onChange={(v) => setInsure((i) => ({ ...i, coverage: v }))} suffix="%" />
                  <TextBox label={t('pos.memberNo')} value={insure.member} onChangeText={(v) => setInsure((i) => ({ ...i, member: v }))} maxLength={60} />
                  {insurerShare > 0 ? <Hint icon="shield-heart" tone="success">{t('pos.insurerPays')} {shop.money(insurerShare)} · {t('pos.patientPays')} {shop.money(due)}</Hint> : null}
                </>
              ) : null}
            </Card>
          ) : null}

          {needsRx ? (
            <Card tone="warning" style={{ gap: 12 }}>
              <ThemedText type="smallBold" themeColor="warning"><Icon name="file-prescription" size={14} color={th.warning} />  {t('pos.rxTitle')}</ThemedText>
              <ThemedText type="small" themeColor="warning">{needsControlled ? t('pos.rxControlled') : t('pos.rxHint')}</ThemedText>
              <DynamicFields defs={saleFields.filter((d) => RX_KEYS.includes(d.key))} values={attrs} onChange={setAttrs} />
              {needsControlled ? <DynamicFields defs={saleFields.filter((d) => BUYER_KEYS.includes(d.key))} values={attrs} onChange={setAttrs} /> : null}
              {!rxOk ? <ThemedText type="smallBold" themeColor="danger">{t('pos.rxMissing')}</ThemedText> : null}
              {!buyerOk ? <ThemedText type="smallBold" themeColor="danger">{t('pos.buyerMissing')}</ThemedText> : null}
            </Card>
          ) : null}

          <PaymentPanel pay={pay} setPay={setPay} due={due} methods={payMethods} res={sett} money={shop.money} currency={shop.currency} />
          {change > 0 ? <Hint icon="coins" tone="success">{t('ws.changeToGive')} {shop.money(change)}</Hint> : null}
          {onCredit > 0 ? <Hint icon="triangle-exclamation" tone={canCredit ? 'warning' : 'danger'}>{canCredit ? t('ws.onCredit', { amount: shop.money(onCredit) }) : t('ws.creditNeedsParty')}</Hint> : null}
          {!sessionOk ? <Hint icon="cash-register" tone="warning">{t('pos.cashRequired')}</Hint> : null}
          {error ? <Hint icon="circle-xmark" tone="danger">{error}</Hint> : null}
          {!offline.online ? <Hint icon="cloud-arrow-up" tone="warning">{t('mob.offlineSaleHint')}</Hint> : null}
        </>
      )}
    </View>
  );

  const chargeBar = (
    <View style={{ gap: 8 }}>
      <View style={s.totalRow}><ThemedText style={{ flex: 1 }} type="smallBold">{insurerShare > 0 ? t('pos.patientShare') : t('ws.total')}</ThemedText><ThemedText style={{ fontSize: 22, lineHeight: 28 }} type="smallBold">{shop.money(due)}</ThemedText></View>
      <Btn icon="check" title={busy ? t('ws.saving') : t('ws.charge', { amount: shop.money(due) })} disabled={!valid || busy} loading={busy} onPress={submit} />
    </View>
  );

  const receipt = done ? (
    <Sheet visible title={done.pending ? t('mob.saleSavedOffline') : t('ws.saleDone', { number: done.number ?? '' })} onClose={reset}
      footer={<Btn icon="plus" title={t('ws.newSale')} onPress={reset} />}>
      {done.pending ? <Hint icon="cloud-arrow-up" tone="warning">{t('mob.saleQueuedText')}</Hint> : null}
      <Receipt doc={done} />
    </Sheet>
  ) : null;

  return (
    <Screen tabs back={false} fixed title={shop.v('checkout')} subtitle={catalog.syncedAt && !offline.online ? t('mob.catalogFrom', { date: new Date(catalog.syncedAt).toLocaleDateString() }) : undefined}>
      {split ? (
        <View style={s.split}>
          <View style={s.flex}>{catalogView}</View>
          <View style={[s.side, { backgroundColor: th.background, borderColor: th.progressTrack }]}>
            <ThemedText type="smallBold" style={{ fontSize: 16 }}><Icon name="basket-shopping" size={14} />  {t('ws.cart')} · {t('ws.itemsCount', { count })}</ThemedText>
            <ScrollView style={s.flex} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">{cartBody}</ScrollView>
            {lines.length > 0 ? chargeBar : null}
          </View>
        </View>
      ) : (
        <>
          {catalogView}
          {cart.length > 0 ? (
            <Pressable onPress={() => setCartOpen(true)} accessibilityRole="button" accessibilityLabel={t('ws.viewCart')} style={[s.cartBar, { backgroundColor: th.primary }]}>
              <Icon name="basket-shopping" size={18} color={th.primaryText} />
              <ThemedText type="smallBold" style={{ color: th.primaryText, flex: 1 }}>{t('ws.itemsCount', { count })}</ThemedText>
              <ThemedText type="smallBold" style={{ color: th.primaryText, fontSize: 17 }}>{shop.money(total)}</ThemedText>
              <Icon name="chevron-up" size={14} color={th.primaryText} />
            </Pressable>
          ) : null}
          <Sheet visible={cartOpen} tall title={t('ws.cart')} onClose={() => setCartOpen(false)} footer={lines.length > 0 ? chargeBar : undefined}>{cartBody}</Sheet>
        </>
      )}
      {receipt}
    </Screen>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  split: { flex: 1, flexDirection: 'row', gap: 16 },
  side: { width: 400, borderLeftWidth: StyleSheet.hairlineWidth, paddingLeft: 16, gap: 12, paddingBottom: 8 },
  search: { justifyContent: 'center', marginBottom: 10 },
  searchIcon: { position: 'absolute', left: 15, zIndex: 1 },
  searchInput: { paddingLeft: 40, paddingRight: 40 },
  clear: { position: 'absolute', right: 14, padding: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingBottom: 20 },
  tile: { borderRadius: 18, padding: 10, gap: 4, alignItems: 'center', borderWidth: 2, minHeight: 150 },
  tileName: { textAlign: 'center', fontSize: 13, lineHeight: 17 },
  qtyBadge: { position: 'absolute', top: 6, right: 6, minWidth: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  lineHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  badges: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  totalRow: { flexDirection: 'row', alignItems: 'center' },
  cartBar: { position: 'absolute', left: 0, right: 0, bottom: 10, minHeight: 58, borderRadius: 20, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', gap: 12, elevation: 6, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
});
