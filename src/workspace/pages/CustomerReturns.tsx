import { useState } from 'react';
import { FlatList, View } from 'react-native';

import { ReturnFromSale } from '@/components/return-from-sale';
import { Receipt, type Doc } from '@/components/receipt';
import { ThemedText } from '@/components/themed-text';
import { Btn, Empty, ErrorNote, Hint, Input, Row, Screen, Sheet, Skeleton, useToast } from '@/components/ui';
import { useT } from '@/i18n';
import { formatDate, formatDateTime } from '@/lib/format';
import { useOffline } from '@/lib/offline';
import { qs, useInfinite, useQuery } from '@/lib/query';
import { useShop } from '@/lib/shop';
import { LIST_PROPS } from '@/lib/list';
import type { PageProps } from '../registry';

type Item = { id: string; number: string; partyName?: string; issuedAt: string; lineCount: number; total: number };
type Sale = { id: string; number: string; partyName?: string; issuedAt: string; total: number };
type Full = Doc & { attributes?: Record<string, any> };

/** Retours clients : liste des avoirs ; un retour se lance depuis l'historique des ventes (ou en cherchant une vente ici). */
export default function CustomerReturns({ item, tab }: PageProps) {
  const { t, lang } = useT();
  const shop = useShop();
  const toast = useToast();
  const offline = useOffline();
  const [open, setOpen] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [found, setFound] = useState<Sale[]>([]);
  const [saleId, setSaleId] = useState<string | null>(null);
  const list = useInfinite<Item>('/api/shop/documents', { type: 'CUSTOMER_RETURN' });
  const pendingSales = offline.items.filter((i) => i.path === '/api/shop/sales' && i.state === 'pending').length;

  async function search() {
    if (!q.trim()) return;
    try { setFound((await shop.call<{ items: Sale[] }>(`/api/shop/documents${qs({ type: 'SALE', q: q.trim(), size: 8 })}`)).items); } catch { setFound([]); }
  }

  return (
    <Screen tabs={tab} fixed title={shop.tr(item.label)} subtitle={t('ret.c.subtitle')}>
      {pendingSales > 0 ? <Hint icon="cloud-arrow-up" tone="warning">{t('ret.c.pendingSales', { count: pendingSales })}</Hint> : null}
      {shop.can('CUSTOMER_RETURNS', 'create') ? (
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 8 }}>
          <View style={{ flex: 1 }}><Input value={q} onChangeText={setQ} placeholder={t('ws.searchDoc')} autoCapitalize="none" onSubmitEditing={search} returnKeyType="search" /></View>
          <Btn small icon="rotate-left" title={t('ret.c.start')} onPress={search} />
        </View>
      ) : null}
      {found.map((d) => <View key={d.id} style={{ marginBottom: 6 }}><Row icon="receipt" title={d.number} subtitle={`${d.partyName ?? t('ws.walkIn')} · ${formatDate(d.issuedAt, lang)}`} right={<ThemedText type="smallBold">{shop.money(d.total)}</ThemedText>} onPress={() => setSaleId(d.id)} /></View>)}
      {list.error ? <ErrorNote message={list.error} onRetry={list.reload} /> : null}
      {list.loading && list.items.length === 0 ? <Skeleton rows={4} height={64} /> : (
        <FlatList {...LIST_PROPS} data={list.items} keyExtractor={(d) => d.id} contentContainerStyle={{ gap: 8, paddingBottom: 100 }} onEndReached={list.loadMore} refreshing={list.refreshing} onRefresh={list.reload} showsVerticalScrollIndicator={false}
          ListEmptyComponent={<Empty icon="rotate-left" title={t('ret.c.empty')} text={t('ret.c.emptyText')} />}
          renderItem={({ item: d }) => <Row icon="rotate-left" title={d.number} subtitle={`${d.partyName ?? t('ws.walkIn')} · ${formatDate(d.issuedAt, lang)} · ${t('ws.itemsCount', { count: d.lineCount })}`} right={<ThemedText type="smallBold">{shop.money(d.total)}</ThemedText>} onPress={() => setOpen(d.id)} />} />
      )}
      {saleId ? <ReturnFromSale saleId={saleId} onClose={() => setSaleId(null)} onDone={(doc) => { setSaleId(null); setFound([]); if (doc) { toast(t('ret.c.done', { number: doc.number ?? '' })); setOpen(doc.id); } else toast(t('ret.c.queued'), 'warning'); void list.reload(); }} /> : null}
      {open ? <ReturnSheet id={open} onClose={() => setOpen(null)} /> : null}
    </Screen>
  );
}

function ReturnSheet({ id, onClose }: { id: string; onClose: () => void }) {
  const { t, lang } = useT();
  const shop = useShop();
  const q = useQuery<Full>(`/api/shop/documents/${id}`);
  const d = q.data;
  const a = d?.attributes ?? {};
  return (
    <Sheet visible tall title={d ? t('ret.c.docTitle', { number: d.number ?? '' }) : '…'} onClose={onClose}>
      {!d ? (q.error ? <ErrorNote message={q.error} onRetry={q.reload} /> : <Skeleton rows={3} height={80} />) : (
        <>
          <ThemedText type="small" themeColor="textSecondary">{formatDateTime(d.issuedAt, lang)}{d.partyName ? ` · ${d.partyName}` : ''}</ThemedText>
          {a.reason ? <ThemedText type="small">{t('ret.c.reason')} : {a.reason}</ThemedText> : null}
          {a.saleNumber ? <ThemedText type="small">{t('ret.c.saleRef', { number: a.saleNumber })}</ThemedText> : null}
          {Number(a.debtReduced) > 0 ? <ThemedText type="small">{t('ret.c.debtReduced', { amount: shop.money(a.debtReduced) })}</ThemedText> : null}
          {Number(a.creditIssued) > 0 ? <ThemedText type="small">{t('ret.c.creditIssued', { amount: shop.money(a.creditIssued) })}</ThemedText> : null}
          {Number(a.pointsCancelled) > 0 ? <ThemedText type="small">{t('ret.c.pointsCancelled', { n: a.pointsCancelled })}</ThemedText> : null}
          <Receipt doc={d} />
        </>
      )}
    </Sheet>
  );
}
