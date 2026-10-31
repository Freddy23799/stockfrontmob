import { useState } from 'react';
import { View } from 'react-native';

import { ClientFinder, CurrentMeasures, MemberBar, SheetForm, useMembers, type Client, type Current } from '@/components/tailor-parts';
import { ThemedText } from '@/components/themed-text';
import { Badge, Btn, Card, Empty, ErrorNote, Screen, SectionTitle, Sheet, Skeleton, useToast } from '@/components/ui';
import { useT } from '@/i18n';
import { useQuery } from '@/lib/query';
import { useShop } from '@/lib/shop';
import type { PageProps } from '../registry';
import { NewOrder, type Model } from './TailorOrders';

const API = '/api/shop/tailor';
type File = { client: Client; orders: { items: { id: string; number: string; status: string; total: number; balance: number; createdAt: string; priority?: string }[] }; measures: Current; members: { member: { id: string; name: string }; measures: Current }[] };

function ClientSheet({ client, onClose }: { client: Client; onClose: () => void }) {
  const { t } = useT();
  const shop = useShop();
  const toast = useToast();
  const q = useQuery<File>(`${API}/clients/${client.id}/file`);
  const models = useQuery<Model[]>(`${API}/models`);
  const workers = useQuery<{ id: string; name: string; active: boolean }[]>(`${API}/workers`);
  const [members, reloadMembers] = useMembers(client.id);
  const [who, setWho] = useState<string | null>(null);
  const [sheet, setSheet] = useState(false);
  const [order, setOrder] = useState(false);
  const f = q.data;
  const shown = who ? f?.members.find((m) => m.member.id === who)?.measures : f?.measures;
  const person = who ? members.find((m) => m.id === who) : null;
  return (
    <Sheet visible tall title={client.name} onClose={onClose} footer={shop.can('TAILOR_ORDERS', 'create') ? <Btn icon="plus" title={t('tl.newOrder')} onPress={() => setOrder(true)} /> : undefined}>
      <View style={{ gap: 12 }}>
        {q.error && !f ? <ErrorNote message={q.error} onRetry={q.reload} /> : null}
        {!f ? <Skeleton rows={3} /> : (
          <>
            {client.phone ? <ThemedText type="smallBold">{client.phone}</ThemedText> : null}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
              {[[t('tl.cl.orders'), f.client.orders], [t('tl.cl.open'), f.client.openOrders], [t('tl.cl.spent'), shop.money(f.client.spent)], [t('tl.balance'), shop.money(f.client.owed)]].map(([k, v]) => <View key={k as string}><ThemedText type="small" themeColor="textSecondary">{k as string}</ThemedText><ThemedText type="smallBold">{String(v)}</ThemedText></View>)}
            </View>
            {shop.has('MEASUREMENTS') ? (
              <>
                <SectionTitle title={t('tl.cl.family')} />
                <MemberBar partyId={client.id} partyName={client.name} memberId={who} onChange={setWho} members={members} reload={async () => { await reloadMembers(); await q.reload(); }} label={t('tl.cl.measuresOf')} />
                <SectionTitle title={`${t('tl.cl.currentMeasures')}${person ? ` · ${person.name}` : ''}`} />
                <CurrentMeasures values={shown} />
                {shop.can('MEASUREMENTS', 'create') ? <Btn small variant="secondary" icon="ruler" title={t('tl.takeMeasures')} onPress={() => setSheet(true)} /> : null}
              </>
            ) : null}
            <SectionTitle title={t('tl.cl.history')} />
            {f.orders.items.length === 0 ? <ThemedText themeColor="textSecondary">{t('tl.cl.noOrders')}</ThemedText> : f.orders.items.map((o) => (
              <Card key={o.id}><View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}><ThemedText type="smallBold" style={{ flex: 1 }}>{o.number}</ThemedText><Badge>{t(`tl.st.${o.status}`)}</Badge>{o.priority === 'URGENT' ? <Badge tone="danger">{t('tl.urgent')}</Badge> : null}<ThemedText type="smallBold">{shop.money(o.total)}</ThemedText></View>
                <ThemedText type="small" themeColor="textSecondary">{o.createdAt.slice(0, 10)}{o.balance > 0 && o.status !== 'CANCELLED' ? ` · ${t('tl.owes', { amount: shop.money(o.balance) })}` : ''}</ThemedText></Card>
            ))}
          </>
        )}
      </View>
      {sheet ? <SheetForm partyId={client.id} memberId={who} memberName={person?.name ?? client.name} base={shown} onClose={() => setSheet(false)} onSaved={(queued) => { setSheet(false); toast(queued ? t('tl.queuedShort') : t('tl.sheetSaved')); void q.reload(); }} /> : null}
      {order ? <NewOrder workers={(workers.data ?? []).map((w) => ({ ...w }))} models={models.data ?? []} preParty={client} onClose={() => setOrder(false)} onCreated={(queued) => { setOrder(false); toast(queued ? t('tl.queued') : t('tl.saved')); void q.reload(); }} /> : null}
    </Sheet>
  );
}

/** Clientes et familles : un bout du telephone suffit pour retrouver la cliente, sa famille, ses mesures et son historique. */
export default function TailorClients({ item, tab }: PageProps) {
  const { t } = useT();
  const shop = useShop();
  const [open, setOpen] = useState<Client | null>(null);
  return (
    <Screen tabs={tab} title={shop.tr(item.label)}>
      <ThemedText themeColor="textSecondary">{t('tl.cl.intro')}</ThemedText>
      <ClientFinder value={null} onChange={(id, c) => { if (c) setOpen(c); }} />
      {!open ? <Empty icon="address-book" title={t('tl.cl.noRecent')} text={t('tl.cl.noRecentText')} /> : null}
      {open ? <ClientSheet client={open} onClose={() => setOpen(null)} /> : null}
    </Screen>
  );
}
