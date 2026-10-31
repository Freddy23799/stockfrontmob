import { useMemo, useState } from 'react';
import { Share, View } from 'react-native';

import { AreaChart, Kpi, RankBars, usePalette } from '@/components/charts';
import { SelectField } from '@/components/dynamic-fields';
import { PdfButton } from '@/components/pdf-button';
import { ThemedText } from '@/components/themed-text';
import { Btn, Card, Chips, Empty, ErrorNote, Grid, Row, Screen, SectionTitle, Skeleton, Stack } from '@/components/ui';
import { useT } from '@/i18n';
import { formatDate, num } from '@/lib/format';
import { qs, useQuery } from '@/lib/query';
import { useShop } from '@/lib/shop';
import type { PageProps } from '../registry';

const iso = (d: Date) => d.toISOString().slice(0, 10);
const GROUPS = ['day', 'product', 'category', 'method', 'customer', 'seller'];
type Rep = { total: number; count: number; margin: number; rows: { key: string; label: string; count: number; quantity: number; total: number; margin: number }[] };

export default function Reports({ item, tab }: PageProps) {
  const { t, lang } = useT();
  const shop = useShop();
  const palette = usePalette();
  const [period, setPeriod] = useState('30');
  const [group, setGroup] = useState('day');
  const [dormantDays, setDormantDays] = useState('90');
  const range = useMemo(() => {
    const now = new Date();
    const from = period === 'month' ? new Date(now.getFullYear(), now.getMonth(), 1) : new Date(now.getTime() - (Number(period) - 1) * 86400000);
    return { from: iso(from), to: iso(now) };
  }, [period]);
  const report = useQuery<Rep>(`/api/shop/reports/sales${qs({ ...range, groupBy: group })}`);
  const valuation = useQuery<{ key: string; label: string; products: number; costValue: number; retailValue: number }[]>(shop.has('STOCK') ? '/api/shop/reports/stock-valuation' : null);
  const purchases = useQuery<{ key: string; label: string; count: number; total: number; paid: number; balance: number }[]>(shop.has('SUPPLIERS') ? `/api/shop/reports/purchases${qs(range)}` : null);
  const dormant = useQuery<{ productId: string; name: string; quantity: number; costValue: number; lastSale?: string }[]>(shop.has('STOCK') ? `/api/shop/reports/dormant?days=${dormantDays}` : null);
  const r = report.data;
  const rows = useMemo(() => (r?.rows ?? []).map((x) => ({
    ...x, label: group === 'method' ? t(`ws.m.${x.key}`) : group === 'day' ? new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short' }).format(new Date(`${x.key}T12:00:00`)) : x.label === '-' ? t('ws.none') : x.label,
  })), [r, group, lang, t]);

  const exportCsv = () => {
    const esc = (v: unknown) => `"${String(v ?? '').replaceAll('"', '""')}"`;
    const head = [t('ws.label'), t('ws.count'), shop.v('quantity'), t('ws.total'), t('ws.margin')];
    void Share.share({ message: [head, ...rows.map((x) => [x.label, x.count, x.quantity, x.total, x.margin])].map((l) => l.map(esc).join(';')).join('\n'), title: `vylaxo-${group}-${range.from}-${range.to}.csv` });
  };

  const refresh = async () => { await Promise.all([report.reload(), valuation.reload(), purchases.reload(), dormant.reload()]); };
  return (
    <Screen tabs={tab} title={shop.tr(item.label)} onRefresh={refresh} right={r ? <View style={{ flexDirection: 'row', gap: 8 }}><PdfButton small path="/api/shop/pdf/sales" params={{ ...range, groupBy: group }} name={`ventes-${range.from}-${range.to}.pdf`} /><Btn small icon="share-nodes" variant="secondary" title="CSV" onPress={exportCsv} /></View> : undefined}>
      <Chips value={period} onChange={setPeriod} options={[{ value: '7', label: t('dash.days', { count: 7 }) }, { value: '30', label: t('dash.days', { count: 30 }) }, { value: '90', label: t('dash.days', { count: 90 }) }, { value: 'month', label: t('mob.thisMonth') }]} />
      <View>
        <ThemedText type="smallBold" style={{ marginBottom: 6 }}>{t('ws.groupBy')}</ThemedText>
        <Chips value={group} onChange={setGroup} options={GROUPS.filter((g) => (g !== 'customer' || shop.has('CUSTOMERS')) && (g !== 'seller' || shop.has('EMPLOYEES'))).map((g) => ({ value: g, label: t(`ws.g.${g}`) }))} />
      </View>
      {report.error && !r ? <ErrorNote message={report.error} onRetry={report.reload} /> : null}
      {!r && !report.error ? <Skeleton rows={3} height={100} /> : null}
      {r ? (
        <Stack gap={14}>
          <Grid min={150} gap={10}>
            <Kpi icon="coins" label={t('ws.revenue')} value={shop.money(r.total)} color={palette[0]} />
            <Kpi icon="receipt" label={t('ws.salesCount')} value={String(r.count)} color={palette[3]} />
            <Kpi icon="chart-line" label={t('ws.margin')} value={shop.money(r.margin)} hint={Number(r.total) > 0 ? `${Math.round((Number(r.margin) / Number(r.total)) * 100)} %` : undefined} color={palette[1]} />
          </Grid>
          {rows.length === 0 ? <Empty icon="chart-line" title={t('ws.noSales')} /> : (
            <Card style={{ gap: 10 }}>
              {group === 'day' ? (
                <AreaChart labels={rows.map((x) => x.label)} format={shop.money} series={[{ key: 'total', label: t('ws.revenue'), color: palette[0], values: rows.map((x) => Number(x.total)) }, { key: 'margin', label: t('ws.margin'), color: palette[1], values: rows.map((x) => Number(x.margin)) }]} />
              ) : <RankBars format={shop.money} items={rows.slice(0, 12).map((x) => ({ key: x.key, label: x.label, value: Number(x.total), sub: `${x.count} · ${t('ws.margin')} ${shop.money(x.margin)}` }))} />}
            </Card>
          )}
        </Stack>
      ) : null}

      {valuation.data && valuation.data.length > 0 ? (
        <Stack gap={8}>
          <SectionTitle title={t('ws.stockValuation')} />
          {valuation.data.map((v) => <Row key={v.key} icon="warehouse" title={v.label === '-' ? t('ws.none') : v.label} subtitle={`${v.products} ${shop.v('products').toLowerCase()}`} right={<View style={{ alignItems: 'flex-end' }}><ThemedText type="smallBold">{shop.money(v.costValue)}</ThemedText><ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 11 }}>{t('ws.stockRetail')} {shop.money(v.retailValue)}</ThemedText></View>} />)}
        </Stack>
      ) : null}

      {dormant.data ? (
        <Stack gap={8}>
          <SectionTitle title={t('ws.dormant')} />
          <SelectField required label={t('ws.dormantDays')} value={dormantDays} onChange={setDormantDays} options={[30, 60, 90, 180, 365].map((d) => ({ value: String(d), label: t('ws.dormantSince', { count: d }) }))} />
          {dormant.data.length === 0 ? <ThemedText type="small" themeColor="textSecondary">{t('ws.dormantNone')}</ThemedText> : (
            <>
              <ThemedText type="small" themeColor="textSecondary">{t('ws.dormantTotal')} <ThemedText type="smallBold">{shop.money(dormant.data.reduce((a, x) => a + Number(x.costValue), 0))}</ThemedText></ThemedText>
              {dormant.data.map((x) => <Row key={x.productId} icon="hourglass" tone="warning" title={x.name} subtitle={`${num(x.quantity)} · ${x.lastSale ? formatDate(x.lastSale, lang) : t('ws.never')}`} right={<ThemedText type="smallBold">{shop.money(x.costValue)}</ThemedText>} />)}
            </>
          )}
        </Stack>
      ) : null}

      {purchases.data && purchases.data.length > 0 ? (
        <Stack gap={8}>
          <SectionTitle title={t('ws.purchasesBySupplier')} />
          {purchases.data.map((p) => <Row key={p.key} icon="truck" title={p.label === '-' ? t('ws.none') : p.label} subtitle={`${p.count} · ${t('ws.paid')} ${shop.money(p.paid)}`} right={<View style={{ alignItems: 'flex-end' }}><ThemedText type="smallBold">{shop.money(p.total)}</ThemedText>{Number(p.balance) > 0 ? <ThemedText type="small" themeColor="danger" style={{ fontSize: 12 }}>{t('ws.balanceDue')} {shop.money(p.balance)}</ThemedText> : null}</View>} />)}
        </Stack>
      ) : null}
    </Screen>
  );
}
