import { useRef, useState } from 'react';
import { FlatList, Linking, Pressable, StyleSheet, View } from 'react-native';

import { CustomerAccount } from '@/components/customer-account';
import { PartyHistory } from '@/components/party-history';
import { DynamicFields, SelectField, cleanAttributes } from '@/components/dynamic-fields';
import { Icon } from '@/components/icon';
import { PdfButton } from '@/components/pdf-button';
import { ThemedText } from '@/components/themed-text';
import { Badge, Btn, Card, Chips, Empty, ErrorNote, Hint, IconBtn, Input, NumberBox, Screen, Sheet, Skeleton, TextBox, useToast } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { useT } from '@/i18n';
import { ApiError } from '@/lib/api';
import { confirmAction } from '@/lib/confirm';
import { formatDate, uuid } from '@/lib/format';
import { OfflineAdvice } from '@/components/offline-advice';
import { useOffline } from '@/lib/offline';
import { usePricing } from '@/lib/pricing';
import { qs, useInfinite, useQuery, type Page } from '@/lib/query';
import { useShop } from '@/lib/shop';
import { LIST_PROPS } from '@/lib/list';
import type { PageProps } from '../registry';

const ROLES: Record<string, { feature: string; plural: string; one: string; icon: string; sales: string | null }> = {
  CUSTOMER: { feature: 'CUSTOMERS', plural: 'customers', one: 'newCustomer', icon: 'users', sales: 'SALE' },
  SUPPLIER: { feature: 'SUPPLIERS', plural: 'suppliers', one: 'newSupplier', icon: 'handshake', sales: 'GOODS_RECEIPT' },
  INSURER: { feature: 'INSURANCE', plural: 'insurers', one: 'newInsurer', icon: 'shield', sales: null },
};
type Party = { id: string; name: string; phone?: string; city?: string; receivable?: number; payable?: number; roles?: string[]; version?: number; attributes?: Record<string, any>; [k: string]: any };

/** Un seul ecran pour tous les tiers (clients/patients, fournisseurs, assureurs) : le role choisit la fonction et les mots du metier. */
export default function Parties({ item, tab }: PageProps) {
  const { t } = useT();
  const shop = useShop();
  const th = useTheme();
  const role = (item.params?.role as string) ?? 'CUSTOMER';
  const cfg = ROLES[role] ?? ROLES.CUSTOMER;
  const customer = role === 'CUSTOMER';
  const [q, setQ] = useState('');
  const [withBalance, setWithBalance] = useState(false);
  const [editing, setEditing] = useState<Party | 'new' | null>(null);
  const list = useInfinite<Party>('/api/shop/parties', { role, q: q.trim(), withBalance: withBalance ? true : undefined });
  const plural = shop.v(cfg.plural);
  const canCreate = shop.can(cfg.feature, 'create');
  const showBalance = customer ? shop.has('DEBTS') : role === 'SUPPLIER' && shop.has('PURCHASE_ORDERS');

  return (
    <Screen tabs={tab} fixed title={plural} subtitle={t('mob.countOf', { count: list.total })}
      right={canCreate ? <IconBtn name="plus" tone="primary" label={shop.v(cfg.one)} onPress={() => setEditing('new')} /> : undefined}>
      <View style={s.search}>
        <Icon name="magnifying-glass" size={15} color={th.textSecondary} style={s.searchIcon} />
        <Input value={q} onChangeText={setQ} placeholder={shop.v('searchParty')} style={s.searchInput} autoCapitalize="none" />
      </View>
      {showBalance ? <View style={{ marginBottom: 6 }}><Chips value={withBalance ? 'b' : ''} onChange={(v) => setWithBalance(v === 'b')} options={[{ value: '', label: t('ws.all') }, { value: 'b', label: t('ws.withBalance') }]} /></View> : null}
      {list.stale ? <Hint icon="cloud" tone="warning">{t('mob.showingSaved')}</Hint> : null}
      {list.error ? <ErrorNote message={list.error} onRetry={list.reload} /> : null}
      {list.loading && list.items.length === 0 ? <Skeleton rows={6} height={64} /> : (
        <FlatList {...LIST_PROPS}
          data={list.items}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ gap: 8, paddingBottom: 100 }}
          onEndReached={list.loadMore}
          onEndReachedThreshold={0.6}
          refreshing={list.refreshing}
          onRefresh={list.reload}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={<Empty icon={cfg.icon} title={q ? t('ws.noResult') : t('ws.noParties', { who: plural.toLowerCase() })} text={!q && canCreate ? t('mob.emptyPartiesHint') : undefined}
            action={!q && canCreate ? <Btn icon="plus" title={shop.v(cfg.one)} onPress={() => setEditing('new')} /> : undefined} />}
          renderItem={({ item: p }) => {
            const owed = Number(customer ? p.receivable : p.payable);
            return (
              <Pressable onPress={() => setEditing(p)} accessibilityRole="button" style={({ pressed }) => [s.row, { backgroundColor: th.backgroundElement, opacity: pressed ? 0.75 : 1 }]}>
                <View style={[s.avatar, { backgroundColor: th.backgroundSelected }]}><ThemedText type="smallBold" themeColor="primary">{p.name.slice(0, 1).toUpperCase()}</ThemedText></View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <ThemedText type="smallBold" numberOfLines={1}>{p.name}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>{[p.phone, p.city].filter(Boolean).join(' · ') || '—'}</ThemedText>
                </View>
                {p.customerType ? <Badge tone="info">{p.customerType}</Badge> : null}
                {owed > 0 ? <Badge tone="warning">{shop.money(owed)}</Badge> : null}
              </Pressable>
            );
          }}
        />
      )}
      {editing ? <PartyForm party={editing === 'new' ? null : editing} role={role} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void list.reload(); }} /> : null}
    </Screen>
  );
}

const PARTY_MERGE = ['name', 'contactName', 'phone', 'whatsapp', 'email', 'address', 'city', 'taxId', 'notes', 'creditLimit', 'paymentTermsDays', 'customerType', 'attributes'];
const EMPTY = { customerType: '', name: '', contactName: '', phone: '', whatsapp: '', email: '', address: '', city: '', taxId: '', notes: '', creditLimit: '', paymentTermsDays: '', attributes: {} as Record<string, any> };

function PartyForm({ party, role, onClose, onSaved }: { party: Party | null; role: string; onClose: () => void; onSaved: () => void }) {
  const { t, lang } = useT();
  const shop = useShop();
  const toast = useToast();
  const offline = useOffline();
  const pricing = usePricing();
  const cfg = ROLES[role];
  const customer = role === 'CUSTOMER';
  const id = useRef(party?.id ?? uuid());
  const [f, setF] = useState(() => (party ? { ...EMPTY, ...Object.fromEntries(Object.entries(party).map(([k, v]) => [k, v == null ? '' : typeof v === 'object' ? v : String(v)])), attributes: party.attributes ?? {} } as typeof EMPTY : EMPTY));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof EMPTY) => (v: string) => setF((s) => ({ ...s, [k]: v }));
  const allowedDocs = cfg.sales && (customer ? shop.can('SALES', 'view') : shop.can('STOCK', 'view'));
  const docs = useQuery<Page<{ id: string; number: string; issuedAt: string; total: number; paymentStatus: string }>>(party && allowedDocs ? `/api/shop/documents${qs({ type: cfg.sales, partyId: party.id, size: 8 })}` : null);

  async function submit() {
    setBusy(true);
    setError(null);
    const body = { id: id.current, roles: party?.roles ?? [role], name: f.name.trim(), contactName: f.contactName, phone: f.phone, whatsapp: f.whatsapp, email: f.email, address: f.address, city: f.city,
      taxId: f.taxId, notes: f.notes, attributes: cleanAttributes(f.attributes), creditLimit: f.creditLimit === '' ? null : Number(f.creditLimit),
      paymentTermsDays: f.paymentTermsDays === '' ? null : Number(f.paymentTermsDays), baseVersion: party?.version,
      ...(customer && pricing.active ? { customerType: f.customerType || null } : {}) };
    try {
      if (party) {
        // modification possible sans reseau : la fiche d'origine part avec elle, le serveur fusionne champ par champ si besoin
        const base = Object.fromEntries(PARTY_MERGE.map((k) => [k, (party as Record<string, unknown>)[k] ?? null]));
        const res = await offline.submit({ id: uuid(), shopId: shop.shopId, method: 'PUT', path: `/api/shop/parties/${party.id}`, body: { ...body, base, editedAt: new Date().toISOString() }, kind: 'edit', label: `${t('mob.labelEdit')} · ${f.name.trim()}` });
        toast(res.queued ? t('mob.queuedGeneric') : t('ws.saved'), res.queued ? 'warning' : 'success');
        return onSaved();
      } else {
        // une nouvelle fiche peut etre creee sans reseau (identifiant choisi ici, pas de doublon possible)
        const res = await offline.submit({ id: id.current, shopId: shop.shopId, method: 'POST', path: '/api/shop/parties', body, label: `${shop.v(cfg.one)} · ${f.name.trim()}` });
        if (res.queued) toast(t('mob.partyQueued'), 'warning');
        else toast(t('ws.saved'));
        return onSaved();
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('common.network'));
      setBusy(false);
    }
  }

  async function remove() {
    if (!(await confirmAction(t('ws.deleteTitle', { name: party!.name }), t('ws.deletePartyText'), t('ws.delete'), t('common.cancel')))) return;
    try {
      await shop.call(`/api/shop/parties/${party!.id}`, { method: 'DELETE' });
      toast(t('ws.deleted'));
      onSaved();
    } catch (e) { setError(e instanceof ApiError ? e.message : t('common.network')); }
  }

  const phone = (f.whatsapp || f.phone).replace(/\D/g, '');
  return (
    <Sheet visible tall title={party ? party.name : shop.v(cfg.one)} onClose={onClose}
      footer={(
        <View style={{ gap: 8 }}>
          <Btn icon="check" title={t('common.save')} disabled={busy || !f.name.trim()} loading={busy} onPress={submit} />
          {party && offline.online ? <PdfButton path={`/api/shop/pdf/parties/${party.id}/statement`} name={`releve-${party.name}.pdf`} label={t('pdf.statement')} /> : null}
          {party && shop.can(cfg.feature, 'delete') ? <Btn variant="danger" icon="trash" title={t('ws.delete')} onPress={remove} disabled={!offline.online} /> : null}
        </View>
      )}>
      {party ? <OfflineAdvice kind={Number(f.creditLimit || 0) !== Number(party.creditLimit || 0) ? 'price' : 'edit'} /> : null}
      {!party && !offline.online ? <Hint icon="cloud-arrow-up" tone="info">{t('mob.createOfflineOk')}</Hint> : null}
      {error ? <Hint icon="circle-xmark" tone="danger">{error}</Hint> : null}
      {party && (Number(party.receivable) > 0 || Number(party.payable) > 0) ? (
        <Card tone="warning">
          {Number(party.receivable) > 0 ? <ThemedText type="smallBold" themeColor="warning">{t('ws.owesUs')} {shop.money(party.receivable)}</ThemedText> : null}
          {Number(party.payable) > 0 ? <ThemedText type="smallBold" themeColor="warning">{t('ws.weOwe')} {shop.money(party.payable)}</ThemedText> : null}
        </Card>
      ) : null}
      <TextBox label={`${t('ws.name')} *`} value={f.name} onChangeText={set('name')} maxLength={200} autoCapitalize="words" autoFocus={!party} />
      <TextBox label={t('ws.phone')} value={f.phone} onChangeText={set('phone')} keyboardType="phone-pad" />
      <TextBox label={t('settings.whatsapp')} value={f.whatsapp} onChangeText={set('whatsapp')} keyboardType="phone-pad" />
      {phone ? <Btn icon="message" variant="secondary" title="WhatsApp" onPress={() => void Linking.openURL(`https://wa.me/${phone}`)} /> : null}
      <TextBox label={t('settings.email')} value={f.email} onChangeText={set('email')} keyboardType="email-address" />
      {!customer && role !== 'INSURER' ? <TextBox label={t('ws.contactName')} value={f.contactName} onChangeText={set('contactName')} autoCapitalize="words" /> : null}
      <TextBox label={t('settings.city')} value={f.city} onChangeText={set('city')} autoCapitalize="words" />
      <TextBox label={t('settings.address')} value={f.address} onChangeText={set('address')} autoCapitalize="sentences" />
      <DynamicFields defs={shop.ws.manifest.partyFields?.[role] ?? []} values={f.attributes} onChange={(attributes) => setF((s) => ({ ...s, attributes }))} />
      {customer && shop.has('DEBTS') ? <NumberBox label={`${t('ws.creditLimit')} (${shop.currency})`} value={f.creditLimit} onChange={set('creditLimit')} hint={t('mob.creditLimitHint')} /> : null}
      {customer && pricing.active ? <SelectField label={t('price.customerType')} value={f.customerType} onChange={set('customerType')} placeholder={t('price.noType')} options={pricing.types.filter((x) => x.active).map((x) => ({ value: x.code, label: x.name }))} /> : null}
      {role === 'SUPPLIER' ? <NumberBox label={t('ws.paymentTerms')} value={f.paymentTermsDays} onChange={set('paymentTermsDays')} /> : null}
      <TextBox label={t('ws.note')} value={f.notes} onChangeText={set('notes')} multiline numberOfLines={2} autoCapitalize="sentences" />
      {party && customer ? <CustomerAccount partyId={party.id} /> : null}
      {party && customer ? <PartyHistory partyId={party.id} /> : null}
      {party && docs.data && docs.data.items.length > 0 ? (
        <View style={{ gap: 6 }}>
          <ThemedText type="smallBold">{customer ? shop.v('sales') : shop.v('goodsReceipt')}</ThemedText>
          {docs.data.items.map((d) => (
            <View key={d.id} style={s.miniRow}>
              <ThemedText type="small" style={{ flex: 1 }}>{d.number} · {formatDate(d.issuedAt, lang)}</ThemedText>
              <Badge tone={d.paymentStatus === 'PAID' ? 'success' : 'warning'}>{shop.money(d.total)}</Badge>
            </View>
          ))}
        </View>
      ) : null}
    </Sheet>
  );
}

const s = StyleSheet.create({
  search: { justifyContent: 'center', marginBottom: 6 },
  searchIcon: { position: 'absolute', left: 15, zIndex: 1 },
  searchInput: { paddingLeft: 40 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 18 },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  miniRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 2 },
});
