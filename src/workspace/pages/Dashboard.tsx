import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AreaChart, Donut, Kpi, RankBars, usePalette } from '@/components/charts';
import { Insights } from '@/components/insights';
import { PdfButton } from '@/components/pdf-button';
import { ThemedText } from '@/components/themed-text';
import { BellButton } from '@/components/notif';
import { LaundryStrip } from '@/components/laundry-strip';
import { Btn, Card, Chips, Empty, ErrorNote, Grid, Hint, Row, Screen, SectionTitle, Skeleton, Stack } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { ConflictsRow } from '@/components/conflicts';
import { useT } from '@/i18n';
import { pctDelta } from '@/lib/format';
import { useGo } from '@/lib/nav';
import { useQuery } from '@/lib/query';
import { useShop } from '@/lib/shop';

type Dash = {
  date: string; finance?: boolean;
  today?: { total: number; count: number; items: number; margin: number; average: number };
  yesterday: { total: number }; month: { total: number };
  stock?: { products: number; outCount: number; lowCount: number; value?: number; retailValue?: number };
  expiry?: { expired: number; expiring: number; alertDays: number; expiredValue: number };
  purchases?: { pendingOrders: number; payable: number };
  receivables?: { total: number };
};
type Cur = { total: number; margin: number; cnt: number; discounts: number; items: number };
type Analytics = {
  series: { date: string; total: number; margin: number; count: number }[]; current: Cur; previous: Cur; newCustomers: number;
  byMethod: { key: string; total: number }[]; byCategory: { label: string; total: number }[];
  topProducts: { product_id: string; name: string; qty: number; total: number; margin: number }[];
};

export default function Dashboard() {
  const { t, lang } = useT();
  const shop = useShop();
  const go = useGo();
  const th = useTheme();
  const [days, setDays] = useState(30);
  const dash = useQuery<Dash>('/api/shop/dashboard');
  const rich = Boolean(dash.data?.finance) && shop.has('SALES');
  const an = useQuery<Analytics>(rich ? `/api/shop/analytics?days=${days}` : null);
  const palette = usePalette();
  const d = dash.data;
  const empty = d?.stock && d.stock.products === 0;

  const attention: { icon: string; label: string; value: number; tone: 'danger' | 'warning' | 'neutral' }[] = [];
  if (d?.expiry) {
    attention.push({ icon: 'calendar-xmark', label: t('ws.expiredLots'), value: d.expiry.expired, tone: d.expiry.expired ? 'danger' : 'neutral' });
    attention.push({ icon: 'hourglass', label: t('ws.expiringLots', { days: d.expiry.alertDays }), value: d.expiry.expiring, tone: d.expiry.expiring ? 'warning' : 'neutral' });
  }
  if (d?.stock) {
    attention.push({ icon: 'box', label: t('ws.outOfStock'), value: d.stock.outCount, tone: d.stock.outCount ? 'danger' : 'neutral' });
    attention.push({ icon: 'triangle-exclamation', label: t('ws.lowStock'), value: d.stock.lowCount, tone: d.stock.lowCount ? 'warning' : 'neutral' });
  }
  if (d?.purchases) attention.push({ icon: 'truck', label: t('ws.pendingOrders'), value: d.purchases.pendingOrders, tone: 'neutral' });

  const dateLabel = d ? new Intl.DateTimeFormat(lang, { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(`${d.date}T12:00:00`)) : '';
  const cur = an.data?.current, prev = an.data?.previous;
  const labels = an.data?.series.map((p) => new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short' }).format(new Date(`${p.date}T12:00:00`))) ?? [];
  const totals = an.data?.series.map((p) => Number(p.total)) ?? [];
  const margins = an.data?.series.map((p) => Number(p.margin)) ?? [];
  const counts = an.data?.series.map((p) => Number(p.count)) ?? [];
  const avg = cur && Number(cur.cnt) > 0 ? Number(cur.total) / Number(cur.cnt) : 0;
  const prevAvg = prev && Number(prev.cnt) > 0 ? Number(prev.total) / Number(prev.cnt) : 0;

  return (
    <Screen tabs back={false} title={shop.ws.shop.settings.name} subtitle={dateLabel} onRefresh={async () => { await Promise.all([dash.reload(), an.reload(), shop.refresh()]); }}
      right={<View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><BellButton shopId={shop.shopId} />{shop.can('REPORTS', 'view') ? <PdfButton small path="/api/shop/pdf/daily" name="rapport-du-jour.pdf" label={t('pdf.daily')} /> : null}</View>}>
      <ConflictsRow />
      {shop.has('LAUNDRY_ORDERS') ? <LaundryStrip /> : null}
      {dash.error && !d ? <ErrorNote message={dash.error} onRetry={dash.reload} /> : null}
      {!d && !dash.error ? <Skeleton rows={4} height={96} /> : null}

      {d ? (
        <Stack gap={14}>
          <View style={s.actions}>
            {go.first('pos') && shop.can('SALES', 'create') ? <Btn icon="cart" title={t('ws.newSale')} onPress={() => go.tab('sell')} style={s.flex} /> : null}
            {go.first('products') && shop.can('PRODUCTS', 'create') ? <Btn icon="plus" title={shop.v('newProduct')} variant="secondary" onPress={() => go.page('products', { create: '1' })} style={s.flex15} /> : null}
          </View>

          {empty ? (
            <Hint icon="wand-magic-sparkles" title={t('ws.startTitle')}>
              {`1. ${t('ws.startStep1', { products: shop.v('products').toLowerCase() })}\n2. ${t('ws.startStep2')}\n3. ${t('ws.startStep3')}`}
            </Hint>
          ) : null}

          {rich ? (
            <>
              <Chips value={String(days)} onChange={(v) => setDays(Number(v))} options={[7, 30, 90].map((n) => ({ value: String(n), label: t('dash.days', { count: n }) }))} />
              {an.loading || !cur || !prev ? <Skeleton rows={2} height={110} /> : (
                <>
                  <Grid min={150} gap={10}>
                    <Kpi icon="coins" label={t('dash.revenue')} value={shop.money(cur.total)} delta={pctDelta(cur.total, prev.total)} hint={t('dash.vsPrev')} spark={totals} color={palette[0]} />
                    <Kpi icon="chart-line" label={t('dash.margin')} value={shop.money(cur.margin)} delta={pctDelta(cur.margin, prev.margin)} hint={Number(cur.total) > 0 ? `${Math.round((Number(cur.margin) / Number(cur.total)) * 100)} %` : undefined} spark={margins} color={palette[1]} />
                    <Kpi icon="receipt" label={t('dash.orders')} value={String(Number(cur.cnt))} delta={pctDelta(cur.cnt, prev.cnt)} hint={t('dash.vsPrev')} spark={counts} color={palette[3]} />
                    <Kpi icon="basket-shopping" label={t('dash.basket')} value={shop.money(avg)} delta={pctDelta(avg, prevAvg)} hint={t('dash.vsPrev')} color={palette[2]} />
                  </Grid>
                  <Grid min={420}>
                    <Card style={s.card}>
                      <SectionTitle title={t('dash.trend')} />
                      {Number(cur.cnt) === 0 ? <ThemedText themeColor="textSecondary" type="small">{t('dash.noData')}</ThemedText> : (
                        <AreaChart labels={labels} format={shop.money} series={[
                          { key: 'total', label: t('dash.revenue'), color: palette[0], values: totals },
                          { key: 'margin', label: t('dash.margin'), color: palette[1], values: margins },
                        ]} />
                      )}
                      <View style={s.strip}>
                        <Mini label={t('dash.itemsSold')} value={String(Number(cur.items))} />
                        <Mini label={t('dash.discounts')} value={shop.money(cur.discounts)} />
                        <Mini label={t('dash.newCustomers')} value={String(an.data!.newCustomers)} />
                      </View>
                    </Card>
                    <Card style={s.card}>
                      <SectionTitle title={t('dash.byMethod')} />
                      {an.data!.byMethod.length === 0 ? <ThemedText themeColor="textSecondary" type="small">{t('dash.noData')}</ThemedText> : (
                        <Donut format={shop.money} centerLabel={t('dash.total')} slices={an.data!.byMethod.map((m) => ({ key: m.key, label: t(`ws.m.${m.key}`), value: Number(m.total) }))} />
                      )}
                    </Card>
                  </Grid>
                  <Grid min={420}>
                    {an.data!.byCategory.length > 0 ? (
                      <Card style={s.card}>
                        <SectionTitle title={t('dash.byCategory')} />
                        <Donut format={shop.money} centerLabel={t('dash.total')} slices={an.data!.byCategory.map((c) => ({ key: c.label, label: c.label === '-' ? t('ws.none') : c.label, value: Number(c.total) }))} />
                      </Card>
                    ) : null}
                    {an.data!.topProducts.length > 0 ? (
                      <Card style={s.card}>
                        <SectionTitle title={t('dash.topProducts')} />
                        <RankBars format={shop.money} items={an.data!.topProducts.map((p) => ({ key: p.product_id, label: p.name, value: Number(p.total), sub: t('dash.sold', { qty: Number(p.qty), margin: shop.money(p.margin) }) }))} />
                      </Card>
                    ) : null}
                  </Grid>
                </>
              )}
            </>
          ) : d.today ? (
            <Grid min={150} gap={10}>
              <Kpi icon="coins" label={t('ws.salesToday')} value={shop.money(d.today.total)} delta={pctDelta(d.today.total, d.yesterday.total)} hint={t('ws.vsYesterday')} color={palette[0]} />
              <Kpi icon="receipt" label={t('ws.salesCount')} value={String(d.today.count)} hint={t('ws.itemsSoldCount', { count: Number(d.today.items) })} color={palette[3]} />
            </Grid>
          ) : null}

          {attention.length > 0 ? (
            <View style={{ gap: 8 }}>
              <SectionTitle title={t('ws.attention')} hint={t('mob.attentionHint')} />
              <Grid min={300} gap={8}>
                {attention.map((a) => (
                  <Row key={a.label} icon={a.icon} tone={a.tone === 'neutral' ? 'primary' : a.tone} title={a.label} onPress={go.first('alerts') ? () => go.page('alerts') : undefined}
                    right={<ThemedText type="smallBold" style={{ fontSize: 18, color: a.tone === 'danger' ? th.danger : a.tone === 'warning' ? th.warning : th.text }}>{a.value}</ThemedText>} />
                ))}
              </Grid>
            </View>
          ) : null}

          {d.stock?.value != null || d.receivables ? (
            <Card style={s.card}>
              <SectionTitle title={t('ws.finances')} />
              {d.stock?.value != null ? <Fact label={t('ws.stockValue')} value={shop.money(d.stock.value)} /> : null}
              {d.stock?.retailValue != null ? <Fact label={t('ws.stockRetail')} value={shop.money(d.stock.retailValue)} /> : null}
              {d.receivables ? <Fact label={t('ws.receivables', { who: shop.v('customers').toLowerCase() })} value={shop.money(d.receivables.total)} /> : null}
              {d.purchases ? <Fact label={t('ws.payables', { who: shop.v('suppliers').toLowerCase() })} value={shop.money(d.purchases.payable)} /> : null}
            </Card>
          ) : null}

          <Insights days={days} />

          {!d.today && !d.stock ? <Empty icon="chart-column" title={t('ws.nothingToShow')} text={shop.owner ? t('ws.nothingToShowOwner') : undefined} /> : null}
        </Stack>
      ) : null}
    </Screen>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return <View style={s.mini}><ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 12 }} numberOfLines={1}>{label}</ThemedText><ThemedText type="smallBold" numberOfLines={1}>{value}</ThemedText></View>;
}
function Fact({ label, value }: { label: string; value: string }) {
  return <View style={s.fact}><ThemedText type="small" themeColor="textSecondary" style={{ flex: 1 }}>{label}</ThemedText><ThemedText type="smallBold">{value}</ThemedText></View>;
}

const s = StyleSheet.create({
  flex: { flexGrow: 1, flexBasis: 150, minWidth: 150 },
  flex15: { flexGrow: 1, flexBasis: 190, minWidth: 190, paddingHorizontal: 12 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  card: { gap: 10 },
  strip: { flexDirection: 'row', gap: 8, marginTop: 4 },
  mini: { flex: 1, minWidth: 0 },
  fact: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
});
