import { useState } from 'react';
import { FlatList, Linking, View } from 'react-native';

import { ListFooter } from '@/components/list-footer';
import { errText, OrderCard, OrderSheet } from '@/components/laundry-order';
import { PdfButton } from '@/components/pdf-button';
import { ThemedText } from '@/components/themed-text';
import { Badge, Btn, Chips, Empty, ErrorNote, Hint, Screen, Sheet, Skeleton, TextBox, useToast } from '@/components/ui';
import { useT } from '@/i18n';
import { confirmAction } from '@/lib/confirm';
import { API, num, type Order } from '@/lib/laundry';
import { LIST_PROPS } from '@/lib/list';
import { useInfinite } from '@/lib/query';
import { useShop } from '@/lib/shop';
import type { PageProps } from '../registry';

/** Articles prets mais non retires : anciennete, relances a faire (message pret a envoyer), abandon apres le delai de garde. */
export default function LaundryUnclaimed({ item, tab }: PageProps) {
  const { t } = useT();
  const shop = useShop();
  const toast = useToast();
  const cfg = shop.config;
  const [min, setMin] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [abandon, setAbandon] = useState<Order | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const list = useInfinite<Order>(`${API}/orders/unclaimed`, { minDays: min || undefined });
  const manager = shop.owner || shop.can('PRODUCTS', 'update');
  const canUpdate = shop.can('LAUNDRY_UNCLAIMED', 'update');

  async function remind(o: Order, channel: 'WHATSAPP' | 'SMS') {
    setBusy(true);
    try {
      const m = await shop.call<{ whatsappUrl?: string; smsUrl?: string }>(`${API}/orders/${o.id}/message?kind=REMINDER`);
      const url = channel === 'SMS' ? m.smsUrl : m.whatsappUrl;
      if (url) await Linking.openURL(url);
      await shop.call(`${API}/orders/${o.id}/reminders`, { method: 'POST', body: { channel } });
      toast(t('ld.reminderLogged')); void list.reload();
    } catch (e) { toast(errText(e, t('common.error')), 'danger'); } finally { setBusy(false); }
  }
  async function doAbandon() {
    if (!abandon) return;
    setBusy(true);
    try { await shop.call(`${API}/orders/${abandon.id}/abandon`, { method: 'POST', body: { reason: reason.trim() } }); toast(t('ld.abandoned')); setAbandon(null); setReason(''); void list.reload(); } catch (e) { toast(errText(e, t('common.error')), 'danger'); } finally { setBusy(false); }
  }

  return (
    <Screen tabs={tab} fixed title={shop.tr(item.label)} subtitle={`${t('ld.unclaimedSubtitle', { remind: num(cfg.reminderAfterDays ?? 7), hold: num(cfg.holdDays ?? 30), abandon: num(cfg.abandonAfterDays ?? 90) })}`}
      right={<PdfButton small path="/api/shop/pdf/laundry/unclaimed" name="non-retires.pdf" label={t('ld.printList')} />}>
      <Chips value={min} onChange={setMin} options={[{ value: '', label: t('ld.ageAll', { days: num(cfg.reminderAfterDays ?? 7) }) }, ...['8', '31', '91'].map((d) => ({ value: d, label: t('ld.olderThan', { days: d }) }))]} />
      <View style={{ height: 8 }} />
      {list.error ? <ErrorNote message={list.error} onRetry={list.reload} /> : null}
      {list.loading && list.items.length === 0 ? <Skeleton rows={4} height={96} /> : (
        <FlatList {...LIST_PROPS} data={list.items} keyExtractor={(o) => o.id} contentContainerStyle={{ gap: 8, paddingBottom: 100 }} onEndReached={list.loadMore} refreshing={list.refreshing} onRefresh={list.reload} showsVerticalScrollIndicator={false}
          ListEmptyComponent={<Empty icon="check-double" title={t('ld.unclaimedEmpty')} text={t('ld.unclaimedEmptyText')} />}
          ListFooterComponent={<ListFooter shown={list.items.length} total={list.total} hasMore={list.hasMore} loading={list.loadingMore} failed={false} onMore={list.loadMore} />}
          renderItem={({ item: o }) => (
            <OrderCard o={o} onPress={() => setOpen(o.id)}>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                <Badge tone={o.holdExpired ? 'danger' : 'warning'}>{t('ld.waiting', { count: o.waitingDays ?? 0 })}</Badge>
                {o.reminderDue ? <Badge tone="warning">{t('ld.reminderDue')}</Badge> : null}
                {o.holdExpired ? <Badge tone="danger">{t('ld.holdExpired')}</Badge> : null}
                {num(o.remindersCount) > 0 ? <ThemedText type="small" themeColor="textSecondary">{t('ld.remindersN', { count: o.remindersCount ?? 0 })}</ThemedText> : null}
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {canUpdate && o.customerPhone ? <Btn small variant="secondary" icon="message" title={t('ld.ch.WHATSAPP')} disabled={busy} onPress={() => void remind(o, 'WHATSAPP')} /> : null}
                {canUpdate && o.customerPhone ? <Btn small variant="secondary" title={t('ld.ch.SMS')} disabled={busy} onPress={() => void remind(o, 'SMS')} /> : null}
                {manager && o.abandonable ? <Btn small variant="danger" title={t('ld.abandon')} onPress={() => setAbandon(o)} /> : null}
              </View>
            </OrderCard>
          )} />
      )}
      {open ? <OrderSheet id={open} onClose={() => setOpen(null)} onChanged={() => void list.reload()} /> : null}
      {abandon ? (
        <Sheet visible title={t('ld.abandonTitle', { number: abandon.number })} onClose={() => setAbandon(null)}
          footer={<Btn variant="danger" title={t('ld.abandon')} disabled={busy || !reason.trim()} loading={busy} onPress={async () => { if (await confirmAction(t('ld.abandonTitle', { number: abandon.number }), t('ld.abandonText'), t('ld.abandon'), t('common.cancel'))) void doAbandon(); }} />}>
          <Hint tone="warning">{t('ld.abandonText')}</Hint>
          <TextBox label={t('ld.abandonReason')} value={reason} onChangeText={setReason} multiline />
        </Sheet>
      ) : null}
    </Screen>
  );
}
