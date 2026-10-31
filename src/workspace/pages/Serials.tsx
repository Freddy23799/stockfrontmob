import { useState } from 'react';
import { FlatList, View } from 'react-native';

import { ListFooter } from '@/components/list-footer';
import { PdfButton } from '@/components/pdf-button';
import { ProductPicker } from '@/components/product-picker';
import { ThemedText } from '@/components/themed-text';
import { Badge, Btn, Card, Chips, Empty, ErrorNote, Fab, Input, NumberBox, Screen, Sheet, Skeleton, TextBox, useToast } from '@/components/ui';
import { useT } from '@/i18n';
import { API, errText, num, prettyImei } from '@/lib/electronics';
import { formatDate, uuid, type Product } from '@/lib/format';
import { LIST_PROPS } from '@/lib/list';
import { useInfinite } from '@/lib/query';
import { useShop } from '@/lib/shop';
import type { PageProps } from '../registry';

type Unit = {
  id: string; productName: string; serialNo: string; imei2?: string | null; condition: string; grade?: string | null; color?: string | null; capacity?: string | null; status: string; costPrice?: number | string | null;
  salePrice?: number | string | null; soldPrice?: number | string | null; margin?: number | string | null; soldAt?: string | null; customerName?: string | null; saleNumber?: string | null; receivedAt: string;
  blocked: boolean; blockReason?: string | null; blacklisted: boolean; daysInStock?: number | null; warranty?: { code: string; endsOn: string; active: boolean } | null;
};
type Detail = { unit: Unit; events: { id: string; kind: string; at: string; note?: string | null; partyName?: string | null; documentNumber?: string | null }[]; warranties: Record<string, any>[]; repairs: Record<string, any>[] };
const STATUSES = ['IN_STOCK', 'SOLD', 'RESERVED', 'IN_REPAIR', 'DEFECTIVE', ''];
const TONE: Record<string, 'info' | 'warning' | 'success' | 'danger'> = { IN_STOCK: 'success', SOLD: 'info', RESERVED: 'warning', IN_REPAIR: 'warning', DEFECTIVE: 'danger', SUPPLIER_RETURNED: 'info', WRITTEN_OFF: 'danger' };

function UnitSheet({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const { t, lang } = useT();
  const shop = useShop();
  const toast = useToast();
  const [d, setD] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const load = () => shop.call<Detail>(`${API}/serials/${id}`).then(setD).catch((e) => setError(errText(e, t('common.error'))));
  useState(() => { void load(); return null; });
  async function toggleBlock(block: boolean) {
    setBusy(true); setError(null);
    try { await shop.call(`${API}/serials/${id}/${block ? 'block' : 'unblock'}`, { method: 'POST', body: { reason: reason.trim() || undefined } }); toast(t('el.saved')); setReason(''); onChanged(); await load(); } catch (e) { setError(errText(e, t('common.error'))); } finally { setBusy(false); }
  }
  if (!d) return <Sheet visible title="…" onClose={onClose}>{error ? <ErrorNote message={error} /> : <Skeleton rows={3} height={60} />}</Sheet>;
  const u = d.unit;
  return (
    <Sheet visible tall title={u.productName} onClose={onClose}>
      {error ? <ErrorNote message={error} /> : null}
      <ThemedText type="smallBold" style={{ letterSpacing: 1 }}>{prettyImei(u.serialNo)}</ThemedText>
      {u.imei2 ? <ThemedText type="small">IMEI 2 : {prettyImei(u.imei2)}</ThemedText> : null}
      <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
        <Badge tone={TONE[u.status] ?? 'info'}>{t(`el.us.${u.status}`)}</Badge><Badge tone="info">{t(`el.cond.${u.condition}`)}</Badge>
        {u.blocked ? <Badge tone="danger">{t('el.blocked')}</Badge> : null}{u.blacklisted ? <Badge tone="danger">{t('el.blacklisted')}</Badge> : null}
      </View>
      <ThemedText type="small" themeColor="textSecondary">{[u.color, u.capacity, u.grade ? `${t('el.grade')} ${u.grade}` : null, u.daysInStock != null && u.status === 'IN_STOCK' ? t('el.daysInStock', { count: u.daysInStock }) : null].filter(Boolean).join(' · ')}</ThemedText>
      {u.salePrice != null ? <ThemedText type="small">{t('el.salePrice')} : {shop.money(u.salePrice)}</ThemedText> : null}
      {u.costPrice != null ? <ThemedText type="small">{t('el.costPrice')} : {shop.money(u.costPrice)}{u.margin != null ? ` · ${shop.money(u.margin)}` : ''}</ThemedText> : null}
      {u.customerName ? <ThemedText type="small">{t('el.customer')} : {u.customerName}{u.saleNumber ? ` · ${u.saleNumber}` : ''}</ThemedText> : null}
      {u.warranty ? <ThemedText type="small" themeColor={u.warranty.active ? 'success' : 'danger'}>{t('el.warranties')} {u.warranty.code} · {t('el.until')} {formatDate(u.warranty.endsOn, lang)}</ThemedText> : null}
      {u.blockReason ? <ThemedText type="small" themeColor="danger">{u.blockReason}</ThemedText> : null}
      {shop.can('SERIAL_WARRANTY', 'update') && ['IN_STOCK', 'RESERVED'].includes(u.status) ? (
        <Card>
          <TextBox label={t('el.blockReason')} value={reason} onChangeText={setReason} />
          <Btn small variant="secondary" title={u.blocked ? t('el.unblock') : t('el.block')} loading={busy} disabled={!u.blocked && !reason.trim()} onPress={() => void toggleBlock(!u.blocked)} />
        </Card>
      ) : null}
      <ThemedText type="smallBold">{t('el.history')}</ThemedText>
      {d.events.map((e) => <ThemedText key={e.id} type="small" themeColor="textSecondary">{t(`el.ev.${e.kind}`) === `el.ev.${e.kind}` ? e.kind : t(`el.ev.${e.kind}`)} · {formatDate(e.at, lang)}{e.partyName ? ` · ${e.partyName}` : ''}{e.documentNumber ? ` · ${e.documentNumber}` : ''}{e.note ? ` · ${e.note}` : ''}</ThemedText>)}
    </Sheet>
  );
}

function Intake({ onClose, onSaved }: { onClose: () => void; onSaved: (n: number) => void }) {
  const { t } = useT();
  const shop = useShop();
  const [product, setProduct] = useState<Product | null>(null);
  const [list, setList] = useState('');
  const [condition, setCondition] = useState('NEW');
  const [cost, setCost] = useState('');
  const [price, setPrice] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const serials = [...new Set(list.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean))];
  async function save() {
    if (!product) return;
    setBusy(true); setError(null);
    try {
      const res = await shop.call<unknown[]>(`${API}/serials/intake`, { method: 'POST', body: { productId: product.id, items: serials.map((serial) => ({ id: uuid(), serial, condition, costPrice: cost ? num(cost) : undefined, salePrice: price ? num(price) : undefined })) } });
      onSaved(res.length);
    } catch (e) { setError(errText(e, t('common.error'))); setBusy(false); }
  }
  return (
    <Sheet visible tall title={t('el.intake')} onClose={onClose} footer={<Btn title={`${t('el.intakeConfirm')} · ${serials.length}`} disabled={!product || serials.length === 0} loading={busy} onPress={() => void save()} />}>
      {error ? <ErrorNote message={error} /> : null}
      <ProductPicker label={shop.v('product')} value={product} onChange={setProduct} />
      <TextBox label={t('el.intakeScan')} hint={t('el.intakeHelp')} value={list} onChangeText={setList} multiline autoCapitalize="characters" autoCorrect={false} />
      <Chips scroll={false} value={condition} onChange={setCondition} options={['NEW', 'USED', 'REFURBISHED'].map((c) => ({ value: c, label: t(`el.cond.${c}`) }))} />
      {shop.can('PRODUCTS', 'update') ? <NumberBox label={t('el.costPrice')} value={cost} onChange={setCost} /> : null}
      <NumberBox label={t('el.salePrice')} value={price} onChange={setPrice} />
    </Sheet>
  );
}

/** Parc d'appareils : recherche par IMEI (ou 6 derniers chiffres), fiche et historique, blocage anti-vol, entree en stock. */
export default function Serials({ item, tab }: PageProps) {
  const { t } = useT();
  const shop = useShop();
  const toast = useToast();
  const [status, setStatus] = useState('IN_STOCK');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [intake, setIntake] = useState(false);
  const list = useInfinite<Unit>(`${API}/serials`, { q: q.trim(), status: status || undefined });
  return (
    <Screen tabs={tab} fixed title={shop.tr(item.label)} subtitle={t('el.serialsSubtitle')}>
      <View style={{ alignItems: 'flex-start', marginBottom: 6 }}><PdfButton path="/api/shop/pdf/electronics/report/stock" name="stock-appareils.pdf" label={t('el.reportStock')} small /></View>
      <Chips value={status} onChange={setStatus} options={STATUSES.map((s) => ({ value: s, label: s ? t(`el.us.${s}`) : t('ws.all') }))} />
      <View style={{ marginVertical: 8 }}><Input value={q} onChangeText={setQ} placeholder={t('el.searchUnits')} autoCapitalize="characters" autoCorrect={false} /></View>
      {list.error ? <ErrorNote message={list.error} onRetry={list.reload} /> : null}
      {list.loading && list.items.length === 0 ? <Skeleton rows={5} height={74} /> : (
        <FlatList {...LIST_PROPS} data={list.items} keyExtractor={(u) => u.id} contentContainerStyle={{ gap: 8, paddingBottom: 110 }} onEndReached={list.loadMore} refreshing={list.refreshing} onRefresh={() => void list.reload()} showsVerticalScrollIndicator={false}
          ListEmptyComponent={<Empty icon="mobile-screen" title={t('el.serialsEmpty')} text={t('el.serialsEmptyText')} />}
          ListFooterComponent={<ListFooter shown={list.items.length} total={list.total} hasMore={list.hasMore} loading={list.loadingMore} failed={false} onMore={list.loadMore} />}
          renderItem={({ item: u }) => (
            <Card onPress={() => setOpen(u.id)}>
              <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                <ThemedText type="smallBold" style={{ flex: 1 }} numberOfLines={1}>{u.productName}</ThemedText>
                {u.blocked ? <Badge tone="danger">{t('el.blocked')}</Badge> : null}
                <Badge tone={TONE[u.status] ?? 'info'}>{t(`el.us.${u.status}`)}</Badge>
              </View>
              <ThemedText type="small" style={{ letterSpacing: 1 }}>{prettyImei(u.serialNo)}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">{[t(`el.cond.${u.condition}`), u.color, u.capacity, u.customerName].filter(Boolean).join(' · ')}</ThemedText>
            </Card>
          )} />
      )}
      {shop.can('SERIAL_WARRANTY', 'create') ? <Fab label={t('el.intake')} onPress={() => setIntake(true)} /> : null}
      {intake ? <Intake onClose={() => setIntake(false)} onSaved={(n) => { setIntake(false); toast(t('el.intakeDone', { count: n })); void list.reload(); }} /> : null}
      {open ? <UnitSheet id={open} onClose={() => setOpen(null)} onChanged={() => void list.reload()} /> : null}
    </Screen>
  );
}
