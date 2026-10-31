import { useState } from 'react';
import { Alert, View } from 'react-native';

import { PdfButton } from '@/components/pdf-button';
import { ThemedText } from '@/components/themed-text';
import { Badge, Btn, Card, Chips, Empty, ErrorNote, Hint, NumberBox, Screen, SectionTitle, Sheet, Skeleton, Stack, TextBox, useToast } from '@/components/ui';
import { useT } from '@/i18n';
import { ApiError } from '@/lib/api';
import { useQuery } from '@/lib/query';
import { useShop } from '@/lib/shop';
import type { PageProps } from '../registry';

const API = '/api/shop/tailor';
const splitList = (s: string) => [...new Set(s.split(/[,;\n]/).map((x) => x.trim()).filter(Boolean))];
const SIZE_SETS: Record<string, string> = { clothes: 'XS, S, M, L, XL, XXL', eu: '36, 38, 40, 42, 44, 46', shoes: '38, 39, 40, 41, 42, 43, 44', kids: '2 ans, 4 ans, 6 ans, 8 ans, 10 ans, 12 ans' };
type Col = { collection: string; articles: number; onSale: number; stockValue?: number | null; stockUnits: number };
type Markdown = { id: string; collection: string; percent: number; items: number; active: boolean; startedAt: string; endedAt?: string | null };

function GridSheet({ cols, onClose, onSaved }: { cols: Col[]; onClose: () => void; onSaved: (created: number, existing: number) => void }) {
  const { t } = useT();
  const shop = useShop();
  const [f, setF] = useState({ name: '', brand: '', collection: '', sizes: SIZE_SETS.clothes, colors: '', salePrice: '', costPrice: '', qty: '', min: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sizes = splitList(f.sizes), colors = splitList(f.colors);
  const count = Math.max(1, sizes.length) * Math.max(1, colors.length);
  const costs = shop.owner || shop.can('PRODUCTS', 'update');
  async function save() {
    setBusy(true); setError(null);
    try {
      const r = await shop.call<{ created: number; existing: number }>(`${API}/grid`, { method: 'POST', body: { name: f.name.trim(), brand: f.brand.trim() || undefined, collection: f.collection.trim() || undefined, sizes, colors, salePrice: Number(f.salePrice),
        costPrice: f.costPrice === '' ? undefined : Number(f.costPrice), openingQuantity: f.qty === '' ? undefined : Number(f.qty), minStockAlert: f.min === '' ? undefined : Number(f.min) } });
      onSaved(r.created, r.existing);
    } catch (e) { setError(e instanceof ApiError ? e.message : t('common.network')); } finally { setBusy(false); }
  }
  return (
    <Sheet visible tall title={t('tl.gridTitle')} onClose={onClose} footer={<Btn title={busy ? t('ws.saving') : t('tl.gridCreate', { n: count })} loading={busy} disabled={!f.name.trim() || f.salePrice === '' || count > 80} onPress={() => void save()} />}>
      <View style={{ gap: 12 }}>
        {error ? <ErrorNote message={error} /> : null}
        <Hint>{t('tl.gridHelp')}</Hint>
        <TextBox label={t('tl.gridName')} value={f.name} onChangeText={(v) => setF({ ...f, name: v })} placeholder={t('tl.gridNameHint')} maxLength={140} />
        <TextBox label={t('tl.brand')} value={f.brand} onChangeText={(v) => setF({ ...f, brand: v })} maxLength={80} />
        <TextBox label={t('tl.collection')} value={f.collection} onChangeText={(v) => setF({ ...f, collection: v })} placeholder={cols[0]?.collection ?? t('tl.collectionHint')} maxLength={80} />
        <TextBox label={t('tl.sizes')} value={f.sizes} onChangeText={(v) => setF({ ...f, sizes: v })} />
        <Chips options={Object.keys(SIZE_SETS).map((k) => ({ value: k, label: t(`tl.sizeSet.${k}`) }))} value={'' as string} onChange={(k) => setF({ ...f, sizes: SIZE_SETS[k] })} />
        <TextBox label={t('tl.colors')} value={f.colors} onChangeText={(v) => setF({ ...f, colors: v })} placeholder={t('tl.colorsHint')} />
        <NumberBox label={t('tl.salePrice')} value={f.salePrice} onChange={(v) => setF({ ...f, salePrice: v })} />
        {costs ? <NumberBox label={t('tl.costPrice')} value={f.costPrice} onChange={(v) => setF({ ...f, costPrice: v })} /> : null}
        <NumberBox label={t('tl.openingQty')} value={f.qty} onChange={(v) => setF({ ...f, qty: v })} />
        <NumberBox label={t('tl.minAlert')} value={f.min} onChange={(v) => setF({ ...f, min: v })} />
        <ThemedText type="small" themeColor="textSecondary">{t('tl.gridCount', { n: count })}</ThemedText>
      </View>
    </Sheet>
  );
}

function SaleSheet({ cols, pre, onClose, onSaved }: { cols: Col[]; pre?: string; onClose: () => void; onSaved: () => void }) {
  const { t } = useT();
  const shop = useShop();
  const [col, setCol] = useState(pre ?? cols[0]?.collection ?? '');
  const [pct, setPct] = useState('20');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sel = cols.find((c) => c.collection === col);
  async function save() {
    setBusy(true); setError(null);
    try { await shop.call(`${API}/markdowns`, { method: 'POST', body: { collection: col, percent: Number(pct) } }); onSaved(); }
    catch (e) { setError(e instanceof ApiError ? e.message : t('common.network')); } finally { setBusy(false); }
  }
  return (
    <Sheet visible title={t('tl.startSale')} onClose={onClose} footer={<Btn title={t('tl.startSaleBtn', { pct })} loading={busy} disabled={!col || !(Number(pct) > 0)} onPress={() => void save()} />}>
      <View style={{ gap: 12 }}>
        {error ? <ErrorNote message={error} /> : null}
        <Chips options={cols.map((c) => ({ value: c.collection, label: `${c.collection} (${c.articles})` }))} value={col} onChange={setCol} />
        <Chips options={['10', '20', '30', '40', '50', '70'].map((v) => ({ value: v, label: `${v} %` }))} value={pct} onChange={setPct} />
        <NumberBox label={t('tl.percent')} value={pct} onChange={setPct} />
        {sel ? <ThemedText type="small" themeColor="textSecondary">{t('tl.saleHelp', { n: sel.articles })}</ThemedText> : null}
      </View>
    </Sheet>
  );
}

/** Collections et soldes, grille taille x couleur. */
export default function TailorSeason({ item, tab }: PageProps) {
  const { t } = useT();
  const shop = useShop();
  const toast = useToast();
  const cols = useQuery<Col[]>(`${API}/collections`);
  const sales = useQuery<Markdown[]>(`${API}/markdowns`);
  const [grid, setGrid] = useState(false);
  const [sale, setSale] = useState<{ pre?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = async () => { await Promise.all([cols.reload(), sales.reload()]); };
  const active = new Map((sales.data ?? []).filter((m) => m.active).map((m) => [m.collection.toLowerCase(), m]));
  const costs = shop.owner || shop.can('PRODUCTS', 'update');
  function end(m: Markdown) {
    Alert.alert(t('tl.endSale'), t('tl.endSaleText', { collection: m.collection }), [{ text: t('common.cancel'), style: 'cancel' }, { text: t('tl.endSale'), onPress: () => {
      void shop.call(`${API}/markdowns/${m.id}/end`, { method: 'POST', body: {} }).then(() => { toast(t('tl.saleEnded')); void reload(); }).catch((e) => setError(e instanceof ApiError ? e.message : t('common.network')));
    } }]);
  }
  return (
    <Screen tabs={tab} title={shop.tr(item.label)} onRefresh={reload}
      right={<View style={{ flexDirection: 'row', gap: 8 }}>{shop.has('VARIANTS') && shop.can('PRODUCTS', 'create') ? <Btn small icon="plus" title={t('tl.newGrid')} onPress={() => setGrid(true)} /> : null}{shop.can('SEASON_SALES', 'create') && (cols.data?.length ?? 0) > 0 ? <Btn small variant="secondary" icon="tag" title={t('tl.startSale')} onPress={() => setSale({})} /> : null}</View>}>
      {error ? <ErrorNote message={error} /> : null}
      {cols.error && !cols.data ? <ErrorNote message={cols.error} onRetry={cols.reload} /> : null}
      {!cols.data ? <Skeleton rows={3} /> : cols.data.length === 0 ? <Empty icon="tag" title={t('tl.noCollection')} text={t('tl.noCollectionText')} /> : (
        <Stack gap={8}>{cols.data.map((c) => { const m = active.get(c.collection.toLowerCase()); return (
          <Card key={c.collection}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><ThemedText type="smallBold" style={{ flex: 1 }}>{c.collection}</ThemedText>{m ? <Badge tone="warning">{`−${m.percent} %`}</Badge> : null}</View>
            <ThemedText type="small" themeColor="textSecondary">{t('tl.itemsN', { n: c.articles })} · {c.stockUnits} {t('tl.stockUnits').toLowerCase()}{costs && c.stockValue != null ? ` · ${shop.money(c.stockValue)}` : ''}</ThemedText>
            <View style={{ flexDirection: 'row', marginTop: 8 }}>
              {m ? (shop.can('SEASON_SALES', 'update') ? <Btn small variant="secondary" title={t('tl.endSale')} onPress={() => end(m)} /> : null) : (shop.can('SEASON_SALES', 'create') ? <Btn small variant="secondary" title={t('tl.startSale')} onPress={() => setSale({ pre: c.collection })} /> : null)}
            </View>
          </Card>
        ); })}</Stack>
      )}
      <SectionTitle title={t('tl.saleHistory')} />
      {!sales.data ? <Skeleton rows={1} /> : sales.data.length === 0 ? <ThemedText themeColor="textSecondary">{t('tl.noSale')}</ThemedText> : sales.data.map((m) => (
        <Card key={m.id}><View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}><ThemedText type="smallBold" style={{ flex: 1 }}>{m.collection}</ThemedText><Badge tone={m.active ? 'warning' : 'info'}>{`−${m.percent} %`}</Badge><Badge tone={m.active ? 'warning' : 'neutral'}>{m.active ? t('tl.saleOn') : t('tl.saleOff')}</Badge></View>
          <ThemedText type="small" themeColor="textSecondary">{m.startedAt.slice(0, 10)}{m.endedAt ? ` → ${m.endedAt.slice(0, 10)}` : ''} · {t('tl.itemsN', { n: m.items })}</ThemedText></Card>
      ))}
      <PdfButton small path="/api/shop/pdf/tailor/collections" name="collections.pdf" label={t('tl.pdf.collections')} />
      {grid ? <GridSheet cols={cols.data ?? []} onClose={() => setGrid(false)} onSaved={(created, existing) => { setGrid(false); toast(t('tl.gridDone', { created, existing })); void reload(); }} /> : null}
      {sale ? <SaleSheet cols={cols.data ?? []} pre={sale.pre} onClose={() => setSale(null)} onSaved={() => { setSale(null); toast(t('tl.saleStarted')); void reload(); }} /> : null}
    </Screen>
  );
}
