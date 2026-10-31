import { useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { FlatList, View } from 'react-native';

import { errText } from '@/components/laundry-order';
import { ListFooter } from '@/components/list-footer';
import { ThemedText } from '@/components/themed-text';
import { Badge, Btn, Card, Chips, Empty, ErrorNote, Fab, Hint, Input, NumberBox, Screen, Sheet, Skeleton, Switch, TextBox, useToast } from '@/components/ui';
import { useT } from '@/i18n';
import { formatDate, uuid } from '@/lib/format';
import { API, CLAIM_KINDS, CLAIM_STATUS, CLAIM_TONE, num, RESOLUTIONS, type Order } from '@/lib/laundry';
import { LIST_PROPS } from '@/lib/list';
import { useInfinite, useQuery } from '@/lib/query';
import { useShop } from '@/lib/shop';
import type { PageProps } from '../registry';

type Claim = { id: string; number: string; orderId: string; orderNumber: string; itemTag?: string; itemName?: string; partyName?: string; kind: string; description: string; status: string; resolution?: string; amount?: number; resolutionNote?: string; createdAt: string; openedByName?: string; capAmount?: number };

function ClaimForm({ preset, onClose, onSaved }: { preset: { orderId?: string; orderNumber?: string } | null; onClose: () => void; onSaved: (c: Claim) => void }) {
  const { t } = useT();
  const shop = useShop();
  const id = useRef(uuid());
  const [code, setCode] = useState(preset?.orderNumber ?? '');
  const [order, setOrder] = useState<Order | null>(null);
  const [itemId, setItemId] = useState('');
  const [kind, setKind] = useState('DAMAGE');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const find = async () => { setError(null); try { setOrder((await shop.call<{ order: Order }>(`${API}/orders/lookup?code=${encodeURIComponent(code.trim())}`)).order); } catch (e) { setOrder(null); setError(errText(e, t('common.error'))); } };
  useEffect(() => { if (preset?.orderId) shop.call<Order>(`${API}/orders/${preset.orderId}`).then(setOrder).catch((e) => setError(errText(e, t('common.error')))); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  async function save() {
    if (!order) return;
    setBusy(true); setError(null);
    try { onSaved(await shop.call<Claim>(`${API}/claims`, { method: 'POST', body: { id: id.current, orderId: order.id, itemId: itemId || undefined, kind, description: description.trim() } })); } catch (e) { setError(errText(e, t('common.error'))); setBusy(false); }
  }
  return (
    <Sheet visible tall title={t('ld.newClaim')} onClose={onClose} footer={<Btn title={t('ld.openClaim')} disabled={!order || description.trim().length < 3} loading={busy} onPress={() => void save()} />}>
      {error ? <ErrorNote message={error} /> : null}
      {!preset?.orderId ? (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1 }}><Input value={code} onChangeText={setCode} placeholder={t('ld.lookupHint')} autoCapitalize="characters" onSubmitEditing={() => void find()} /></View>
          <Btn title={t('ld.lookup')} disabled={!code.trim()} onPress={() => void find()} />
        </View>
      ) : null}
      {order ? <Hint icon="receipt"><ThemedText type="smallBold">{order.number}</ThemedText> · {order.partyName ?? order.customerName ?? t('ld.walkIn')} · {shop.money(order.total)}</Hint> : null}
      {order ? <Chips value={itemId} onChange={setItemId} options={[{ value: '', label: t('ld.wholeTicket') }, ...order.items.map((i) => ({ value: i.id, label: `${i.garmentName} · ${i.tagCode}` }))]} /> : null}
      <Chips value={kind} onChange={setKind} options={CLAIM_KINDS.map((k) => ({ value: k, label: t(`ld.ck.${k}`) }))} />
      <TextBox label={t('ld.description')} value={description} onChangeText={setDescription} multiline placeholder={t('ld.claimDescHint')} />
      <ThemedText type="small" themeColor="textSecondary">{t('ld.claimDisputeNote')}</ThemedText>
    </Sheet>
  );
}

function ClaimSheet({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const { t, lang } = useT();
  const shop = useShop();
  const toast = useToast();
  const q = useQuery<Claim>(`${API}/claims/${id}`);
  const [resolving, setResolving] = useState(false);
  const [resolution, setResolution] = useState('REFUND_CASH');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [reject, setReject] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const c = q.data;
  if (!c) return <Sheet visible tall title="…" onClose={onClose}>{q.error ? <ErrorNote message={q.error} onRetry={q.reload} /> : <Skeleton rows={3} height={70} />}</Sheet>;
  const canUpdate = shop.can('LAUNDRY_CLAIMS', 'update');
  const manager = shop.owner || shop.can('PRODUCTS', 'update');
  const open = c.status === 'OPEN' || c.status === 'INVESTIGATING';
  const money = resolution === 'REFUND_CASH' || resolution === 'STORE_CREDIT';
  const overCap = c.capAmount != null && num(amount) > num(c.capAmount);
  async function act(path: string, body: unknown, msg: string) {
    setBusy(true); setError(null);
    try { await shop.call(`${API}/claims/${id}/${path}`, { method: 'POST', body }); toast(msg); setResolving(false); onChanged(); await q.reload(); } catch (e) { setError(errText(e, t('common.error'))); } finally { setBusy(false); }
  }
  return (
    <Sheet visible tall title={`${t('ld.claim')} ${c.number}`} onClose={onClose}
      footer={canUpdate && open && !resolving ? <View style={{ gap: 8 }}>{c.status === 'OPEN' ? <Btn variant="secondary" title={t('ld.investigate')} disabled={busy} onPress={() => void act('investigate', undefined, t('ld.investigating'))} /> : null}<Btn title={t('ld.resolve')} onPress={() => setResolving(true)} /></View> : undefined}>
      {error ? <ErrorNote message={error} /> : null}
      <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}><ThemedText type="smallBold" style={{ flex: 1 }}>{c.partyName ?? '—'}</ThemedText><Badge tone="warning">{t(`ld.ck.${c.kind}`)}</Badge><Badge tone={CLAIM_TONE[c.status]}>{t(`ld.cs.${c.status}`)}</Badge></View>
      <Card>
        {([[t('ld.ticket'), c.orderNumber], c.itemTag ? [t('ld.tag'), `${c.itemTag}${c.itemName ? ` · ${c.itemName}` : ''}`] : null, [t('ld.openedOn'), `${formatDate(c.createdAt, lang)}${c.openedByName ? ` · ${c.openedByName}` : ''}`], c.capAmount != null ? [t('ld.cap'), shop.money(c.capAmount)] : null] as ([string, string] | null)[]).filter(Boolean).map((r) => (
          <View key={r![0]} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}><ThemedText type="small" themeColor="textSecondary">{r![0]}</ThemedText><ThemedText type="smallBold" style={{ flexShrink: 1, textAlign: 'right' }}>{r![1]}</ThemedText></View>
        ))}
      </Card>
      <ThemedText type="small">{c.description}</ThemedText>
      {c.resolution ? <Hint icon="check" tone="success"><ThemedText type="smallBold">{t(`ld.res.${c.resolution}`)}</ThemedText>{num(c.amount) > 0 ? ` · ${shop.money(c.amount)}` : ''}{c.resolutionNote ? ` · ${c.resolutionNote}` : ''}</Hint> : null}
      {resolving ? (
        <Card>
          <Switch value={reject} onChange={setReject} label={t('ld.rejectClaim')} />
          {!reject ? (
            <>
              <Chips scroll={false} value={resolution} onChange={setResolution} options={RESOLUTIONS.map((r) => ({ value: r, label: t(`ld.res.${r}`) }))} />
              <ThemedText type="small" themeColor="textSecondary">{t(`ld.resHelp.${resolution}`)}</ThemedText>
              {money ? <NumberBox label={t('ld.amount')} value={amount} onChange={setAmount} suffix={shop.currency} error={overCap ? (manager ? t('ld.capManager') : t('ld.capExceeded', { amount: shop.money(c.capAmount) })) : null} /> : null}
            </>
          ) : null}
          <TextBox label={t('ld.note')} value={note} onChangeText={setNote} multiline />
          <Btn title={t('ld.confirmResolve')} loading={busy} disabled={(!reject && money && num(amount) <= 0) || (overCap && !manager)} onPress={() => void act('resolve', reject ? { resolution: 'NONE', reject: true, note: note || undefined } : { resolution, amount: money ? num(amount) : undefined, note: note || undefined }, t('ld.resolved'))} />
          <Btn variant="ghost" small title={t('common.cancel')} onPress={() => setResolving(false)} />
        </Card>
      ) : null}
    </Sheet>
  );
}

/** Reclamations et dommages : ouverture depuis un ticket, instruction, indemnisation (remboursement, avoir, reprise) ou rejet. */
export default function LaundryClaims({ item, tab }: PageProps) {
  const { t, lang } = useT();
  const shop = useShop();
  const toast = useToast();
  const params = useLocalSearchParams<{ orderId?: string; orderNumber?: string }>();
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [form, setForm] = useState<{ orderId?: string; orderNumber?: string } | null>(params.orderId ? { orderId: params.orderId, orderNumber: params.orderNumber } : null);
  const [open, setOpen] = useState<string | null>(null);
  const list = useInfinite<Claim>(`${API}/claims`, { status: status || undefined, q: q.trim() });
  return (
    <Screen tabs={tab} fixed title={shop.tr(item.label)} subtitle={t('ld.claimsSubtitle')}>
      <Input value={q} onChangeText={setQ} placeholder={t('ld.searchClaims')} autoCapitalize="none" />
      <View style={{ height: 8 }} />
      <Chips value={status} onChange={setStatus} options={['', ...CLAIM_STATUS].map((s) => ({ value: s, label: s ? t(`ld.cs.${s}`) : t('ws.all') }))} />
      <View style={{ height: 8 }} />
      {list.error ? <ErrorNote message={list.error} onRetry={list.reload} /> : null}
      {list.loading && list.items.length === 0 ? <Skeleton rows={4} height={76} /> : (
        <FlatList {...LIST_PROPS} data={list.items} keyExtractor={(c) => c.id} contentContainerStyle={{ gap: 8, paddingBottom: 110 }} onEndReached={list.loadMore} refreshing={list.refreshing} onRefresh={list.reload} showsVerticalScrollIndicator={false}
          ListEmptyComponent={<Empty icon="check-double" title={t('ld.claimsEmpty')} text={t('ld.claimsEmptyText')} />}
          ListFooterComponent={<ListFooter shown={list.items.length} total={list.total} hasMore={list.hasMore} loading={list.loadingMore} failed={false} onMore={list.loadMore} />}
          renderItem={({ item: c }) => (
            <Card onPress={() => setOpen(c.id)}>
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}><ThemedText type="smallBold" style={{ flex: 1 }}>{c.number} · {t(`ld.ck.${c.kind}`)}</ThemedText><Badge tone={CLAIM_TONE[c.status]}>{t(`ld.cs.${c.status}`)}</Badge></View>
              <ThemedText type="small" themeColor="textSecondary">{[c.partyName, `${t('ld.ticket')} ${c.orderNumber}`, c.itemName, formatDate(c.createdAt, lang)].filter(Boolean).join(' · ')}</ThemedText>
            </Card>
          )} />
      )}
      {shop.can('LAUNDRY_CLAIMS', 'create') ? <Fab label={t('ld.newClaim')} onPress={() => setForm({})} /> : null}
      {form ? <ClaimForm preset={form.orderId ? form : null} onClose={() => setForm(null)} onSaved={(c) => { setForm(null); toast(t('ld.claimOpened')); setOpen(c.id); void list.reload(); }} /> : null}
      {open ? <ClaimSheet id={open} onClose={() => setOpen(null)} onChanged={() => void list.reload()} /> : null}
    </Screen>
  );
}
