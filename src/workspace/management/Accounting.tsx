import { useMemo, useState } from 'react';
import { Share, View } from 'react-native';

import { Donut, GroupedBars, Legend, usePalette } from '@/components/charts';
import { DateField } from '@/components/date-field';
import { Icon } from '@/components/icon';
import { PdfButton } from '@/components/pdf-button';
import { ThemedText } from '@/components/themed-text';
import { Badge, Btn, Card, Chips, Empty, ErrorNote, Grid, Hint, Screen, SectionTitle, Skeleton, Stack, useToast } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { OfflineAdvice } from '@/components/offline-advice';
import { useT } from '@/i18n';
import { ApiError } from '@/lib/api';
import { confirmAction } from '@/lib/confirm';
import { formatDateTime } from '@/lib/format';
import { qs, useQuery } from '@/lib/query';
import { useShop } from '@/lib/shop';

const iso = (d: Date) => d.toISOString().slice(0, 10);
const ymd = (y: number, m: number, d: number) => iso(new Date(Date.UTC(y, m, d)));

type Sum = {
  closed?: boolean; netResult: number; grossMargin?: number; costOfGoods?: number; stockLosses?: number; purchasesPaid?: number;
  revenue?: { total: number; count: number }; expenses?: { total: number; byCategory: { label: string; total: number }[] };
  payroll?: { paid: number; remaining: number };
  cash: { in: number; purchases: number; expenses: number; payroll: number; net: number };
  receivables: { customers?: number; insurers?: number };
};
type Month = { period: string; revenue?: number; grossMargin?: number; expenses?: number; payroll?: number; stockLosses?: number; netResult: number; closed?: boolean };
type Closing = { period: string; closedAt: string; snapshot: { netResult: number } };

function Line({ label, value, strong, tone, indent, hint }: { label: string; value: number | string; strong?: boolean; tone?: 'ok' | 'bad'; indent?: boolean; hint?: string }) {
  const shop = useShop();
  const th = useTheme();
  const color = tone === 'ok' ? th.success : tone === 'bad' ? th.danger : th.text;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 5, paddingLeft: indent ? 14 : 0, borderTopWidth: strong ? 1 : 0, borderTopColor: th.progressTrack }}>
      <View style={{ flex: 1 }}>
        <ThemedText type={strong ? 'smallBold' : 'small'} style={{ color }}>{label}</ThemedText>
        {hint ? <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 12 }}>{hint}</ThemedText> : null}
      </View>
      <ThemedText type="smallBold" style={{ color }}>{shop.money(value as number)}</ThemedText>
    </View>
  );
}

export default function Accounting() {
  const { t, lang } = useT();
  const shop = useShop();
  const th = useTheme();
  const palette = usePalette();
  const toast = useToast();
  const now = new Date();
  const [range, setRange] = useState('month');
  const [month, setMonth] = useState(iso(now).slice(0, 7));
  const [from, setFrom] = useState(ymd(now.getFullYear(), now.getMonth(), 1));
  const [to, setTo] = useState(iso(now));
  const year = Number(month.slice(0, 4));
  const period = useMemo(() => {
    if (range === 'custom') return { from, to };
    if (range === 'year') return { from: `${year}-01-01`, to: year === now.getFullYear() ? iso(now) : `${year}-12-31` };
    const [y, m] = month.split('-').map(Number);
    return { from: ymd(y, m - 1, 1), to: ymd(y, m, 0) > iso(now) && month === iso(now).slice(0, 7) ? iso(now) : ymd(y, m, 0) };
  }, [range, month, from, to, year]); // eslint-disable-line react-hooks/exhaustive-deps
  const sumQ = useQuery<Sum>(`/api/shop/accounting/summary${qs(period)}`);
  const monthlyQ = useQuery<Month[]>(`/api/shop/accounting/monthly?year=${year}`);
  const closingsQ = useQuery<Closing[]>('/api/shop/accounting/closings');
  const sum = sumQ.data, monthly = monthlyQ.data ?? [], closings = closingsQ.data ?? [];
  const reload = async () => { await Promise.all([sumQ.reload(), monthlyQ.reload(), closingsQ.reload()]); };
  const latest = closings[0]?.period;
  const isPast = (p: string) => p < iso(now).slice(0, 7);
  const net = sum ? Number(sum.netResult) : 0;

  // 12 derniers mois proposes en puces : pas de saisie, pas d'erreur de format
  const months = Array.from({ length: 12 }, (_, i) => { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); return iso(new Date(Date.UTC(d.getFullYear(), d.getMonth(), 1))).slice(0, 7); });
  const years = Array.from({ length: 4 }, (_, i) => String(now.getFullYear() - i));
  const monthLabel = (m: string) => new Intl.DateTimeFormat(lang, { month: 'short', year: '2-digit' }).format(new Date(`${m}-15T12:00:00`));

  async function close(p: string) {
    if (!(await confirmAction(t('acc.closeTitle', { period: p }), t('acc.closeText'), t('acc.close'), t('common.cancel'), false))) return;
    try { await shop.call('/api/shop/accounting/closings', { method: 'POST', body: { period: p } }); toast(t('acc.closed')); await reload(); } catch (e) { toast(e instanceof ApiError ? e.message : t('common.network'), 'danger'); }
  }
  async function reopen(p: string) {
    if (!(await confirmAction(t('acc.reopenTitle', { period: p }), t('acc.reopenText'), t('acc.reopen'), t('common.cancel')))) return;
    try { await shop.call(`/api/shop/accounting/closings/${p}`, { method: 'DELETE' }); toast(t('acc.reopened')); await reload(); } catch (e) { toast(e instanceof ApiError ? e.message : t('common.network'), 'danger'); }
  }
  const exportCsv = () => {
    const esc = (v: unknown) => `"${String(v ?? '').replaceAll('"', '""')}"`;
    const head = [t('acc.month'), t('acc.revenue'), t('acc.grossMargin'), t('acc.expenses'), t('acc.payroll'), t('acc.stockLosses'), t('acc.netResult')];
    void Share.share({ title: `vylaxo-comptabilite-${year}.csv`, message: [head, ...monthly.map((m) => [m.period, m.revenue, m.grossMargin, m.expenses, m.payroll, m.stockLosses, m.netResult])].map((r) => r.map(esc).join(';')).join('\n') });
  };

  const parts = sum ? [
    sum.costOfGoods != null && { key: 'cogs', label: t('acc.costOfGoods'), value: Number(sum.costOfGoods) },
    sum.expenses && { key: 'exp', label: t('acc.expenses'), value: Number(sum.expenses.total) },
    sum.payroll && { key: 'pay', label: t('acc.payroll'), value: Number(sum.payroll.paid) },
    sum.stockLosses != null && { key: 'loss', label: t('acc.stockLosses'), value: Number(sum.stockLosses) },
  ].filter((x): x is { key: string; label: string; value: number } => Boolean(x) && (x as { value: number }).value > 0) : [];

  if (!shop.has('ACCOUNTING')) return <Screen title={t('acc.title')}><Empty icon="lock" title={t('ws.featureOff')} text={t('ws.featureOffText')} /></Screen>;
  if (!shop.can('ACCOUNTING', 'view')) return <Screen title={t('acc.title')}><Empty icon="lock" title={t('ws.noAccess')} text={t('ws.noAccessText')} /></Screen>;

  return (
    <Screen title={t('acc.title')} subtitle={t('acc.subtitle')} onRefresh={reload} right={monthly.length > 0 ? <View style={{ flexDirection: 'row', gap: 8 }}><PdfButton small path="/api/shop/pdf/accounting" params={{ from: period.from, to: period.to }} name={`resultat-${period.from}-${period.to}.pdf`} /><Btn small variant="secondary" icon="share-nodes" title="CSV" onPress={exportCsv} /></View> : undefined}>
      <OfflineAdvice kind="needsNetwork" />
      <Chips value={range} onChange={setRange} options={[{ value: 'month', label: t('acc.byMonth') }, { value: 'year', label: t('acc.byYear') }, { value: 'custom', label: t('acc.custom') }]} />
      {range === 'month' ? <Chips value={month} onChange={setMonth} options={months.map((m) => ({ value: m, label: monthLabel(m) }))} /> : null}
      {range === 'year' ? <Chips value={String(year)} onChange={(y) => setMonth(`${y}-${month.slice(5)}`)} options={years.map((y) => ({ value: y, label: y }))} /> : null}
      {range === 'custom' ? <Grid min={240} gap={10}><DateField label={t('ws.from')} value={from} onChange={setFrom} max={to} /><DateField label={t('ws.to')} value={to} onChange={setTo} min={from} /></Grid> : null}

      {sumQ.error && !sum ? <ErrorNote message={sumQ.error} onRetry={sumQ.reload} /> : null}
      {!sum && !sumQ.error ? <Skeleton rows={3} height={110} /> : null}
      {sum ? (
        <Stack gap={14}>
          {sum.closed ? <Hint icon="lock">{t('acc.frozen')}</Hint> : null}
          <Card tone={net >= 0 ? 'success' : 'danger'} style={{ gap: 2 }}>
            <ThemedText type="small" style={{ color: net >= 0 ? th.success : th.danger }}>{t('acc.netResult')}</ThemedText>
            <ThemedText type="subtitle" style={{ color: net >= 0 ? th.success : th.danger, fontSize: 28 }} numberOfLines={1} adjustsFontSizeToFit>{shop.money(net)}</ThemedText>
            <ThemedText type="small" style={{ color: net >= 0 ? th.success : th.danger }}>{net >= 0 ? t('acc.profit') : t('acc.loss')}</ThemedText>
          </Card>
          <Grid min={340}>
            <Card style={{ gap: 2 }}>
              <SectionTitle title={t('acc.result')} />
              {sum.revenue ? (
                <>
                  <Line label={t('acc.revenue')} value={sum.revenue.total} hint={t('acc.salesCount', { count: Number(sum.revenue.count) })} />
                  <Line label={t('acc.costOfGoods')} value={-Number(sum.costOfGoods)} indent />
                  <Line label={t('acc.grossMargin')} value={sum.grossMargin ?? 0} strong />
                </>
              ) : null}
              {sum.expenses ? (
                <>
                  <Line label={t('acc.expenses')} value={-Number(sum.expenses.total)} />
                  {sum.expenses.byCategory.map((c) => <Line key={c.label} label={c.label === '-' ? t('ws.none') : c.label} value={-Number(c.total)} indent />)}
                </>
              ) : null}
              {sum.payroll ? <Line label={t('acc.payroll')} value={-Number(sum.payroll.paid)} hint={Number(sum.payroll.remaining) > 0 ? t('acc.payrollRemaining', { amount: shop.money(sum.payroll.remaining) }) : undefined} /> : null}
              {sum.stockLosses != null && Number(sum.stockLosses) > 0 ? <Line label={t('acc.stockLosses')} value={-Number(sum.stockLosses)} /> : null}
              <Line label={t('acc.netResult')} value={net} strong tone={net >= 0 ? 'ok' : 'bad'} />
            </Card>
            <Card style={{ gap: 2 }}>
              <SectionTitle title={t('acc.cash')} hint={t('acc.cashHint')} />
              {sum.revenue ? <Line label={t('acc.cashIn')} value={sum.cash.in} /> : null}
              {sum.purchasesPaid != null ? <Line label={t('acc.purchasesPaid')} value={-Number(sum.cash.purchases)} /> : null}
              {sum.expenses ? <Line label={t('acc.expenses')} value={-Number(sum.cash.expenses)} /> : null}
              {sum.payroll ? <Line label={t('acc.payroll')} value={-Number(sum.cash.payroll)} /> : null}
              <Line label={t('acc.cashNet')} value={sum.cash.net} strong tone={Number(sum.cash.net) >= 0 ? 'ok' : 'bad'} />
              {sum.receivables.customers != null || sum.receivables.insurers != null ? (
                <>
                  <SectionTitle title={t('acc.receivables')} />
                  {sum.receivables.customers != null ? <Line label={t('acc.customersOwe')} value={sum.receivables.customers} /> : null}
                  {sum.receivables.insurers != null ? <Line label={t('acc.insurersOwe')} value={sum.receivables.insurers} /> : null}
                </>
              ) : null}
            </Card>
          </Grid>
        </Stack>
      ) : null}

      {monthly.length > 0 ? (
        <Grid min={420}>
          <Card style={{ gap: 10 }}>
            <SectionTitle title={t('acc.monthly', { year })} />
            <Legend items={[{ label: t('acc.grossMargin'), color: palette[0] }, { label: t('acc.expenses'), color: palette[2] }, { label: t('acc.payroll'), color: palette[3] }]} />
            <GroupedBars labels={monthly.map((m) => m.period.slice(5))} format={shop.money} series={[
              { key: 'm', label: t('acc.grossMargin'), color: palette[0], values: monthly.map((m) => Number(m.grossMargin ?? 0)) },
              { key: 'e', label: t('acc.expenses'), color: palette[2], values: monthly.map((m) => Number(m.expenses ?? 0)) },
              { key: 'p', label: t('acc.payroll'), color: palette[3], values: monthly.map((m) => Number(m.payroll ?? 0)) },
            ]} />
          </Card>
          {parts.length > 0 ? <Card style={{ gap: 10 }}><SectionTitle title={t('acc.costsSplit')} /><Donut slices={parts} format={shop.money} centerLabel={t('acc.costs')} /></Card> : null}
        </Grid>
      ) : null}

      <Card style={{ gap: 8 }}>
        <SectionTitle title={t('acc.monthly', { year })} />
        {monthly.length === 0 ? <ThemedText type="small" themeColor="textSecondary">{t('acc.noMonths')}</ThemedText> : monthly.map((m) => (
          <View key={m.period} style={{ gap: 6, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: th.progressTrack }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <ThemedText type="smallBold" style={{ flex: 1 }}>{m.period} {m.closed ? <Icon name="lock" size={11} color={th.textSecondary} /> : null}</ThemedText>
              <ThemedText type="smallBold" style={{ color: Number(m.netResult) < 0 ? th.danger : th.text }}>{shop.money(m.netResult)}</ThemedText>
            </View>
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              {shop.can('ACCOUNTING', 'update') && !m.closed && isPast(m.period) ? <Btn small variant="secondary" icon="lock" title={t('acc.close')} onPress={() => close(m.period)} /> : null}
              {m.period === latest && shop.owner ? <Btn small variant="ghost" title={t('acc.reopen')} onPress={() => reopen(m.period)} /> : null}
            </View>
          </View>
        ))}
        <Hint icon="circle-info">{t('acc.closingHint')}</Hint>
      </Card>

      {closings.length > 0 ? (
        <Card style={{ gap: 8 }}>
          <SectionTitle title={t('acc.closings')} />
          {closings.map((c) => (
            <View key={c.period} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Icon name="lock" size={12} color={th.textSecondary} />
              <ThemedText type="small" style={{ flex: 1 }}>{c.period} · {formatDateTime(c.closedAt, lang)}</ThemedText>
              <Badge tone={Number(c.snapshot.netResult) >= 0 ? 'success' : 'danger'}>{shop.money(c.snapshot.netResult)}</Badge>
            </View>
          ))}
        </Card>
      ) : null}
    </Screen>
  );
}
