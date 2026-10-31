import { useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';

import { DynamicFields, SelectField, cleanAttributes } from '@/components/dynamic-fields';
import { Icon } from '@/components/icon';
import { PartyPicker } from '@/components/party-picker';
import { ThemedText } from '@/components/themed-text';
import { Thumb } from '@/components/thumb';
import { UnitsEditor, unitsPayload, type UnitDraft } from '@/components/units-editor';
import { Badge, Btn, Card, Chips, Empty, ErrorNote, Hint, IconBtn, Input, NumberBox, Screen, Sheet, Skeleton, Switch, TextBox, useToast, type Tone } from '@/components/ui';
import { useLayout } from '@/hooks/use-layout';
import { useTheme } from '@/hooks/use-theme';
import { useT } from '@/i18n';
import { ApiError } from '@/lib/api';
import { confirmAction } from '@/lib/confirm';
import { formatDate, sellable, uuid, type Product } from '@/lib/format';
import { OfflineAdvice } from '@/components/offline-advice';
import { useCatalog } from '@/lib/catalog';
import { useOffline } from '@/lib/offline';
import { appendPhoto, pickPhoto } from '@/lib/photo';
import { useInfinite, useQuery } from '@/lib/query';
import { useShop } from '@/lib/shop';
import { LIST_PROPS } from '@/lib/list';
import { useLocalSearchParams } from 'expo-router';
import type { PageProps } from '../registry';

type Category = { id: string; name: string; productCount: number };
type Loc = { id: string; name: string };

function stockTone(p: Product): Tone | null {
  if (!p.trackStock) return null;
  const q = sellable(p);
  if (q <= 0) return 'danger';
  if (p.minStockAlert != null && q <= Number(p.minStockAlert)) return 'warning';
  return 'success';
}

export default function Products({ item, tab }: PageProps) {
  const { t, lang } = useT();
  const shop = useShop();
  const th = useTheme();
  const layout = useLayout();
  const offline = useOffline();
  const params = useLocalSearchParams<{ create?: string }>();
  const [q, setQ] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [status, setStatus] = useState('');
  const [editing, setEditing] = useState<Product | 'new' | null>(params.create && shop.can('PRODUCTS', 'create') && (!shop.siteAdmin || shop.delegated('CREATE_LOCAL_PRODUCTS')) ? 'new' : null);
  const [manage, setManage] = useState(false);
  const categories = useQuery<Category[]>('/api/shop/categories');
  const list = useInfinite<Product>('/api/shop/products', { q: q.trim(), categoryId, status });
  // un sous-admin ne cree des produits locaux que si le proprietaire le lui a delegue
  const canCreate = shop.can('PRODUCTS', 'create') && (!shop.siteAdmin || shop.delegated('CREATE_LOCAL_PRODUCTS'));


  const cols = layout.expanded ? 2 : 1;
  const chips = [{ value: '', label: t('ws.all') }, { value: 'low', label: t('ws.lowStock') }, { value: 'out', label: t('ws.outOfStock') }, ...(shop.has('EXPIRY') ? [{ value: 'expiring', label: shop.v('expiry') }] : [])];

  return (
    <Screen tabs={tab} fixed back={!tab} title={shop.tr(item.label)} subtitle={t('mob.countOf', { count: list.total })}
      right={<View style={{ flexDirection: 'row', gap: 8 }}>
        <IconBtn name="tags" label={shop.v('categories')} onPress={() => setManage(true)} />
        {canCreate ? <IconBtn name="plus" label={shop.v('newProduct')} tone="primary" onPress={() => setEditing('new')} /> : null}
      </View>}>
      <View style={s.search}>
        <Icon name="magnifying-glass" size={15} color={th.textSecondary} style={s.searchIcon} />
        <Input value={q} onChangeText={setQ} placeholder={shop.v('searchProduct')} style={s.searchInput} autoCapitalize="none" returnKeyType="search" />
        {q ? <Pressable onPress={() => setQ('')} hitSlop={10} style={s.clear} accessibilityLabel={t('ws.clear')}><Icon name="xmark" size={14} color={th.textSecondary} /></Pressable> : null}
      </View>
      <View style={{ gap: 6, marginBottom: 6 }}>
        <Chips value={status} onChange={setStatus} options={chips} />
        {(categories.data?.length ?? 0) > 0 ? <Chips value={categoryId} onChange={setCategoryId} options={[{ value: '', label: shop.v('categories') }, ...categories.data!.map((c) => ({ value: c.id, label: `${c.name} (${c.productCount})` }))]} /> : null}
      </View>
      {list.stale ? <Hint icon="cloud" tone="warning">{t('mob.showingSaved')}</Hint> : null}
      {list.error ? <ErrorNote message={list.error} onRetry={list.reload} /> : null}
      {list.loading && list.items.length === 0 ? <Skeleton rows={6} height={72} /> : (
        <FlatList {...LIST_PROPS}
          key={cols}
          data={list.items}
          numColumns={cols}
          keyExtractor={(p) => p.id}
          columnWrapperStyle={cols > 1 ? { gap: 10 } : undefined}
          contentContainerStyle={{ gap: 10, paddingBottom: 100 }}
          onEndReached={list.loadMore}
          onEndReachedThreshold={0.6}
          refreshing={list.refreshing}
          onRefresh={list.reload}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={(
            <Empty icon="box-open" title={q || categoryId || status ? t('ws.noResult') : shop.v('emptyProducts')}
              text={!q && !categoryId && !status && canCreate ? t('mob.emptyProductsHint', { products: shop.v('products').toLowerCase() }) : undefined}
              action={!q && !categoryId && !status && canCreate ? (
                <View style={{ gap: 12, alignItems: 'center' }}>
                  <Btn icon="plus" title={shop.v('newProduct')} onPress={() => setEditing('new')} />
                  <Hint icon="file-import">{t('imp.webOnlyHint')}</Hint>
                </View>
              ) : undefined} />
          )}
          ListFooterComponent={list.loadingMore ? <Skeleton height={64} /> : undefined}
          renderItem={({ item: p }) => {
            const tone = stockTone(p);
            return (
              <Pressable onPress={() => setEditing(p)} accessibilityRole="button" accessibilityLabel={p.name}
                style={({ pressed }) => [s.row, { backgroundColor: th.backgroundElement, opacity: pressed ? 0.75 : 1, flex: cols > 1 ? 1 : undefined }]}>
                <Thumb image={p.image} size={56} />
                <View style={s.rowText}>
                  <ThemedText type="smallBold" numberOfLines={2}>{p.name}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary" numberOfLines={1} style={{ fontSize: 12 }}>{[p.attributes?.dosage, p.attributes?.dci, p.categoryName].filter(Boolean).join(' · ') || p.unit}</ThemedText>
                  <View style={s.tags}>
                    {p.centralProduct === true ? <Badge tone="primary">{t('sa.centralBadge')}</Badge> : null}
                    {p.attributes?.prescription === true ? <Badge tone="info">Rx</Badge> : null}
                    {p.attributes?.controlled === true ? <Badge tone="danger">{t('ws.controlled')}</Badge> : null}
                    {Number(p.expiredQuantity) > 0 ? <Badge tone="danger">{t('ws.expiredQty', { n: Number(p.expiredQuantity) })}</Badge> : null}
                    {p.nextExpiry ? <Badge tone="info">{shop.v('expiry')} {formatDate(p.nextExpiry, lang, { month: 'short', year: 'numeric' })}</Badge> : null}
                  </View>
                </View>
                <View style={s.right}>
                  <ThemedText type="smallBold">{shop.money(p.salePrice)}</ThemedText>
                  {tone ? <Badge tone={tone}>{sellable(p)} {p.unit}</Badge> : null}
                  {!p.isActive ? <Badge>{t('ws.inactive')}</Badge> : null}
                </View>
              </Pressable>
            );
          }}
        />
      )}

      {editing ? (
        <ProductForm product={editing === 'new' ? null : editing} categories={categories.data ?? []} online={offline.online}
          onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void list.reload(); void categories.reload(); }} />
      ) : null}
      {manage ? <CategoriesSheet onClose={() => { setManage(false); void categories.reload(); void list.reload(); }} /> : null}
    </Screen>
  );
}

/** Champs comparables a la fusion : la fiche d'origine part avec la modification pour que le serveur sache ce qui a vraiment change. */
const MERGE_FIELDS = ['name', 'categoryId', 'sku', 'barcode', 'description', 'unit', 'costPrice', 'salePrice', 'trackStock', 'minStockAlert', 'trackLots', 'taxRate', 'locationId', 'supplierId', 'isActive', 'attributes'] as const;
const baseOf = (p: Product) => Object.fromEntries(MERGE_FIELDS.map((k) => [k, (p as Record<string, unknown>)[k] ?? null]));

const EMPTY = { name: '', kind: 'PRODUCT', categoryId: '', sku: '', barcode: '', description: '', unit: '', costPrice: '', salePrice: '', taxRate: '', trackStock: true,
  trackLots: false, minStockAlert: '', locationId: '', supplierId: null as string | null, attributes: {} as Record<string, any>, opening: { quantity: '', lotNumber: '', expiryDate: '', unitCost: '' } };

function ProductForm({ product, categories, online, onClose, onSaved }: { product: Product | null; categories: Category[]; online: boolean; onClose: () => void; onSaved: () => void }) {
  const { t } = useT();
  const shop = useShop();
  const toast = useToast();
  const offline = useOffline();
  const catalog = useCatalog();
  const id = useRef(product?.id ?? uuid());
  const editing = Boolean(product);
  const locations = useQuery<Loc[]>(shop.has('LOCATIONS') ? '/api/shop/locations' : null);
  const [photo, setPhoto] = useState<{ uri: string; name: string; type: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ownUnit, setOwnUnit] = useState(false);
  const customUnits = useQuery<string[]>('/api/shop/units');
  const [unitDrafts, setUnitDrafts] = useState<UnitDraft[]>(() => (product?.units ?? []).map((u) => ({ id: u.id, label: u.label, factor: String(Number(u.factor)), price: u.fixedPrice ? String(Number(u.price)) : '', barcode: u.barcode ?? '', isDefault: u.isDefault })));
  const [f, setF] = useState(() => (product ? {
    ...EMPTY, ...product, categoryId: product.categoryId ?? '', locationId: product.locationId ?? '', costPrice: String(product.costPrice ?? ''), salePrice: String(product.salePrice ?? ''),
    taxRate: String(product.taxRate ?? ''), minStockAlert: product.minStockAlert != null ? String(product.minStockAlert) : '', sku: product.sku ?? '', barcode: product.barcode ?? '',
    description: product.description ?? '', attributes: product.attributes ?? {}, supplierId: product.supplierId ?? null,
  } : { ...EMPTY, unit: shop.ws.manifest.units?.[0]?.value ?? 'piece', trackLots: shop.has('EXPIRY') && shop.config.lotTracking === true, taxRate: String(shop.config.taxRate ?? 0) }));
  const set = <K extends keyof typeof EMPTY>(k: K, v: (typeof EMPTY)[K]) => setF((s) => ({ ...s, [k]: v }));
  const service = f.kind === 'SERVICE';
  const margin = Number(f.salePrice) > 0 && Number(f.costPrice) > 0 ? Math.round(((Number(f.salePrice) - Number(f.costPrice)) / Number(f.salePrice)) * 100) : null;
  const units = shop.ws.manifest.units ?? [];
  // fiche diffusee par l'enseigne : seul le proprietaire en change le contenu ; un sous-admin n'ajuste que le prix de vente de son site, s'il en a le droit
  const locked = product?.centralProduct === true && !shop.owner;
  const priceLocked = locked && !(shop.siteAdmin && shop.delegated('EDIT_CENTRAL_PRODUCT_PRICES'));

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        id: id.current, name: f.name.trim(), kind: f.kind, categoryId: f.categoryId || null, sku: f.sku, barcode: f.barcode, description: f.description, unit: f.unit,
        costPrice: Number(f.costPrice || 0), salePrice: Number(f.salePrice || 0), taxRate: Number(f.taxRate || 0), trackStock: !service && f.trackStock,
        trackLots: !service && f.trackStock && Boolean(f.trackLots), minStockAlert: f.minStockAlert === '' ? null : Number(f.minStockAlert),
        locationId: f.locationId || null, supplierId: f.supplierId || null, attributes: cleanAttributes(f.attributes), baseVersion: editing ? product!.version : undefined,
        units: shop.has('UNIT_PACKS') && !service ? unitsPayload(unitDrafts) : undefined,
      };
      if (!editing && !service && f.trackStock && Number(f.opening.quantity) > 0) {
        body.openingStock = { quantity: Number(f.opening.quantity), lotNumber: f.opening.lotNumber || undefined, expiryDate: f.opening.expiryDate || undefined, unitCost: f.opening.unitCost === '' ? undefined : Number(f.opening.unitCost) };
      }
      let saved: Product;
      if (editing || !photo) {
        // creation (sans photo) et modification fonctionnent sans reseau ; en modification, la fiche d'origine et l'heure reelle partent avec elle :
        // si quelqu'un d'autre a modifie la fiche entre-temps, le serveur fusionne champ par champ au lieu de refuser
        const sent = editing ? { ...body, base: baseOf(product!), editedAt: new Date().toISOString() } : body;
        const res = await offline.submit<Product>({ id: editing ? uuid() : id.current, shopId: shop.shopId, method: editing ? 'PUT' : 'POST', path: editing ? `/api/shop/products/${product!.id}` : '/api/shop/products', body: sent, kind: editing ? 'edit' : 'product', label: `${t(editing ? 'mob.labelEdit' : 'mob.labelNewProduct')} · ${f.name.trim()}` });
        if (res.queued) {
          const opening = Number((body.openingStock as { quantity?: number } | undefined)?.quantity ?? 0);
          catalog.upsertLocal(editing ? { ...product!, ...Object.fromEntries(MERGE_FIELDS.filter((k) => k in body).map((k) => [k, body[k]])) } as Product
            : { id: id.current, ...body, categoryName: null, stock: opening, expiredQuantity: 0, nextExpiry: null, units: [], image: null, version: 0, isActive: true } as unknown as Product);
          toast(t(editing ? 'mob.queuedGeneric' : 'mob.productQueued'), 'warning');
          if (photo) toast(t('mob.photoLater'), 'warning');
          return onSaved();
        }
        saved = res.data;
      } else {
        saved = await shop.call<Product>('/api/shop/products', { method: 'POST', body });
      }
      if (photo) {
        const form = new FormData();
        await appendPhoto(form, 'file', photo);
        form.append('mediaId', uuid());
        await shop.call<Product>(`/api/shop/products/${saved.id}/image`, { method: 'POST', body: form });
      }
      toast(t('ws.saved'));
      onSaved();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('common.network'));
      setBusy(false);
    }
  }

  async function remove() {
    if (!(await confirmAction(t('ws.deleteTitle', { name: product!.name }), t('ws.deleteText'), t('ws.delete'), t('common.cancel')))) return;
    try {
      await shop.call(`/api/shop/products/${product!.id}`, { method: 'DELETE' });
      toast(t('ws.deleted'));
      onSaved();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('common.network'));
    }
  }

  const choosePhoto = async () => {
    const source = await new Promise<'camera' | 'library' | null>((resolve) => {
      // sur le web la camera n'existe pas : on va directement a la galerie
      resolve('library');
    });
    if (source) setPhoto(await pickPhoto(source));
  };

  if (locked) {
    return (
      <Sheet visible title={product!.name} onClose={onClose}
        footer={<Btn title={busy ? t('settings.saving') : t('common.save')} icon="check" disabled={busy || priceLocked || Number(f.salePrice) < 0} loading={busy} onPress={submit} />}>
        {editing ? <OfflineAdvice kind={Number(f.salePrice || 0) !== Number(product!.salePrice) || Number(f.costPrice || 0) !== Number(product!.costPrice) ? 'price' : 'edit'} /> : null}
        {error ? <Hint icon="circle-xmark" tone="danger">{error}</Hint> : null}
        <Hint icon="lock">{t('sa.centralHint')}</Hint>
        <Card style={{ gap: 12 }}>
          <ThemedText type="smallBold">{t('ws.prices')} ({shop.currency})</ThemedText>
          <NumberBox label={`${t('ws.salePrice')} *`} value={f.salePrice} onChange={(v) => set('salePrice', v)} editable={!priceLocked} />
          <ThemedText type="small" themeColor="textSecondary">{priceLocked ? t('sa.centralPriceLocked') : t('sa.centralPrice')}</ThemedText>
        </Card>
      </Sheet>
    );
  }

  return (
    <Sheet visible tall title={editing ? product!.name : shop.v('newProduct')} onClose={onClose}
      footer={(
        <View style={{ gap: 8 }}>
          <Btn title={busy ? t('settings.saving') : t('common.save')} icon="check" disabled={busy || f.name.trim().length < 1 || (ownUnit && f.unit.trim().length < 1) || (Number(f.salePrice) < 0)} loading={busy} onPress={submit} />
          {editing && shop.can('PRODUCTS', 'delete') ? <Btn variant="danger" icon="trash" title={t('ws.delete')} onPress={remove} disabled={!online} /> : null}
        </View>
      )}>
      {!online && editing ? <Hint icon="cloud" tone="warning">{t('mob.deleteNeedsNetwork')}</Hint> : null}
      {error ? <Hint icon="circle-xmark" tone="danger">{error}</Hint> : null}

      <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
        <Pressable onPress={choosePhoto} accessibilityRole="button" accessibilityLabel={t('ws.addPhoto')}>
          {photo ? <Thumb image={{ id: 'x', variants: { sm: { webp: photo.uri, width: 88, height: 88 } } }} size={88} /> : <View><Thumb image={product?.image} size={88} icon="camera" /></View>}
        </Pressable>
        <View style={{ flex: 1, gap: 4 }}>
          <TextBox label={`${t('ws.name')} *`} value={f.name} onChangeText={(v) => set('name', v)} maxLength={200} autoCapitalize="sentences" />
        </View>
      </View>
      <ThemedText type="small" themeColor="textSecondary">{t('ws.photoHint')}</ThemedText>

      {!editing ? (
        <Chips scroll={false} value={f.kind} onChange={(v) => set('kind', v)} options={[{ value: 'PRODUCT', label: shop.v('product') }, { value: 'SERVICE', label: t('ws.service') }]} />
      ) : null}

      <SelectField label={shop.v('category')} value={f.categoryId} onChange={(v) => set('categoryId', v)} options={categories.map((c) => ({ value: c.id, label: c.name }))} />
      <SelectField label={t('ws.unit')} value={ownUnit ? '__new' : f.unit} required onChange={(v) => { if (v === '__new') { setOwnUnit(true); set('unit', ''); } else { setOwnUnit(false); set('unit', v); } }}
        options={[...units.map((u) => ({ value: u.value, label: shop.tr(u.label) })),
          ...(customUnits.data ?? []).filter((c) => !units.some((u) => u.value === c)).map((c) => ({ value: c, label: c })),
          ...(f.unit && !ownUnit && !units.some((u) => u.value === f.unit) && !(customUnits.data ?? []).includes(f.unit) ? [{ value: f.unit, label: f.unit }] : []),
          { value: '__new', label: `＋ ${t('mob.newUnit')}` }]} />
      {ownUnit ? <TextBox label={t('mob.newUnitName')} value={f.unit} onChangeText={(v) => set('unit', v)} maxLength={30} hint={t('mob.newUnitHint')} autoCapitalize="none" autoFocus /> : null}

      <Card style={{ gap: 12 }}>
        <ThemedText type="smallBold">{t('ws.prices')} ({shop.currency})</ThemedText>
        {!service ? <NumberBox label={t('ws.costPrice')} value={f.costPrice} onChange={(v) => set('costPrice', v)} /> : null}
        <NumberBox label={`${t('ws.salePrice')} *`} value={f.salePrice} onChange={(v) => set('salePrice', v)} />
        <NumberBox label={`${t('ws.taxRate')} (%)`} value={f.taxRate} onChange={(v) => set('taxRate', v)} />
        {margin !== null ? <ThemedText type="small" themeColor={margin < 0 ? 'danger' : 'textSecondary'}>{t('ws.marginPct', { pct: margin })}</ThemedText> : null}
      </Card>

      {shop.has('UNIT_PACKS') && !service ? <UnitsEditor baseUnit={f.unit} salePrice={f.salePrice} value={unitDrafts} onChange={setUnitDrafts} /> : null}

      <DynamicFields defs={shop.ws.manifest.productFields ?? []} groups={shop.ws.manifest.groups} values={f.attributes} onChange={(a) => set('attributes', a)} />

      <Card style={{ gap: 12 }}>
        <ThemedText type="smallBold">{t('ws.codes')}</ThemedText>
        <TextBox label={t('ws.sku')} value={f.sku} onChangeText={(v) => set('sku', v)} maxLength={60} />
        <TextBox label={t('ws.barcode')} value={f.barcode} onChangeText={(v) => set('barcode', v)} keyboardType="number-pad" maxLength={60} />
        <TextBox label={t('ws.description')} value={f.description} onChangeText={(v) => set('description', v)} maxLength={500} multiline numberOfLines={2} autoCapitalize="sentences" />
      </Card>

      {!service && shop.has('STOCK') ? (
        <Card style={{ gap: 12 }}>
          <ThemedText type="smallBold">{shop.v('stock')}</ThemedText>
          <Switch label={t('ws.trackStock')} value={f.trackStock} onChange={(v) => set('trackStock', v)} />
          {f.trackStock ? (
            <>
              <NumberBox label={t('ws.minStock')} value={f.minStockAlert} onChange={(v) => set('minStockAlert', v)} placeholder={String(shop.config.defaultMinStock ?? '')} />
              {shop.has('LOCATIONS') ? <SelectField label={shop.v('location')} value={f.locationId} onChange={(v) => set('locationId', v)} options={(locations.data ?? []).map((l) => ({ value: l.id, label: l.name }))} /> : null}
              {shop.has('SUPPLIERS') ? <PartyPicker role="SUPPLIER" label={t('ws.mainSupplier')} value={f.supplierId} onChange={(sid) => set('supplierId', sid)} /> : null}
              {shop.has('EXPIRY') ? <Switch label={t('ws.trackLots')} value={Boolean(f.trackLots)} onChange={(v) => set('trackLots', v)} /> : null}
              {!editing ? (
                <View style={{ gap: 12 }}>
                  <ThemedText type="smallBold">{t('ws.openingStock')}</ThemedText>
                  <NumberBox label={shop.v('quantity')} value={f.opening.quantity} onChange={(v) => setF((s) => ({ ...s, opening: { ...s.opening, quantity: v } }))} />
                  {f.trackLots ? <TextBox label={`${t('ws.lotNumber')} *`} value={f.opening.lotNumber} onChangeText={(v) => setF((s) => ({ ...s, opening: { ...s.opening, lotNumber: v } }))} /> : null}
                  {f.trackLots ? <TextBox label={`${shop.v('expiry')}${shop.config.lotRequiresExpiry ? ' *' : ''}`} value={f.opening.expiryDate} placeholder="AAAA-MM-JJ" maxLength={10} onChangeText={(v) => setF((s) => ({ ...s, opening: { ...s.opening, expiryDate: v } }))} /> : null}
                </View>
              ) : null}
            </>
          ) : null}
        </Card>
      ) : null}
    </Sheet>
  );
}

function CategoriesSheet({ onClose }: { onClose: () => void }) {
  const { t } = useT();
  const shop = useShop();
  const toast = useToast();
  const list = useQuery<Category[]>('/api/shop/categories');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const run = async (fn: () => Promise<unknown>) => { try { setError(null); await fn(); await list.reload(); } catch (e) { setError(e instanceof ApiError ? e.message : t('common.network')); } };
  return (
    <Sheet visible title={shop.v('categories')} onClose={onClose}>
      <Hint icon="lightbulb">{t('mob.categoriesHint')}</Hint>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Input style={{ flex: 1 }} value={name} onChangeText={setName} placeholder={t('ws.newCategory')} maxLength={100} autoCapitalize="sentences" />
        <IconBtn name="plus" label={t('ws.add')} tone="primary" size={50} onPress={() => name.trim() && run(async () => { await shop.call('/api/shop/categories', { method: 'POST', body: { id: uuid(), name: name.trim() } }); setName(''); })} />
      </View>
      {error ? <Hint icon="circle-xmark" tone="danger">{error}</Hint> : null}
      {(list.data ?? []).map((c) => (
        <CategoryRow key={c.id} c={c}
          onRename={(n) => run(() => shop.call(`/api/shop/categories/${c.id}`, { method: 'PUT', body: { name: n } }))}
          onDelete={async () => { if (await confirmAction(t('ws.deleteTitle', { name: c.name }), t('ws.deleteCategoryText'), t('ws.delete'), t('common.cancel'))) { await run(() => shop.call(`/api/shop/categories/${c.id}`, { method: 'DELETE' })); toast(t('ws.deleted')); } }} />
      ))}
    </Sheet>
  );
}

function CategoryRow({ c, onRename, onDelete }: { c: Category; onRename: (n: string) => void; onDelete: () => void }) {
  const th = useTheme();
  const [edit, setEdit] = useState(false);
  const [v, setV] = useState(c.name);
  return (
    <View style={[s.catRow, { backgroundColor: th.backgroundElement }]}>
      {edit ? <Input style={{ flex: 1 }} value={v} onChangeText={setV} autoFocus autoCapitalize="sentences" onSubmitEditing={() => { onRename(v.trim()); setEdit(false); }} />
        : <ThemedText style={{ flex: 1 }} type="smallBold" numberOfLines={1}>{c.name} <ThemedText type="small" themeColor="textSecondary">· {c.productCount}</ThemedText></ThemedText>}
      <IconBtn name={edit ? 'check' : 'pen'} label="edit" size={36} onPress={() => { if (edit) onRename(v.trim()); setEdit(!edit); }} />
      <IconBtn name="trash" label="delete" size={36} tone="danger" onPress={onDelete} />
    </View>
  );
}

const s = StyleSheet.create({
  search: { justifyContent: 'center', marginBottom: 4 },
  searchIcon: { position: 'absolute', left: 15, zIndex: 1 },
  searchInput: { paddingLeft: 40, paddingRight: 40 },
  clear: { position: 'absolute', right: 14, padding: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 18 },
  rowText: { flex: 1, minWidth: 0, gap: 3 },
  tags: { flexDirection: 'row', gap: 4, flexWrap: 'wrap' },
  right: { alignItems: 'flex-end', gap: 4 },
  catRow: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 16 },
});
