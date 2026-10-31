import { useMemo, useRef, useState } from 'react';
import { View } from 'react-native';

import { PartyPicker } from '@/components/party-picker';
import { PaymentPanel } from '@/components/payment-panel';
import { ProductPicker } from '@/components/product-picker';
import { ThemedText } from '@/components/themed-text';
import { Badge, Btn, Card, Empty, ErrorNote, Hint, NumberBox, Row, Screen, SectionTitle, Sheet, Skeleton, Stack, Switch, TextBox, useToast } from '@/components/ui';
import { useT } from '@/i18n';
import { ApiError } from '@/lib/api';
import { num, uuid, type Product } from '@/lib/format';
import { qs, useQuery } from '@/lib/query';
import { initPay, resetPay, settle } from '@/lib/payments';
import { useShop } from '@/lib/shop';
import type { PageProps } from '../registry';

const API = '/api/shop/salon';
type Tpl = { id: string; name: string; productId: string; productName: string; sessions: number; price: number | string; validityDays?: number | null; active: boolean };
type Pack = { id: string; partyName: string; name: string; sessionsLeft: number; sessionsTotal: number; expiresOn?: string | null; status: string };

function TemplateSheet({ tpl, onClose, onSaved }: { tpl: Tpl | null; onClose: () => void; onSaved: () => void }) {
  const { t } = useT();
  const shop = useShop();
  const [f, setF] = useState({ name: tpl?.name ?? '', sessions: String(tpl?.sessions ?? 5), price: tpl ? String(tpl.price) : '', validity: String(tpl?.validityDays ?? 90), active: tpl?.active ?? true });
  const [product, setProduct] = useState<Product | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const productId = product?.id ?? tpl?.productId;
  async function save() {
    setBusy(true); setError(null);
    try { await shop.call(tpl ? `${API}/packages/templates/${tpl.id}` : `${API}/packages/templates`, { method: tpl ? 'PUT' : 'POST', body: { name: f.name, productId, sessions: Number(f.sessions), price: Number(f.price), validityDays: f.validity === '' ? undefined : Number(f.validity), active: f.active } }); onSaved(); }
    catch (e) { setError(e instanceof ApiError ? e.message : t('common.network')); } finally { setBusy(false); }
  }
  return (
    <Sheet visible title={tpl?.name ?? t('sl.newPackage')} onClose={onClose} footer={<Btn title={t('common.save')} loading={busy} disabled={!f.name.trim() || !productId || f.price === ''} onPress={() => void save()} />}>
      <View style={{ gap: 12 }}>
        {error ? <Hint tone="danger">{error}</Hint> : null}
        <TextBox label={t('sl.name')} value={f.name} onChangeText={(v) => setF({ ...f, name: v })} placeholder={t('sl.packageHint')} maxLength={120} />
        <ProductPicker label={`${t('sl.coveredService')}${tpl && !product ? ` · ${tpl.productName}` : ''}`} value={product} onChange={setProduct} />
        <NumberBox label={t('sl.sessions')} value={f.sessions} onChange={(v) => setF({ ...f, sessions: v })} />
        <NumberBox label={t('sl.price')} value={f.price} onChange={(v) => setF({ ...f, price: v })} />
        <NumberBox label={t('sl.validityDays')} value={f.validity} onChange={(v) => setF({ ...f, validity: v })} />
        {tpl ? <Switch label={t('sl.active')} value={f.active} onChange={(v) => setF({ ...f, active: v })} /> : null}
      </View>
    </Sheet>
  );
}

function SellSheet({ tpl, onClose, onSold }: { tpl: Tpl; onClose: () => void; onSold: () => void }) {
  const { t } = useT();
  const shop = useShop();
  const methods: string[] = shop.ws.manifest.paymentMethods?.length ? shop.ws.manifest.paymentMethods : ['CASH'];
  const [partyId, setPartyId] = useState<string | null>(null);
  const [pay, setPay] = useState(() => initPay(methods[0]));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const saleId = useRef(uuid());
  const due = num(tpl.price);
  const sett = settle(pay, due);
  const valid = !!partyId && sett.valid && (sett.remaining === 0 || due === 0 || shop.has('DEBTS'));
  async function submit() {
    setBusy(true); setError(null);
    try {
      await shop.call(`${API}/packages/sell`, { method: 'POST', body: { saleId: saleId.current, templateId: tpl.id, partyId, payments: sett.payments.map((p) => ({ id: uuid(), method: p.method, amount: p.amount, reference: p.reference })) } });
      setPay((p) => resetPay(p)); onSold();
    } catch (e) { setError(e instanceof ApiError ? e.message : t('common.network')); } finally { setBusy(false); }
  }
  return (
    <Sheet visible title={t('sl.sellPackage', { name: tpl.name })} onClose={onClose} tall footer={<Btn icon="check" title={busy ? t('ws.saving') : t('ws.charge', { amount: shop.money(due) })} loading={busy} disabled={!valid} onPress={() => void submit()} />}>
      <View style={{ gap: 12 }}>
        {error ? <Hint tone="danger">{error}</Hint> : null}
        <ThemedText type="small" themeColor="textSecondary">{t('sl.packageSummary', { sessions: tpl.sessions, service: tpl.productName })}</ThemedText>
        <PartyPicker role="CUSTOMER" label={shop.v('customer')} value={partyId} onChange={(id) => { saleId.current = uuid(); setPartyId(id); }} />
        <PaymentPanel pay={pay} setPay={(p) => { saleId.current = uuid(); setPay(p); }} due={due} methods={methods} res={sett} money={shop.money} currency={shop.currency} />
        {sett.remaining > 0 ? <Hint tone="warning">{t('ws.onCredit', { amount: shop.money(sett.remaining) })}</Hint> : null}
      </View>
    </Sheet>
  );
}

/** Forfaits : modeles (10 coupes, 5 soins...), vente en caisse et soldes des clients. */
export default function SalonPackages({ item, tab }: PageProps) {
  const { t } = useT();
  const shop = useShop();
  const toast = useToast();
  const tpls = useQuery<Tpl[]>(`${API}/packages/templates${qs({ all: true })}`);
  const [page, setPage] = useState(0);
  const packs = useQuery<{ items: Pack[]; total: number }>(`${API}/packages${qs({ active: true, page: 0, size: 20 * (page + 1) })}`);
  const [edit, setEdit] = useState<Tpl | null | undefined>(undefined);
  const [sell, setSell] = useState<Tpl | null>(null);
  const reload = async () => { await Promise.all([tpls.reload(), packs.reload()]); };
  const shown = useMemo(() => packs.data?.items ?? [], [packs.data]);
  return (
    <Screen tabs={tab} title={shop.tr(item.label)} onRefresh={reload} right={shop.can('SERVICE_PACKAGES', 'create') ? <Btn small icon="plus" title={t('sl.newPackage')} onPress={() => setEdit(null)} /> : undefined}>
      {tpls.error && !tpls.data ? <ErrorNote message={tpls.error} onRetry={tpls.reload} /> : null}
      {!tpls.data ? <Skeleton rows={3} /> : tpls.data.length === 0 ? <Empty icon="tag" title={t('sl.noPackageTpl')} text={t('sl.noPackageTplText')} /> : (
        <Stack gap={8}>{tpls.data.map((p) => (
          <Card key={p.id}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}><ThemedText type="smallBold" style={{ flex: 1 }}>{p.name}</ThemedText>{!p.active ? <Badge tone="danger">{t('sl.inactive')}</Badge> : null}<ThemedText type="smallBold">{shop.money(p.price)}</ThemedText></View>
            <ThemedText type="small" themeColor="textSecondary">{p.sessions} × {p.productName}</ThemedText>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
              {p.active && shop.can('SERVICE_PACKAGES', 'create') ? <Btn small title={t('sl.sell')} onPress={() => setSell(p)} /> : null}
              {shop.can('SERVICE_PACKAGES', 'update') ? <Btn small variant="secondary" title={t('ws.edit')} onPress={() => setEdit(p)} /> : null}
            </View>
          </Card>
        ))}</Stack>
      )}
      <SectionTitle title={t('sl.clientPackages')} />
      {!packs.data ? <Skeleton rows={2} /> : shown.length === 0 ? <ThemedText themeColor="textSecondary">{t('sl.noPackage')}</ThemedText> : (
        <>
          {shown.map((c) => <Row key={c.id} title={`${c.partyName} · ${c.name}`} subtitle={c.expiresOn ? t('sl.expires', { date: c.expiresOn }) : undefined} meta={<Badge tone={c.status === 'ACTIVE' ? 'success' : 'danger'}>{`${c.sessionsLeft}/${c.sessionsTotal}`}</Badge>} />)}
          {(packs.data?.total ?? 0) > shown.length ? <Btn variant="secondary" title={t('list.more')} onPress={() => setPage((p) => p + 1)} /> : null}
        </>
      )}
      {edit !== undefined ? <TemplateSheet tpl={edit} onClose={() => setEdit(undefined)} onSaved={() => { setEdit(undefined); void reload(); }} /> : null}
      {sell ? <SellSheet tpl={sell} onClose={() => setSell(null)} onSold={() => { setSell(null); toast(t('sl.packageSold')); void reload(); }} /> : null}
    </Screen>
  );
}
