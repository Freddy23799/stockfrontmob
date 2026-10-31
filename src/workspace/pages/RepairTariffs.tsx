import { useState } from 'react';
import { FlatList, View } from 'react-native';

import { ListFooter } from '@/components/list-footer';
import { ThemedText } from '@/components/themed-text';
import { Badge, Btn, Card, Chips, Empty, ErrorNote, Fab, Input, NumberBox, Screen, Sheet, Skeleton, Switch, TextBox, useToast } from '@/components/ui';
import { useT } from '@/i18n';
import { API, errText, KINDS, num, type Service } from '@/lib/electronics';
import { LIST_PROPS, useProgressive } from '@/lib/list';
import { useQuery } from '@/lib/query';
import { useShop } from '@/lib/shop';
import type { PageProps } from '../registry';

const NONE: Service[] = [];

function ServiceForm({ service, onClose, onSaved }: { service: Service | null; onClose: () => void; onSaved: () => void }) {
  const { t } = useT();
  const shop = useShop();
  const [f, setF] = useState({ name: service?.name ?? '', deviceKind: service?.deviceKind ?? 'PHONE', brand: service?.brand ?? '', laborPrice: String(num(service?.laborPrice ?? 0)),
    estMinutes: service?.estMinutes != null ? String(service.estMinutes) : '', warrantyDays: service?.warrantyDays != null ? String(service.warrantyDays) : '', active: service?.active ?? true });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (v: string) => setF((s) => ({ ...s, [k]: v }));
  async function save() {
    setBusy(true); setError(null);
    try {
      await shop.call(service ? `${API}/repair-services/${service.id}` : `${API}/repair-services`, { method: service ? 'PUT' : 'POST', body: {
        name: f.name.trim(), deviceKind: f.deviceKind, brand: f.brand.trim(), laborPrice: num(f.laborPrice), estMinutes: f.estMinutes === '' ? undefined : Number(f.estMinutes),
        warrantyDays: f.warrantyDays === '' ? undefined : Number(f.warrantyDays), active: f.active } });
      onSaved();
    } catch (e) { setError(errText(e, t('common.error'))); setBusy(false); }
  }
  async function remove() {
    if (!service) return;
    setBusy(true);
    try { await shop.call(`${API}/repair-services/${service.id}`, { method: 'DELETE' }); onSaved(); } catch (e) { setError(errText(e, t('common.error'))); setBusy(false); }
  }
  return (
    <Sheet visible title={service ? t('el.tariffEdit') : t('el.tariffNew')} onClose={onClose}
      footer={<View style={{ gap: 8 }}><Btn title={t('common.save')} disabled={f.name.trim().length < 2} loading={busy} onPress={() => void save()} />
        {service && shop.can('REPAIRS', 'delete') ? <Btn variant="ghost" title={t('ws.delete')} onPress={() => void remove()} /> : null}</View>}>
      {error ? <ErrorNote message={error} /> : null}
      <TextBox label={`${t('el.serviceName')} *`} value={f.name} onChangeText={set('name')} maxLength={120} />
      <Chips value={f.deviceKind} onChange={set('deviceKind')} options={KINDS.map((k) => ({ value: k, label: t(`el.kind.${k}`) }))} />
      <TextBox label={t('el.serviceBrand')} value={f.brand} onChangeText={set('brand')} maxLength={60} />
      <NumberBox label={t('el.servicePrice')} value={f.laborPrice} onChange={set('laborPrice')} />
      <NumberBox label={t('el.serviceMinutes')} value={f.estMinutes} onChange={set('estMinutes')} />
      <NumberBox label={t('el.serviceWarranty')} hint={t('el.serviceWarrantyHint')} value={f.warrantyDays} onChange={set('warrantyDays')} />
      <Switch value={f.active} onChange={(v) => setF({ ...f, active: v })} label={t('el.serviceActive')} />
    </Sheet>
  );
}

/** Tarif de l'atelier : prestations types (ecran, batterie, desoxydation...) avec prix, duree et garantie. */
export default function RepairTariffs({ item, tab }: PageProps) {
  const { t } = useT();
  const shop = useShop();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [kind, setKind] = useState('');
  const [form, setForm] = useState<Service | 'new' | null>(null);
  const query = useQuery<Service[]>(`${API}/repair-services?${new URLSearchParams({ ...(q.trim() ? { q: q.trim() } : {}), ...(kind ? { kind } : {}) })}`, { debounce: 250 });
  const prog = useProgressive(query.data ?? NONE, 20);
  const canEdit = shop.can('REPAIRS', 'update');
  return (
    <Screen tabs={tab} fixed title={shop.tr(item.label)} subtitle={t('el.tariffSubtitle')}>
      <Chips value={kind} onChange={setKind} options={[{ value: '', label: t('el.allKinds') }, ...KINDS.map((k) => ({ value: k, label: t(`el.kind.${k}`) }))]} />
      <View style={{ marginVertical: 8 }}><Input value={q} onChangeText={setQ} placeholder={t('el.searchTariff')} autoCapitalize="none" /></View>
      {query.error ? <ErrorNote message={query.error} onRetry={query.reload} /> : null}
      {query.loading && !query.data ? <Skeleton rows={4} height={64} /> : (
        <FlatList {...LIST_PROPS} data={prog.visible} keyExtractor={(s) => s.id} contentContainerStyle={{ gap: 8, paddingBottom: 110 }} onEndReached={prog.loadMore} showsVerticalScrollIndicator={false}
          ListEmptyComponent={<Empty icon="screwdriver-wrench" title={t('el.tariffEmpty')} text={t('el.tariffEmptyText')} />}
          ListFooterComponent={<ListFooter shown={prog.visible.length} total={prog.total} hasMore={prog.hasMore} onMore={prog.loadMore} loading={false} failed={false} />}
          renderItem={({ item: s }) => (
            <Card onPress={canEdit ? () => setForm(s) : undefined}>
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                <ThemedText type="smallBold" style={{ flex: 1 }}>{s.name}</ThemedText>
                {!s.active ? <Badge tone="warning">{t('el.serviceInactive')}</Badge> : null}
                <ThemedText type="smallBold">{shop.money(s.laborPrice)}</ThemedText>
              </View>
              <ThemedText type="small" themeColor="textSecondary">
                {[t(`el.kind.${s.deviceKind}`), s.brand, s.estMinutes ? t('el.minutesShort', { count: s.estMinutes }) : null, s.warrantyDays != null ? `${t('el.repairWarranty')} ${t('el.days', { count: s.warrantyDays })}` : null].filter(Boolean).join(' · ')}
              </ThemedText>
            </Card>
          )} />
      )}
      {canEdit ? <Fab label={t('el.tariffNew')} onPress={() => setForm('new')} /> : null}
      {form ? <ServiceForm service={form === 'new' ? null : form} onClose={() => setForm(null)} onSaved={() => { setForm(null); toast(t('el.tariffSaved')); void query.reload(); }} /> : null}
    </Screen>
  );
}
