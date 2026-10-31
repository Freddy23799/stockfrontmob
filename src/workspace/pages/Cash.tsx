import { useRef, useState } from 'react';
import { View } from 'react-native';

import { PdfButton } from '@/components/pdf-button';
import { ThemedText } from '@/components/themed-text';
import { Badge, Btn, Card, Empty, ErrorNote, Hint, NumberBox, Row, Screen, SectionTitle, Sheet, Skeleton, Stack, TextBox, useToast } from '@/components/ui';
import { OfflineAdvice } from '@/components/offline-advice';
import { useT } from '@/i18n';
import { ApiError } from '@/lib/api';
import { formatDateTime, num, uuid } from '@/lib/format';
import { useInfinite } from '@/lib/query';
import { useOffline } from '@/lib/offline';
import { useShop } from '@/lib/shop';
import { useCashSession, type CashSession } from '../cash';
import type { PageProps } from '../registry';

type Session = CashSession & { expectedCash: number; salesCount: number; salesTotal: number; byMethod?: Record<string, number>; openedByName?: string; closedAt?: string; countedCash?: number; difference?: number; notes?: string };

function Breakdown({ byMethod }: { byMethod?: Record<string, number> }) {
  const { t } = useT();
  const shop = useShop();
  const entries = Object.entries(byMethod ?? {});
  if (entries.length === 0) return <ThemedText type="small" themeColor="textSecondary">{t('cash.noPayments')}</ThemedText>;
  return <View style={{ gap: 4 }}>{entries.map(([m, v]) => <View key={m} style={{ flexDirection: 'row' }}><ThemedText type="small" style={{ flex: 1 }}>{t(`ws.m.${m}`)}</ThemedText><ThemedText type="smallBold">{shop.money(v)}</ThemedText></View>)}</View>;
}

export default function Cash({ item, tab }: PageProps) {
  const { t, lang } = useT();
  const shop = useShop();
  const toast = useToast();
  const { session, reload, enabled } = useCashSession();
  const [sheet, setSheet] = useState<'open' | 'close' | null>(null);
  const history = useInfinite<Session>('/api/shop/cash/sessions', {});
  const live = session as Session | null | undefined;
  const after = (msg: string) => { setSheet(null); toast(msg); void reload(); void history.reload(); };

  return (
    <Screen tabs={tab} title={shop.tr(item.label)} subtitle={t('cash.subtitle')} onRefresh={async () => { await reload(); await history.reload(); }}>
      {live === undefined ? <Skeleton height={140} /> : live ? (
        <Card tone="success" style={{ gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Badge tone="success">{t('cash.isOpen')}</Badge>
            <ThemedText type="small" themeColor="success" style={{ flex: 1 }}>{t('cash.since', { when: formatDateTime(live.openedAt, lang) })}</ThemedText>
          </View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Mini label={t('cash.sales')} value={String(live.salesCount)} />
            <Mini label={t('cash.salesTotal')} value={shop.money(live.salesTotal)} />
            <Mini label={t('cash.expected')} value={shop.money(live.expectedCash)} />
          </View>
          <Breakdown byMethod={live.byMethod} />
          {shop.can('CASH_SESSIONS', 'update') ? <Btn icon="lock" title={t('cash.close')} onPress={() => setSheet('close')} /> : null}
        </Card>
      ) : (
        <Empty icon="cash-register" title={t('cash.closedTitle')} text={t('cash.closedText')}
          action={enabled && shop.can('CASH_SESSIONS', 'create') ? <Btn icon="cash-register" title={t('cash.open')} onPress={() => setSheet('open')} /> : undefined} />
      )}

      <SectionTitle title={t('cash.history')} />
      {history.error ? <ErrorNote message={history.error} onRetry={history.reload} /> : null}
      <Stack gap={8}>
        {history.items.length === 0 && !history.loading ? <ThemedText type="small" themeColor="textSecondary">{t('cash.noHistory')}</ThemedText> : null}
        {history.items.map((s) => (
          <Row key={s.id} icon="cash-register" tone="neutral" title={s.openedByName ?? '—'}
            subtitle={`${formatDateTime(s.openedAt, lang)}${s.closedAt ? ` → ${formatDateTime(s.closedAt, lang)}` : ''}${s.closedAt ? `\n${t('cash.summary', { sales: s.salesCount, expected: shop.money(s.expectedCash), counted: shop.money(s.countedCash) })}` : ''}`}
            meta={s.closedAt ? <View style={{ alignSelf: 'flex-start', marginTop: 4 }}><PdfButton small variant="ghost" path={`/api/shop/pdf/cash/${s.id}`} name="caisse.pdf" label="PDF" /></View> : undefined}
            right={!s.closedAt ? <Badge tone="info">{t('cash.isOpen')}</Badge> : <Badge tone={num(s.difference) === 0 ? 'success' : num(s.difference) < 0 ? 'danger' : 'warning'}>{num(s.difference) === 0 ? t('cash.exact') : `${num(s.difference) > 0 ? '+' : ''}${shop.money(s.difference)}`}</Badge>} />
        ))}
        {history.hasMore ? <Btn variant="secondary" title={t('mob.loadMore')} onPress={history.loadMore} loading={history.loadingMore} /> : null}
      </Stack>

      {sheet === 'open' ? <OpenSheet onClose={() => setSheet(null)} onDone={() => after(t('cash.opened'))} /> : null}
      {sheet === 'close' && live ? <CloseSheet session={live} onClose={() => setSheet(null)} onDone={() => after(t('cash.closed'))} /> : null}
    </Screen>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return <View style={{ flex: 1, minWidth: 0 }}><ThemedText type="small" themeColor="success" style={{ fontSize: 12 }} numberOfLines={1}>{label}</ThemedText><ThemedText type="smallBold" themeColor="success" numberOfLines={1} adjustsFontSizeToFit>{value}</ThemedText></View>;
}

export function OpenSheet({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { t } = useT();
  const shop = useShop();
  const offline = useOffline();
  const toast = useToast();
  const id = useRef(uuid());
  const [fund, setFund] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function go() {
    setBusy(true);
    try {
      const body = { id: id.current, openingFloat: fund === '' ? 0 : Number(fund), at: new Date().toISOString() };
      const res = await offline.submit({ id: id.current, shopId: shop.shopId, method: 'POST', path: '/api/shop/cash/open', body, kind: 'cash-open', label: t('mob.labelCashOpen') });
      if (res.queued) toast(t('mob.cashQueued'), 'warning');
      onDone();
    } catch (e) { setError(e instanceof ApiError ? e.message : t('common.network')); setBusy(false); }
  }
  return (
    <Sheet visible title={t('cash.open')} onClose={onClose} footer={<Btn icon="cash-register" title={t('cash.openAction')} loading={busy} onPress={go} />}>
      <Hint icon="lightbulb">{t('cash.openHint')}</Hint>
      {error ? <Hint icon="circle-xmark" tone="danger">{error}</Hint> : null}
      <NumberBox label={`${t('cash.float')} (${shop.currency})`} value={fund} onChange={setFund} placeholder="0" suffix={shop.currency} />
    </Sheet>
  );
}

function CloseSheet({ session, onClose, onDone }: { session: Session; onClose: () => void; onDone: () => void }) {
  const { t } = useT();
  const shop = useShop();
  const offline = useOffline();
  const toast = useToast();
  const closeId = useRef(uuid());
  const [counted, setCounted] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const diff = counted === '' ? null : Number(counted) - Number(session.expectedCash);
  async function go() {
    setBusy(true);
    try {
      const body = { countedCash: Number(counted), notes, at: new Date().toISOString() };
      const res = await offline.submit({ id: closeId.current, shopId: shop.shopId, method: 'POST', path: `/api/shop/cash/${session.id}/close`, body, kind: 'cash-close', label: t('mob.labelCashClose') });
      if (res.queued) toast(t('mob.cashQueued'), 'warning');
      onDone();
    } catch (e) { setError(e instanceof ApiError ? e.message : t('common.network')); setBusy(false); }
  }
  return (
    <Sheet visible tall title={t('cash.close')} onClose={onClose} footer={<Btn icon="lock" title={t('cash.closeAction')} loading={busy} disabled={counted === ''} onPress={go} />}>
      <OfflineAdvice kind="cashClose" />
      {error ? <Hint icon="circle-xmark" tone="danger">{error}</Hint> : null}
      <Card style={{ gap: 8 }}>
        <View style={{ flexDirection: 'row' }}><ThemedText type="small" style={{ flex: 1 }}>{t('cash.float')}</ThemedText><ThemedText type="smallBold">{shop.money(session.openingFloat)}</ThemedText></View>
        <Breakdown byMethod={session.byMethod} />
        <View style={{ flexDirection: 'row' }}><ThemedText type="smallBold" style={{ flex: 1 }}>{t('cash.expected')}</ThemedText><ThemedText type="smallBold">{shop.money(session.expectedCash)}</ThemedText></View>
      </Card>
      <NumberBox label={`${t('cash.counted')} (${shop.currency}) *`} value={counted} onChange={setCounted} hint={t('cash.countedHint')} suffix={shop.currency} autoFocus />
      {diff !== null ? <Hint icon={diff === 0 ? 'check' : 'triangle-exclamation'} tone={diff === 0 ? 'success' : diff < 0 ? 'danger' : 'warning'}>{diff === 0 ? t('cash.exact') : t(diff < 0 ? 'cash.missing' : 'cash.surplus', { amount: shop.money(Math.abs(diff)) })}</Hint> : null}
      <TextBox label={t('cash.notes')} value={notes} onChangeText={setNotes} maxLength={300} multiline autoCapitalize="sentences" />
    </Sheet>
  );
}
