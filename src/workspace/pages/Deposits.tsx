import { useRef, useState } from 'react';
import { FlatList, View } from 'react-native';

import { SelectField } from '@/components/dynamic-fields';
import { PartyPicker, type Party } from '@/components/party-picker';
import { ThemedText } from '@/components/themed-text';
import { Badge, Btn, Card, Chips, Empty, ErrorNote, Hint, IconBtn, NumberBox, Row, Screen, SectionTitle, Sheet, Skeleton, Switch, TextBox, useToast } from '@/components/ui';
import { useT } from '@/i18n';
import { ApiError } from '@/lib/api';
import { formatDateTime, num, uuid } from '@/lib/format';
import { LIST_PROPS } from '@/lib/list';
import { useOffline } from '@/lib/offline';
import { qs, useInfinite, useQuery } from '@/lib/query';
import { useShop } from '@/lib/shop';
import type { PageProps } from '../registry';

type Item = { id: string; name: string; kind: string; unitValue: number; supplierId?: string; active: boolean; emptiesStock: number };
type Summary = { items: Item[]; atCustomersQty: number; atCustomersValue: number; owedToSuppliersQty: number; owedToSuppliersValue: number; heldCash: number; customersWithBalance: number; overLimit: { partyId: string; name: string }[] };
type Held = { itemId: string; itemName: string; kind: string; qty: number; value: number };
type Bal = { partyId: string; name: string; totalValue: number; held: number; netDue: number; overLimit: boolean; items: Held[] };
type Position = { partyId: string; name: string; totalValue: number; held: number; netDue: number; overLimit: boolean; limitValue?: number; items: Held[] };
type Move = { id: string; kind: string; itemName: string; partyName?: string; qty: number; amount: number; occurredAt: string; documentNumber?: string; note?: string };
const KINDS = ['CRATE', 'BOTTLE', 'KEG', 'PALLET', 'OTHER'];
const METHODS = ['CASH', 'MOBILE_MONEY', 'TRANSFER', 'CARD', 'CHEQUE'];
const MOVES = ['OUT', 'RETURN', 'SALE_CANCEL', 'FORFEIT', 'ADJUST', 'RECEIVE', 'SEND_BACK', 'STOCK_ADJUST'];
const fmt = (v: number | string | null | undefined) => num(v).toLocaleString(undefined, { maximumFractionDigits: 3 });
const lines = (q: Record<string, string>) => Object.entries(q).filter(([, v]) => num(v) > 0).map(([itemId, v]) => ({ itemId, qty: num(v) }));

/** Envoie une operation de consigne (idempotente) ; gardee dans la file si le reseau est coupe. */
function useAct(done: () => void) {
  const { t } = useT();
  const shop = useShop();
  const offline = useOffline();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run(path: string, body: { id: string }, label: string, ok: string) {
    setBusy(true); setError(null);
    try {
      const res = await offline.submit({ id: body.id, shopId: shop.shopId, method: 'POST', path, body, kind: 'deposit', label });
      toast(res.queued ? t('bv.dp.queued') : ok);
      done();
    } catch (e) { setError(e instanceof ApiError ? e.message : t('common.network')); } finally { setBusy(false); }
  }
  return { run, busy, error, setError };
}

function Qty({ items, qty, setQty, max }: { items: { itemId: string; itemName: string; qty?: number }[]; qty: Record<string, string>; setQty: (q: Record<string, string>) => void; max?: boolean }) {
  const { t } = useT();
  if (!items.length) return <ThemedText type="small" themeColor="textSecondary">{t('bv.dp.noItems')}</ThemedText>;
  return <>{items.map((i) => (
    <NumberBox key={i.itemId} label={`${i.itemName}${max ? ` · ${t('bv.dp.owes')} ${fmt(i.qty)}` : ''}`} value={qty[i.itemId] ?? ''} onChange={(v) => setQty({ ...qty, [i.itemId]: v })} keyboardType="number-pad" />
  ))}</>;
}

function PartySheet({ partyId, onClose, onChanged }: { partyId: string; onClose: () => void; onChanged: () => void }) {
  const { t, lang } = useT();
  const shop = useShop();
  const q = useQuery<Position>(`/api/shop/deposits/parties/${partyId}`);
  const mv = useQuery<{ items: Move[] }>(`/api/shop/deposits/movements${qs({ partyId, size: 15 })}`);
  const [mode, setMode] = useState<string | null>(null);
  const [qty, setQty] = useState<Record<string, string>>({});
  const [refund, setRefund] = useState(false);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('CASH');
  const [note, setNote] = useState('');
  const id = useRef(uuid());
  const d = q.data;
  const act = useAct(() => { setMode(null); setQty({}); setAmount(''); setNote(''); setRefund(false); id.current = uuid(); void q.reload(); void mv.reload(); onChanged(); });
  const held = (d?.items ?? []).filter((i) => num(i.qty) !== 0);
  const canWrite = shop.can('DEPOSITS', 'create');
  const open = (m: string) => { setMode(m); id.current = uuid(); act.setError(null); setQty(m === 'return' || m === 'forfeit' ? Object.fromEntries(held.map((i) => [i.itemId, String(num(i.qty))])) : {}); };
  const needLines = mode === 'return' || mode === 'forfeit';
  const valid = needLines ? lines(qty).length > 0 : num(amount) > 0;
  function submit() {
    if (!d) return;
    const note_ = note || undefined;
    if (mode === 'return') return act.run('/api/shop/deposits/returns', { id: id.current, partyId, lines: lines(qty), note: note_, refund: refund && num(amount) > 0 ? { method, amount: num(amount) } : undefined } as { id: string }, `${t('bv.dp.labelReturn')} · ${d.name}`, t('bv.dp.returned'));
    if (mode === 'forfeit') return act.run('/api/shop/deposits/forfeits', { id: id.current, partyId, lines: lines(qty), note: note_, payment: num(amount) > 0 ? { method, amount: num(amount) } : undefined } as { id: string }, `${t('bv.dp.labelForfeit')} · ${d.name}`, t('bv.dp.forfeited'));
    const pre = mode === 'prepay';
    return act.run(`/api/shop/deposits/${pre ? 'prepay' : 'refund'}`, { id: id.current, partyId, amount: num(amount), method, note: note_ } as { id: string }, `${t(pre ? 'bv.dp.labelPrepay' : 'bv.dp.labelRefund')} · ${shop.money(num(amount))}`, t('bv.dp.done'));
  }
  return (
    <Sheet visible tall title={d?.name ?? '…'} onClose={onClose}
      footer={mode ? <View style={{ gap: 8 }}><Btn icon="check" title={act.busy ? t('ws.saving') : t('bv.dp.confirm')} loading={act.busy} disabled={!valid || act.busy} onPress={submit} /><Btn variant="secondary" title={t('common.cancel')} onPress={() => setMode(null)} /></View>
        : canWrite && d ? <View style={{ gap: 8 }}><Btn icon="check" title={t('bv.dp.returnEmpties')} disabled={held.length === 0} onPress={() => open('return')} />
          <View style={{ flexDirection: 'row', gap: 8 }}><View style={{ flex: 1 }}><Btn variant="secondary" small title={t('bv.dp.prepay')} onPress={() => open('prepay')} /></View><View style={{ flex: 1 }}><Btn variant="secondary" small title={t('bv.dp.forfeitConfirm')} disabled={held.length === 0} onPress={() => open('forfeit')} /></View></View></View> : undefined}>
      {!d ? <Skeleton rows={3} height={70} /> : (
        <>
          {q.error ? <ErrorNote message={q.error} onRetry={() => void q.reload()} /> : null}
          <Card style={{ gap: 6 }}>
            <View style={{ flexDirection: 'row' }}><ThemedText type="small" style={{ flex: 1 }}>{t('bv.dp.value')}</ThemedText><ThemedText type="smallBold">{shop.money(d.totalValue)}</ThemedText></View>
            <View style={{ flexDirection: 'row' }}><ThemedText type="small" style={{ flex: 1 }}>{t('bv.dp.held')}</ThemedText><ThemedText type="smallBold">{shop.money(d.held)}</ThemedText></View>
            <View style={{ flexDirection: 'row' }}><ThemedText type="small" style={{ flex: 1 }}>{t('bv.dp.netDue')}</ThemedText><ThemedText type="smallBold">{shop.money(d.netDue)}</ThemedText></View>
            {d.limitValue != null ? <ThemedText type="small" themeColor="textSecondary">{t('bv.dp.limit', { amount: shop.money(d.limitValue) })}</ThemedText> : null}
          </Card>
          {d.overLimit ? <Hint icon="triangle-exclamation" tone="danger">{t('bv.dp.overBadge')}</Hint> : null}
          <SectionTitle title={t('bv.dp.account')} />
          {held.length === 0 ? <ThemedText type="small" themeColor="textSecondary">{t('bv.dp.nothing')}</ThemedText> : held.map((i) => (
            <Row key={i.itemId} title={i.itemName} subtitle={t(`bv.dp.kind.${i.kind}`)} right={<View style={{ alignItems: 'flex-end' }}><ThemedText type="smallBold">{fmt(i.qty)}</ThemedText><ThemedText type="small" themeColor="textSecondary">{shop.money(i.value)}</ThemedText></View>} />
          ))}
          {mode ? (
            <Card style={{ gap: 10 }}>
              <ThemedText type="smallBold">{t(mode === 'return' ? 'bv.dp.returnEmpties' : mode === 'forfeit' ? 'bv.dp.forfeit' : 'bv.dp.prepay')}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">{t(mode === 'return' ? 'bv.dp.returnHelp' : mode === 'forfeit' ? 'bv.dp.forfeitHelp' : 'bv.dp.prepayHelp')}</ThemedText>
              {act.error ? <Hint icon="circle-xmark" tone="danger">{act.error}</Hint> : null}
              {needLines ? <Qty items={held} qty={qty} setQty={setQty} max /> : null}
              {mode === 'return' ? <Switch value={refund} onChange={setRefund} label={t('bv.dp.refundNow')} /> : null}
              {mode !== 'return' || refund ? (
                <>
                  <NumberBox label={mode === 'return' ? t('bv.dp.refundAmount') : mode === 'forfeit' ? t('bv.dp.collect') : t('bv.dp.amount')} value={amount} onChange={setAmount} />
                  <SelectField required label={t('bv.dp.refundMethod')} value={method} onChange={setMethod} options={METHODS.map((m) => ({ value: m, label: t(`ws.m.${m}`) }))} />
                </>
              ) : null}
              <TextBox label={t('bv.dp.note')} value={note} onChangeText={setNote} autoCapitalize="sentences" />
            </Card>
          ) : null}
          <SectionTitle title={t('bv.dp.history')} />
          {(mv.data?.items ?? []).length === 0 ? <ThemedText type="small" themeColor="textSecondary">{t('bv.dp.emptyMovesText')}</ThemedText> : (mv.data?.items ?? []).map((m) => (
            <Row key={m.id} title={`${t(`bv.dp.mv.${m.kind}`)} · ${m.itemName}`} subtitle={[formatDateTime(m.occurredAt, lang), m.documentNumber, m.note].filter(Boolean).join(' · ')} right={<ThemedText type="smallBold">{num(m.qty) > 0 ? '+' : ''}{fmt(m.qty)}</ThemedText>} />
          ))}
        </>
      )}
    </Sheet>
  );
}

function ItemSheet({ item, onClose, onSaved }: { item: Item | null; onClose: () => void; onSaved: () => void }) {
  const { t } = useT();
  const shop = useShop();
  const id = useRef(item?.id ?? uuid());
  const [name, setName] = useState(item?.name ?? '');
  const [kind, setKind] = useState(item?.kind ?? 'CRATE');
  const [value, setValue] = useState(item ? String(item.unitValue) : '');
  const [supplierId, setSupplierId] = useState<string | null>(item?.supplierId ?? null);
  const [supplier, setSupplier] = useState<Party | null>(null);
  const [active, setActive] = useState(item?.active ?? true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function save() {
    setBusy(true); setError(null);
    try {
      await shop.call(item ? `/api/shop/deposits/items/${item.id}` : '/api/shop/deposits/items', { method: item ? 'PUT' : 'POST', body: { id: id.current, name: name.trim(), kind, unitValue: num(value), supplierId: supplierId ?? undefined, active } });
      onSaved();
    } catch (e) { setError(e instanceof ApiError ? e.message : t('common.network')); setBusy(false); }
  }
  return (
    <Sheet visible title={item ? t('bv.dp.editItem') : t('bv.dp.newItem')} onClose={onClose} footer={<Btn icon="check" title={busy ? t('ws.saving') : t('bv.dp.confirm')} loading={busy} disabled={!name.trim() || busy} onPress={save} />}>
      {error ? <Hint icon="circle-xmark" tone="danger">{error}</Hint> : null}
      <TextBox label={t('bv.dp.itemName')} value={name} onChangeText={setName} autoCapitalize="words" />
      <SelectField required label={t('bv.dp.itemKind')} value={kind} onChange={setKind} options={KINDS.map((k) => ({ value: k, label: t(`bv.dp.kind.${k}`) }))} />
      <NumberBox label={t('bv.dp.itemValue')} value={value} onChange={setValue} />
      <PartyPicker role="SUPPLIER" label={t('bv.dp.supplier')} value={supplierId} selected={supplier} onChange={(sid, p) => { setSupplierId(sid); setSupplier(p ?? null); }} />
      <Switch value={active} onChange={setActive} label={t('bv.dp.itemActive')} />
    </Sheet>
  );
}

/** Mouvement avec une brasserie (recu / rendu) ou correction du stock de vides. */
function StockSheet({ mode, items, item, onClose, onDone }: { mode: 'receive' | 'sendBack' | 'adjust'; items: Item[]; item?: Item; onClose: () => void; onDone: () => void }) {
  const { t } = useT();
  const id = useRef(uuid());
  const [supplierId, setSupplierId] = useState<string | null>(null);
  const [supplier, setSupplier] = useState<Party | null>(null);
  const [qty, setQty] = useState<Record<string, string>>({});
  const [delta, setDelta] = useState('');
  const [note, setNote] = useState('');
  const act = useAct(onDone);
  const ls = lines(qty);
  const valid = mode === 'adjust' ? num(delta) !== 0 : Boolean(supplierId) && ls.length > 0;
  function go() {
    if (mode === 'adjust' && item) return act.run('/api/shop/deposits/empties/adjust', { id: id.current, itemId: item.id, delta: num(delta), note: note || undefined } as { id: string }, `${t('bv.dp.adjustEmpties')} · ${item.name}`, t('bv.dp.done'));
    return act.run(`/api/shop/deposits/supplier/${mode === 'receive' ? 'receive' : 'send-back'}`, { id: id.current, supplierId, lines: ls, note: note || undefined } as { id: string }, t(mode === 'receive' ? 'bv.dp.supplierReceive' : 'bv.dp.supplierSendBack'), t('bv.dp.supplierDone'));
  }
  return (
    <Sheet visible tall title={mode === 'adjust' ? `${t('bv.dp.adjustEmpties')} · ${item?.name}` : t(mode === 'receive' ? 'bv.dp.supplierReceive' : 'bv.dp.supplierSendBack')} onClose={onClose}
      footer={<Btn icon="check" title={act.busy ? t('ws.saving') : t('bv.dp.confirm')} loading={act.busy} disabled={!valid || act.busy} onPress={go} />}>
      {act.error ? <Hint icon="circle-xmark" tone="danger">{act.error}</Hint> : null}
      {mode === 'adjust' ? (
        <><ThemedText type="small" themeColor="textSecondary">{t('bv.dp.adjustHelp')}</ThemedText><NumberBox label={t('bv.dp.delta')} value={delta} onChange={setDelta} keyboardType="numbers-and-punctuation" /></>
      ) : (
        <><PartyPicker role="SUPPLIER" label={t('bv.dp.supplier')} value={supplierId} selected={supplier} onChange={(sid, p) => { setSupplierId(sid); setSupplier(p ?? null); }} />
          <Qty items={items.filter((i) => i.active).map((i) => ({ itemId: i.id, itemName: i.name }))} qty={qty} setQty={setQty} /></>
      )}
      <TextBox label={t('bv.dp.note')} value={note} onChangeText={setNote} autoCapitalize="sentences" />
    </Sheet>
  );
}

function Balances({ side, summary, onChanged }: { side: 'CUSTOMER' | 'SUPPLIER'; summary: Summary | null; onChanged: () => void }) {
  const { t } = useT();
  const shop = useShop();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [stock, setStock] = useState<'receive' | 'sendBack' | null>(null);
  const list = useInfinite<Bal>('/api/shop/deposits/balances', { side, q: q || undefined, onlyDue: true });
  return (
    <>
      <TextBox label={t('bv.dp.search')} value={q} onChangeText={setQ} autoCapitalize="none" />
      {side === 'SUPPLIER' && shop.can('DEPOSITS', 'create') ? <View style={{ flexDirection: 'row', gap: 8 }}><View style={{ flex: 1 }}><Btn variant="secondary" small title={t('bv.dp.supplierReceive')} onPress={() => setStock('receive')} /></View><View style={{ flex: 1 }}><Btn variant="secondary" small title={t('bv.dp.supplierSendBack')} onPress={() => setStock('sendBack')} /></View></View> : null}
      {list.error ? <ErrorNote message={list.error} onRetry={() => void list.reload()} /> : null}
      {list.loading && list.items.length === 0 ? <Skeleton rows={4} height={68} /> : (
        <FlatList {...LIST_PROPS} scrollEnabled={false} data={list.items} keyExtractor={(b) => b.partyId} contentContainerStyle={{ gap: 8 }}
          ListEmptyComponent={<Empty icon="box" title={t(side === 'SUPPLIER' ? 'bv.dp.emptySuppliers' : 'bv.dp.emptyCustomers')} text={t(side === 'SUPPLIER' ? 'bv.dp.emptySuppliersText' : 'bv.dp.emptyCustomersText')} />}
          renderItem={({ item: b }) => (
            <Row title={b.name} subtitle={b.items.map((i) => `${fmt(i.qty)} ${i.itemName}`).join(' · ') || t('bv.dp.nothing')} onPress={side === 'CUSTOMER' ? () => setOpen(b.partyId) : undefined}
              right={<View style={{ alignItems: 'flex-end', gap: 4 }}><ThemedText type="smallBold">{shop.money(b.totalValue)}</ThemedText>{b.overLimit ? <Badge tone="danger">{t('bv.dp.overBadge')}</Badge> : null}</View>} />
          )} />
      )}
      {list.hasMore ? <Btn variant="secondary" small loading={list.loadingMore} title={t('list.more')} onPress={list.loadMore} /> : null}
      {open ? <PartySheet partyId={open} onClose={() => setOpen(null)} onChanged={() => { void list.reload(); onChanged(); }} /> : null}
      {stock ? <StockSheet mode={stock} items={summary?.items ?? []} onClose={() => setStock(null)} onDone={() => { setStock(null); void list.reload(); onChanged(); }} /> : null}
    </>
  );
}

function Moves() {
  const { t, lang } = useT();
  const shop = useShop();
  const [kind, setKind] = useState('');
  const list = useInfinite<Move>('/api/shop/deposits/movements', { kind: kind || undefined });
  return (
    <>
      <Chips value={kind} onChange={setKind} options={[{ value: '', label: t('bv.dp.allKinds') }, ...MOVES.map((k) => ({ value: k, label: t(`bv.dp.mv.${k}`) }))]} />
      {list.error ? <ErrorNote message={list.error} onRetry={() => void list.reload()} /> : null}
      {list.loading && list.items.length === 0 ? <Skeleton rows={4} height={60} /> : list.items.length === 0 ? <Empty icon="clipboard-list" title={t('bv.dp.emptyMoves')} text={t('bv.dp.emptyMovesText')} /> : list.items.map((m) => (
        <Row key={m.id} title={`${t(`bv.dp.mv.${m.kind}`)} · ${m.itemName}`} subtitle={[m.partyName, formatDateTime(m.occurredAt, lang), m.documentNumber, m.note].filter(Boolean).join(' · ')}
          right={<View style={{ alignItems: 'flex-end' }}><ThemedText type="smallBold">{num(m.qty) > 0 ? '+' : ''}{fmt(m.qty)}</ThemedText>{num(m.amount) !== 0 ? <ThemedText type="small" themeColor="textSecondary">{shop.money(m.amount)}</ThemedText> : null}</View>} />
      ))}
      {list.hasMore ? <Btn variant="secondary" small loading={list.loadingMore} title={t('list.more')} onPress={list.loadMore} /> : null}
    </>
  );
}

/** Consignes : emballages chez les clients et dus aux brasseries, retours de vides, valorisation, stock de vides. */
export default function Deposits({ item, tab }: PageProps) {
  const { t } = useT();
  const shop = useShop();
  const sum = useQuery<Summary>('/api/shop/deposits/summary');
  const [view, setView] = useState('customers');
  const [form, setForm] = useState<{ item: Item | null } | null>(null);
  const [adjust, setAdjust] = useState<Item | null>(null);
  const s = sum.data ?? null;
  const canCreate = shop.can('DEPOSITS', 'create');
  return (
    <Screen tabs={tab} title={shop.tr(item.label)} subtitle={t('bv.dp.subtitle')} onRefresh={() => void sum.reload()} refreshing={false}
      right={canCreate ? <IconBtn name="plus" tone="primary" label={t('bv.dp.newItem')} onPress={() => setForm({ item: null })} /> : undefined}>
      {sum.error ? <ErrorNote message={sum.error} onRetry={() => void sum.reload()} /> : null}
      {!s && !sum.error ? <Skeleton rows={2} height={80} /> : s ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {[[t('bv.dp.atCustomers'), fmt(s.atCustomersQty), shop.money(s.atCustomersValue)], [t('bv.dp.owedSuppliers'), fmt(s.owedToSuppliersQty), shop.money(s.owedToSuppliersValue)], [t('bv.dp.heldCash'), shop.money(s.heldCash), t('bv.dp.heldCashHint')]].map(([l, v, h]) => (
            <Card key={l} style={{ flexGrow: 1, flexBasis: 140, gap: 2 }}><ThemedText type="small" themeColor="textSecondary">{l}</ThemedText><ThemedText type="smallBold" style={{ fontSize: 18 }}>{v}</ThemedText><ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 12 }}>{h}</ThemedText></Card>
          ))}
        </View>
      ) : null}
      <Chips value={view} onChange={setView} options={['customers', 'suppliers', 'items', 'moves'].map((k) => ({ value: k, label: t(`bv.dp.tab.${k}`) }))} />
      {view === 'customers' ? <Balances side="CUSTOMER" summary={s} onChanged={() => void sum.reload()} /> : null}
      {view === 'suppliers' ? <Balances side="SUPPLIER" summary={s} onChanged={() => void sum.reload()} /> : null}
      {view === 'items' ? (!s ? <Skeleton rows={3} height={64} /> : s.items.length === 0 ? <Empty icon="box" title={t('bv.dp.emptyItems')} text={t('bv.dp.emptyItemsText')} /> : s.items.map((i) => (
        <Row key={i.id} title={i.name} subtitle={`${t(`bv.dp.kind.${i.kind}`)} · ${shop.money(i.unitValue)} · ${t('bv.dp.emptiesStock')} ${fmt(i.emptiesStock)}`}
          right={canCreate ? <View style={{ gap: 4 }}><IconBtn size={34} name="pen" label={t('bv.dp.editItem')} onPress={() => setForm({ item: i })} /><IconBtn size={34} name="scale-balanced" label={t('bv.dp.adjustEmpties')} onPress={() => setAdjust(i)} /></View> : undefined} />
      ))) : null}
      {view === 'moves' ? <Moves /> : null}
      {form ? <ItemSheet item={form.item} onClose={() => setForm(null)} onSaved={() => { setForm(null); void sum.reload(); }} /> : null}
      {adjust ? <StockSheet mode="adjust" items={[]} item={adjust} onClose={() => setAdjust(null)} onDone={() => { setAdjust(null); void sum.reload(); }} /> : null}
    </Screen>
  );
}
