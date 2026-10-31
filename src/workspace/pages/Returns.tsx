import { useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';

import { SelectField } from '@/components/dynamic-fields';
import { PartyPicker, type Party } from '@/components/party-picker';
import { ProductPicker } from '@/components/product-picker';
import { Receipt, type Doc } from '@/components/receipt';
import { ThemedText } from '@/components/themed-text';
import { Badge, Btn, Card, Chips, Empty, ErrorNote, Hint, IconBtn, NumberBox, Screen, Sheet, Skeleton, TextBox, useToast } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { useT } from '@/i18n';
import { ApiError } from '@/lib/api';
import { formatDate, formatDateTime, num, uuid, type Product } from '@/lib/format';
import { qs, useInfinite, useQuery } from '@/lib/query';
import { useShop } from '@/lib/shop';
import { LIST_PROPS } from '@/lib/list';
import type { PageProps } from '../registry';

const REASONS = ['EXPIRED', 'DAMAGED', 'RECALL', 'WRONG_ITEM', 'OTHER'];
type Lot = { id: string; lotNumber: string; quantity: number; unitCost: number; expiryDate?: string; status: string };
type RLine = { key: string; product: Product; lots: Lot[]; lotId: string; quantity: string; cost: string };

/** Retours fournisseurs : lots perimes ou abimes renvoyes ; le stock baisse, l'avoir du fournisseur est suivi. */
export default function Returns({ item, tab }: PageProps) {
  const { t, lang } = useT();
  const shop = useShop();
  const th = useTheme();
  const toast = useToast();
  const [form, setForm] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const list = useInfinite<{ id: string; number: string; partyName?: string; issuedAt: string; lineCount: number; total: number; paymentStatus: string }>('/api/shop/documents', { type: 'SUPPLIER_RETURN' });
  return (
    <Screen tabs={tab} fixed title={shop.tr(item.label)} subtitle={t('ret.subtitle')} right={shop.can('SUPPLIER_RETURNS', 'create') ? <IconBtn name="plus" tone="primary" label={t('ret.new')} onPress={() => setForm(true)} /> : undefined}>
      {list.error ? <ErrorNote message={list.error} onRetry={list.reload} /> : null}
      {list.loading && list.items.length === 0 ? <Skeleton rows={4} height={68} /> : (
        <FlatList {...LIST_PROPS} data={list.items} keyExtractor={(d) => d.id} contentContainerStyle={{ gap: 8, paddingBottom: 100 }} onEndReached={list.loadMore} refreshing={list.refreshing} onRefresh={list.reload} showsVerticalScrollIndicator={false}
          ListEmptyComponent={<Empty icon="rotate-left" title={t('ret.empty')} text={t('ret.emptyText')} />}
          renderItem={({ item: d }) => (
            <Pressable onPress={() => setOpen(d.id)} accessibilityRole="button" style={({ pressed }) => [s.row, { backgroundColor: th.backgroundElement, opacity: pressed ? 0.75 : 1 }]}>
              <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                <ThemedText type="smallBold">{d.number}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary" numberOfLines={2} style={{ fontSize: 12 }}>{d.partyName} · {formatDate(d.issuedAt, lang)} · {t('ws.itemsCount', { count: d.lineCount })}</ThemedText>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 4 }}><ThemedText type="smallBold">{shop.money(d.total)}</ThemedText><Badge tone={d.paymentStatus === 'PAID' ? 'success' : 'warning'}>{d.paymentStatus === 'PAID' ? t('ret.refunded') : t('ret.pending')}</Badge></View>
            </Pressable>
          )} />
      )}
      {form ? <ReturnForm onClose={() => setForm(false)} onSaved={(doc) => { setForm(false); toast(t('ret.done', { number: doc.number ?? '' })); setOpen(doc.id); void list.reload(); }} /> : null}
      {open ? <ReturnSheet id={open} onClose={() => setOpen(null)} onChanged={() => void list.reload()} /> : null}
    </Screen>
  );
}

function ReturnForm({ onClose, onSaved }: { onClose: () => void; onSaved: (d: Doc) => void }) {
  const { t, lang } = useT();
  const shop = useShop();
  const id = useRef(uuid());
  const [supplierId, setSupplierId] = useState<string | null>(null);
  const [supplier, setSupplier] = useState<Party | null>(null);
  const [reason, setReason] = useState('EXPIRED');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<RLine[]>([]);
  const [pick, setPick] = useState<Product | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add(product: Product | null) {
    setPick(null);
    if (!product) return;
    let lots: Lot[] = [];
    if (product.trackLots) {
      try {
        const r = await shop.call<{ items: Lot[] }>(`/api/shop/stock/lots${qs({ productId: product.id, status: 'all', size: 50 })}`);
        lots = r.items.filter((l) => Number(l.quantity) > 0);
      } catch { setError(t('mob.needsConnection')); return; }
      if (lots.length === 0) { setError(t('ret.noLot', { name: product.name })); return; }
    }
    setError(null);
    setLines((ls) => [...ls, { key: uuid(), product, lots, lotId: lots[0]?.id ?? '', quantity: '1', cost: String(lots[0] ? lots[0].unitCost : product.costPrice ?? 0) }]);
  }
  const patch = (key: string, c: Partial<RLine>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...c } : l)));
  const pickLot = (l: RLine, lotId: string) => { const lot = l.lots.find((x) => x.id === lotId); patch(l.key, { lotId, cost: lot ? String(lot.unitCost) : l.cost }); };
  const total = lines.reduce((a, l) => a + num(l.quantity) * num(l.cost), 0);
  const valid = Boolean(supplierId) && lines.length > 0 && lines.every((l) => num(l.quantity) > 0 && (!l.product.trackLots || l.lotId));

  async function submit() {
    setBusy(true); setError(null);
    try {
      const doc = await shop.call<Doc>('/api/shop/supplier-returns', { method: 'POST', body: { id: id.current, supplierId, reason: t(`ret.reason.${reason}`), notes: notes || undefined, lines: lines.map((l) => ({ productId: l.product.id, lotId: l.lotId || undefined, quantity: num(l.quantity), unitCost: num(l.cost) })) } });
      onSaved(doc);
    } catch (e) { setError(e instanceof ApiError ? e.message : t('common.network')); setBusy(false); }
  }
  return (
    <Sheet visible tall title={t('ret.new')} onClose={onClose}
      footer={<View style={{ gap: 8 }}><View style={{ flexDirection: 'row' }}><ThemedText type="smallBold" style={{ flex: 1 }}>{t('ws.total')}</ThemedText><ThemedText type="smallBold" style={{ fontSize: 18 }}>{shop.money(total)}</ThemedText></View><Btn icon="check" title={busy ? t('ws.saving') : t('ret.confirm')} disabled={!valid || busy} loading={busy} onPress={submit} /></View>}>
      {error ? <Hint icon="circle-xmark" tone="danger">{error}</Hint> : null}
      <PartyPicker role="SUPPLIER" label={shop.v('supplier')} value={supplierId} selected={supplier} onChange={(sid, p) => { setSupplierId(sid); setSupplier(p ?? null); }} />
      <SelectField required label={t('ret.reason')} value={reason} onChange={setReason} options={REASONS.map((r) => ({ value: r, label: t(`ret.reason.${r}`) }))} />
      <ProductPicker label={t('ret.addProduct')} value={pick} onChange={add} stockedOnly />
      {lines.length === 0 ? <ThemedText type="small" themeColor="textSecondary">{t('ret.noLines')}</ThemedText> : lines.map((l) => (
        <Card key={l.key} style={{ gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><ThemedText type="smallBold" style={{ flex: 1 }}>{l.product.name}</ThemedText><IconBtn size={34} name="xmark" label={t('ws.remove')} onPress={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} /></View>
          {l.product.trackLots ? <SelectField required label={shop.v('lot')} value={l.lotId} onChange={(v) => pickLot(l, v)} options={l.lots.map((x) => ({ value: x.id, label: `${x.lotNumber} · ${num(x.quantity)} ${l.product.unit}${x.expiryDate ? ` · ${formatDate(x.expiryDate, lang, { month: 'short', year: 'numeric' })}` : ''}${x.status === 'EXPIRED' ? ` · ${t('ret.expired')}` : ''}` }))} /> : null}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}><NumberBox label={shop.v('quantity')} value={l.quantity} onChange={(v) => patch(l.key, { quantity: v })} /></View>
            <View style={{ flex: 1 }}><NumberBox label={t('ret.unitCredit')} value={l.cost} onChange={(v) => patch(l.key, { cost: v })} /></View>
          </View>
        </Card>
      ))}
      <TextBox label={t('ws.note')} value={notes} onChangeText={setNotes} multiline autoCapitalize="sentences" />
    </Sheet>
  );
}

function ReturnSheet({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const { t, lang } = useT();
  const shop = useShop();
  const toast = useToast();
  const q = useQuery<Doc & { paymentStatus: string }>(`/api/shop/documents/${id}`);
  const [doc, setDoc] = useState<(Doc & { paymentStatus: string }) | null>(null);
  const d = doc ?? q.data;
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('CASH');
  const [error, setError] = useState<string | null>(null);
  async function refund() {
    try { setDoc(await shop.call(`/api/shop/documents/${id}/payments`, { method: 'POST', body: { id: uuid(), method, amount: Number(amount) } })); setAmount(''); toast(t('ws.saved')); onChanged(); } catch (e) { setError(e instanceof ApiError ? e.message : t('common.network')); }
  }
  return (
    <Sheet visible tall title={d ? `${shop.v('supplierReturn')} ${d.number}` : '…'} onClose={onClose}>
      {!d ? <Skeleton rows={3} height={70} /> : (
        <>
          {error ? <Hint icon="circle-xmark" tone="danger">{error}</Hint> : null}
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <Badge tone={d.paymentStatus === 'PAID' ? 'success' : 'warning'}>{d.paymentStatus === 'PAID' ? t('ret.refunded') : t('ret.pending')}</Badge>
            <ThemedText type="small" themeColor="textSecondary">{formatDateTime(d.issuedAt, lang)}</ThemedText><ThemedText type="small">{d.partyName}</ThemedText>
          </View>
          {d.attributes?.reason ? <ThemedText type="small" themeColor="textSecondary">{t('ret.reason')} : {d.attributes.reason}</ThemedText> : null}
          <Receipt doc={d} />
          {num(d.balance) > 0 && shop.can('SUPPLIER_RETURNS', 'update') ? (
            <Card style={{ gap: 10 }}>
              <ThemedText type="smallBold">{t('ret.recordRefund')}</ThemedText>
              <Chips scroll={false} value={method} onChange={setMethod} options={(shop.ws.manifest.paymentMethods ?? ['CASH']).map((m) => ({ value: m, label: t(`ws.m.${m}`) }))} />
              <NumberBox label={t('ws.amountPaid')} value={amount} onChange={setAmount} placeholder={String(d.balance)} suffix={shop.currency} />
              <Btn title={t('ret.collect')} disabled={!(Number(amount) > 0)} onPress={refund} />
            </Card>
          ) : null}
        </>
      )}
    </Sheet>
  );
}

const s = StyleSheet.create({ row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 18 } });
