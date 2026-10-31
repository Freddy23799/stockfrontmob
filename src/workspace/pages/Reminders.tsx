import { useState } from 'react';
import { Linking, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Badge, Btn, Card, Empty, ErrorNote, Screen, Skeleton, useToast } from '@/components/ui';
import { useT } from '@/i18n';
import { errText } from '@/lib/electronics';
import { formatDateTime } from '@/lib/format';
import { useGo } from '@/lib/nav';
import { useQuery } from '@/lib/query';
import { useShop } from '@/lib/shop';
import { waLink } from '@/lib/whatsapp';
import type { PageProps } from '../registry';

type Item = {
  source: string; kind: string; refId: string; number?: string | null; customerName?: string | null; phone?: string | null; label?: string | null; dueDate?: string | null; daysFromToday: number;
  amount?: number | string | null; page: string; lastRemindedAt?: string | null; lastChannel?: string | null;
};
type Listing = { items: Item[]; summary: { total: number; notReminded: number } };
const GROUPS: [string, (i: Item) => boolean, 'danger' | 'warning' | 'info' | 'success'][] = [
  ['late', (i) => i.kind !== 'READY' && i.daysFromToday < 0, 'danger'], ['today', (i) => i.kind !== 'READY' && i.daysFromToday === 0, 'warning'],
  ['upcoming', (i) => i.kind !== 'READY' && i.daysFromToday > 0, 'info'], ['ready', (i) => i.kind === 'READY', 'success'],
];
const TONE: Record<string, 'success' | 'warning' | 'info'> = { READY: 'success', QUOTE: 'warning', DUE: 'info', PAYMENT: 'warning' };

/** Liste « A relancer » : une seule page pour tous les metiers ; WhatsApp en un geste quand le numero est connu. */
export default function Reminders({ item, tab }: PageProps) {
  const { t, lang } = useT();
  const shop = useShop();
  const toast = useToast();
  const go = useGo();
  const q = useQuery<Listing>('/api/shop/reminders');
  const [error, setError] = useState<string | null>(null);

  const when = (i: Item) => {
    if (i.kind === 'READY' || i.kind === 'QUOTE') return i.daysFromToday < 0 ? t('rem.due.waiting', { count: -i.daysFromToday }) : t('rem.due.today');
    if (i.daysFromToday < 0) return t('rem.due.late', { count: -i.daysFromToday });
    if (i.daysFromToday === 0) return t('rem.due.today');
    return i.daysFromToday === 1 ? t('rem.due.tomorrow') : t('rem.due.in', { count: i.daysFromToday });
  };
  const text = (i: Item) => {
    const custom = (shop.config as Record<string, unknown> | undefined)?.[`reminderMessage${i.kind}`];
    const base = typeof custom === 'string' && custom.trim() ? custom : t(`rem.msg.${i.kind}`);
    const vars: Record<string, string> = { name: i.customerName ?? '', device: i.label ?? '', number: i.number ?? '', amount: shop.money(i.amount ?? 0), shop: shop.ws.shop?.name ?? '',
      date: i.dueDate ? new Date(`${i.dueDate}T12:00:00`).toLocaleDateString(lang, { day: 'numeric', month: 'long' }) : '' };
    return base.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? vars[k] : m));
  };
  async function log(i: Item, channel: string) {
    try { await shop.call('/api/shop/reminders/log', { method: 'POST', body: { source: i.source, refId: i.refId, channel } }); toast(t('rem.logged')); void q.reload(); } catch (e) { setError(errText(e, t('common.error'))); }
  }

  const title = shop.tr(item.label);
  if (q.loading && !q.data) return <Screen tabs={tab} title={title}><Skeleton rows={4} height={84} /></Screen>;
  if (q.error && !q.data) return <Screen tabs={tab} title={title}><ErrorNote message={q.error} onRetry={q.reload} /></Screen>;
  const items = q.data?.items ?? [];
  return (
    <Screen tabs={tab} title={title} subtitle={t('rem.subtitle')} onRefresh={q.reload} refreshing={q.refreshing}>
      {error ? <ErrorNote message={error} /> : null}
      {items.length === 0 ? <Empty icon="bell" title={t('rem.empty')} text={t('rem.emptyText')} /> : GROUPS.map(([key, test, tone]) => {
        const list = items.filter(test);
        if (list.length === 0) return null;
        return (
          <View key={key} style={{ gap: 8, marginBottom: 12 }}>
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}><Badge tone={tone}>{String(list.length)}</Badge><ThemedText type="smallBold">{t(`rem.g.${key}`)}</ThemedText></View>
            {list.map((i) => {
              const link = waLink(i.phone, text(i));
              return (
                <Card key={`${i.source}:${i.refId}`}>
                  <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                    <ThemedText type="smallBold" style={{ flex: 1 }} numberOfLines={1}>{i.customerName ?? '—'}</ThemedText>
                    <Badge tone={TONE[i.kind] ?? 'info'}>{t(`rem.kind.${i.kind}`)}</Badge>
                  </View>
                  <ThemedText type="small" themeColor="textSecondary">{[i.number, i.label, i.amount != null && Number(i.amount) > 0 ? shop.money(i.amount) : null, when(i)].filter(Boolean).join(' · ')}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">{i.lastRemindedAt ? t('rem.reminded', { when: formatDateTime(i.lastRemindedAt, lang), channel: t(`rem.ch.${i.lastChannel ?? 'OTHER'}`) }) : t('rem.neverReminded')}</ThemedText>
                  <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                    {link ? <Btn small icon="whatsapp" title={t('rem.whatsapp')} onPress={() => { void log(i, 'WHATSAPP'); void Linking.openURL(link); }} /> : <ThemedText type="small" themeColor="textSecondary">{t('rem.noPhone')}</ThemedText>}
                    {i.phone ? <Btn small variant="secondary" title={t('rem.called')} onPress={() => { void log(i, 'PHONE'); void Linking.openURL(`tel:${i.phone}`); }} /> : null}
                    <Btn small variant="ghost" title={t('rem.open')} onPress={() => go.page(i.page, { open: i.refId })} />
                  </View>
                </Card>
              );
            })}
          </View>
        );
      })}
    </Screen>
  );
}
