import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Badge, Btn, Card, Chips, Empty, ErrorNote, Hint, IconBtn, Input, NumberBox, Screen, Sheet, Skeleton, Stack, Switch, TextBox, useToast } from '@/components/ui';
import { useT } from '@/i18n';
import { api, ApiError, NetworkError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { ListFooter } from '@/components/list-footer';
import { useOrgInfinite, useOrgQuery, type CatalogProduct } from '@/lib/org';

type Form = {
  name: string; kind: 'PRODUCT' | 'SERVICE'; sku: string; barcode: string; description: string; unit: string;
  costPrice: string; salePrice: string; minStockAlert: string; trackStock: boolean; siteIds: string[];
};

const blank = (siteIds: string[]): Form => ({ name: '', kind: 'PRODUCT', sku: '', barcode: '', description: '', unit: 'piece', costPrice: '', salePrice: '', minStockAlert: '', trackStock: true, siteIds });

/** Catalogue central : une fiche creee une fois, attribuee aux sites choisis. Chaque site garde son stock et son prix local. */
export default function OrganizationCatalog() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useT();
  const { profile } = useAuth();
  const owner = profile?.accountType === 'MERCHANT';
  const [search, setSearch] = useState('');
  // le catalogue arrive par pages de 24 au defilement, et la recherche se fait cote serveur : jamais tout le catalogue d'un coup
  const products = useOrgInfinite<CatalogProduct>(owner ? `/api/merchant/organizations/${id}/catalog` : null, { q: search.trim() });
  const siteList = useOrgQuery<{ id: string; name: string; city?: string; country?: string }[]>(owner ? `/api/merchant/organizations/${id}/catalog/sites` : null);
  const [editing, setEditing] = useState<CatalogProduct | 'new' | null>(null);
  const sites = siteList.data ?? [];
  const offline = products.stale || siteList.stale;

  if (!owner) return <Screen title={t('orgc.title')}><Empty icon="lock" title={t('org.ownerOnly')} /></Screen>;
  if (products.error && products.items.length === 0 && !products.loading) return <Screen title={t('orgc.title')}><ErrorNote message={products.error === 'network' ? t('common.network') : products.error} onRetry={products.reload} /></Screen>;

  return (
    <Screen title={t('orgc.title')} subtitle={t('orgc.subtitle')} onRefresh={async () => { await products.reload(); await siteList.reload(); }} onEndReached={products.loadMore}
      right={<IconBtn name="plus" label={t('orgc.add')} tone="primary" onPress={() => setEditing('new')} />}>
      <Hint icon="circle-info">{t('orgc.note')}</Hint>
      {offline ? <Hint icon="cloud" tone="warning">{t('orgc.needsNetwork')}</Hint> : null}
      <Input value={search} onChangeText={setSearch} placeholder={t('orgc.search')} autoCapitalize="none" returnKeyType="search" />
      {products.loading && products.items.length === 0 ? <Skeleton rows={4} height={96} /> : null}
      {!products.loading && products.items.length === 0 ? <Empty icon="boxes-stacked" title={t('orgc.empty')} text={t('orgc.emptyText')} action={<Btn icon="plus" title={t('orgc.add')} onPress={() => setEditing('new')} />} /> : null}
      <Stack gap={10}>
        {products.items.map((p) => (
          <Card key={p.id} onPress={() => setEditing(p)} style={{ gap: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <ThemedText type="smallBold" style={{ flex: 1, fontSize: 16 }} numberOfLines={2}>{p.name}</ThemedText>
              <Badge tone="info">{t(p.kind === 'SERVICE' ? 'orgc.kindService' : 'orgc.kindProduct')}</Badge>
            </View>
            <ThemedText type="small" themeColor="textSecondary">{[p.sku && `${t('orgc.sku')} ${p.sku}`, p.barcode].filter(Boolean).join(' · ') || t('orgc.noRef')}</ThemedText>
            <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
              {p.sites.length > 0 ? p.sites.map((s) => <Badge key={s.shopId}>{s.shopName}</Badge>) : <Badge tone="warning">{t('orgc.notAssigned')}</Badge>}
            </View>
          </Card>
        ))}
      </Stack>
      <ListFooter shown={products.items.length} total={products.total} hasMore={products.hasMore} loading={products.loadingMore} failed={products.moreError} onMore={products.loadMore} />
      {editing ? (
        <CatalogForm organizationId={id} product={editing === 'new' ? null : editing} sites={sites} online={!offline}
          onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void products.reload(); }} />
      ) : null}
    </Screen>
  );
}

function CatalogForm({ organizationId, product, sites, online, onClose, onSaved }: {
  organizationId: string; product: CatalogProduct | null; sites: { id: string; name: string; city?: string; country?: string }[]; online: boolean; onClose: () => void; onSaved: () => void;
}) {
  const { t } = useT();
  const toast = useToast();
  const [f, setF] = useState<Form>(() => product ? {
    name: product.name, kind: product.kind, sku: product.sku ?? '', barcode: product.barcode ?? '', description: product.description ?? '', unit: product.unit,
    costPrice: String(product.costPrice ?? ''), salePrice: String(product.salePrice ?? ''), minStockAlert: product.minStockAlert != null ? String(product.minStockAlert) : '',
    trackStock: product.trackStock, siteIds: product.sites.map((s) => s.shopId),
  } : blank(sites.map((s) => s.id)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof Form>(k: K) => (v: Form[K]) => setF((s) => ({ ...s, [k]: v }));
  const toggleSite = (sid: string) => setF((s) => ({ ...s, siteIds: s.siteIds.includes(sid) ? s.siteIds.filter((x) => x !== sid) : [...s.siteIds, sid] }));

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const body = {
        name: f.name.trim(), kind: f.kind, sku: f.sku, barcode: f.barcode, description: f.description, unit: f.unit.trim() || 'piece',
        costPrice: f.costPrice === '' ? 0 : Number(f.costPrice), salePrice: f.salePrice === '' ? 0 : Number(f.salePrice),
        minStockAlert: f.minStockAlert === '' ? null : Number(f.minStockAlert), trackStock: f.kind === 'PRODUCT' && f.trackStock, active: true, siteIds: f.siteIds,
      };
      await api(product ? `/api/merchant/organizations/${organizationId}/catalog/${product.id}` : `/api/merchant/organizations/${organizationId}/catalog`, { method: product ? 'PUT' : 'POST', body });
      toast(t('orgc.saved'));
      onSaved();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : e instanceof NetworkError ? t('common.network') : t('common.error'));
      setBusy(false);
    }
  }

  return (
    <Sheet visible tall title={product ? product.name : t('orgc.new')} onClose={onClose}
      footer={<Btn icon="check" title={product ? t('common.save') : t('orgc.create')} loading={busy} disabled={busy || !online || !f.name.trim()} onPress={submit} />}>
      {!online ? <Hint icon="cloud" tone="warning">{t('orgc.needsNetwork')}</Hint> : null}
      {error ? <Hint icon="circle-xmark" tone="danger">{error}</Hint> : null}
      <TextBox label={`${t('orgc.name')} *`} value={f.name} onChangeText={set('name')} maxLength={200} autoCapitalize="sentences" />
      <Chips scroll={false} value={f.kind} onChange={set('kind')} options={[{ value: 'PRODUCT', label: t('orgc.kindProduct') }, { value: 'SERVICE', label: t('orgc.kindService') }]} />
      <TextBox label={t('orgc.sku')} value={f.sku} onChangeText={set('sku')} autoCapitalize="characters" maxLength={60} />
      <TextBox label={t('orgc.barcode')} value={f.barcode} onChangeText={set('barcode')} keyboardType="number-pad" maxLength={60} />
      <TextBox label={t('orgc.unit')} value={f.unit} onChangeText={set('unit')} maxLength={30} autoCapitalize="none" />
      <NumberBox label={t('orgc.cost')} value={f.costPrice} onChange={set('costPrice')} />
      <NumberBox label={t('orgc.sale')} value={f.salePrice} onChange={set('salePrice')} hint={t('orgc.saleHint')} />
      {f.kind === 'PRODUCT' ? <NumberBox label={t('orgc.minStock')} value={f.minStockAlert} onChange={set('minStockAlert')} /> : null}
      <TextBox label={t('orgc.description')} value={f.description} onChangeText={set('description')} maxLength={500} multiline numberOfLines={2} autoCapitalize="sentences" />
      {f.kind === 'PRODUCT' ? <Switch label={t('orgc.trackStock')} value={f.trackStock} onChange={set('trackStock')} /> : null}
      <View style={{ gap: 8 }}>
        <ThemedText type="smallBold">{t('orgc.sitesTitle')}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">{t('orgc.sitesHint')}</ThemedText>
        {sites.map((s) => <Switch key={s.id} label={s.name} hint={[s.city, s.country].filter(Boolean).join(' · ') || undefined} value={f.siteIds.includes(s.id)} onChange={() => toggleSite(s.id)} />)}
      </View>
    </Sheet>
  );
}
