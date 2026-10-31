import { useRef, useState } from 'react';
import { View } from 'react-native';

import { SelectField } from '@/components/dynamic-fields';
import { PartyPicker, type Party } from '@/components/party-picker';
import { ProductPicker } from '@/components/product-picker';
import { ThemedText } from '@/components/themed-text';
import { Badge, Btn, Card, Chips, Empty, ErrorNote, Hint, IconBtn, NumberBox, Row, Screen, SectionTitle, Sheet, Skeleton, Switch, TextBox, useToast, type Tone } from '@/components/ui';
import { useT } from '@/i18n';
import { ApiError } from '@/lib/api';
import { formatDateTime, num, uuid, type Product } from '@/lib/format';
import { useOffline } from '@/lib/offline';
import { useInfinite, useQuery } from '@/lib/query';
import { useShop } from '@/lib/shop';
import { activeUnits, defaultUnit } from '@/lib/units';
import type { PageProps } from '../registry';

type Loss = { id: string; productName: string; unit?: string; quantity: number; unitLabel?: string; unitFactor: number; reason: string; context: string; roundNumber?: string; supplierId?: string; supplierName?: string; claimStatus: string; claimAmount?: number; note?: string; occurredAt: string; value?: number };
type Summary = { byReason: { reason: string; events: number; qty: number; value: number }[]; byContext: { context: string; events: number; value: number }[]; topProducts: { name: string; qty: number; value: number }[]; openClaims: { n: number; amount: number } };
const REASONS = ['BREAKAGE', 'LEAK', 'EXPIRED', 'THEFT', 'SPOILED', 'SAMPLE', 'OTHER'];
const CONTEXTS = ['WAREHOUSE', 'ROUND', 'SUPPLIER_DELIVERY', 'CUSTOMER', 'OTHER'];
const CLAIMS = ['TO_CLAIM', 'CLAIMED', 'ACCEPTED', 'REJECTED'];
const CLAIM_TONE: Record<string, Tone> = { TO_CLAIM: 'warning', CLAIMED: 'warning', ACCEPTED: 'success', REJECTED: 'danger' };
const fmt = (v: unknown) => num(v).toLocaleString(undefined, { maximumFractionDigits: 3 });

function LossForm({ onClose, onSaved }: { onClose: () => void; onSaved: (queued: boolean) => void }) {
  const { t } = useT();
  const shop = useShop();
  const offline = useOffline();
  const id = useRef(uuid());
  const [product, setProduct] = useState<Product | null>(null);
  const [unitId, setUnitId] = useState('');
  const [qty, setQty] = useState('1');
  const [reason, setReason] = useState('BREAKAGE');
  const [context, setContext] = useState('WAREHOUSE');
  const [supplierId, setSupplierId] = useState<string | null>(null);
  const [supplier, setSupplier] = useState<Party | null>(null);
  const [claim, setClaim] = useState(false);
  const [claimAmount, setClaimAmount] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid = Boolean(product) && num(qty) > 0 && (reason !== 'OTHER' || note.trim().length > 0);
  async function save() {
    if (!product) return;
    setBusy(true); setError(null);
    try {
      const body = { id: id.current, productId: product.id, unitId: unitId || undefined, quantity: num(qty), reason, context, supplierId: supplierId || undefined, note: note || undefined, claim: claim || undefined, claimAmount: claim && claimAmount !== '' ? num(claimAmount) : undefined, at: new Date().toISOString() };
      const res = await offline.submit({ id: body.id, shopId: shop.shopId, method: 'POST', path: '/api/shop/losses', body, kind: 'loss', label: `${t('bv.ls.label')} · ${product.name}` });
      onSaved(res.queued);
    } catch (e) { setError(e instanceof ApiError ? e.message : t('common.network')); setBusy(false); }
  }
  return (
    <Sheet visible tall title={t('bv.ls.new')} onClose={onClose} footer={<Btn icon="check" title={busy ? t('ws.saving') : t('bv.ls.save')} loading={busy} disabled={!valid || busy} onPress={save} />}>
      {error ? <Hint icon="circle-xmark" tone="danger">{error}</Hint> : null}
      <ProductPicker label={t('bv.ls.product')} value={product} onChange={(p) => { setProduct(p); setUnitId(p ? defaultUnit(p)?.id ?? '' : ''); }} />
      <NumberBox label={t('bv.ls.qty')} value={qty} onChange={setQty} />
      {product && activeUnits(product).length > 0 ? <Chips value={unitId} onChange={setUnitId} options={[{ value: '', label: product.unit }, ...activeUnits(product).map((u) => ({ value: u.id, label: u.label }))]} /> : null}
      <SelectField required label={t('bv.ls.reason')} value={reason} onChange={setReason} options={REASONS.map((r) => ({ value: r, label: t(`bv.ls.r.${r}`) }))} />
      <SelectField required label={t('bv.ls.context')} value={context} onChange={setContext} options={CONTEXTS.map((r) => ({ value: r, label: t(`bv.ls.c.${r}`) }))} />
      <TextBox label={t('bv.ls.note')} value={note} onChangeText={setNote} autoCapitalize="sentences" error={reason === 'OTHER' && !note.trim() ? t('bv.ls.noteRequired') : null} />
      {shop.has('SUPPLIERS') ? <PartyPicker role="SUPPLIER" label={t('bv.ls.supplier')} value={supplierId} selected={supplier} onChange={(sid, p) => { setSupplierId(sid); setSupplier(p ?? null); }} /> : null}
      {supplierId ? <Switch value={claim} onChange={setClaim} label={t('bv.ls.claim')} /> : null}
      {claim ? <NumberBox label={t('bv.ls.claimAmount')} value={claimAmount} onChange={setClaimAmount} /> : null}
    </Sheet>
  );
}

function ClaimSheet({ loss, onClose, onSaved }: { loss: Loss; onClose: () => void; onSaved: () => void }) {
  const { t } = useT();
  const shop = useShop();
  const [status, setStatus] = useState(loss.claimStatus === 'NONE' ? 'TO_CLAIM' : loss.claimStatus);
  const [amount, setAmount] = useState(loss.claimAmount != null ? String(loss.claimAmount) : '');
  const [error, setError] = useState<string | null>(null);
  async function save() {
    try { await shop.call(`/api/shop/losses/${loss.id}/claim`, { method: 'POST', body: { status, amount: amount === '' ? undefined : num(amount) } }); onSaved(); } catch (e) { setError(e instanceof ApiError ? e.message : t('common.network')); }
  }
  return (
    <Sheet visible title={t('bv.ls.setClaim')} onClose={onClose} footer={<Btn icon="check" title={t('bv.x.confirm')} onPress={save} />}>
      {error ? <Hint icon="circle-xmark" tone="danger">{error}</Hint> : null}
      <ThemedText type="smallBold">{loss.productName} · {fmt(loss.quantity)}</ThemedText>
      <SelectField required label={t('bv.ls.claim')} value={status} onChange={setStatus} options={CLAIMS.map((c) => ({ value: c, label: t(`bv.ls.cs.${c}`) }))} />
      <NumberBox label={t('bv.ls.claimAmount')} value={amount} onChange={setAmount} />
    </Sheet>
  );
}

function SummaryView() {
  const { t } = useT();
  const shop = useShop();
  const q = useQuery<Summary>('/api/shop/losses/summary');
  const d = q.data;
  if (q.error) return <ErrorNote message={q.error} onRetry={() => void q.reload()} />;
  if (!d) return <Skeleton rows={3} height={70} />;
  const total = d.byReason.reduce((s, r) => s + num(r.value), 0);
  return (
    <>
      <Card style={{ gap: 2 }}><ThemedText type="small" themeColor="textSecondary">{t('bv.ls.value')}</ThemedText><ThemedText type="smallBold" style={{ fontSize: 20 }}>{shop.money(total)}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">{t('bv.ls.openClaims')} : {d.openClaims?.n ?? 0} · {shop.money(d.openClaims?.amount ?? 0)}</ThemedText></Card>
      <SectionTitle title={t('bv.ls.byReason')} />
      {d.byReason.map((r) => <Row key={r.reason} title={t(`bv.ls.r.${r.reason}`)} subtitle={`${t('bv.ls.events', { count: r.events })} · ${fmt(r.qty)}`} right={<ThemedText type="smallBold">{shop.money(r.value)}</ThemedText>} />)}
      <SectionTitle title={t('bv.ls.byContext')} />
      {d.byContext.map((r) => <Row key={r.context} title={t(`bv.ls.c.${r.context}`)} right={<ThemedText type="smallBold">{shop.money(r.value)}</ThemedText>} />)}
      {d.topProducts.length > 0 ? <><SectionTitle title={t('bv.ls.topProducts')} />{d.topProducts.map((r) => <Row key={r.name} title={r.name} subtitle={fmt(r.qty)} right={<ThemedText type="smallBold">{shop.money(r.value)}</ThemedText>} />)}</> : null}
    </>
  );
}

function LossList({ claims, tick }: { claims?: boolean; tick: number }) {
  const { t, lang } = useT();
  const shop = useShop();
  const [reason, setReason] = useState('');
  const [claim, setClaim] = useState(claims ? 'OPEN' : '');
  const [edit, setEdit] = useState<Loss | null>(null);
  const list = useInfinite<Loss>('/api/shop/losses', { reason: reason || undefined, claim: claim || undefined, k: tick });
  const canUpdate = shop.can('STOCK_LOSSES', 'update');
  return (
    <>
      {claims ? <Chips value={claim} onChange={setClaim} options={['OPEN', ...CLAIMS].map((c) => ({ value: c, label: c === 'OPEN' ? t('bv.ls.f.OPEN') : t(`bv.ls.cs.${c}`) }))} />
        : <Chips value={reason} onChange={setReason} options={[{ value: '', label: t('bv.ls.f.ALL') }, ...REASONS.map((r) => ({ value: r, label: t(`bv.ls.r.${r}`) }))]} />}
      {list.error ? <ErrorNote message={list.error} onRetry={() => void list.reload()} /> : null}
      {list.loading && list.items.length === 0 ? <Skeleton rows={4} height={64} /> : list.items.length === 0 ? <Empty icon="box" title={t('bv.ls.empty')} text={t('bv.ls.emptyText')} /> : list.items.map((x) => (
        <Row key={x.id} title={`${x.productName} · ${x.unitLabel && num(x.unitFactor) > 1 ? `${fmt(num(x.quantity) / num(x.unitFactor))} ${x.unitLabel}` : `${fmt(x.quantity)} ${x.unit ?? ''}`}`}
          subtitle={[t(`bv.ls.r.${x.reason}`), t(`bv.ls.c.${x.context}`), x.roundNumber, x.supplierName, formatDateTime(x.occurredAt, lang), x.note].filter(Boolean).join(' · ')}
          onPress={canUpdate && x.supplierId ? () => setEdit(x) : undefined}
          right={<View style={{ alignItems: 'flex-end', gap: 4 }}>{x.value != null ? <ThemedText type="smallBold">{shop.money(x.value)}</ThemedText> : null}{x.claimStatus !== 'NONE' ? <Badge tone={CLAIM_TONE[x.claimStatus] ?? 'neutral'}>{t(`bv.ls.cs.${x.claimStatus}`)}</Badge> : null}</View>} />
      ))}
      {list.hasMore ? <Btn variant="secondary" small loading={list.loadingMore} title={t('list.more')} onPress={list.loadMore} /> : null}
      {edit ? <ClaimSheet loss={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); void list.reload(); }} /> : null}
    </>
  );
}

/** Casse et pertes : declaration (meme hors ligne), reclamations aux fournisseurs, synthese par motif et par lieu. */
export default function Losses({ item, tab }: PageProps) {
  const { t } = useT();
  const shop = useShop();
  const toast = useToast();
  const [view, setView] = useState('list');
  const [form, setForm] = useState(false);
  const [tick, setTick] = useState(0);
  return (
    <Screen tabs={tab} title={shop.tr(item.label)} subtitle={t('bv.ls.subtitle')}
      right={shop.can('STOCK_LOSSES', 'create') ? <IconBtn name="plus" tone="primary" label={t('bv.ls.new')} onPress={() => setForm(true)} /> : undefined}>
      <Chips value={view} onChange={setView} options={['list', 'claims', 'summary'].map((k) => ({ value: k, label: t(`bv.ls.tab.${k}`) }))} />
      {view === 'list' ? <LossList key={`l${tick}`} tick={tick} /> : null}
      {view === 'claims' ? <LossList key={`c${tick}`} claims tick={tick} /> : null}
      {view === 'summary' ? <SummaryView key={`s${tick}`} /> : null}
      {form ? <LossForm onClose={() => setForm(false)} onSaved={(queued) => { setForm(false); toast(queued ? t('bv.x.queued') : t('bv.ls.saved')); setTick((x) => x + 1); }} /> : null}
    </Screen>
  );
}
